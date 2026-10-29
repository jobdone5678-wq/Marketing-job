import 'server-only';
import {database,checkDb} from '@/lib/db/admin';
import {applicationUrlKey,type AppliedJobKeys,type CandidateJobApplication} from './application-state';

type LinkedJob={id:string;application_url:string;source_url:string;location:string|null;employment_type:string;state:string;source:{provider:string}|{provider:string}[]|null};
type Record={id:string;candidate_id:string;job_id:string|null;job_url:string|null;company_name:string;job_title:string;job_location:string|null;portal_source:string|null;status:string;capture_status:string|null;submission_date:string;job:LinkedJob|LinkedJob[]|null};
const appliedStages=new Set(['Applied','Vendor_Screening','Submitted_to_Client','Interview_Scheduled','Round_1','Round_2','Offer_Received','Rejected','No_Response']);

// The caller must resolve candidate access through recommendationContext first.
export async function candidateJobApplications(candidateId:string|null|undefined){
 const records:Record[]=[];
 if(candidateId)for(let offset=0;;offset+=500){
  const {data,error}=await database().from('job_submissions')
   .select('id,candidate_id,job_id,job_url,company_name,job_title,job_location,portal_source,status,capture_status,submission_date,job:jobs(id,application_url,source_url,location,employment_type,state,source:job_sources(provider))')
   .eq('candidate_id',candidateId).order('submission_date',{ascending:false}).order('created_at',{ascending:false}).order('id').range(offset,offset+499);
  checkDb(error);records.push(...(data||[]) as unknown as Record[]);if(!data||data.length<500)break;
 }
 const jobIds=new Set<string>(),urls=new Set<string>(),applications:CandidateJobApplication[]=[];
 for(const record of records){
  if(!appliedStages.has(record.status)&&!['submitted','confirmed'].includes(record.capture_status||''))continue;
  const job=Array.isArray(record.job)?record.job[0]:record.job;
  const id=record.job_id||job?.id||null;
  const keys=[record.job_url,job?.application_url,job?.source_url].map(applicationUrlKey).filter((value):value is string=>!!value);
  const duplicate=(id&&jobIds.has(id))||keys.some(key=>urls.has(key));
  if(id)jobIds.add(id);keys.forEach(key=>urls.add(key));
  if(duplicate)continue;
  const source=Array.isArray(job?.source)?job.source[0]:job?.source;
  let provider=source?.provider||record.portal_source?.toLowerCase()||'';
  if(!['greenhouse','ashby','lever','smartrecruiters','breezy','remoteok'].includes(provider)){
   let host='';try{host=new URL(record.job_url||job?.application_url||'').hostname;}catch{}
   provider=host.includes('greenhouse.io')?'greenhouse':host.includes('ashbyhq.com')?'ashby':host.includes('lever.co')?'lever':host.includes('smartrecruiters.com')?'smartrecruiters':host.includes('breezy.hr')?'breezy':host.includes('remoteok.com')?'remoteok':'unknown';
  }
  applications.push({id:record.id,candidateId:record.candidate_id,jobId:id,title:record.job_title,company:record.company_name,location:record.job_location||job?.location||null,provider,employmentType:job?.employment_type||'unknown',jobUrl:record.job_url||job?.application_url||null,status:record.status,captureStatus:record.capture_status,appliedAt:record.submission_date,jobState:job?.state||null});
 }
 return {applications,appliedKeys:{jobIds:[...jobIds],urls:[...urls]} satisfies AppliedJobKeys};
}
