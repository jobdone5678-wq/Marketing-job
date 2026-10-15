import {jobRequirements} from './requirements';
import 'server-only';import {database,checkDb,CaptureError} from '@/lib/db/admin';import {getAIModel} from './client';import {validateMatch} from './match-validation';import type {BackgroundTask} from '@/lib/tasks/types';
export async function recruitingInputs(task:BackgroundTask){const db=database();const {data:candidate,error:c}=await db.from('candidates').select('*').eq('id',task.payload.candidateId).single();checkDb(c);const {data:job,error:j}=await db.from('jobs').select('*').eq('id',task.payload.jobId).single();checkDb(j);const {data:actor,error:a}=await db.from('profiles').select('role,status').eq('id',task.actor_id).single();checkDb(a);
 if(!actor||actor.status!=='active'||actor.role==='client'&&candidate.user_id!==task.actor_id)throw new CaptureError('Candidate access denied.',403);
 if(candidate.provenance_status!=='confirmed')throw new CaptureError('Review and confirm the candidate profile first.',409);
 if(candidate.version!==task.payload.candidateVersion||job.version!==task.payload.jobVersion||job.state==='closed')throw new CaptureError('Candidate or job changed. Start a new comparison.',409);
 return {candidate,job};}
export async function analyzeMatch(task:BackgroundTask){const {candidate,job}=await recruitingInputs(task);const db=database();const {data:cached,error}=await db.from('candidate_matches').select('id').eq('candidate_id',candidate.id).eq('job_id',job.id).eq('candidate_version',candidate.version).eq('job_version',job.version).eq('prompt_version','match-v1').maybeSingle();checkDb(error);if(cached)return {matchId:cached.id};
 const requirements=await jobRequirements(task,job);
 // AI extracts job criteria. Reviewed candidate evidence is verified locally;
 // a second model cannot rename criteria or turn supported literal skills into unknowns.
 const validated=validateMatch({requirements:requirements.requirements.map(r=>({...r,status:'unknown',candidateField:null,candidateEvidence:null})),constraints:requirements.constraints},candidate.confirmed_facts,job.description);
 const {data:id,error:save}=await db.rpc('save_recruiting_artifact',{p_task:task.id,p_lease:task.lease_token,p_candidate:candidate.id,p_job:job.id,p_cv:candidate.version,p_jv:job.version,p_data:validated,p_model:getAIModel(),p_packet:false});checkDb(save);return {matchId:id};}