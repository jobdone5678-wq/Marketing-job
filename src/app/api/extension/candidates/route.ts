import { extensionRoute, extensionActor, cors } from '@/lib/capture/server';
import { database, checkDb } from '@/lib/db/admin';

export async function OPTIONS(request: Request) {
  return cors(request, new Response(null, { status: 204 }));
}

export async function GET(request: Request) {
  return extensionRoute(request, async () => {
    const actorId = await extensionActor(request);

    // Fetch active bench candidates
    const { data: candidates, error } = await database()
      .from('candidates')
      .select(`
        id,
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
      .order('full_name', { ascending: true })
      .limit(100);

    checkDb(error);

    return {
      candidates: candidates || [],
      actorId,
    };
  });
}
