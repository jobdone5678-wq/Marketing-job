import {protectedRoute} from '@/lib/http/protected-route';
import {database,checkDb,CaptureError} from '@/lib/db/admin';
import {fetchSnapshot,validateBoard} from '@/lib/jobs/adapters/native';
import type {NormalizedJob} from '@/lib/jobs/types';

export interface LiveJobItem extends NormalizedJob {
  provider: 'greenhouse' | 'ashby';
  board_slug: string;
}

export async function GET(request: Request) {
  return protectedRoute(request, 'candidate_or_staff', async () => {
    const params = new URL(request.url).searchParams;
    const requestedProvider = (params.get('provider') || 'all').toLowerCase();
    const requestedBoard = params.get('board')?.trim();
    const requestedCompany = params.get('company')?.trim();
    const employmentFilter = params.get('type') || 'all';
    const searchQuery = params.get('search')?.trim().toLowerCase();

    const jobs: LiveJobItem[] = [];
    const sourceStatuses: { company: string; board: string; provider: string; count: number; error?: string }[] = [];

    // Mode 1: Direct board fetch requested by user (e.g. ?board=stripe&provider=greenhouse)
    if (requestedBoard) {
      const provider = requestedProvider === 'ashby' ? 'ashby' : 'greenhouse';
      try {
        validateBoard(requestedBoard);
        const companyName = requestedCompany || requestedBoard.charAt(0).toUpperCase() + requestedBoard.slice(1);
        const snapshot = await fetchSnapshot({
          provider,
          board_slug: requestedBoard,
          company: companyName,
        });

        for (const job of snapshot.jobs) {
          jobs.push({ ...job, provider, board_slug: requestedBoard });
        }
        sourceStatuses.push({
          company: companyName,
          board: requestedBoard,
          provider,
          count: snapshot.jobs.length,
        });
      } catch (err) {
        throw new CaptureError(`Failed to fetch from ${provider} board "${requestedBoard}": ${(err as Error).message}`, 400);
      }
    } else {
      // Mode 2: Fetch all enabled sources configured in job_sources
      let q = database().from('job_sources').select('*').eq('enabled', true);
      if (requestedProvider === 'greenhouse' || requestedProvider === 'ashby') {
        q = q.eq('provider', requestedProvider);
      }
      const { data: sources, error } = await q;
      checkDb(error);

      // If no sources exist in DB yet, provide helpful default public tech boards for instant live demo
      const activeSources = (sources && sources.length > 0)
        ? sources
        : [
            { provider: 'greenhouse', board_slug: 'ramp', company: 'Ramp' },
            { provider: 'greenhouse', board_slug: 'figma', company: 'Figma' },
            { provider: 'ashby', board_slug: 'openai', company: 'OpenAI' },
          ].filter(s => requestedProvider === 'all' || s.provider === requestedProvider);

      const fetchResults = await Promise.allSettled(
        activeSources.map(async (src) => {
          try {
            const snapshot = await fetchSnapshot(src);
            return { src, jobs: snapshot.jobs };
          } catch (err) {
            return { src, error: (err as Error).message };
          }
        })
      );

      for (const res of fetchResults) {
        if (res.status === 'fulfilled') {
          const { src, jobs: srcJobs, error: srcError } = res.value;
          if (srcJobs) {
            for (const j of srcJobs) {
              jobs.push({
                ...j,
                provider: src.provider as 'greenhouse' | 'ashby',
                board_slug: src.board_slug,
              });
            }
            sourceStatuses.push({
              company: src.company,
              board: src.board_slug,
              provider: src.provider,
              count: srcJobs.length,
            });
          } else {
            sourceStatuses.push({
              company: src.company,
              board: src.board_slug,
              provider: src.provider,
              count: 0,
              error: srcError,
            });
          }
        }
      }
    }

    // In-memory filter (Zero database queries or writes)
    let filtered = jobs;
    if (employmentFilter !== 'all') {
      filtered = filtered.filter((j) => j.employment_type === employmentFilter);
    }
    if (searchQuery) {
      filtered = filtered.filter(
        (j) =>
          j.title.toLowerCase().includes(searchQuery) ||
          j.company.toLowerCase().includes(searchQuery) ||
          (j.location && j.location.toLowerCase().includes(searchQuery)) ||
          (j.department && j.department.toLowerCase().includes(searchQuery))
      );
    }

    return {
      jobs: filtered,
      total: filtered.length,
      unfilteredTotal: jobs.length,
      sources: sourceStatuses,
      fetchedAt: new Date().toISOString(),
      live: true,
      persistedInDb: false,
    };
  });
}
