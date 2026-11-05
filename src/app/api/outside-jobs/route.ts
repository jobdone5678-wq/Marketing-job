import { protectedRoute } from '@/lib/http/protected-route';
import { database, checkDb, CaptureError } from '@/lib/db/admin';

export async function GET(request: Request) {
  return protectedRoute(request, 'candidate_or_staff', async (profile) => {
    const { searchParams } = new URL(request.url);
    const rawSearch = searchParams.get('q')?.trim() || '';
    const safeSearch = rawSearch.replace(/[%_,()'"\\:]/g, ' ').trim();

    let query = database()
      .from('outside_jobs')
      .select(`
        *,
        candidate:candidates(id, full_name, email, current_city)
      `)
      .order('created_at', { ascending: false });

    // Enforce data isolation: candidates can only view their own outside job applications
    if (profile.role === 'client') {
      const { data: cand, error: candError } = await database()
        .from('candidates')
        .select('id')
        .eq('user_id', profile.id)
        .maybeSingle();
      checkDb(candError);

      if (!cand) {
        return { success: true, outsideJobs: [] };
      }
      query = query.eq('candidate_id', cand.id);
    }

    if (safeSearch) {
      const term = `%${safeSearch}%`;
      query = query.or(`company.ilike.${term},title.ilike.${term},portal_source.ilike.${term},location.ilike.${term}`);
    }

    const { data, error } = await query;
    checkDb(error);

    return { success: true, outsideJobs: data || [] };
  });
}
