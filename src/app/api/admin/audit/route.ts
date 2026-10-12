import {protectedRoute} from '@/lib/http/protected-route';
import {database,checkDb} from '@/lib/db/admin';
import {z} from 'zod';
export async function GET(request:Request){return protectedRoute(request,'admin',async()=>{
 const id=z.uuid().parse(new URL(request.url).searchParams.get('subjectId'));
 const {data,error}=await database().from('audit_events').select('id,action,created_at,metadata,actor:profiles(full_name,email)').eq('subject_id',id).order('created_at',{ascending:false}).limit(100);checkDb(error);return {events:data||[]};
});}
