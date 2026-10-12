import { protectedRoute } from '@/lib/http/protected-route';
import { database, checkDb, CaptureError } from '@/lib/db/admin';
import { syncPlacementMonths } from '@/lib/placements/repository';
import { z } from 'zod';
import {earningSummary,checkPayrollError} from '@/lib/payroll/repository';

export async function GET(request:Request){return protectedRoute(request,'admin',async()=>{
 const {data:initial,error:initialError}=await database().from('placements').select('id');checkDb(initialError);
 await Promise.all((initial||[]).map(syncPlacementMonths));
 const {data,error}=await database().from('placements').select('*,candidate:candidates(id,full_name,email),recruiter:profiles!placements_recruiter_id_fkey(id,full_name,email),technical_recruiter:profiles!placements_technical_recruiter_id_fkey(id,full_name,email),months:placement_months(*),commission:technical_recruiter_commissions(*)').order('created_at',{ascending:false});checkDb(error);
 const {data:payments,error:paymentError}=await database().from('earning_payment_balances').select('commission_id,amount');checkDb(paymentError);
 const placements=(data||[]).map(item=>({...item,commission:(item.commission||[]).map((commission:{id:string;amount:string;status:string;due_date:string|null})=>({...commission,...earningSummary(commission.amount,(payments||[]).filter(payment=>payment.commission_id===commission.id),commission.due_date,commission.status)}))}));
 return {placements};
});}

const input=z.object({candidateId:z.uuid(),submissionId:z.uuid().nullable().optional(),company:z.string().trim().min(1).max(200),roleTitle:z.string().trim().min(1).max(200),status:z.enum(['offer_accepted','joining_scheduled','active','completed','ended_early','cancelled']).default('offer_accepted'),recruiterId:z.uuid().nullable().optional(),technicalRecruiterId:z.uuid().nullable().optional(),plannedStartDate:z.iso.date().nullable().optional(),actualJoinDate:z.iso.date().nullable().optional(),expectedEndDate:z.iso.date().nullable().optional(),actualEndDate:z.iso.date().nullable().optional(),candidateMonthlyAmount:z.number().finite().min(0).nullable().optional(),candidateCurrency:z.string().regex(/^[A-Z]{3}$/).nullable().optional(),candidateCompensationVisible:z.boolean().default(false),commissionAmount:z.number().finite().min(0).nullable().optional(),commissionCurrency:z.string().regex(/^[A-Z]{3}$/).nullable().optional(),commissionMilestone:z.enum(['candidate_joining','placement_active']).default('candidate_joining'),commissionDueDays:z.number().int().min(0).max(365).default(0),notes:z.string().max(4000).nullable().optional()});
export async function POST(request:Request){return protectedRoute(request,'admin',async actor=>{
 const body=input.parse(await request.json());
 const today=new Date().toISOString().slice(0,10);if(body.actualJoinDate&&body.actualJoinDate>today)throw new CaptureError('Actual joining date cannot be in the future.');if(body.actualEndDate&&body.actualEndDate>today)throw new CaptureError('Actual employment end date cannot be in the future.');if(body.actualEndDate&&!body.actualJoinDate)throw new CaptureError('Record the actual joining date before recording an actual end date.');
 if(body.actualJoinDate&&body.expectedEndDate&&body.expectedEndDate<body.actualJoinDate)throw new CaptureError('Expected end date cannot precede actual joining.');if(body.actualJoinDate&&body.actualEndDate&&body.actualEndDate<body.actualJoinDate)throw new CaptureError('Actual end date cannot precede actual joining.');
 if(body.candidateMonthlyAmount!==null&&body.candidateMonthlyAmount!==undefined&&!body.candidateCurrency)throw new CaptureError('Select a currency for candidate compensation.');
 if(body.commissionAmount!==null&&body.commissionAmount!==undefined&&!body.commissionCurrency)throw new CaptureError('Select a currency for commission.');
 const {data:candidate,error:candidateError}=await database().from('candidates').select('id,assigned_recruiter_id,assigned_technical_recruiter_id').eq('id',body.candidateId).maybeSingle();checkDb(candidateError);if(!candidate)throw new CaptureError('Candidate not found.',404);
 if(body.submissionId){const {data:submission,error}=await database().from('job_submissions').select('id,candidate_id').eq('id',body.submissionId).maybeSingle();checkDb(error);if(!submission||submission.candidate_id!==body.candidateId)throw new CaptureError('Choose an application belonging to this candidate.');}
 const recruiterId=body.recruiterId===undefined?candidate.assigned_recruiter_id:body.recruiterId;const technicalId=body.technicalRecruiterId===undefined?candidate.assigned_technical_recruiter_id:body.technicalRecruiterId;
 for(const [id,role] of [[recruiterId,'recruiter'],[technicalId,'technical_recruiter']] as const){if(id){const {data:person,error}=await database().from('profiles').select('id,role,status').eq('id',id).maybeSingle();checkDb(error);if(!person||person.role!==role||person.status!=='active')throw new CaptureError(`Assigned ${role.replace('_',' ')} must be active.`);}}
 const {data:placement,error}=await database().from('placements').insert({candidate_id:body.candidateId,submission_id:body.submissionId||null,company:body.company,role_title:body.roleTitle,status:body.status,recruiter_id:recruiterId,technical_recruiter_id:technicalId,planned_start_date:body.plannedStartDate||null,actual_join_date:body.actualJoinDate||null,expected_end_date:body.expectedEndDate||null,actual_end_date:body.actualEndDate||null,candidate_monthly_amount:body.candidateMonthlyAmount??null,candidate_currency:body.candidateCurrency??null,candidate_compensation_visible:body.candidateCompensationVisible,commission_amount:body.commissionAmount??null,commission_currency:body.commissionCurrency??null,commission_milestone:body.commissionMilestone,commission_due_days:body.commissionDueDays,notes:body.notes||null,created_by:actor.id}).select().single();checkPayrollError(error);
 if(placement.actual_join_date)await syncPlacementMonths(placement);
 const {error:auditError}=await database().from('audit_events').insert({actor_id:actor.id,action:'placement_created',subject_id:placement.id,metadata:{candidate_id:placement.candidate_id,submission_id:placement.submission_id,status:placement.status,actual_join_date:placement.actual_join_date,expected_end_date:placement.expected_end_date}});checkDb(auditError);
 return {placement};
});}

