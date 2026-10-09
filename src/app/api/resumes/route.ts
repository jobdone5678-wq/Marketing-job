import {protectedRoute} from '@/lib/http/protected-route';
import {database,checkDb,CaptureError} from '@/lib/db/admin';
import {candidateAccess} from '@/lib/resumes/repository';
import {randomUUID,createHash} from 'node:crypto';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(request:Request) {return protectedRoute(request,'candidate_or_staff',async profile=>{
  if(Number(request.headers.get('content-length')||0)>11*1024*1024)throw new CaptureError('Resume must be at most 10 MiB.',413);
  const form=await request.formData();const file=form.get('resume');
  if(!(file instanceof File)||file.size>10*1024*1024||!file.size)throw new CaptureError('Upload a PDF or DOCX of at most 10 MiB.');
  if(form.get('consent')!=='true')throw new CaptureError('Confirm your consent to AI resume processing.');
  const candidateId=String(form.get('candidateId')||'');const candidate=candidateId?await candidateAccess(profile,candidateId):null;
  const filename=file.name.replace(/[^a-zA-Z0-9._ -]/g,'_').slice(-160);const raw=Buffer.from(await file.arrayBuffer());
  const pdf=/\.pdf$/i.test(filename)&&raw.subarray(0,5).toString()==='%PDF-';const docx=/\.docx$/i.test(filename)&&raw.subarray(0,4).toString('hex')==='504b0304';
  if(!pdf&&!docx)throw new CaptureError('Upload a valid PDF or DOCX.');
  const documentId=randomUUID();const path=`${profile.id}/${documentId}/${filename}`;const db=database();
  const {error:uploadError}=await db.storage.from('candidate-resumes').upload(path,raw,{contentType:pdf?'application/pdf':'application/vnd.openxmlformats-officedocument.wordprocessingml.document',upsert:false});
  if(uploadError)throw new CaptureError('Private resume upload failed. Check storage setup and retry.',503);
  try {
    const {data:taskId,error}=await db.rpc('register_resume',{p_actor:profile.id,p_document:documentId,p_candidate:candidate?.id||null,p_expected:candidate?.version||null,p_path:path,p_filename:filename,p_hash:createHash('sha256').update(raw).digest('hex')});checkDb(error);
    
    // In-route immediate AI processing (Option 1: Serverless Native)
    try {
      const lease = randomUUID();
      const { data: claimed } = await db.rpc('claim_task', { p_lease: lease });
      const task = claimed?.[0];
      if (task && task.id === taskId) {
        const { handleTask } = await import('@/lib/tasks/handlers');
        const result = await handleTask(task);
        await db.rpc('finish_task', {
          p_task: task.id,
          p_lease: task.lease_token,
          p_result: result,
          p_error: null,
          p_transient: false,
        });

        const { data: extraction } = await db
          .from('resume_extractions')
          .select('data,model,created_at')
          .eq('document_id', documentId)
          .maybeSingle();

        return {
          documentId,
          taskId,
          status: 'ready',
          extraction: extraction?.data || null,
        };
      }
    } catch (inlineError: any) {
      console.warn('In-route AI extraction fallback to queue/polling:', inlineError?.message);
    }

    return {documentId,taskId};
  } catch(error) {
    await db.storage.from('candidate-resumes').remove([path]);
    await db.from('candidate_documents').update({status:'failed',error:'Upload registration did not complete. Upload again.'}).eq('id',documentId);
    throw error;
  }
});}
