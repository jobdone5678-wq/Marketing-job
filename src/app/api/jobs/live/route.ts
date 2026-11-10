import {protectedRoute} from '@/lib/http/protected-route';
import {database,checkDb,CaptureError} from '@/lib/db/admin';
import {fetchSnapshot,validateBoard} from '@/lib/jobs/adapters/native';
import {isSoftwareJob} from '@/lib/jobs/normalize';
import type {NormalizedJob} from '@/lib/jobs/types';
import {recommendationContext} from '@/lib/jobs/recommendations';
import {rankResumeJobs} from '@/lib/jobs/relevance';
import {PUBLIC_JOB_BOARDS} from '@/lib/public-directory';
import {persistLiveJobs} from '@/lib/jobs/live-persistence';
import {publicationWindow,isWithinPublicationWindow,newestPostedFirst} from '@/lib/jobs/freshness';
import {candidateJobApplications} from '@/lib/jobs/applications';
import {withoutAppliedJobs} from '@/lib/jobs/application-state';

import type {SupportedJobProvider} from '@/lib/public-directory';

export interface LiveJobItem extends NormalizedJob {
  provider: SupportedJobProvider;
  board_slug: string;
}

const SUPPORTED_PROVIDERS: string[] = ['all', 'greenhouse', 'ashby', 'lever', 'smartrecruiters', 'breezy', 'remoteok'];

export async function GET(request:Request) {
  return protectedRoute(request, 'candidate_or_staff', async profile => {
    const params = new URL(request.url).searchParams;
    const postedWithin=params.get('postedWithin');
    if(postedWithin&&!['7','30','90','all'].includes(postedWithin))throw new CaptureError('Invalid posting date filter.');
    const window=publicationWindow(postedWithin);
    const {candidate,recommendation} = await recommendationContext(profile,params);
    if (recommendation.requiresProfile && !recommendation.staffSeeAll) return {jobs:[],total:0,fetchedAt:new Date().toISOString(),persistedInDb:false,recommendation};
    const requestedProvider = (params.get('provider') || 'all').toLowerCase();
    if (!SUPPORTED_PROVIDERS.includes(requestedProvider)) throw new CaptureError('Unsupported public job provider.');
    const requestedBoard = params.get('board')?.trim();
    const saveToDb = params.get('saveToDb') === 'true';
    type Source = {id?:string; provider:string; board_slug:string; company:string; enabled?:boolean};
    let activeSources:Source[];
    if (requestedBoard) {
      if (requestedProvider !== 'remoteok') {
        validateBoard(requestedBoard);
      }
      const provider = (requestedProvider !== 'all' ? requestedProvider : 'greenhouse') as SupportedJobProvider;
      const catalog = PUBLIC_JOB_BOARDS.find(b => b.provider === provider && b.board_slug === requestedBoard);
      activeSources = [{provider,board_slug:requestedBoard,company:params.get('company')?.trim() || catalog?.company || requestedBoard}];
    } else {

      // Read disabled sources too: an intentionally disabled directory must not
      // silently fall back to fetching those companies again.
      const {data,error} = await database().from('job_sources').select('*');
      checkDb(error);
      const sources = new Map<string,Source>();
      for (const source of PUBLIC_JOB_BOARDS) sources.set(`${source.provider}/${source.board_slug}`,source);
      // Saved settings override catalog defaults, including explicit disables.
      for (const source of data || []) sources.set(`${source.provider}/${source.board_slug}`,source);
      activeSources = [...sources.values()].filter(s => s.enabled !== false)
        .filter(s => requestedProvider === 'all' || s.provider === requestedProvider);
    }

    const results = await Promise.all(activeSources.map(async source => {
      try {
        const snapshot = await fetchSnapshot(source);
        const jobs = snapshot.jobs.filter(isSoftwareJob);
        try {
          const persisted = saveToDb ? await persistLiveJobs(source,profile.id,jobs,['recruiter','super_admin'].includes(profile.role)) : 0;
          return {source,jobs,persisted,error:undefined};
        } catch (error) {
          return {source,jobs,persisted:0,error:`Fetched jobs, but saving failed: ${(error as Error).message}`};
        }
      } catch (error) {
        return {source,jobs:[],persisted:0,error:(error as Error).message};
      }
    }));
    if (requestedBoard && results[0]?.error && !results[0].jobs.length) throw new CaptureError(`Failed to fetch from ${results[0].source.provider} board "${requestedBoard}": ${results[0].error}`,400);
    const jobs:LiveJobItem[] = results.flatMap(r => r.jobs.map(job => ({...job,provider:r.source.provider as SupportedJobProvider,board_slug:r.source.board_slug})));
    const search = params.get('search')?.trim().toLowerCase();
    const employment = params.get('type') || 'all';
    const company = params.get('company')?.trim().toLowerCase();
    const location = params.get('location')?.trim().toLowerCase();
    const filtered = jobs.filter(job => (!job.closes_at || !(Date.parse(job.closes_at) <= Date.now()))
      && isWithinPublicationWindow(job.posted_at,window)
      && (employment === 'all' || job.employment_type === employment)
      && (!company || job.company?.toLowerCase().includes(company))
      && (!location || job.location?.toLowerCase().includes(location))
      && (!search || [job.title,job.company,job.location,job.department].some(value => value?.toLowerCase().includes(search))));
    const {appliedKeys}=await candidateJobApplications(recommendation.candidateId||candidate?.id);
    const available=withoutAppliedJobs(filtered,appliedKeys);
    const displayed = (candidate ? rankResumeJobs(available,candidate) : available).sort(newestPostedFirst);
    const persistedCount = results.reduce((sum,result) => sum + result.persisted,0);
    return {jobs:displayed,total:displayed.length,recommendation,unfilteredTotal:jobs.length,
      sources:results.map(r => ({company:r.source.company,board:r.source.board_slug,provider:r.source.provider,count:r.jobs.length,...(r.error ? {error:r.error} : {})})),
      fetchedAt:new Date().toISOString(),live:true,persistedInDb:saveToDb && persistedCount > 0 && results.every(r => !r.error),persistedCount};
  });
}
