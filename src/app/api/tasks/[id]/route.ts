import {protectedRoute} from '@/lib/http/protected-route';
import {database,checkDb,CaptureError} from '@/lib/db/admin';
import {z} from 'zod';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context) {return protectedRoute(request,'candidate_or_staff',async profile=>{
  const {id}=await context.params;if(!z.uuid().safeParse(id).success)throw new CaptureError('Invalid task identifier.');
  const {data,error}=await database().from('background_tasks').select('id,actor_id,kind,status,attempts,error,result,created_at,updated_at').eq('id',id).maybeSingle();checkDb(error);
  if(!data||data.actor_id!==profile.id&&profile.role!=='super_admin')throw new CaptureError('Task not found.',404);return {task:data};
});}
