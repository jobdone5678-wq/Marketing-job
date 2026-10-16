import {protectedRoute} from '@/lib/http/protected-route';
import {database,CaptureError} from '@/lib/db/admin';
import {getTailoredResume} from '@/lib/tailored-resumes/repository';
import {checkWorkflowDb} from '@/lib/job-briefs/repository';
import {z} from 'zod';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){return protectedRoute(request,'candidate_or_staff',async profile=>({resume:(await getTailoredResume(profile,(await context.params).id)).resume}));}
export async function PATCH(request:Request,context:Context){return protectedRoute(request,'candidate_or_staff',async profile=>{
 const id=(await context.params).id;const {resume}=await getTailoredResume(profile,id);
 const body=z.object({revision:z.number().int().min(1),content:z.string().trim().min(1).max(100000),confirmFacts:z.literal(true)}).parse(await request.json());
 if(resume.stale)throw new CaptureError('Candidate or source changed. Generate a new resume.',409);
 const {error}=await database().rpc('review_tailored_resume',{p_actor:profile.id,p_resume:id,p_expected:body.revision,p_content:body.content});
 if(error?.message?.includes('changed'))throw new CaptureError('The resume changed. Reload it before saving.',409);checkWorkflowDb(error);
 return {resume:(await getTailoredResume(profile,id)).resume};
});}
