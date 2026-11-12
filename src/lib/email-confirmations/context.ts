import 'server-only';
import {adminClient,checkDb,CaptureError} from './server';
import {readAllRows} from './pagination';
import type {CandidateIdentity,ApplicationIdentity} from './types';
export async function receiptContext(owner:string){
 const db=adminClient();const {data:actor,error}=await db.from('profiles').select('id,role,status').eq('id',owner).single();checkDb(error);
 if(!actor||actor.status!=='active'||actor.role!=='candidate')throw new CaptureError('Active account required.',403);
 const candidates=await readAllRows<CandidateIdentity>(async(from,to)=>{
  const q=db.from('candidates').select('id,full_name,email').eq('user_id',owner).order('id').range(from,to);
  const {data,error}=await q;checkDb(error);return data||[];
 });
 const applications:ApplicationIdentity[]=[];
 // Bound URL size and never scan another candidate's applications through the service client.
 for(let offset=0;offset<candidates.length;offset+=100){
  const ids=candidates.slice(offset,offset+100).map(c=>c.id);
  applications.push(...await readAllRows<ApplicationIdentity>(async(from,to)=>{const {data,error}=await db.from('job_submissions').select('id,candidate_id,company_name,job_title,status,submission_date').in('candidate_id',ids).order('id').range(from,to);checkDb(error);return data||[];}));
 }
 return {candidates,applications};
}
