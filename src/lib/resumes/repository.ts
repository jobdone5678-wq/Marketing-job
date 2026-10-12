import 'server-only';
import {database,checkDb,CaptureError} from '@/lib/db/admin';
import {canAccessCandidateRecord} from '@/lib/auth/candidate-assignment';
import type {Candidate,UserProfile} from '@/types/database';
import {z} from 'zod';
export async function ownDocument(profile:UserProfile,id:string) {
  if(!z.uuid().safeParse(id).success)throw new CaptureError('Invalid document identifier.');
  const {data,error}=await database().from('candidate_documents').select('*').eq('id',id).maybeSingle();checkDb(error);
  let linkedOwner=false;if(data?.candidate_id&&profile.role==='client'){const {data:candidate,error:e}=await database().from('candidates').select('user_id').eq('id',data.candidate_id).maybeSingle();checkDb(e);linkedOwner=candidate?.user_id===profile.id;}
  if(!data||data.status==='deleted'||profile.role==='client'&&data.owner_id!==profile.id&&!linkedOwner)throw new CaptureError('Resume not found.',404);
  if(!data.candidate_id&&profile.role!=='super_admin'&&data.owner_id!==profile.id)throw new CaptureError('Resume not found.',404);
  if(data.candidate_id&&profile.role==='recruiter')await candidateAccess(profile,data.candidate_id);
  if(data.candidate_id&&profile.role==='technical_recruiter')await candidateAccess(profile,data.candidate_id);
  return data;
}
export async function candidateAccess(profile:UserProfile,id:string) {
  if(!z.uuid().safeParse(id).success)throw new CaptureError('Invalid candidate identifier.');
  const {data,error}=await database().from('candidates').select('*').eq('id',id).maybeSingle();checkDb(error);
  const candidate=data as Candidate|null;
  if(!candidate||!canAccessCandidateRecord(profile,candidate))throw new CaptureError('Candidate not found.',404);
  return candidate;
}
