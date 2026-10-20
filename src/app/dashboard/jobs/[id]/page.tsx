"use client";

import Link from 'next/link';

import {WorkspaceHeading,WorkspaceError,WorkspaceSkeleton} from '@/components/workspace-ui';

import {TailoredResumePanel} from '@/components/tailored-resume-panel';

import {JobDates} from '@/components/job-dates';

import {use,useEffect,useState} from 'react';import {api} from '@/lib/api-client';import {Button} from '@/components/ui/button';import {SkillMatcherDialog} from '@/components/skill-matcher-dialog';import {getCandidates} from '@/lib/candidates';import type {Candidate} from '@/types/database';import type {StoredJob} from '@/lib/jobs/types';import {useUserProfile} from '@/hooks/use-user-profile';

export default function JobDetail({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{candidateId?:string}>}){const {id}=use(params);const requestedCandidate=use(searchParams).candidateId||'';const {isRecruiter,isTechnicalRecruiter,isClient}=useUserProfile();const canRecruit=isRecruiter||isTechnicalRecruiter;const [job,setJob]=useState<StoredJob|null>(null),[error,setError]=useState(''),[candidates,setCandidates]=useState<Candidate[]>([]),[candidateId,setCandidate]=useState(requestedCandidate),[matcher,setMatcher]=useState(false),[notice,setNotice]=useState(''),[packet,setPacket]=useState<unknown>(null);

 useEffect(()=>{void api<{job:StoredJob}>(`/api/jobs/${id}`).then(r=>setJob(r.job)).catch(e=>setError(e.message));void getCandidates().then(items=>setCandidates(items.filter(candidate=>candidate.provenance_status==='confirmed'))).catch(e=>setError(e.message));},[id]);

 async function apply(){const tab=window.open('about:blank','_blank');try{if(tab)tab.opener=null;const r=await api<{intent:{id:string;job:{application_url:string}}}>('/api/application-intents',{method:'POST',body:JSON.stringify({candidateId,jobId:id})});const u=new URL(r.intent.job.application_url);u.hash='marketing-intent='+r.intent.id;if(tab)tab.location.href=u.toString();else setNotice('Application linked and started as a draft.');setNotice('Application started as a Draft. The extension or email receipt will update its status.');}catch(e){tab?.close();setError((e as Error).message);}}

 async function draft(){try{const r=await api<{tasks:{taskId:string}[]}>('/api/packets',{method:'POST',body:JSON.stringify({candidateId,jobIds:[id],allowOtherEmployment:true})});setNotice('Packet queued. Waiting for the worker...');const taskId=r.tasks[0].taskId;let attempts=0;async function poll(){if(attempts++>150)return;const t=await api<{task:{status:string;error:string|null}}>(`/api/tasks/${taskId}`);if(t.task.status==='failed'){setError(t.task.error||'Packet failed');return;}if(t.task.status==='succeeded'){setPacket(await api(`/api/packets?candidateId=${candidateId}`));setNotice('Factual packet saved with a Draft submission.');return;}setTimeout(()=>void poll().catch(e=>setError(e.message)),2000);}void poll().catch(e=>setError(e.message));}catch(e){setError((e as Error).message);}}

 return <main className="portal-page space-y-6"><Link href="/dashboard/jobs" className="text-xs text-muted-foreground hover:text-foreground">Back to jobs</Link>{error&&<WorkspaceError message={error}/>} {!job&&!error?<WorkspaceSkeleton/>:job&&<>

 <WorkspaceHeading eyebrow="Job detail" title={job.title} description={`${job.company} · ${job.location||'Location unknown'}`} actions={<span className={`status-chip ${job.state==='stale'?'status-warning':'status-neutral'}`}>{job.state}</span>}/>

 <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">

 <article className="min-w-0 space-y-5"><div className="flex flex-wrap gap-x-5 gap-y-2 border-y border-border/60 py-3 text-xs text-muted-foreground"><span>{job.employment_type.replaceAll('_',' ')}</span><span>{job.source?.provider||'Source not recorded'}</span><JobDates posted_at={job.posted_at} closes_at={job.closes_at} provider={job.source?.provider}/></div><section className="space-y-3"><h2 className="section-label">Job description</h2><div className="whitespace-pre-wrap break-words text-sm leading-7">{job.description}</div></section><p className="border-t border-border/60 pt-3 text-xs text-muted-foreground">Employment evidence: {job.employment_evidence||'No explicit evidence recorded.'}</p></article>

 <aside className="space-y-5 rounded-lg border border-border/60 bg-card p-4 lg:sticky lg:top-5"><h2 className="section-label">Candidate & next action</h2><Button variant="outline" className="w-full" onClick={()=>setMatcher(true)}>Compare reviewed candidate with AI</Button>{canRecruit?<section className="space-y-4"><label className="grid gap-2 text-xs">Candidate<select aria-label="Candidate for application" className="ops-input" value={candidateId} onChange={event=>setCandidate(event.target.value)}><option value="">Choose candidate</option>{candidates.map(candidate=><option key={candidate.id} value={candidate.id}>{candidate.full_name}</option>)}</select></label><div className="grid gap-2"><Button disabled={!candidates.some(candidate=>candidate.id===candidateId)||job.state==='closed'} onClick={()=>void apply()}>Start linked application</Button><Button disabled={!candidates.some(candidate=>candidate.id===candidateId)} variant="outline" onClick={()=>void draft()}>Prepare factual packet draft</Button></div><p className="text-xs leading-relaxed text-muted-foreground">Starting opens the external form and creates a draft. It does not mean an application was submitted.</p>{candidateId&&<Link href={`/dashboard/candidates/${candidateId}`} className="text-xs text-primary underline">Review candidate facts & documents</Link>}</section>:<a className="inline-flex min-h-9 items-center text-sm font-medium text-primary underline" href={job.application_url} target="_blank" rel="noopener noreferrer">Open public application</a>}</aside></div>

 {notice&&<p role="status" className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">{notice}</p>}{!!packet&&<details className="border-y border-border/60 py-3 text-sm"><summary>Prepared packet details</summary><pre className="mt-3 whitespace-pre-wrap break-words text-xs">{JSON.stringify(packet,null,2)}</pre></details>}

 {(isRecruiter||isClient)&&<TailoredResumePanel key={`${job.id}:${candidateId}`} jobId={job.id} candidateId={candidateId||undefined} candidates={candidates}/>}

 <SkillMatcherDialog open={matcher} onOpenChange={setMatcher} job={{id:job.id,title:job.title,company:job.company,description:job.description,location:job.location||undefined,url:job.application_url}}/>

 </>}</main>;

}

