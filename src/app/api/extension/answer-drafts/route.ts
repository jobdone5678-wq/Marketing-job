import {extensionRoute,cors} from '@/lib/capture/server';
import {extensionResumeActor,resumeRequestBody} from '@/lib/tailored-resumes/extension-service';
import {requestScreening,answerTaskStatus} from '@/lib/extension-answers/service';
export const runtime='nodejs';
export const maxDuration=60;
export async function OPTIONS(request:Request){return cors(request,new Response(null,{status:204}));}
export async function POST(request:Request){return extensionRoute(request,async()=>requestScreening(await extensionResumeActor(request),await resumeRequestBody(request)));}
export async function GET(request:Request){return extensionRoute(request,async()=>answerTaskStatus(await extensionResumeActor(request),new URL(request.url).searchParams.get('taskId')||''));}
