import 'server-only';
import {database,checkDb,CaptureError} from '@/lib/db/admin';
import type {BackgroundTask} from '@/lib/tasks/types';
import {readResume} from '@/lib/resumes/validation';
import {resumeSchema,validateResumeExtraction} from './schemas';
import {structuredAI, getAIModel} from './client';
import {taskLease} from '@/lib/tasks/repository';
import {createHash} from 'node:crypto';
export async function extractResume(task:BackgroundTask) {
  const db=database();const documentId=String(task.payload.documentId||'');
  const {data:document,error}=await db.from('candidate_documents').select('*').eq('id',documentId).eq('task_id',task.id).single();checkDb(error);
  if(!document||document.status==='deleted')throw new CaptureError('Resume is no longer available.',404);
  if(document.status==='confirmed')return {documentId,alreadyConfirmed:true};
  const {data:existing,error:existingError}=await db.from('resume_extractions').select('id').eq('document_id',documentId).maybeSingle();checkDb(existingError);
  if(existing)return {documentId,cached:true};
  await taskLease(task.id,task.lease_token);
  const {data:download,error:downloadError}=await db.storage.from('candidate-resumes').download(document.object_path);
  if(downloadError||!download)throw new CaptureError('Private resume download failed.',502);
  const raw=Buffer.from(await download.arrayBuffer());
  if(createHash('sha256').update(raw).digest('hex')!==document.content_hash)throw new CaptureError('Resume content changed. Upload again.',409);
  const parsed=await readResume(raw,document.filename);
  const model=getAIModel();
  const {data:cached,error:cacheError}=await db.from('resume_extractions').select('data,document:candidate_documents!inner(owner_id,content_hash,status)')
    .eq('document.owner_id',document.owner_id).eq('document.content_hash',document.content_hash).eq('model',model).eq('prompt_version','resume-v1').limit(1).maybeSingle();checkDb(cacheError);
  const extracted=cached?.data || await structuredAI(task,resumeSchema,'resume_profile','Extract only explicit candidate facts. Use null for unknown values, including visa, authorization, salary and availability. Each non-null field and history entry needs an exact source snippet. Dates retain their original precision. Never infer legal eligibility or total experience. Include warnings for unreadable/image text.',
    'Extract a reviewable candidate profile from this resume.',{raw,mime:parsed.mime,filename:document.filename});
  const draft=validateResumeExtraction(extracted,parsed.text);
  if(!parsed.text.trim())draft.warnings.push('No machine-readable text was available; extracted facts need manual entry.');
  const {error:saveError}=await db.rpc('save_resume_extraction',{p_task:task.id,p_lease:task.lease_token,p_document:documentId,p_data:draft,p_model:model,p_prompt:'resume-v1'});checkDb(saveError);
  return {documentId};
}
