import { protectedRoute } from '@/lib/http/protected-route';
import { database, checkDb } from '@/lib/db/admin';
import { ensureSalaryPeriods,earningSummary } from '@/lib/payroll/repository';
import { syncPlacementMonthsBatch } from '@/lib/placements/repository';

export async function GET(request:Request){return protectedRoute(request,'candidate_or_staff',async profile=>{
 const [visible,finances]=await Promise.all([
  (async()=>{
    let placementsQuery=database().from('placements').select('*,candidate:candidates(id,full_name,email)').order('actual_join_date',{ascending:false,nullsFirst:false});
    if(profile.role==='client'){
     const {data:candidates,error}=await database().from('candidates').select('id').eq('user_id',profile.id);checkDb(error);const ids=(candidates||[]).map(c=>c.id);placementsQuery=placementsQuery.in('candidate_id',ids.length?ids:['00000000-0000-0000-0000-000000000000']);
    } else if(profile.role==='recruiter'||profile.role==='technical_recruiter'){
     const key=profile.role==='recruiter'?'assigned_recruiter_id':'assigned_technical_recruiter_id';const {data:candidates,error}=await database().from('candidates').select('id').eq(key,profile.id);checkDb(error);const ids=(candidates||[]).map(c=>c.id);placementsQuery=placementsQuery.in('candidate_id',ids.length?ids:['00000000-0000-0000-0000-000000000000']);
    }
    const {data:placements,error}=await placementsQuery;checkDb(error);
    await syncPlacementMonthsBatch(placements||[]);
    const ids=(placements||[]).map(row=>row.id);
    const {data:months,error:monthsError}=await database().from('placement_months').select('*').in('placement_id',ids.length?ids:['00000000-0000-0000-0000-000000000000']);checkDb(monthsError);
    for(const row of placements||[])row.months=(months||[]).filter(month=>month.placement_id===row.id);
    const visible=(placements||[]).map(row=>{
     const showAmount=profile.role!=='client'||row.candidate_compensation_visible;
     return {id:row.id,candidate_id:row.candidate_id,candidate:row.candidate,company:row.company,role_title:row.role_title,status:row.status,
      planned_start_date:row.planned_start_date,actual_join_date:row.actual_join_date,expected_end_date:row.expected_end_date,actual_end_date:row.actual_end_date,
      candidate_compensation_visible:row.candidate_compensation_visible,candidate_monthly_amount:showAmount?row.candidate_monthly_amount:null,candidate_currency:showAmount?row.candidate_currency:null,
      months:(row.months||[]).map((month:Record<string,unknown>)=>({id:month.id,covered_start:month.covered_start,covered_end:month.covered_end,status:month.status,agreed_amount:showAmount?month.agreed_amount:null,currency:showAmount?month.currency:null}))};
    });
   return visible;
  })(),
  (async()=>{
    let employment=null,salaryPeriods:unknown[]=[],commissions:unknown[]=[],payments:unknown[]=[];
    if(profile.role!=='client'){
     const [baseResult,commissionResult,paymentResult]=await Promise.all([
      database().from('staff_employments').select('id').eq('profile_id',profile.id).maybeSingle(),
      database().from('technical_recruiter_commissions').select('*,placement:placements(company,role_title,candidate:candidates(full_name))').eq('technical_recruiter_id',profile.id).order('created_at',{ascending:false}),
      database().from('external_payments').select('*').eq('payee_profile_id',profile.id).order('paid_on',{ascending:false})
     ]);
     checkDb(baseResult.error);checkDb(commissionResult.error);checkDb(paymentResult.error);
     if(baseResult.data)await ensureSalaryPeriods(baseResult.data.id);
     const {data:e,error:employmentError}=await database().from('staff_employments').select('*,profile:profiles!staff_employments_profile_id_fkey(full_name,email),terms:staff_compensation_terms(*),periods:staff_salary_periods(*)').eq('profile_id',profile.id).maybeSingle();checkDb(employmentError);employment=e;
     const c=commissionResult.data;payments=paymentResult.data||[];
     const zero='00000000-0000-0000-0000-000000000000';
     const [salaryBalances,commissionBalances]=await Promise.all([
      database().from('earning_payment_balances').select('*').in('salary_period_id',e?.periods?.length?e.periods.map((period:{id:string})=>period.id):[zero]),
      database().from('earning_payment_balances').select('*').in('commission_id',c?.length?c.map(item=>item.id):[zero])
     ]);checkDb(salaryBalances.error);checkDb(commissionBalances.error);
     salaryPeriods=(e?.periods||[]).map((period:{id:string;amount:string;currency:string;due_date:string;status:string})=>({...period,employment:{profile:e.profile,hire_date:e.hire_date},...earningSummary(period.amount,(salaryBalances.data||[]).filter(row=>row.salary_period_id===period.id),period.due_date,period.status)}));
     commissions=(c||[]).map(item=>({...item,...earningSummary(item.amount,(commissionBalances.data||[]).filter(row=>row.commission_id===item.id),item.due_date,item.status),profile:{full_name:profile.full_name,email:profile.email}}));
    }
   return {employment,salaryPeriods,commissions,payments};
  })()
 ]);
 return {placements:visible,...finances};
});}
