import {protectedRoute} from '@/lib/http/protected-route';import {requestAnalysis} from '@/lib/ai/request';import {candidateAccess} from '@/lib/resumes/repository';import {database,checkDb} from '@/lib/db/admin';import {z} from 'zod';
import {refreshStoredMatch} from '@/lib/ai/match-validation';
export async function POST(request:Request){return protectedRoute(request,'candidate_or_staff',p=>requestAnalysis(request,p));}
export async function GET(request:Request){
 return protectedRoute(request,'candidate_or_staff',async p=>{
  const params=new URL(request.url).searchParams;
  const id=params.get('candidateId')||'';
  const candidate=await candidateAccess(p,id);
  const jobId=params.get('jobId');
  let query=database().from('candidate_matches').select('*,job:jobs(title,version,state,description)').eq('candidate_id',id);
  if(jobId)query=query.eq('job_id',z.uuid().parse(jobId));
  const {data,error}=await query.order('created_at',{ascending:false}).limit(100);checkDb(error);
  return {matches:(data||[]).map(m=>{
   const stale=m.candidate_version!==candidate.version||m.job_version!==m.job?.version||m.job?.state==='closed';
   // Correct cached display evidence without another provider call or altering history.
   const refreshed=!stale&&typeof m.job?.description==='string'?refreshStoredMatch(m.data,candidate.confirmed_facts||{},m.job.description):null;
   return {...m,data:refreshed||m.data,job:m.job?{title:m.job.title,version:m.job.version,state:m.job.state}:m.job,stale};
  })};
 });
}
