import { protectedRoute } from '@/lib/http/protected-route';
import { database, checkDb } from '@/lib/db/admin';
import { candidateAccess } from '@/lib/resumes/repository';
import { z } from 'zod';

const columns = '*,candidate:candidates(id,full_name,email,phone,visa_status,target_job_titles,primary_skills,current_city,current_state),recruiter:profiles!job_submissions_recruiter_id_fkey(id,full_name,email,role)';

export async function GET(request: Request) {
  return protectedRoute(request, 'candidate_or_staff', async (actor) => {
    const rawCandidateId = new URL(request.url).searchParams.get('candidateId');
    let query = database()
      .from('job_submissions')
      .select(columns)
      .order('submission_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (rawCandidateId) {
      const candidateId = z.string().uuid().parse(rawCandidateId);
      await candidateAccess(actor, candidateId);
      query = query.eq('candidate_id', candidateId);
    } else if (actor.role === 'client') {
      const { data: cand } = await database()
        .from('candidates')
        .select('id')
        .eq('user_id', actor.id)
        .maybeSingle();
      if (!cand) return { submissions: [] };
      query = query.eq('candidate_id', cand.id);
    }

    const { data, error } = await query.limit(500);
    checkDb(error);
    return { submissions: data || [] };
  });
}
