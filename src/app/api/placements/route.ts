import { protectedRoute } from '@/lib/http/protected-route';
import { database, checkDb } from '@/lib/db/admin';
import { syncPlacementMonthsBatch } from '@/lib/placements/repository';

export async function GET(request:Request){return protectedRoute(request,async profile=>{
 const {data:candidates,error:candidateError}=await database().from('candidates').select('id').eq('user_id',profile.id);checkDb(candidateError);
 const candidateIds=(candidates||[]).map(c=>c.id);
 const placementsQuery=database().from('placements').select('*,candidate:candidates(id,full_name,email)').in('candidate_id',candidateIds.length?candidateIds:['00000000-0000-0000-0000-000000000000']).order('actual_join_date',{ascending:false,nullsFirst:false});
 const {data:placements,error}=await placementsQuery;checkDb(error);
 await syncPlacementMonthsBatch(placements||[]);
 const ids=(placements||[]).map(row=>row.id);
 const {data:months,error:monthsError}=await database().from('placement_months').select('*').in('placement_id',ids.length?ids:['00000000-0000-0000-0000-000000000000']);checkDb(monthsError);
 for(const row of placements||[])row.months=(months||[]).filter(month=>month.placement_id===row.id);
 const visible=(placements||[]).map(row=>{
  const showAmount=row.candidate_compensation_visible;
  return {id:row.id,candidate_id:row.candidate_id,candidate:row.candidate,company:row.company,role_title:row.role_title,status:row.status,
   planned_start_date:row.planned_start_date,actual_join_date:row.actual_join_date,expected_end_date:row.expected_end_date,actual_end_date:row.actual_end_date,
   candidate_compensation_visible:row.candidate_compensation_visible,candidate_monthly_amount:showAmount?row.candidate_monthly_amount:null,candidate_currency:showAmount?row.candidate_currency:null,
   months:(row.months||[]).map((month:Record<string,unknown>)=>({id:month.id,covered_start:month.covered_start,covered_end:month.covered_end,status:month.status,agreed_amount:showAmount?month.agreed_amount:null,currency:showAmount?month.currency:null}))};
 });
 return {placements:visible};
});}
