import {protectedRoute} from '@/lib/http/protected-route';
import {CaptureError} from '@/lib/db/admin';
import {recommendationContext} from '@/lib/jobs/recommendations';
import {candidateJobApplications} from '@/lib/jobs/applications';

export async function GET(request:Request){
 return protectedRoute(request,'candidate_or_staff',async profile=>{
  const params=new URL(request.url).searchParams;
  const {recommendation}=await recommendationContext(profile,params);
  const page=Number(params.get('page')||0);
  if(!Number.isSafeInteger(page)||page<0)throw new CaptureError('Invalid page.');
  const provider=params.get('provider');
  if(provider&&!['greenhouse','ashby','lever','smartrecruiters','breezy','remoteok'].includes(provider))throw new CaptureError('Invalid portal filter.');
  const {applications,appliedKeys}=await candidateJobApplications(recommendation.candidateId);
  const search=params.get('search')?.trim().toLowerCase(),company=params.get('company')?.trim().toLowerCase(),location=params.get('location')?.trim().toLowerCase(),type=params.get('type')||'all';
  if(!['all','contract','permanent','temporary','part_time','internship','unknown'].includes(type))throw new CaptureError('Invalid job filter.');
  const filtered=applications.filter(row=>(!provider||row.provider===provider)&&(!company||row.company.toLowerCase().includes(company))&&(!location||row.location?.toLowerCase().includes(location))&&(!search||[row.title,row.company].some(value=>value.toLowerCase().includes(search)))&&(type==='all'||row.employmentType===type));
  return {candidateId:recommendation.candidateId,candidateName:recommendation.candidateName,requiresCandidate:!recommendation.candidateId,applications:filtered.slice(page*50,page*50+50),total:filtered.length,hasMore:(page+1)*50<filtered.length,appliedKeys};
 });
}
