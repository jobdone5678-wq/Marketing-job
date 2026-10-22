import {extensionRoute,extensionProfile,cors} from '@/lib/capture/server';
import {database,checkDb,CaptureError} from '@/lib/db/admin';
import {candidateAccess} from '@/lib/resumes/repository';
import {z} from 'zod';

export async function OPTIONS(request:Request){return cors(request,new Response(null,{status:204}));}

// Push a reviewed candidate profile into the extension of the person applying.
// The extension polls this with the recipient's own credential, so the poll is
// actor-scoped: a recipient only ever sees shares addressed to them.
export async function POST(request:Request){
 return extensionRoute(request,async()=>{
  const actor=await extensionProfile(request);
  const body=await request.json().catch(()=>{throw new CaptureError('Provide a candidate and a recipient client account.',400);});
  const input=z.object({candidateId:z.uuid(),recipientId:z.uuid(),label:z.string().trim().max(120).nullable()}).safeParse(body);
  if(!input.success)throw new CaptureError('Provide a candidate and a recipient client account.',400);
  const candidate=await candidateAccess(actor as unknown as {id:string;role:string},input.data.candidateId);
  if(candidate.provenance_status!=='confirmed')throw new CaptureError('Review and confirm the candidate details before sharing.',409);
  const {data,error}=await database().rpc('save_candidate_share',{p_actor:actor.id,p_candidate:input.data.candidateId,p_recipient:input.data.recipientId,p_label:input.data.label});
  checkDb(error);
  return {success:true,share:data?.[0]};
 });
}

export async function GET(request:Request){
 return extensionRoute(request,async()=>{
  const actor=await extensionProfile(request);
  const url=new URL(request.url);
  const candidateId=url.searchParams.get('candidateId');
  if(candidateId&&!z.uuid().safeParse(candidateId).success)throw new CaptureError('Invalid candidate identifier.',400);
  let query=database().from('candidate_shares').select('id,candidate_id,recipient_id,pushed_by,label,created_at,revoked_at,candidate:candidates(id,full_name,email,phone,current_job_title,current_city,current_state,primary_skills,secondary_skills,total_experience_years,confirmed_facts,provenance_status,version,authorized_in_usa,need_sponsorship_now,need_sponsorship_future,open_to_relocation,notice_period,expected_salary,employment_history,education_history,certifications,linkedin_url)')
    .eq('recipient_id',actor.id).is('revoked_at',null).order('created_at',{ascending:false}).limit(100);
  if(candidateId)query=query.eq('candidate_id',candidateId);
  const {data,error}=await query;
  checkDb(error);
  return {success:true,shares:data||[]};
 });
}

export async function DELETE(request:Request){
 return extensionRoute(request,async()=>{
  const actor=await extensionProfile(request);
  const id=new URL(request.url).searchParams.get('id');
  if(!id||!z.uuid().safeParse(id).success)throw new CaptureError('Share identifier required.',400);
  const {data,error}=await database().rpc('revoke_candidate_share',{p_actor:actor.id,p_share:id});
  checkDb(error);
  if(!data)throw new CaptureError('Share not found or not revocable by this account.',404);
  return {success:true};
 });
}