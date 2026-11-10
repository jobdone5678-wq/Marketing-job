import {protectedRoute} from '@/lib/http/protected-route';
import {database} from '@/lib/db/admin';
import {checkPayrollError} from '@/lib/payroll/repository';
import {z} from 'zod';
export async function PATCH(request:Request,context:{params:Promise<{id:string}>}) {
  return protectedRoute(request,'admin',async actor=>{
    const id=z.uuid().parse((await context.params).id);
    const body=z.object({amount:z.number().finite().min(0).max(100000000).multipleOf(0.01),reason:z.string().trim().min(1).max(500)}).parse(await request.json());
    const {error}=await database().rpc('adjust_staff_salary_period',{p_actor:actor.id,p_period:id,p_amount:body.amount,p_reason:body.reason});
    checkPayrollError(error);return {saved:true};
  });
}
