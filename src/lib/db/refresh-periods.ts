import 'server-only';
import {database,checkDb,CaptureError} from '@/lib/db/admin';

function checkRefresh(error:{code?:string;message:string}|null){
 if(error?.code==='P0001')throw new CaptureError(error.message,409);
 checkDb(error);
}

// Bound payload size and avoid opening a connection for every row on dashboard reads.
// Keep a compatibility path until the performance migration has been installed.
export async function refreshPeriods(kind:'salary'|'placement',ids:string[]) {
 const unique=[...new Set(ids)];
 for(let offset=0;offset<unique.length;offset+=200){
  const batch=unique.slice(offset,offset+200);
  const {error}=await database().rpc('sync_recruiting_periods',{
   p_employments:kind==='salary'?batch:[],p_placements:kind==='placement'?batch:[]
  });
  if(error?.code==='PGRST202'){
   // Limit legacy fan-out as well; never overload the pool with an unbounded Promise.all.
   for(let i=0;i<batch.length;i+=5){
    await Promise.all(batch.slice(i,i+5).map(async id=>{
     const {error:legacyError}=await database().rpc(kind==='salary'?'sync_staff_salary_periods':'sync_placement_months',kind==='salary'?{p_employment:id}:{p_placement:id});
     checkRefresh(legacyError);
    }));
   }
  }else checkRefresh(error);
 }
}
