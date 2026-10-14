import { protectedRoute } from '@/lib/http/protected-route';
import { database, checkDb, CaptureError } from '@/lib/db/admin';
import { candidateInput } from '@/lib/candidate-input';
export async function GET(request: Request) {
  return protectedRoute(request, 'candidate_or_staff', async profile => {
    const url = new URL(request.url);
    const page = Math.max(0, Number(url.searchParams.get('page') || 0)); if (!Number.isSafeInteger(page)) throw new CaptureError('Invalid page.');
    const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get('limit') || 100)));
    const offset = page * limit;
    let query = database().from('candidates').select('*', { count: 'exact' }).order('created_at', { ascending: false }).order('id').range(offset, offset + limit - 1);
    if (profile.role === 'client') query = query.eq('user_id', profile.id);
    if (profile.role === 'recruiter') query = query.eq('assigned_recruiter_id', profile.id);
    if (profile.role === 'technical_recruiter') query = query.eq('assigned_technical_recruiter_id', profile.id);
    const { data, error, count } = await query; checkDb(error); return { candidates: data, total: count || 0, hasMore: (page + 1) * limit < (count || 0), role: profile.role }
  });
}
export async function POST(request: Request) {
  return protectedRoute(request, 'candidate_or_staff', async profile => {
    const fields = candidateInput.parse(await request.json()); if (!fields.full_name?.trim()) throw new CaptureError('Full name is required.');
    const { data: id, error } = await database().rpc('save_candidate_profile', { p_actor: profile.id, p_id: null, p_expected: null, p_fields: fields }); checkDb(error)
    const { data, error: readError } = await database().from('candidates').select('*').eq('id', id).single(); checkDb(readError); return { candidate: data };
  });
}
