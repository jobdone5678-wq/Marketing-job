import 'server-only';
import {database,checkDb,CaptureError} from '@/lib/db/admin';
import type {TaskKind} from './types';
export async function enqueueTask(input:{actorId:string;kind:TaskKind;payload:Record<string,unknown>;key:string}) {
  const {data,error}=await database().rpc('enqueue_task',{p_actor:input.actorId,p_kind:input.kind,p_payload:input.payload,p_key:input.key});checkDb(error);
  return {taskId:data as string};
}
export async function taskLease(id:string,lease:string) {
  const {error}=await database().rpc('check_task_lease',{p_task:id,p_lease:lease});if(error)throw new CaptureError('The task lease expired. Retry through the worker.',409);
}
