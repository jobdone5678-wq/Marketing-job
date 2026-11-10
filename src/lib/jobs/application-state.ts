export type AppliedJobKeys={jobIds:string[];urls:string[]};
export type CandidateJobApplication={id:string;candidateId:string;jobId:string|null;title:string;company:string;location:string|null;provider:string;employmentType:string;jobUrl:string|null;status:string;captureStatus:string|null;appliedAt:string;jobState:string|null};
export type AppliedJobsResponse={candidateId:string|null;candidateName:string|null;requiresCandidate:boolean;applications:CandidateJobApplication[];total:number;hasMore:boolean;appliedKeys:AppliedJobKeys};

// Match a posting, not a company or title. Tracking and application routes do not
// identify a different vacancy, while host, board and posting path still do.
export function applicationUrlKey(value:string|null|undefined){
 try{const url=new URL(value||'');if(!['https:','http:'].includes(url.protocol))return null;
  const identity=new URLSearchParams();
  const fields=new Set(['id','jobid','job_id','gh_jid','postingid','posting_id','requisitionid','requisition_id','jk']);
  const greenhouse=url.hostname==='greenhouse.io'||url.hostname.endsWith('.greenhouse.io');
  for(const [name,value] of url.searchParams){const key=name.toLowerCase();if(fields.has(key)||(greenhouse&&['for','token'].includes(key)))identity.append(key,value);}
  identity.sort();
  return url.origin+url.pathname.replace(/\/(?:application|apply|confirmation|thank-you|success)(?:\/.*)?\/?$/i,'').replace(/\/$/,'')+(identity.size?'?'+identity.toString():'');
 }catch{return null;}
}
export function withoutAppliedJobs<T extends {id?:string;application_url?:string;source_url?:string}>(jobs:T[],keys:AppliedJobKeys){
 const ids=new Set(keys.jobIds),urls=new Set(keys.urls);
 return jobs.filter(job=>!ids.has(job.id||'')&&![job.application_url,job.source_url].some(value=>{const key=applicationUrlKey(value);return key&&urls.has(key);}));
}
