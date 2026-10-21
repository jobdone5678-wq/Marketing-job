import 'server-only';
import {randomUUID} from 'node:crypto';
import {after} from 'next/server';
import {z} from 'zod';
import {extensionProfile} from '@/lib/capture/server';
import {database,checkDb,CaptureError} from '@/lib/db/admin';
import {enqueueTask} from '@/lib/tasks/repository';
import {aiConfiguration,getAIModel} from '@/lib/ai/config';
import {withAIExecutionWindow} from '@/lib/ai/execution-window';
import {resumeDocx} from './docx';
import {EXTENSION_AI_VERSION} from './extension-content';
import {currentExtensionCandidate,generateExtensionResume,type ExtensionResumeInput,type ExtensionJob} from './extension-task';
import {buildResume,fingerprint,normalizeCandidate} from '../../../browser-extension/resume-engine.js';
import type {UserProfile} from '@/types/database';
import type {BackgroundTask} from '@/lib/tasks/types';

export const extensionJobSchema=z.object({jobTitle:z.string().trim().min(1).max(500),companyName:z.string().trim().min(1).max(500),jobDescription:z.string().trim().min(40).max(100000),jobUrl:z.string().url().max(4000),consent:z.literal(true),requestId:z.uuid()});
export async function extensionResumeActor(request:Request){
 const actor=await extensionProfile(request);
 if(actor.status!=='active'||!['client','recruiter','super_admin'].includes(actor.role))throw new CaptureError('Your role cannot generate or access application resumes.',403);
 return actor as UserProfile;
}
export async function resumeRequestBody(request:Request){
 const body=await request.text();if(body.length>220000)throw new CaptureError('Resume request is too large. Use a shorter source resume and JD.',413);
 try{return JSON.parse(body);}catch{throw new CaptureError('Provide candidate details, a complete JD and AI processing consent.',400);}
}
export function canonicalExtensionJob(input:ExtensionJob):ExtensionJob{
 const url=new URL(input.jobUrl);
 if(!['https:','http:'].includes(url.protocol)||url.username||url.password)throw new CaptureError('Provide the actual HTTP(S) job URL.',400);
 url.hash='';for(const key of [...url.searchParams.keys()])if(/^(utm_|fbclid$|gclid$)/i.test(key))url.searchParams.delete(key);url.searchParams.sort();
 return {jobTitle:input.jobTitle,companyName:input.companyName,jobDescription:input.jobDescription,jobUrl:url.toString()};
}
export function extensionDocument(record:{id:string;candidate_id:string;candidate_version:number;job_url:string;scope_key:string;result:ReturnType<typeof buildResume>}){
 return {...record.result,success:true,status:'succeeded',savedToPortal:true,resumeId:record.id,candidateId:record.candidate_id,candidateVersion:record.candidate_version,jobUrl:record.job_url,scopeKey:record.scope_key,docxBase64:Buffer.from(resumeDocx(record.result.markdown)).toString('base64')};
}
export async function extensionTaskStatus(actor:UserProfile,id:string,uploaded:boolean){
 if(!z.uuid().safeParse(id).success)throw new CaptureError('Invalid AI task identifier.',400);
 const {data:task,error}=await database().from('background_tasks').select('id,actor_id,kind,status,payload,result,error').eq('id',id).eq('actor_id',actor.id).maybeSingle();checkDb(error);
 const input=task?.payload?.extensionTailoring as ExtensionResumeInput|undefined;
 if(!task||task.kind!=='resume_tailor'||!input||!!input.uploadedCandidate!==uploaded)throw new CaptureError('AI resume task not found.',404);
 await currentExtensionCandidate(actor,input);
 if(task.status==='failed'||task.status==='cancelled')throw new CaptureError(task.error||'AI generation failed. Generate again to retry.',422);
 if(task.status!=='succeeded')return {success:true,taskId:id,status:task.status,message:'Waiting for AI processing. A configured server or worker must be running.'};
 if(uploaded){
  const result=task.result?.result;
  if(!result?.ai||!result.markdown)throw new CaptureError('AI resume output is unavailable. Generate again.',409);
  return {...result,success:true,status:'succeeded',taskId:id,candidateId:input.candidateId,savedToPortal:false,jobUrl:input.job.jobUrl,docxBase64:Buffer.from(resumeDocx(result.markdown)).toString('base64')};
 }
 const {data:record,error:loadError}=await database().from('application_resume_versions').select('*').eq('id',task.result?.resumeId).eq('actor_id',actor.id).eq('candidate_id',input.candidateId).eq('scope_key',input.scopeKey).maybeSingle();checkDb(loadError);
 if(!record)throw new CaptureError('Saved AI resume not found.',404);
 return extensionDocument(record);
}
export async function requestExtensionAI(actor:UserProfile,candidate:Record<string,unknown>,job:ExtensionJob,requestId:string,uploaded=false){
 try{buildResume(candidate,job);}catch(error){throw new CaptureError(error instanceof Error?error.message:'Candidate facts or JD are missing.',422);}
 const candidateHash=await fingerprint(normalizeCandidate(candidate)),candidateVersion=Number(candidate.version)||1;
 const scopeKey=await fingerprint({engine:EXTENSION_AI_VERSION,model:getAIModel(),candidateId:candidate.id,candidateHash,candidateVersion,job});
 if(!uploaded){
  const {data:existing,error}=await database().from('application_resume_versions').select('*').eq('actor_id',actor.id).eq('candidate_id',candidate.id).eq('scope_key',scopeKey).maybeSingle();
  if(error)throw new CaptureError('Unable to read AI resume history. Check the application resume migration.',503);
  if(existing)return extensionDocument(existing);
 }
 const input:ExtensionResumeInput={version:EXTENSION_AI_VERSION,candidateId:String(candidate.id),candidateVersion,candidateHash,scopeKey,job,...(uploaded?{uploadedCandidate:candidate}:{})};
 const {taskId}=await enqueueTask({actorId:actor.id,kind:'resume_tailor',key:`extension-ai:${actor.id}:${scopeKey}:${requestId}`,payload:{candidateId:uploaded?undefined:candidate.id,extensionTailoring:input}});
 // An unconfigured web server leaves durable work for the separately configured worker.
 if(aiConfiguration().configured)after(async()=>{
  try{
  const {data:state,error:stateError}=await database().from('background_tasks').select('id,attempts').eq('id',taskId).eq('actor_id',actor.id).maybeSingle();checkDb(stateError);
  // Only the first attempt belongs to web processing. Recovery uses the longer worker window.
  if(!state||state.attempts>0)return;
  const {data:claimed,error}=await database().rpc('claim_specific_task',{p_task:taskId,p_lease:randomUUID()});checkDb(error);
  const task=claimed?.[0] as BackgroundTask|undefined;
  if(task){
   let result;
   try{result=await withAIExecutionWindow(45000,()=>generateExtensionResume(task));}
   catch(error){
    const message=error instanceof CaptureError?error.message:'AI resume processing failed. Check configuration and retry.';
    const {error:finishError}=await database().rpc('finish_task',{p_task:task.id,p_lease:task.lease_token,p_result:null,p_error:message,p_transient:error instanceof CaptureError&&error.status===502});checkDb(finishError);
    return;
   }
   const {error:finishError}=await database().rpc('finish_task',{p_task:task.id,p_lease:task.lease_token,p_result:result,p_error:null,p_transient:false});checkDb(finishError);
  }
  }catch{console.warn('AI resume task could not be finalized; the durable queue retains unfinished work.');}
 });
 return extensionTaskStatus(actor,taskId,uploaded);
}
