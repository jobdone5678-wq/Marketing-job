import { protectedRoute } from '@/lib/http/protected-route';
import { database, checkDb, CaptureError } from '@/lib/db/admin';
import { candidateAccess } from '@/lib/resumes/repository';
import { z } from 'zod';

export async function GET(request: Request, context: { params: Promise<{id:string}> }) {
  return protectedRoute(request, 'candidate_or_staff', async profile => {
    const id = z.uuid().parse((await context.params).id);
    const { data: submission, error } = await database().from('job_submissions').select('id,candidate_id').eq('id', id).maybeSingle();
    checkDb(error);
    if (!submission) throw new CaptureError('Submission not found.',404);
    await candidateAccess(profile, submission.candidate_id);
    const { data, error: snapshotError } = await database().from('application_answer_snapshots')
      .select('id,actor_id,event_key,attempt,revision,portal,portal_url,profile_version,answers,observed_at,created_at')
      .eq('submission_id', id).order('created_at',{ascending:false});
    checkDb(snapshotError);
    return { snapshots: data || [] };
  });
}
