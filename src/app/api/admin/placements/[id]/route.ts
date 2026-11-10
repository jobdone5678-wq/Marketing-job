import { protectedRoute } from '@/lib/http/protected-route';
import { database, checkDb, CaptureError } from '@/lib/db/admin';
import { syncPlacementMonths } from '@/lib/placements/repository';
import { z } from 'zod';
import {checkPayrollError} from '@/lib/payroll/repository';

export async function PATCH(request:Request,context:{params:Promise<{id:string}>}){return protectedRoute(request,'admin',async actor=>{
 const id=z.uuid().parse((await context.params).id);const body=z.object({status:z.enum(['offer_accepted','joining_scheduled','active','completed','ended_early','cancelled']).optional(),plannedStartDate:z.iso.date().nullable().optional(),actualJoinDate:z.iso.date().nullable().optional(),expectedEndDate:z.iso.date().nullable().optional(),actualEndDate:z.iso.date().nullable().optional(),candidateMonthlyAmount:z.number().finite().min(0).nullable().optional(),candidateCurrency:z.string().regex(/^[A-Z]{3}$/).nullable().optional(),candidateCompensationVisible:z.boolean().optional(),commissionAmount:z.number().finite().min(0).nullable().optional(),commissionCurrency:z.string().regex(/^[A-Z]{3}$/).nullable().optional(),notes:z.string().max(4000).nullable().optional(),reason:z.string().max(500).optional()}).parse(await request.json());
 const {data:before,error:readError}=await database().from('placements').select('*').eq('id',id).maybeSingle();checkDb(readError);if(!before)throw new CaptureError('Placement not found.',404);
 const fields:Record<string,unknown>={};const map:Record<string,string>={status:'status',plannedStartDate:'planned_start_date',actualJoinDate:'actual_join_date',expectedEndDate:'expected_end_date',actualEndDate:'actual_end_date',candidateMonthlyAmount:'candidate_monthly_amount',candidateCurrency:'candidate_currency',candidateCompensationVisible:'candidate_compensation_visible',commissionAmount:'commission_amount',commissionCurrency:'commission_currency',notes:'notes'};
 for(const [key,column] of Object.entries(map))if(body[key as keyof typeof body]!==undefined)fields[column]=body[key as keyof typeof body];
 const join=String((Object.hasOwn(fields,'actual_join_date')?fields.actual_join_date:before.actual_join_date)||'');const end=String((Object.hasOwn(fields,'actual_end_date')?fields.actual_end_date:before.actual_end_date)||'');const today=new Date().toISOString().slice(0,10);if(join&&join>today)throw new CaptureError('Actual joining date cannot be in the future.');if(end&&end>today)throw new CaptureError('Actual employment end date cannot be in the future.');if(end&&!join)throw new CaptureError('Record actual joining before actual end date.');if(join&&end&&end<join)throw new CaptureError('Actual end date cannot precede joining date.');const expected=String((Object.hasOwn(fields,'expected_end_date')?fields.expected_end_date:before.expected_end_date)||'');if(join&&expected&&expected<join)throw new CaptureError('Expected end date cannot precede joining date.');if(fields.actual_end_date&&!fields.status)fields.status='completed';
 fields.updated_at=new Date().toISOString();const {data:placement,error}=await database().from('placements').update(fields).eq('id',id).select().single();checkPayrollError(error);
 await syncPlacementMonths(placement);
 const {error:auditError}=await database().from('audit_events').insert({actor_id:actor.id,action:'placement_updated',subject_id:id,metadata:{before:{status:before.status,actual_join_date:before.actual_join_date,expected_end_date:before.expected_end_date,actual_end_date:before.actual_end_date},after:fields,reason:body.reason||null}});checkDb(auditError);
 return {placement};
});}

