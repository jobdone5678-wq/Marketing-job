import {protectedRoute} from '@/lib/http/protected-route';
import {database,checkDb} from '@/lib/db/admin';
import {checkPayrollError} from '@/lib/payroll/repository';
import {z} from 'zod';
export async function GET(request:Request){return protectedRoute(request,'admin',async()=>{
 const offset=z.coerce.number().int().min(0).max(1_000_000).parse(new URL(request.url).searchParams.get('offset')??0);
 const {data,error}=await database().from('profiles').select('id,email,full_name,role,status').order('created_at',{ascending:false}).order('id',{ascending:false}).range(offset,offset+500);
 checkDb(error);const rows=data||[],hasMore=rows.length>500;return {profiles:rows.slice(0,500),hasMore,nextOffset:hasMore?offset+500:null};
});}
export async function PATCH(request:Request){return protectedRoute(request,'admin',async actor=>{
 const body=z.object({id:z.uuid(),status:z.enum(['active','pending','rejected','suspended']).optional(),role:z.enum(['recruiter','technical_recruiter']).optional(),reason:z.string().trim().max(500).optional()})
  .refine(value=>Boolean(value.status)!==Boolean(value.role),'Choose a role correction or an approval action.').parse(await request.json());
 const {error}=body.role
  ? await database().rpc('correct_staff_account_role',{p_actor:actor.id,p_profile:body.id,p_role:body.role,p_reason:body.reason||null})
  : await database().rpc('set_staff_account_status',{p_actor:actor.id,p_profile:body.id,p_status:body.status});
 checkPayrollError(error);return {saved:true};
});}
