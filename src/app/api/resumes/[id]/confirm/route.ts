import {protectedRoute} from '@/lib/http/protected-route';
import {database,checkDb,CaptureError} from '@/lib/db/admin';
import {ownDocument} from '@/lib/resumes/repository';
import {candidateInput} from '@/lib/candidate-input';
import {z} from 'zod';
export async function POST(request:Request,context:{params:Promise<{id:string}>}) {return protectedRoute(request,'candidate_or_staff',async profile=>{
  const {id}=await context.params;await ownDocument(profile,id);
  const body=z.object({version:z.number().int().positive().nullable(),fields:candidateInput}).parse(await request.json());
  if(!body.fields.full_name?.trim())throw new CaptureError('Full name is required.');
  const {data:candidateId,error}=await database().rpc('confirm_resume',{p_actor:profile.id,p_document:id,p_expected:body.version,p_fields:body.fields});
  if(error?.message.includes('changed')||error?.message.includes('newer'))throw new CaptureError('A newer resume or profile exists. Reload and review it.',409);checkDb(error);
  return {candidateId};
});}
