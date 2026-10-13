import {protectedRoute} from '@/lib/http/protected-route';
import {database,checkDb,CaptureError} from '@/lib/db/admin';
import {ownDocument} from '@/lib/resumes/repository';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context) {return protectedRoute(request,'candidate_or_staff',async profile=>{
  const document=await ownDocument(profile,(await context.params).id);const db=database();
  const {data:extraction,error}=await db.from('resume_extractions').select('data,model,created_at').eq('document_id',document.id).maybeSingle();checkDb(error);
  const {data:task,error:taskError}=document.task_id?await db.from('background_tasks').select('id,kind,status,error,payload,lease_until').eq('id',document.task_id).maybeSingle():{data:null,error:null};checkDb(taskError);
  
  return {document,extraction,task};
});}
export async function DELETE(request:Request,context:Context) {return protectedRoute(request,'candidate_or_staff',async profile=>{
  const document=await ownDocument(profile,(await context.params).id);const db=database();
  const {error}=await db.from('candidate_documents').update({status:'deleted'}).eq('id',document.id);checkDb(error);
  const {error:storageError}=await db.storage.from('candidate-resumes').remove([document.object_path]);if(storageError)throw new CaptureError('Document disabled; storage cleanup needs an administrator.',503);
  return {deleted:true};
});}
