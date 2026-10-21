import {z} from 'zod';
import {extensionRoute,cors} from '@/lib/capture/server';
import {CaptureError} from '@/lib/db/admin';
import {extensionJobSchema,canonicalExtensionJob,extensionResumeActor,extensionTaskStatus,requestExtensionAI,resumeRequestBody} from '@/lib/tailored-resumes/extension-service';
import {candidateFromText} from '../../../../../browser-extension/resume-engine.js';
export const runtime='nodejs';
export const maxDuration=60;
export async function OPTIONS(request:Request){return cors(request,new Response(null,{status:204}));}
export async function POST(request:Request){
 return extensionRoute(request,async()=>{
  const actor=await extensionResumeActor(request);
  const input=extensionJobSchema.extend({candidate:z.object({id:z.string().startsWith('uploaded').max(120),source_text:z.string().min(40).max(100000)})}).safeParse(await resumeRequestBody(request));
  if(!input.success)throw new CaptureError('Supply the reviewed source resume, complete job details and AI processing consent.',400);
  let candidate:Record<string,unknown>;
  try{candidate={...candidateFromText(input.data.candidate.source_text),id:input.data.candidate.id};}
  catch{throw new CaptureError('Candidate details are incomplete. Review and save a readable source resume first.',422);}
  return requestExtensionAI(actor,candidate,canonicalExtensionJob(input.data),input.data.requestId,true);
 });
}
export async function GET(request:Request){return extensionRoute(request,async()=>extensionTaskStatus(await extensionResumeActor(request),new URL(request.url).searchParams.get('taskId')||'',true));}
