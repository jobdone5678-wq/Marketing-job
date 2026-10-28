import {appliedResumeSchema,saveAppliedResume} from './applied-resume';
import 'server-only';import {createHash} from 'node:crypto';import {database,checkDb,CaptureError,errorResponse} from '@/lib/db/admin';import {allowedCaptureUrl,validateObservation} from './validation';import {validateApplicationAnswers} from './snapshot';import {z} from 'zod';
export const tokenHash=(value:string)=>createHash('sha256').update(value).digest('hex');
export type ExtensionProfile = { id: string; status: string; role: 'client' | 'recruiter' | 'technical_recruiter' | 'super_admin' };
export async function extensionProfile(request: Request): Promise<ExtensionProfile> {
  const header = request.headers.get('authorization') || '';
  if (!/^Bearer [A-Za-z0-9_-]{40,100}$/.test(header)) throw new CaptureError('Extension authorization required.', 401);
  const { data, error } = await database().from('extension_credentials').select('owner_id,expires_at,revoked_at')
    .eq('token_hash', tokenHash(header.slice(7))).maybeSingle();
  checkDb(error);
  const credential = data as {owner_id: string; expires_at: string; revoked_at: string | null} | null;
  if (!credential || credential.revoked_at || Date.parse(credential.expires_at) <= Date.now()) {
    throw new CaptureError('Extension credential expired or revoked.', 401);
  }
  const { data: profileData, error: profileError } = await database().from('profiles').select('id,status,role').eq('id', credential.owner_id).single();
  checkDb(profileError);
  const profile = profileData as ExtensionProfile | null;
  if (!profile || profile.status !== 'active' || !['client', 'recruiter', 'technical_recruiter', 'super_admin'].includes(profile.role)) {
    throw new CaptureError('Active account required.', 403);
  }
  return profile;
}
export async function extensionActor(request: Request) {
  const profile = await extensionProfile(request);
  if(profile.role==='client')throw new CaptureError('Active recruiting staff required for linked application actions.',403);
  return profile.id;
}
export async function recordObservation(actor:string,body:unknown,manual=false){const input=z.object({intentId:z.uuid(),eventKey:z.uuid(),status:z.enum(['in_progress','submit_attempted','submitted','failed']),attempt:z.number().int().min(1).max(1000),evidence:z.string().min(1).max(1000),url:z.string().url().max(2000),observedAt:z.string().datetime(),answers:z.unknown().optional(),appliedResume:appliedResumeSchema}).parse(body);const parsedUrl=new URL(input.url);parsedUrl.search='';parsedUrl.hash='';const safeUrl=parsedUrl.toString();const {data:intent,error}=await database().from('application_intents').select('*,job:jobs(application_url),candidate:candidates(version)').eq('id',input.intentId).eq('owner_id',actor).single();checkDb(error);if(!intent)throw new CaptureError('Intent not found.',404);if(!manual&&(!allowedCaptureUrl(safeUrl,intent.job.application_url)||!validateObservation(input.status,input.evidence)))throw new CaptureError('Unsupported site or insufficient application evidence. Review manually.',422);
 const validatedAnswers=input.answers!==undefined?validateApplicationAnswers(input.answers):undefined;
 const {data,error:save}=await database().rpc('record_browser_event',{p_actor:actor,p_intent:input.intentId,p_key:input.eventKey,p_status:input.status,p_attempt:input.attempt,p_source:manual?'recruiter_attestation':'extension_observation',p_evidence:input.evidence,p_url:safeUrl,p_observed:input.observedAt});checkDb(save);
 if(input.appliedResume&&input.status==='submitted')await saveAppliedResume(intent.submission_id,intent.candidate_id,input.appliedResume);
 let snapshot=null;
 if(input.answers!==undefined&&['submit_attempted','submitted'].includes(input.status)){
  const answers=validatedAnswers;
  const {data:stored,error:snapshotError}=await database().rpc('save_application_answer_snapshot',{p_actor:actor,p_intent:input.intentId,p_submission:intent.submission_id,p_candidate:intent.candidate_id,p_attempt:input.attempt,p_event_key:input.eventKey,p_portal:parsedUrl.hostname,p_url:safeUrl,p_profile_version:intent.candidate?.version??null,p_answers:answers,p_observed_at:input.observedAt});checkDb(snapshotError);snapshot=stored;
 }
 return {status:data,snapshot};}
export async function extensionRoute(request:Request,work:()=>Promise<unknown>){try{return cors(request,Response.json(await work()));}catch(e){if(e instanceof z.ZodError)return cors(request,Response.json({error:'Invalid capture request.'},{status:400}));return cors(request,errorResponse(e));}}
export function cors(request:Request,response:Response){const origin=request.headers.get('origin');if(origin&&(origin.startsWith('chrome-extension://')||origin.startsWith('http://localhost')||origin.startsWith('http://127.0.0.1'))){response.headers.set('Access-Control-Allow-Origin',origin);response.headers.set('Vary','Origin');response.headers.set('Access-Control-Allow-Headers','Authorization, Content-Type');response.headers.set('Access-Control-Allow-Methods','GET, POST, OPTIONS, DELETE');response.headers.set('Access-Control-Allow-Credentials','true');}return response;}
