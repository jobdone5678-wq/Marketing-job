import { extensionRoute, extensionProfile, cors } from '@/lib/capture/server';
import { database, checkDb, CaptureError } from '@/lib/db/admin';
import { z } from 'zod';
import type { Candidate } from '@/types/database';

export async function OPTIONS(request: Request) {
  return cors(request, new Response(null, { status: 204 }));
}

export async function GET(request: Request) {
  return extensionRoute(request, async () => {
    const profile = await extensionProfile(request);
    const requested = new URL(request.url).searchParams.get('candidateId');
    if (requested) z.uuid().parse(requested);

    // Fetch active bench candidates
    let query = database()
      .from('candidates')
      .select(`
        id,
        user_id,
        version,
        provenance_status,
        full_name,
        email,
        phone,
        linkedin_url,
        current_city,
        current_state,
        full_address,
        visa_status,
        authorized_in_usa,
        need_sponsorship_now,
        need_sponsorship_future,
        open_to_relocation,
        current_employer,
        current_job_title,
        total_experience_years,
        relevant_experience_years,
        primary_skills,
        secondary_skills,
        highest_qualification,
        university_name,
        graduation_year,
        is_active_bench
      `)
      .eq('provenance_status', 'confirmed')
      .order('updated_at', { ascending: false })
      .order('id')
      .limit(profile.role === 'client' ? 1 : 100);
    if (profile.role === 'client') query = query.eq('user_id', profile.id);
    if (profile.role === 'recruiter') query = query.eq('assigned_recruiter_id', profile.id);
    if (profile.role === 'technical_recruiter') query = query.eq('assigned_technical_recruiter_id', profile.id);
    if (requested) query = query.eq('id', requested);
    const { data, error } = await query;

    checkDb(error);
    const candidates = (data || []) as Candidate[];
    if (requested && candidates.length === 0) throw new CaptureError('Candidate not found or not assigned to this account.', 404);

    return {
      candidates: candidates || [],
      actorId: profile.id,
      role: profile.role,
      ownCandidateId: profile.role === 'client' ? candidates?.[0]?.id || null : null,
    };
  });
}
