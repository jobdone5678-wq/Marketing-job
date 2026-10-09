import {protectedRoute} from '@/lib/http/protected-route';
import {database,checkDb,CaptureError} from '@/lib/db/admin';
import {ownDocument} from '@/lib/resumes/repository';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context) {return protectedRoute(request,'candidate_or_staff',async profile=>{
  const document=await ownDocument(profile,(await context.params).id);const db=database();
  const {data:extraction,error}=await db.from('resume_extractions').select('data,model,created_at').eq('document_id',document.id).maybeSingle();checkDb(error);
  let {data:task,error:taskError}=document.task_id?await db.from('background_tasks').select('id,kind,status,error,payload').eq('id',document.task_id).maybeSingle():{data:null,error:null};checkDb(taskError);
  
  // If task is still queued and not yet extracted, proactively execute it inline
  if (!extraction && task && task.status === 'queued') {
    try {
      const { randomUUID } = await import('node:crypto');
      const lease = randomUUID();
      const { data: claimed } = await db.rpc('claim_task', { p_lease: lease });
      const claimedTask = claimed?.[0];
      if (claimedTask && claimedTask.id === task.id) {
        const { handleTask } = await import('@/lib/tasks/handlers');
        const result = await handleTask(claimedTask);
        await db.rpc('finish_task', {
          p_task: claimedTask.id,
          p_lease: claimedTask.lease_token,
          p_result: result,
          p_error: null,
          p_transient: false
        });
        const { data: refreshedExtraction } = await db.from('resume_extractions').select('data,model,created_at').eq('document_id',document.id).maybeSingle();
        const { data: refreshedTask } = await db.from('background_tasks').select('status,error').eq('id',document.task_id).maybeSingle();
        return { document, extraction: refreshedExtraction, task: refreshedTask };
      }
    } catch (inlineErr: any) {
      console.warn('Inline task processing fallback encountered an issue:', inlineErr.message);
    }
  }

  return {document,extraction,task};
});}
export async function DELETE(request:Request,context:Context) {return protectedRoute(request,'candidate_or_staff',async profile=>{
  const document=await ownDocument(profile,(await context.params).id);const db=database();
  const {error}=await db.from('candidate_documents').update({status:'deleted'}).eq('id',document.id);checkDb(error);
  const {error:storageError}=await db.storage.from('candidate-resumes').remove([document.object_path]);if(storageError)throw new CaptureError('Document disabled; storage cleanup needs an administrator.',503);
  return {deleted:true};
});}
