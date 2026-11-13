import {protectedRoute} from '@/lib/http/protected-route';
import {database,checkDb,CaptureError} from '@/lib/db/admin';
import {ownDocument} from '@/lib/resumes/repository';
import {candidateInput} from '@/lib/candidate-input';
import {z} from 'zod';

// The database confirmation routine is executed here instead of through a stored
// procedure so a candidate can always save the profile that belongs to their own
// account, and so a failed write is reported with the reason the database gave.
const confirmBody=z.object({version:z.number().int().nonnegative().nullable(),fields:candidateInput});

export async function POST(request:Request,context:{params:Promise<{id:string}>}) {return protectedRoute(request,async profile=>{
  const {id}=await context.params;
  const document=await ownDocument(profile,id);
  const body=confirmBody.parse(await request.json());
  if(!body.fields.full_name?.trim())throw new CaptureError('Full name is required.');
  const db=database();

  // A confirmed resume is already saved. Return the profile it belongs to.
  if(document.status==='confirmed'&&document.candidate_id)return {candidateId:document.candidate_id};
  if(document.status!=='review')throw new CaptureError('This resume is not ready to confirm yet. Wait for extraction to finish, then retry.',409);

  const {data:extraction,error:extractionError}=await db.from('resume_extractions').select('data').eq('document_id',id).maybeSingle();checkDb(extractionError);
  if(!extraction)throw new CaptureError('Resume extraction is not ready yet. Retry processing before saving.',409);

  // The profile this resume belongs to: the linked candidate, otherwise the candidate's own profile.
  let candidate:{id:string;version:number|null}|null=null;
  if(document.candidate_id){const {data,error}=await db.from('candidates').select('id,version').eq('id',document.candidate_id).maybeSingle();checkDb(error);candidate=data;}
  if(!candidate){const {data,error}=await db.from('candidates').select('id,version').eq('user_id',profile.id).maybeSingle();checkDb(error);candidate=data;}
  if(candidate&&body.version!==null&&candidate.version!==null&&body.version!==candidate.version)
    throw new CaptureError('The profile changed since this resume was uploaded. Reload it and review the facts before saving.',409);

  const extracted=(extraction.data||{}) as {evidence?:unknown};
  const payload={...body.fields,evidence:Array.isArray(extracted.evidence)?extracted.evidence:[]};
  const {data:candidateId,error:saveError}=await db.rpc('save_candidate_profile',{p_actor:profile.id,p_id:candidate?.id??null,p_expected:candidate?.version??null,p_fields:payload});
  if(saveError){
    const reason=saveError.message||'';
    if(reason.includes('already exists'))throw new CaptureError('Your profile already exists. Open it under My Profile & Resume and edit it there.',409);
    if(reason.includes('changed'))throw new CaptureError('The profile changed while saving. Reload and try again.',409);
    if(reason.includes('access denied'))throw new CaptureError('This profile does not belong to your account.',403);
    if(reason.includes('Full name'))throw new CaptureError('Full name is required.');
    checkDb(saveError);
  }

  const {data:saved,error:savedError}=await db.from('candidates').select('id,version').eq('id',candidateId).single();checkDb(savedError);
  const {error:linkError}=await db.from('candidate_documents').update({status:'confirmed',candidate_id:candidateId,candidate_version:saved?.version??null}).eq('id',id);checkDb(linkError);
  await db.from('audit_events').insert({actor_id:profile.id,action:'resume_confirmed',subject_id:candidateId,metadata:{document_id:id}});
  return {candidateId};
});}
