import { protectedRoute } from '@/lib/http/protected-route';
import { database, checkDb, CaptureError } from '@/lib/db/admin';
import { candidateProfileCache, outsideJobsCache } from '@/lib/cache';

export async function GET(request: Request) {
  return protectedRoute(request,async (profile) => {
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

      if (!cand || !cand.id) {
        return { success: true, outsideJobs: [] };
      }
      candidateId = cand.id;
    }

    // Cache key for query results based on role, candidate, and search parameter
    const cacheKey = `outside-jobs:${profile.id}:${candidateId || 'staff'}:${safeSearch || 'all'}`;

    // System Design: Cache-aside with SWR revalidation to achieve sub-5ms response times
    const outsideJobs = await outsideJobsCache.fetchWithSWR(
      cacheKey,
      async () => {
        let query = database()
          .from('outside_jobs')
          .select(`
            *,
            candidate:candidates(id, full_name, email, current_city)
          `)
          .order('created_at', { ascending: false });

        if (candidateId) {
          query = query.eq('candidate_id', candidateId);
        }

        if (safeSearch) {
          const term = `%${safeSearch}%`;
          query = query.or(`company.ilike.${term},title.ilike.${term},portal_source.ilike.${term},location.ilike.${term}`);
        }

        const { data, error } = await query;
        checkDb(error);
        return data || [];
      },
      { ttlMs: 10000, staleTtlMs: 30000 }
    );

    return { success: true, outsideJobs };
  });
}
