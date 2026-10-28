import {z} from 'zod';
import {database,checkDb,CaptureError} from '@/lib/db/admin';

export const appliedResumeSchema=z.object({
  filename:z.string().min(1).max(255),
  mimeType:z.string().min(1).max(255),
  base64:z.string().max(14_000_000).optional().nullable(),
  markdown:z.string().max(100000).optional().nullable(),
  isTailored:z.boolean().default(false),
  matchScore:z.number().min(0).max(100).optional().nullable(),
  appliedAt:z.string().optional().nullable(),
  resumeId:z.uuid().optional().nullable(),
}).optional().nullable();

// Call only after the authenticated observation/submission RPC has checked access.
export async function saveAppliedResume(submissionId:string,candidateId:string,resume:z.infer<typeof appliedResumeSchema>){
  if(!resume)return;
  const {data,error}=await database().from('job_submissions').update({applied_resume:resume})
    .eq('id',submissionId).eq('candidate_id',candidateId).select('id').maybeSingle();
  checkDb(error);
  if(!data)throw new CaptureError('Applied resume could not be saved to this application.',404);
}
