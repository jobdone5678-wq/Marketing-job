import 'server-only';
import {database,checkDb,CaptureError} from '@/lib/db/admin';
import {refreshPeriods} from '@/lib/db/refresh-periods';

export function ensureSalaryPeriodsBatch(ids:string[]) {return refreshPeriods('salary',ids);}

export async function ensureSalaryPeriods(employmentId:string) {
  const {error}=await database().rpc('sync_staff_salary_periods',{p_employment:employmentId});
  checkPayrollError(error);
}
export function checkPayrollError(error:{message:string;code?:string}|null) {
  if(error?.code==='P0001')throw new CaptureError(error.message,409);
  checkDb(error);
}
export function earningSummary(amount:string|number,payments:{amount:string|number}[],dueDate:string|null,status:string,today=new Date().toISOString().slice(0,10)) {
  // Database amounts are numeric(14,2). Sum minor units to avoid binary decimal drift.
  const paidMinor=payments.reduce((sum,payment)=>sum+Math.round(Number(payment.amount)*100),0);
  const balanceMinor=Math.round(Number(amount)*100)-paidMinor;
  return {paid_amount:paidMinor/100,balance:balanceMinor/100,status:
    ['cancelled','awaiting_adjustment','awaiting_eligibility','awaiting_approval','rejected'].includes(status)?status:
    balanceMinor<=0?'paid':paidMinor>0?'partially_paid':dueDate&&dueDate<today?'overdue':dueDate===today?'due':status==='approved'?'approved':'accruing'};
}
