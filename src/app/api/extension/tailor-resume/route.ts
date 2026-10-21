import {extensionRoute,cors} from '@/lib/capture/server';
import {database,checkDb,CaptureError} from '@/lib/db/admin';
import {candidateAccess} from '@/lib/resumes/repository';
import {extensionJobSchema,canonicalExtensionJob,extensionResumeActor,extensionDocument,extensionTaskStatus,requestExtensionAI,resumeRequestBody} from '@/lib/tailored-resumes/extension-service';
import {z} from 'zod';
export const runtime='nodejs';
export const maxDuration=60;
export async function OPTIONS(request:Request){return cors(request,new Response(null,{status:204}));}
export async function POST(request:Request){
 return extensionRoute(request,async()=>{
  const actor=await extensionResumeActor(request);
  const parsed=extensionJobSchema.extend({candidateId:z.uuid()}).safeParse(await resumeRequestBody(request));
  if(!parsed.success)throw new CaptureError('Select a candidate, supply the actual job title, company, URL and full JD, and agree to AI processing.',400);
  const input=parsed.data,candidate=await candidateAccess(actor,input.candidateId);
  if(candidate.provenance_status!=='confirmed')throw new CaptureError('Review and confirm the candidate details before AI tailoring.',409);
  return requestExtensionAI(actor,candidate as unknown as Record<string,unknown>,canonicalExtensionJob(input),input.requestId);
 });
}
export async function GET(request:Request){
 return extensionRoute(request,async()=>{
  const actor=await extensionResumeActor(request),params=new URL(request.url).searchParams;
  if(params.has('taskId'))return extensionTaskStatus(actor,params.get('taskId')!,false);
  const candidateId=params.get('candidateId');
  if(!z.uuid().safeParse(candidateId).success)throw new CaptureError('Select a valid candidate to view resume history.',400);
  await candidateAccess(actor,candidateId!);
  const query=database().from('application_resume_versions').select('*').eq('actor_id',actor.id).eq('candidate_id',candidateId!);
  const resumeId=params.get('resumeId');
  if(resumeId){
   if(!z.uuid().safeParse(resumeId).success)throw new CaptureError('Invalid resume identifier.',400);
   const {data,error}=await query.eq('id',resumeId).maybeSingle();checkDb(error);
   if(!data)throw new CaptureError('Application resume not found.',404);
   return extensionDocument(data);
  }
  const paging=z.object({offset:z.coerce.number().int().min(0),limit:z.coerce.number().int().min(1).max(100)}).safeParse({offset:params.get('offset')||0,limit:params.get('limit')||25});
  if(!paging.success)throw new CaptureError('Invalid resume history pagination.',400);
  const {offset,limit}=paging.data;
  const {data,error}=await query.order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+limit);checkDb(error);
  const rows=data||[];
  return {success:true,resumes:rows.slice(0,limit).map(row=>({resumeId:row.id,candidateId:row.candidate_id,candidateVersion:row.candidate_version,jobTitle:row.job_title,companyName:row.company_name,jobUrl:row.job_url,createdAt:row.created_at,filename:row.result.filename,matchScore:row.result.matchScore,ai:!!row.result.ai})),nextOffset:rows.length>limit?offset+limit:null};
 });
}
