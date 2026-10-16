import 'server-only';
import {database,CaptureError} from '@/lib/db/admin';
import {checkWorkflowDb} from '@/lib/job-briefs/repository';
import {candidateAccess} from '@/lib/resumes/repository';
import type {UserProfile} from '@/types/database';
import {z} from 'zod';
export function tailoringRole(profile:UserProfile){if(!['client','recruiter','super_admin'].includes(profile.role))throw new CaptureError('Resume tailoring is available to candidates, recruiters and Super Admin.',403);}
export async function getTailoredResume(profile:UserProfile,id:string){
 tailoringRole(profile);if(!z.uuid().safeParse(id).success)throw new CaptureError('Invalid resume identifier.');
 const {data,error}=await database().from('tailored_resumes').select('*').eq('id',id).maybeSingle();checkWorkflowDb(error);
 if(!data)throw new CaptureError('Tailored resume not found.',404);
 const candidate=await candidateAccess(profile,data.candidate_id);
 const {data:current,error:versionError}=await database().rpc('tailored_resume_is_current',{p_resume:id});checkWorkflowDb(versionError);
 return {resume:{...data,stale:!current},candidate};
}
