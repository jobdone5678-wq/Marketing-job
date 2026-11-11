import {protectedRoute} from '@/lib/http/protected-route';
import {database,CaptureError} from '@/lib/db/admin';
import {candidateAccess} from '@/lib/resumes/repository';
import {tailoringRole} from '@/lib/tailored-resumes/repository';
import {checkWorkflowDb} from '@/lib/tailored-resumes/workflow-db';
import {z} from 'zod';
export async function POST(request:Request){return protectedRoute(request,async profile=>{
 tailoringRole(profile);
 const body=z.object({candidateId:z.uuid(),jobId:z.uuid(),consent:z.literal(true)}).parse(await request.json());
 const candidate=await candidateAccess(profile,body.candidateId);
 if(candidate.provenance_status!=='confirmed')throw new CaptureError('Review and save the candidate resume before tailoring.',409);
 const {data,error}=await database().rpc('request_tailored_resume',{p_actor:profile.id,p_candidate:body.candidateId,p_job:body.jobId});checkWorkflowDb(error);return data;
});}
export async function GET(request:Request){return protectedRoute(request,async profile=>{
 tailoringRole(profile);const params=new URL(request.url).searchParams;const candidateId=z.uuid().parse(params.get('candidateId'));
 const candidate=await candidateAccess(profile,candidateId);
 let query=database().from('tailored_resumes').select('id,candidate_id,candidate_version,job_id,source_version,status,revision,reviewed_revision,model,task_id,created_at,data').eq('candidate_id',candidateId);
 if(params.get('jobId'))query=query.eq('job_id',z.uuid().parse(params.get('jobId')));
 const {data,error}=await query.order('created_at',{ascending:false}).limit(50);checkWorkflowDb(error);
 return {resumes:(data||[]).map(row=>({...row,stale:row.candidate_version!==candidate.version}))};
});}
