import { protectedRoute } from '@/lib/http/protected-route';
import { database, checkDb } from '@/lib/db/admin';
import { candidateProfileCache } from '@/lib/cache';
import { applicationUrlKey } from '@/lib/jobs/application-state';

export async function GET(request: Request) {
  return protectedRoute(request, async (profile) => {
    const { searchParams } = new URL(request.url);
    const rawSearch = searchParams.get('q')?.trim() || '';
    const safeSearch = rawSearch.replace(/[%_,()'"\\:]/g, ' ').trim();

    let candidateId: string | null = null;

    // Enforce data isolation: candidates can only view their own outside job applications
    {
      // System Design: L1 In-Memory Cache with SWR for candidate ID resolution
      const cand = await candidateProfileCache.fetchWithSWR(
        `candidate:user:${profile.id}`,
        async () => {
          const { data, error } = await database()
            .from('candidates')
            .select('id, user_id')
            .eq('user_id', profile.id)
            .maybeSingle();
          checkDb(error);
          return data || { id: '', user_id: profile.id };
        },
        { ttlMs: 30000, staleTtlMs: 120000 }
      );

      candidateId = cand?.id || null;
    }

    let query = database()
      .from('outside_jobs')
      .select('*,candidate:candidates(id, full_name, email, current_city)')
      .order('created_at', { ascending: false });

    query = candidateId
      ? query.or(
          `capture_owner_id.eq.${profile.id},and(capture_owner_id.is.null,candidate_id.eq.${candidateId})`
        )
      : query.eq('capture_owner_id', profile.id);

    if (safeSearch) {
      const term = `%${safeSearch}%`;
      query = query.or(
        `company.ilike.${term},title.ilike.${term},portal_source.ilike.${term},location.ilike.${term}`
      );
    }

    const { data, error } = await query;
    checkDb(error);
    const postings = new Map<string, NonNullable<typeof data>[number]>();
    for (const job of data || []) {
      const key = applicationUrlKey(job.job_url) || job.id;
      const previous = postings.get(key);
      if (!previous || (job.status === 'Applied' && previous.status !== 'Applied')) {
        postings.set(key, job);
      }
    }
    return { success: true, outsideJobs: [...postings.values()] };
  });
}
