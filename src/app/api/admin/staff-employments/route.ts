import {protectedRoute} from '@/lib/http/protected-route';
import {database,checkDb} from '@/lib/db/admin';
import {ensureSalaryPeriods,checkPayrollError,earningSummary} from '@/lib/payroll/repository';
import {z} from 'zod';

export async function GET(request:Request) {
  return protectedRoute(request,'admin',async()=>{
    const {data:initial,error:initialError}=await database().from('staff_employments').select('id');checkDb(initialError);
    await Promise.all((initial||[]).map(row=>ensureSalaryPeriods(row.id)));
    const {data:rows,error}=await database().from('staff_employments').select('*,profile:profiles!staff_employments_profile_id_fkey(id,email,full_name,role,status),terms:staff_compensation_terms(*),periods:staff_salary_periods(*)').order('hire_date',{ascending:false});checkDb(error);
    const {data:payments,error:paymentError}=await database().from('earning_payment_balances').select('salary_period_id,amount');checkDb(paymentError);
    const employments=(rows||[]).map(row=>({...row,periods:(row.periods||[]).map((period:{id:string;amount:string;due_date:string;status:string})=>({
      ...period,employment:{profile:row.profile,hire_date:row.hire_date},...earningSummary(period.amount,(payments||[]).filter(payment=>payment.salary_period_id===period.id),period.due_date,period.status)
    }))}));
    return {employments};
  });
}
const input=z.object({profileId:z.uuid(),hireDate:z.iso.date(),endDate:z.iso.date().nullable().optional(),monthlyAmount:z.number().finite().min(0).max(100000000).multipleOf(0.01),currency:z.string().regex(/^[A-Z]{3}$/),effectiveFrom:z.iso.date(),partialPeriodRule:z.enum(['manual','fixed_monthly'])});
export async function POST(request:Request) {
  return protectedRoute(request,'admin',async actor=>{
    const body=input.parse(await request.json());
    const {data:employment,error}=await database().rpc('save_staff_employment',{p_actor:actor.id,p_profile:body.profileId,p_hire:body.hireDate,p_end:body.endDate||null,p_partial_rule:body.partialPeriodRule,p_amount:body.monthlyAmount,p_currency:body.currency,p_effective:body.effectiveFrom});
    checkPayrollError(error);return {employment};
  });
}
