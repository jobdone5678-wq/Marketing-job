import {protectedRoute} from '@/lib/http/protected-route';
import {database} from '@/lib/db/admin';
import {checkPayrollError} from '@/lib/payroll/repository';
import {z} from 'zod';
export async function PATCH(request:Request,context:{params:Promise<{id:string}>}){
 return protectedRoute(request,'admin',async actor=>{
  const id=z.uuid().parse((await context.params).id);
  const body=z.object({monthId:z.uuid(),agreedAmount:z.number().finite().min(0).max(100000000).multipleOf(0.01),currency:z.string().regex(/^[A-Z]{3}$/),notes:z.string().max(1000).nullable().optional(),reason:z.string().trim().min(1).max(500)}).parse(await request.json());
  const {error}=await database().rpc('adjust_placement_month',{p_actor:actor.id,p_placement:id,p_month:body.monthId,p_amount:body.agreedAmount,p_currency:body.currency,p_notes:body.notes||null,p_reason:body.reason});checkPayrollError(error);return {saved:true};
 });
}
