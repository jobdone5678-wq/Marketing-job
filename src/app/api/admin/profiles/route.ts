import {protectedRoute} from '@/lib/http/protected-route';
import {database,checkDb} from '@/lib/db/admin';
import {checkPayrollError} from '@/lib/payroll/repository';
import {z} from 'zod';
export async function GET(request:Request){return protectedRoute(request,'admin',async()=>{
 const {data,error}=await database().from('profiles').select('id,email,full_name,role,status').order('created_at',{ascending:false}).limit(500);checkDb(error);return {profiles:data||[]};
});}
export async function PATCH(request:Request){return protectedRoute(request,'admin',async actor=>{
 const body=z.object({id:z.uuid(),status:z.enum(['active','pending','rejected','suspended'])}).parse(await request.json());
 const {error}=await database().rpc('set_staff_account_status',{p_actor:actor.id,p_profile:body.id,p_status:body.status});checkPayrollError(error);return {saved:true};
});}
