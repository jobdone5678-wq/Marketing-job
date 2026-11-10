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

    if (actor.role === 'client' || actor.role === 'job_seeker') {
      const { data: userCandidates, error: candErr } = await database()
        .from('candidates')
        .select('id')
        .or(`user_id.eq.${actor.id},email.eq.${actor.email}`);
      checkDb(candErr);
      const ownedIds = (userCandidates || []).map(c => c.id);
      if (ownedIds.length === 0) return { submissions: [] };

      if (rawCandidateId) {
        const candidateId = z.string().uuid().parse(rawCandidateId);
        if (!ownedIds.includes(candidateId)) return { submissions: [] };
        query = query.eq('candidate_id', candidateId);
      } else {
        query = query.in('candidate_id', ownedIds);
      }
    } else if (rawCandidateId) {
      const candidateId = z.string().uuid().parse(rawCandidateId);
      await candidateAccess(actor, candidateId);
      query = query.eq('candidate_id', candidateId);
    }

    const { data, error } = await query.limit(500);
    checkDb(error);

    const enriched = (data || []).map((row: any) => {
      if (!row.rtr_document && row.notes && typeof row.notes === 'string') {
        const match = row.notes.match(/<!-- RTR_METADATA:\s*(\{[\s\S]*?\})\s*-->/);
        if (match) {
          try {
            row.rtr_document = JSON.parse(match[1]);
          } catch {}
        }
      }
      return row;
    });

    return { submissions: enriched };
  });
}
