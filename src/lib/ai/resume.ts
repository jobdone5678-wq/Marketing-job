import 'server-only';
import {database,checkDb,CaptureError} from '@/lib/db/admin';
import type {BackgroundTask} from '@/lib/tasks/types';
import {readResume,ResumeReadError} from '@/lib/resumes/validation';
import {validateResumeExtraction} from './schemas';
import {taskLease} from '@/lib/tasks/repository';
import {extractResumeLocal} from '@/lib/resumes/local-extract';
import {createHash} from 'node:crypto';

export async function extractResume(task:BackgroundTask) {
  const db=database();
  const documentId=String(task.payload.documentId||'');
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
  let parsed:Awaited<ReturnType<typeof readResume>>;
  try {
    parsed=await readResume(raw,document.filename);
  } catch(error) {
    if(error instanceof ResumeReadError)throw new CaptureError(error.message,422);
    throw error;
  }

  // LOCAL EXTRACTION: No AI required
  const extracted = extractResumeLocal(parsed.text, document.filename);

  // Validate and save
  const draft=validateResumeExtraction(extracted,parsed.text);
  if(!parsed.text.trim())draft.warnings.push('No machine-readable text was available; extracted facts need manual entry.');
  if(extracted.warnings.length === 0) draft.warnings.push('Extracted using deterministic parser. Review all evidence before saving.');
  const {error:saveError}=await db.rpc('save_resume_extraction',{p_task:task.id,p_lease:task.lease_token,p_document:documentId,p_data:draft,p_model:'local-parser',p_prompt:'none'});checkDb(saveError);
  return {documentId};
}