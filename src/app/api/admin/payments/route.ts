import {protectedRoute} from '@/lib/http/protected-route';
import {database,checkDb,CaptureError} from '@/lib/db/admin';
import {z} from 'zod';
import {checkPayrollError} from '@/lib/payroll/repository';

export async function GET(request:Request){return protectedRoute(request,'admin',async()=>{const {data,error}=await database().from('external_payments').select('*,payee:profiles!external_payments_payee_profile_id_fkey(id,full_name,email),salary_period:staff_salary_periods(start_date,end_date_exclusive),commission:technical_recruiter_commissions(placement:placements(company,role_title))').order('paid_on',{ascending:false}).limit(500);checkDb(error);return {payments:data||[]};});}

const input=z.object({salaryPeriodId:z.uuid().nullable().optional(),commissionId:z.uuid().nullable().optional(),amount:z.number().finite().multipleOf(0.01).refine(value=>value!==0),currency:z.string().regex(/^[A-Z]{3}$/),paidOn:z.iso.date(),method:z.string().trim().min(1).max(100),externalReference:z.string().trim().max(200).nullable().optional(),notes:z.string().max(1000).nullable().optional(),correctionOf:z.uuid().nullable().optional(),reason:z.string().trim().max(500).nullable().optional()}).refine(body=>Boolean(body.salaryPeriodId)!==Boolean(body.commissionId),'Link a payment to one salary period or commission.');
export async function POST(request:Request){return protectedRoute(request,'admin',async actor=>{
 const body=input.parse(await request.json());
 const {data,error}=await database().rpc('record_external_payment',{p_actor:actor.id,p_salary_period:body.salaryPeriodId||null,p_commission:body.commissionId||null,p_amount:body.amount,p_currency:body.currency,p_paid_on:body.paidOn,p_method:body.method,p_reference:body.externalReference||null,p_notes:body.notes||null,p_correction:body.correctionOf||null,p_reason:body.reason||null});
 if(error?.code==='23505')throw new CaptureError('That external payment reference is already recorded.',409);
 if(error?.message.includes('exceeds the outstanding'))throw new CaptureError('Payment exceeds the outstanding balance.',409);
 if(error?.message.includes('approval is required'))throw new CaptureError('Commission must be approved before payment.',409);
 if(error?.message.includes('currency mismatch'))throw new CaptureError('Payment currency does not match the earning record.',400);
 if(error?.message.includes('not found'))throw new CaptureError('Payment target not found.',404);
 if(error?.message.toLowerCase().includes('correction')||error?.message.toLowerCase().includes('negative payments'))throw new CaptureError(error.message,400);
 if(error?.message.includes('manual salary'))throw new CaptureError('Set the final partial salary amount before recording payment.',409);
 checkPayrollError(error);return {payment:data};
});}

