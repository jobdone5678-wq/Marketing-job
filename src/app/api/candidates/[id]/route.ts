import {protectedRoute} from '@/lib/http/protected-route';
import {database,checkDb,CaptureError} from '@/lib/db/admin';
import {candidateAccess} from '@/lib/resumes/repository';
import {candidateInput} from '@/lib/candidate-input';
import {z} from 'zod';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context) {return protectedRoute(request,'candidate_or_staff',async profile=>({candidate:await candidateAccess(profile,(await context.params).id)}));}
export async function PATCH(request:Request,context:Context) {return protectedRoute(request,'candidate_or_staff',async profile=>{
  const {id}=await context.params;const current=await candidateAccess(profile,id);
  const body=z.object({version:z.number().int().positive(),fields:candidateInput}).parse(await request.json());
  const {error}=await database().rpc('save_candidate_profile',{p_actor:profile.id,p_id:id,p_expected:body.version,p_fields:candidateInput.parse({...current,...body.fields})});
  if(error?.message.includes('changed'))throw new CaptureError('Profile changed. Reload before saving.',409);checkDb(error);
  return {candidate:await candidateAccess(profile,id)};
});}
