import {protectedRoute} from '@/lib/http/protected-route';
import {database} from '@/lib/db/admin';
import {checkPayrollError} from '@/lib/payroll/repository';
import {z} from 'zod';
export async function PATCH(request:Request,context:{params:Promise<{id:string}>}){
 return protectedRoute(request,'admin',async actor=>{
  const id=z.uuid().parse((await context.params).id);
  const body=z.object({status:z.enum(['approved','rejected']),reason:z.string().trim().max(500).optional()}).parse(await request.json());
  const {error}=await database().rpc('decide_placement_commission',{p_actor:actor.id,p_commission:id,p_status:body.status,p_reason:body.reason||null});
  checkPayrollError(error);return {saved:true,status:body.status};
 });
}
