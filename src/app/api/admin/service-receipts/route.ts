import {protectedRoute} from '@/lib/http/protected-route';
import {database} from '@/lib/db/admin';
import {checkBillingError} from '@/lib/billing/repository';
import {z} from 'zod';
const input=z.object({billId:z.uuid(),amount:z.number().finite().multipleOf(0.01).refine(n=>n!==0),currency:z.string().regex(/^[A-Z]{3}$/),receivedOn:z.iso.date(),method:z.string().trim().min(1).max(100),externalReference:z.string().trim().max(200).nullable().optional(),correctionOf:z.uuid().nullable().optional(),reason:z.string().trim().max(500).nullable().optional()});
export async function POST(request:Request){return protectedRoute(request,'admin',async actor=>{
 const body=input.parse(await request.json());
 const {data,error}=await database().rpc('record_service_receipt',{p_actor:actor.id,p_bill:body.billId,p_amount:body.amount,p_currency:body.currency,p_on:body.receivedOn,p_method:body.method,p_reference:body.externalReference||null,p_correction:body.correctionOf||null,p_reason:body.reason||null});
 checkBillingError(error);return {receipt:data};
});}
