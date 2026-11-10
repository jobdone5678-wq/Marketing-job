import {protectedRoute} from '@/lib/http/protected-route';
import {database,checkDb,CaptureError} from '@/lib/db/admin';
import {serviceCollections} from '@/lib/billing/repository';
export async function GET(request:Request){return protectedRoute(request,'candidate_or_staff',async actor=>{
 if(actor.role!=='client')throw new CaptureError('Candidate access required.',403);
 const {data,error}=await database().from('candidates').select('id').eq('user_id',actor.id);checkDb(error);
 return serviceCollections((data||[]).map(c=>c.id));
});}
