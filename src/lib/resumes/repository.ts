import 'server-only';
import {database,checkDb,CaptureError} from '@/lib/db/admin';
import type {UserProfile} from '@/types/database';
import {z} from 'zod';
export async function ownDocument(profile:UserProfile,id:string) {
  if(!z.uuid().safeParse(id).success)throw new CaptureError('Invalid document identifier.');
  const {data,error}=await database().from('candidate_documents').select('*').eq('id',id).maybeSingle();checkDb(error);
  let linkedOwner=false;if(data?.candidate_id&&profile.role==='client'){const {data:candidate,error:e}=await database().from('candidates').select('user_id').eq('id',data.candidate_id).maybeSingle();checkDb(e);linkedOwner=candidate?.user_id===profile.id;}
  if(!data||data.status==='deleted'||profile.role==='client'&&data.owner_id!==profile.id&&!linkedOwner)throw new CaptureError('Resume not found.',404);
  return data;
}
export async function candidateAccess(profile:UserProfile,id:string) {
  if(!z.uuid().safeParse(id).success)throw new CaptureError('Invalid candidate identifier.');
  const {data,error}=await database().from('candidates').select('*').eq('id',id).maybeSingle();checkDb(error);
  if(!data||profile.role==='client'&&data.user_id!==profile.id)throw new CaptureError('Candidate not found.',404);
  return data;
}
