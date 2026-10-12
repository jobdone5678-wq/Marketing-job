import {protectedRoute} from '@/lib/http/protected-route';
import {database,checkDb} from '@/lib/db/admin';
import {candidateAccess} from '@/lib/resumes/repository';
import {z} from 'zod';
export async function GET(request:Request){return protectedRoute(request,'candidate_or_staff',async actor=>{
 const candidateId=z.uuid().parse(new URL(request.url).searchParams.get('candidateId'));
 await candidateAccess(actor,candidateId);
 const {data,error}=await database().from('job_submissions').select('id,company_name,job_title,status').eq('candidate_id',candidateId).order('submission_date',{ascending:false}).limit(200);checkDb(error);return {submissions:data||[]};
});}
