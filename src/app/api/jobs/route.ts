import { protectedRoute } from '@/lib/http/protected-route';
import { database, checkDb, CaptureError } from '@/lib/db/admin';
import { recommendationContext } from '@/lib/jobs/recommendations';
import { rankResumeJobs } from '@/lib/jobs/relevance';
import type { StoredJob } from '@/lib/jobs/types';
import {publicationWindow,newestPostedFirst} from '@/lib/jobs/freshness';

export interface PublicJob {id:string;title:string;company:string;companySlug:string;portal:'Greenhouse'|'Ashby';location:string;department:string;type:string;url:string;updatedAt:string}

export async function GET(request: Request) {
  return protectedRoute(request, 'candidate_or_staff', async profile => {
    const params = new URL(request.url).searchParams;
    const postedWithin=params.get('postedWithin');
    if(postedWithin&&!['7','30','90','all'].includes(postedWithin))throw new CaptureError('Invalid posting date filter.');
    const window=publicationWindow(postedWithin);
    const page = Number(params.get('page') || 0);
    if (!Number.isSafeInteger(page) || page < 0) throw new CaptureError('Invalid page.');
    const type = params.get('type') || 'all';
    if (!['all','contract','permanent','temporary','part_time','internship','unknown'].includes(type)) throw new CaptureError('Invalid job filter.');
    const { candidate, recommendation } = await recommendationContext(profile, params);
    if (recommendation.requiresProfile) return { jobs: [], total: 0, hasMore: false, recommendation };
    const provider = params.get('provider');
    if (provider && !['greenhouse','ashby','lever','smartrecruiters','breezy','remoteok'].includes(provider)) throw new CaptureError('Invalid portal filter.');
    let sourceIds: string[] | null = null;
    if (provider) {
      const { data, error } = await database().from('job_sources').select('id').eq('provider', provider);
      checkDb(error);
      sourceIds = ((data || []) as {id:string}[]).map(source => source.id);
    }
    function query(count=false) {
      let q = database().from('jobs').select('id,external_id,title,company,location,department,description,employment_type,arrangements,compensation,source_url,application_url,version,state,updated_at,posted_at,closes_at,source:job_sources(provider,board_slug,health)', count ? { count: 'exact' } : {})
        .neq('state', 'closed').or('closes_at.is.null,closes_at.gt.' + new Date().toISOString()).order('posted_at', { ascending: false, nullsFirst:false }).order('id');
      if(window.since)q=q.gte('posted_at',window.since).lte('posted_at',window.until);
      if (type !== 'all') q = q.eq('employment_type', type);
      const search = params.get('search')?.trim();
      if (search) q = q.ilike('title', '%' + search.replace(/[\\%_]/g, '\\$&') + '%');
      for (const field of ['company','location'] as const) {
        const value = params.get(field)?.trim();
        if (value) q = q.ilike(field, '%' + value.replace(/[\\%_]/g, '\\$&') + '%');
      }
      if (sourceIds) q = q.in('source_id', sourceIds);
      return q;
    }
    if (!candidate) {
      const { data, error, count } = await query(true).range(page * 50, page * 50 + 49);
      checkDb(error);
      return { jobs: data || [], total: count || 0, hasMore: (page + 1) * 50 < (count || 0), recommendation };
    }
    // Match the entire date-filtered feed before pagination, then show newest matches first.
    const jobs: StoredJob[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await query().range(offset, offset + 499);
      checkDb(error);
      jobs.push(...(data || []) as unknown as StoredJob[]);
      if (!data || data.length < 500) break;
    }
    const ranked = rankResumeJobs(jobs, candidate).sort(newestPostedFirst);
    return { jobs: ranked.slice(page * 50, page * 50 + 50), total: ranked.length, hasMore: (page + 1) * 50 < ranked.length, recommendation };
  });
}
