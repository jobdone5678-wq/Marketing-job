import {protectedRoute} from '@/lib/http/protected-route';
import {database,CaptureError} from '@/lib/db/admin';
import {checkWorkflowDb} from '@/lib/job-briefs/repository';
import {readResume} from '@/lib/resumes/validation';
import {randomUUID,createHash} from 'node:crypto';
import {z} from 'zod';
export const runtime='nodejs';
export const maxDuration=60;
export async function GET(request:Request){return protectedRoute(request,'admin',async()=>{
 const {data,error}=await database().from('job_briefs').select('id,title,company,status,version,task_id,created_at,updated_at').order('created_at',{ascending:false}).limit(100);checkWorkflowDb(error);return {briefs:data||[]};
});}
export async function POST(request:Request){return protectedRoute(request,'admin',async profile=>{
 const form=await request.formData();const title=z.string().trim().min(1).max(200).parse(form.get('title'));
 const company=z.string().trim().max(200).parse(form.get('company')||'');
 if(form.get('consent')!=='true')throw new CaptureError('Confirm permission to process this JD with the configured AI provider.');
 const file=form.get('file');let description=String(form.get('description')||'').trim(),raw:Buffer|undefined,filename:string|null=null;
 if(file instanceof File&&file.size){
  if(description)throw new CaptureError('Paste a JD or upload one file, rather than both.');
  if(file.size>10*1024*1024)throw new CaptureError('JD files must be at most 10 MiB.');
  filename=file.name.replace(/[^a-zA-Z0-9._ -]/g,'_').slice(0,180);raw=Buffer.from(await file.arrayBuffer());
  try{description=(await readResume(raw,filename)).text.trim();}catch(error){throw new CaptureError((error as Error).message.replaceAll('Resume','JD').replaceAll('resume','JD'));}
 }
 if(description.length<20||description.length>100000)throw new CaptureError('Provide 20–100,000 characters of readable JD text. Scanned files need readable text.');
 const id=randomUUID(),path=raw?`jd/${profile.id}/${id}/${filename}`:null;
 const db=database();
 if(raw&&path){const {error}=await db.storage.from('recruiting-documents').upload(path,raw,{contentType:/\.pdf$/i.test(filename!)?'application/pdf':'application/vnd.openxmlformats-officedocument.wordprocessingml.document',upsert:false});if(error)throw new CaptureError('Private JD upload failed. Check the recruiting-documents bucket and database update.',503);}
 try{
  const hash=createHash('sha256').update(JSON.stringify({title,company,description})).digest('hex');
  const {data,error}=await db.rpc('create_job_brief',{p_actor:profile.id,p_id:id,p_title:title,p_company:company,p_description:description,p_object_path:path,p_filename:filename,p_hash:hash});checkWorkflowDb(error);
  if(path&&data.briefId!==id)await db.storage.from('recruiting-documents').remove([path]);return data;
 }catch(error){if(path)await db.storage.from('recruiting-documents').remove([path]);throw error;}
});}
