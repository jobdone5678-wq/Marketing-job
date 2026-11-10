import {protectedRoute} from '@/lib/http/protected-route';
import {database} from '@/lib/db/admin';
import {checkBillingError,serviceCollections} from '@/lib/billing/repository';
import {z} from 'zod';
const input=z.object({candidateId:z.uuid(),joiningDate:z.iso.date(),endDate:z.iso.date().nullable().optional(),monthlyFee:z.number().finite().min(0).max(100000000).multipleOf(0.01),currency:z.string().regex(/^[A-Z]{3}$/)});
export async function GET(request:Request){return protectedRoute(request,'admin',async()=>serviceCollections());}
export async function POST(request:Request){return protectedRoute(request,'admin',async actor=>{
 const body=input.parse(await request.json());
 const {data,error}=await database().rpc('create_service_enrollment',{p_actor:actor.id,p_candidate:body.candidateId,p_join:body.joiningDate,p_end:body.endDate||null,p_fee:body.monthlyFee,p_currency:body.currency});
 checkBillingError(error);return {enrollment:data};
});}
const endInput=z.object({enrollmentId:z.uuid(),endDate:z.iso.date(),reason:z.string().trim().min(1).max(500)});
export async function PATCH(request:Request){return protectedRoute(request,'admin',async actor=>{
 const body=endInput.parse(await request.json());
 const {error}=await database().rpc('end_service_enrollment',{p_actor:actor.id,p_enrollment:body.enrollmentId,p_end:body.endDate,p_reason:body.reason});
 checkBillingError(error);return {saved:true};
});}
