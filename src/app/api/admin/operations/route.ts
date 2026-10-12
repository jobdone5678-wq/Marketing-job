import {protectedRoute} from '@/lib/http/protected-route';
import {database,checkDb} from '@/lib/db/admin';
import {ensureSalaryPeriods,earningSummary} from '@/lib/payroll/repository';
export async function GET(request:Request){return protectedRoute(request,'admin',async actor=>{
 const {data:employments,error:employmentError}=await database().from('staff_employments').select('id');checkDb(employmentError);
 await Promise.all((employments||[]).map(row=>ensureSalaryPeriods(row.id)));
 const [pending,candidates,placements,periods,commissions,capture,totals]=await Promise.all([
  database().from('profiles').select('id,email,full_name,role,status,created_at').in('role',['recruiter','technical_recruiter']).eq('status','pending').order('created_at').limit(100),
  database().from('candidates').select('id,full_name,email,provenance_status').or('assigned_recruiter_id.is.null,assigned_technical_recruiter_id.is.null,provenance_status.eq.legacy_unconfirmed').order('updated_at',{ascending:false}).limit(100),
  database().from('placements').select('*,candidate:candidates(full_name),recruiter:profiles!placements_recruiter_id_fkey(full_name),technical_recruiter:profiles!placements_technical_recruiter_id_fkey(full_name)').order('actual_join_date',{ascending:false,nullsFirst:true}).limit(300),
  database().from('staff_salary_periods').select('*,employment:staff_employments(profile_id,hire_date,profile:profiles!staff_employments_profile_id_fkey(id,full_name,email,role))').not('status','in','(cancelled,paid)').order('due_date').limit(500),
  database().from('technical_recruiter_commissions').select('*,profile:profiles!technical_recruiter_commissions_technical_recruiter_id_fkey(full_name,email),placement:placements(company,role_title,candidate:candidates(full_name))').not('status','in','(rejected,paid)').order('due_date',{nullsFirst:false}).limit(300),
  database().from('job_submissions').select('id,company_name,job_title,capture_status,candidate:candidates(full_name)').in('capture_status',['failed','submit_attempted','started','in_progress']).order('submission_date',{ascending:false}).limit(100),
  database().rpc('recruiting_operations_totals',{p_actor:actor.id})
 ]);
 for(const result of [pending,candidates,placements,periods,commissions,capture,totals])checkDb(result.error);
 const zero='00000000-0000-0000-0000-000000000000';
 const [salaryPayments,commissionPayments]=await Promise.all([
  database().from('earning_payment_balances').select('*').in('salary_period_id',periods.data?.length?periods.data.map(row=>row.id):[zero]),
  database().from('earning_payment_balances').select('*').in('commission_id',commissions.data?.length?commissions.data.map(row=>row.id):[zero])
 ]);checkDb(salaryPayments.error);checkDb(commissionPayments.error);
 return {pendingStaff:pending.data||[],unassignedCandidates:candidates.data||[],placements:placements.data||[],
  salaryPeriods:(periods.data||[]).map(row=>({...row,...earningSummary(row.amount,(salaryPayments.data||[]).filter(payment=>payment.salary_period_id===row.id),row.due_date,row.status)})),
  commissions:(commissions.data||[]).map(row=>({...row,...earningSummary(row.amount,(commissionPayments.data||[]).filter(payment=>payment.commission_id===row.id),row.due_date,row.status)})),
  captureIssues:capture.data||[],...totals.data};
});}
