import 'server-only';
import {database,checkDb,CaptureError} from '@/lib/db/admin';

export function checkBillingError(error:{message:string;code?:string}|null){
 if(error?.code==='23505')throw new CaptureError('That receipt reference is already recorded.',409);
 if(error?.code==='P0001')throw new CaptureError(error.message,409);
 checkDb(error);
}
export async function serviceCollections(candidateIds?:string[]){
 if(candidateIds?.length===0)return {enrollments:[],limited:false};
 const db=database();
 const {error}=await db.rpc('sync_service_bills',candidateIds?{p_candidates:candidateIds}:{});checkBillingError(error);
 let query=db.from('service_enrollments').select('*,candidate:candidates(id,full_name),bills:service_bills(*,receipts:service_receipts(*))').order('joining_date',{ascending:false}).limit(500);
 if(candidateIds)query=query.in('candidate_id',candidateIds.length?candidateIds:['00000000-0000-0000-0000-000000000000']);
 const {data,error:readError}=await query;checkDb(readError);
 const today=new Date().toISOString().slice(0,10);
 const enrollments=(data||[]).map(e=>({...e,bills:(e.bills||[]).map((b:{id:string;amount:number;currency:string;due_date:string;receipts:{amount:number}[]})=>{
 const received=Math.round(b.receipts.reduce((s,r)=>s+Math.round(Number(r.amount)*100),0))/100;
 const balance=(Math.round(Number(b.amount)*100)-Math.round(received*100))/100;
 return {...b,received_amount:received,balance,status:balance<=0?'paid':received>0?'partially_paid':b.due_date<today?'overdue':b.due_date===today?'due':'upcoming'};
 }).sort((a:{due_date:string},b:{due_date:string})=>a.due_date.localeCompare(b.due_date))}));
 return {enrollments,limited:enrollments.length===500};
}
