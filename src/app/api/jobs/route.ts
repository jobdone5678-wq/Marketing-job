import { protectedRoute } from '@/lib/http/protected-route';
import { database, checkDb, CaptureError } from '@/lib/db/admin';
import { recommendationContext } from '@/lib/jobs/recommendations';
import { rankResumeJobs } from '@/lib/jobs/relevance';
import type { StoredJob } from '@/lib/jobs/types';
import {publicationWindow,newestPostedFirst} from '@/lib/jobs/freshness';
import {candidateJobApplications} from '@/lib/jobs/applications';
import {withoutAppliedJobs} from '@/lib/jobs/application-state';

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
    const isSuperAdmin = profile.role === 'super_admin';
    const provider = params.get('provider');
    if (provider && !['greenhouse','ashby','lever','smartrecruiters','breezy','remoteok'].includes(provider)) throw new CaptureError('Invalid portal filter.');
    let sourceIds: string[] | null = null;
    if (provider) {
      const { data, error } = await database().from('job_sources').select('id').eq('provider', provider);
      checkDb(error);
      sourceIds = ((data || []) as {id:string}[]).map(source => source.id);
    }
    // Broad USA location filter: matches country names, state abbreviations, and common US city patterns.
    const usaLocationFilter = 'location.ilike.%United States%,location.ilike.%USA%,location.ilike.% US%,location.ilike.%US %,location.ilike.%Alabama%,location.ilike.%Alaska%,location.ilike.%Arizona%,location.ilike.%Arkansas%,location.ilike.%California%,location.ilike.%Colorado%,location.ilike.%Connecticut%,location.ilike.%Delaware%,location.ilike.%Florida%,location.ilike.%Georgia%,location.ilike.%Hawaii%,location.ilike.%Idaho%,location.ilike.%Illinois%,location.ilike.%Indiana%,location.ilike.%Iowa%,location.ilike.%Kansas%,location.ilike.%Kentucky%,location.ilike.%Louisiana%,location.ilike.%Maine%,location.ilike.%Maryland%,location.ilike.%Massachusetts%,location.ilike.%Michigan%,location.ilike.%Minnesota%,location.ilike.%Mississippi%,location.ilike.%Missouri%,location.ilike.%Montana%,location.ilike.%Nebraska%,location.ilike.%Nevada%,location.ilike.%New Hampshire%,location.ilike.%New Jersey%,location.ilike.%New Mexico%,location.ilike.%New York%,location.ilike.%North Carolina%,location.ilike.%North Dakota%,location.ilike.%Ohio%,location.ilike.%Oklahoma%,location.ilike.%Oregon%,location.ilike.%Pennsylvania%,location.ilike.%Rhode Island%,location.ilike.%South Carolina%,location.ilike.%South Dakota%,location.ilike.%Tennessee%,location.ilike.%Texas%,location.ilike.%Utah%,location.ilike.%Vermont%,location.ilike.%Virginia%,location.ilike.%Washington%,location.ilike.%West Virginia%,location.ilike.%Wisconsin%,location.ilike.%Wyoming%,location.ilike.%District of Columbia%,location.ilike.%Remote%';
    function query(count=false) {
      let q = database().from('jobs').select('id,external_id,title,company,location,department,description,employment_type,arrangements,compensation,source_url,application_url,version,state,updated_at,posted_at,closes_at,source:job_sources(provider,board_slug,health)', count ? { count: 'exact' } : {})
        .neq('state', 'closed').or('closes_at.is.null,closes_at.gt.' + new Date().toISOString()).or(usaLocationFilter).order('posted_at', { ascending: false, nullsFirst:false }).order('id');
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
    // Without a candidate, keep the broad feed paginated. Candidate feeds remove
    // only that candidate's applications before counting and pagination.
    if (!recommendation.candidateId && !candidate) {
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
    const {appliedKeys}=await candidateJobApplications(recommendation.candidateId||candidate?.id);
    const available=withoutAppliedJobs(jobs,appliedKeys);
    const ranked = (candidate&&!isSuperAdmin?rankResumeJobs(available, candidate):available).sort(newestPostedFirst);
    return { jobs: ranked.slice(page * 50, page * 50 + 50), total: ranked.length, hasMore: (page + 1) * 50 < ranked.length, recommendation };
  });
}
