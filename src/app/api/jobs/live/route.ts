import {protectedRoute} from '@/lib/http/protected-route';
import {database,checkDb,CaptureError} from '@/lib/db/admin';
import {fetchSnapshot,validateBoard} from '@/lib/jobs/adapters/native';
import {isSoftwareJob} from '@/lib/jobs/normalize';
import type {NormalizedJob} from '@/lib/jobs/types';

export interface LiveJobItem extends NormalizedJob {
  provider: 'greenhouse' | 'ashby';
  board_slug: string;
}

export async function GET(request: Request) {
  return protectedRoute(request, 'candidate_or_staff', async (profile) => {
    const params = new URL(request.url).searchParams;
    const requestedProvider = (params.get('provider') || 'all').toLowerCase();
    const requestedBoard = params.get('board')?.trim();
    const requestedCompany = params.get('company')?.trim();
    const employmentFilter = params.get('type') || 'all';
    const searchQuery = params.get('search')?.trim().toLowerCase();
    const saveToDb = params.get('saveToDb') === 'true';

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

        // Filter strictly for software-related roles
        const softwareJobs = snapshot.jobs.filter(isSoftwareJob);
        for (const job of softwareJobs) {
          jobs.push({ ...job, provider, board_slug: requestedBoard });
        }
        sourceStatuses.push({
          company: companyName,
          board: requestedBoard,
          provider,
          count: softwareJobs.length,
        });

        // Save to DB if requested
        if (saveToDb && softwareJobs.length > 0) {
          const db = database();
          // Ensure source exists
          let sourceId = null;
          const { data: existingSrc } = await db.from('job_sources').select('id').eq('provider', provider).eq('board_slug', requestedBoard).maybeSingle();
          if (existingSrc) {
            sourceId = existingSrc.id;
          } else {
            const { data: newSrc } = await db.from('job_sources').insert({
              provider,
              board_slug: requestedBoard,
              company: companyName,
              created_by: profile.id
            }).select('id').maybeSingle();
            sourceId = newSrc?.id;
          }

          if (sourceId) {
            for (const item of softwareJobs) {
              await db.from('jobs').upsert({
                source_id: sourceId,
                external_id: item.external_id,
                title: item.title,
                company: item.company,
                source_url: item.source_url,
                application_url: item.application_url,
                location: item.location,
                department: item.department,
                description: item.description,
                description_html: item.description_html,
                employment_type: item.employment_type,
                employment_evidence: item.employment_evidence,
                arrangements: item.arrangements,
                compensation: item.compensation,
                content_hash: item.content_hash,
                state: 'active'
              }, { onConflict: 'source_id,external_id' });
            }
          }
        }
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

      // Default active sources if none configured
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
            const softwareJobs = snapshot.jobs.filter(isSoftwareJob);
            return { src, jobs: softwareJobs };
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

            // Save to DB if requested
            if (saveToDb && src.id && srcJobs.length > 0) {
              const db = database();
              for (const item of srcJobs) {
                await db.from('jobs').upsert({
                  source_id: src.id,
                  external_id: item.external_id,
                  title: item.title,
                  company: item.company,
                  source_url: item.source_url,
                  application_url: item.application_url,
                  location: item.location,
                  department: item.department,
                  description: item.description,
                  description_html: item.description_html,
                  employment_type: item.employment_type,
                  employment_evidence: item.employment_evidence,
                  arrangements: item.arrangements,
                  compensation: item.compensation,
                  content_hash: item.content_hash,
                  state: 'active'
                }, { onConflict: 'source_id,external_id' });
              }
            }
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

    // In-memory filter for display
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
      persistedInDb: saveToDb,
    };
  });
}
