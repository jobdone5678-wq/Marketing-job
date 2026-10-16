import {protectedRoute} from '@/lib/http/protected-route';
import {database,checkDb,CaptureError} from '@/lib/db/admin';
import {aiConfiguration} from '@/lib/ai/config';
import {withAIExecutionWindow} from '@/lib/ai/execution-window';
import {handleTask} from '@/lib/tasks/handlers';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import type {BackgroundTask} from '@/lib/tasks/types';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
 return protectedRoute(request,'candidate_or_staff',async actor=>{
  const {id}=await context.params;if(!z.uuid().safeParse(id).success)throw new CaptureError('Invalid task identifier.');
  const db=database();const {data:allowed,error:accessError}=await db.rpc('task_actor_can_access',{p_actor:actor.id,p_task:id});checkDb(accessError);
  if(!allowed)throw new CaptureError('Task not found.',404);
  const {data:target,error}=await db.from('background_tasks').select('id,actor_id,kind,status').eq('id',id).maybeSingle();checkDb(error);
  if(!target||(target.actor_id!==actor.id&&actor.role!=='super_admin'))throw new CaptureError('Task not found.',404);
  if(!['resume_extract','candidate_match','packet_generate','jd_extract','resume_tailor'].includes(target.kind))throw new CaptureError('This task requires the background worker.',409);
  if(!aiConfiguration().configured)return {taskId:id,status:'waiting_for_worker',message:'AI is waiting for a configured processing worker. Ask your administrator to check the AI endpoint, model and worker settings.'};
  const {data:claimed,error:claimError}=await db.rpc('claim_specific_task',{p_task:id,p_lease:randomUUID()});checkDb(claimError);
  const task=claimed?.[0] as BackgroundTask|undefined;
  if(!task)return {taskId:id,status:'not_claimed'};
  let result:Awaited<ReturnType<typeof handleTask>>;
  try{result=await withAIExecutionWindow(45000,()=>handleTask(task));}
  catch(error){
   const message=error instanceof CaptureError?error.message:'AI processing failed. Check the provider endpoint and model, then retry.';
   const {error:recordError}=await db.rpc('record_task_failure',{p_task:id,p_lease:task.lease_token,p_error:message});checkDb(recordError);
   const {error:finishError}=await db.rpc('finish_task',{p_task:id,p_lease:task.lease_token,p_result:null,p_error:message,p_transient:false});checkDb(finishError);
   throw new CaptureError(message,error instanceof CaptureError?error.status:422);
  }
  const {error:finishError}=await db.rpc('finish_task',{p_task:id,p_lease:task.lease_token,p_result:result,p_error:null,p_transient:false});checkDb(finishError);
  return {taskId:id,status:'succeeded'};
 });
}
