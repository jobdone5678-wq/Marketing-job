"use client";
import {useEffect,useState} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogHeader,DialogDescription} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import {api,ApiRequestError} from '@/lib/api-client';
import {getCandidates} from '@/lib/candidates';
import type {Candidate} from '@/types/database';

type Requirement={requirement:string;status:'met'|'missing'|'unknown';jobEvidence:string;candidateField:string|null;candidateEvidence:string|null;candidateCitations?:{field:string;evidence:string}[]};
type Constraint={field:string;requiredValue:boolean;status:'met'|'conflict'|'unknown';jobEvidence:string};
type Match={id:string;job_id:string;stale:boolean;data:{coverage:number|null;requirements:Requirement[];constraints:Constraint[]}};
const statusLabel={met:'Supported',missing:'Missing',unknown:'Unknown',conflict:'Conflict'};
const constraintLabels:Record<string,string>={authorized_in_usa:'US work authorization',need_sponsorship_now:'Sponsorship needed now',need_sponsorship_future:'Future sponsorship needed',open_to_relocation:'Open to relocation'};

export function SkillMatcherDialog({open,onOpenChange,job}:{open:boolean;onOpenChange:(v:boolean)=>void;job:{id?:string;title:string;company:string;description:string;location?:string;portal?:string;url?:string}}){
 const [candidates,setCandidates]=useState<Candidate[]>([]),[selected,setSelected]=useState(''),[tasks,setTasks]=useState<string[]>([]),[result,setResult]=useState<Match|null>(null),[error,setError]=useState(''),[failedTask,setFailedTask]=useState<string|null>(null),[submitting,setSubmitting]=useState(false),[processingNote,setProcessingNote]=useState(''),[taskStatus,setTaskStatus]=useState('queued'),[statusUnavailable,setStatusUnavailable]=useState(false),[statusVersion,setStatusVersion]=useState(0);
 useEffect(()=>{if(!open)return;let active=true;getCandidates().then(rows=>{if(active)setCandidates(rows);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[open]);
 useEffect(()=>{
  if(!open||!tasks.length)return;
  let cancelled=false;
  void api<{status:string;message?:string}>(`/api/tasks/${tasks[0]}/process`,{method:'POST'}).then(response=>{if(!cancelled)setProcessingNote(response.status==='waiting_for_worker'?response.message||'Waiting for the processing worker.':response.status==='not_claimed'?'Waiting for the worker to finish the existing task.':'');}).catch(()=>{if(!cancelled)setProcessingNote('Checking saved task status. If this stays queued, ask your administrator to check the processing worker.');});
  return()=>{cancelled=true;};
 },[open,tasks]);
 useEffect(()=>{
  if(!open||!tasks.length||!job.id)return;
  let cancelled=false;let timer:ReturnType<typeof setTimeout>;let networkFailures=0;
  async function poll(){try{
   const response=await api<{task:{status:string;error:string|null;result:{matchId?:string}|null}}>(`/api/tasks/${tasks[0]}`);
   if(cancelled)return;
   setStatusUnavailable(false);setError('');setTaskStatus(response.task.status);
   if(response.task.status==='failed'){setFailedTask(tasks[0]);setError(response.task.error||'Processing failed. Fix the reported issue and retry the comparison.');return;}
   if(response.task.status==='succeeded'){
    const data=await api<{matches:Match[]}>(`/api/matches?candidateId=${encodeURIComponent(selected)}&jobId=${encodeURIComponent(job.id!)}`);
    const matches=data.matches.filter(match=>match.job_id===job.id);
    const match=matches.find(row=>row.id===response.task.result?.matchId)||matches[0];
    if(!match)throw new Error('No comparison result was available for this job. Check the saved comparison status or contact your administrator.');
    if(!cancelled)setResult(match);return;
   }
   networkFailures=0;timer=setTimeout(poll,2000);
  }catch(e){
   if(cancelled)return;
   const transient=e instanceof ApiRequestError&&(e.status===null||e.status>=500||e.status===408||e.status===429);
   if(transient&&networkFailures<2){networkFailures++;setProcessingNote('Connection interrupted. Rechecking the saved comparison status...');timer=setTimeout(poll,1000*2**(networkFailures-1));return;}
   setError((e as Error).message);setStatusUnavailable(true);
  }}
  void poll();return()=>{cancelled=true;clearTimeout(timer);};
 },[open,tasks,selected,job.id,statusVersion]);
 const visibleResult=result?.job_id===job.id?result:null;
 const analysis=visibleResult?.data;
 return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[85vh] overflow-auto sm:max-w-3xl">
  <DialogHeader><DialogTitle>Compare candidate with {job.title}</DialogTitle><DialogDescription>{job.company} · Evidence coverage includes unknown requirements. It is not a placement probability or a legal eligibility decision.</DialogDescription></DialogHeader>
  <label className="grid gap-1 text-sm">Reviewed candidate<select className="rounded border bg-background p-2" aria-label="Candidate for comparison" value={selected} onChange={e=>{setSelected(e.target.value);setResult(null);setTasks([]);setFailedTask(null);setError('');setStatusUnavailable(false);}}><option value="">Choose a reviewed candidate</option>{candidates.filter(candidate=>candidate.provenance_status==='confirmed').map(candidate=><option key={candidate.id} value={candidate.id}>{candidate.full_name}</option>)}</select></label>
  <Button disabled={!selected||!job.id||submitting||(tasks.length>0&&!failedTask&&!visibleResult)} onClick={async()=>{
   setSubmitting(true);
   try{
    setError('');setResult(null);setTasks([]);setProcessingNote('Starting AI processing...');setTaskStatus('queued');setStatusUnavailable(false);
    if(failedTask){
     const response=await api<{taskId:string}>(`/api/tasks/${failedTask}/retry`,{method:'POST'});
     setFailedTask(null);setTasks([response.taskId]);
    }else{
     const response=await api<{tasks:{taskId:string}[]}>('/api/matches',{method:'POST',body:JSON.stringify({candidateId:selected,jobIds:[job.id],allowOtherEmployment:true})});
     setTasks(response.tasks.map(task=>task.taskId));
    }
   }catch(e){setError((e as Error).message);}finally{setSubmitting(false);}
  }}>{submitting?'Starting comparison…':failedTask?'Retry AI comparison':'Queue AI comparison (this employment type)'}</Button>
  {tasks.length>0&&!visibleResult&&!error&&<div role="status"><p>{taskStatus==='running'?'AI comparison is processing...':'Comparison queued. Waiting for processing to start.'}</p>{processingNote&&<p className="mt-1 text-sm text-muted-foreground">{processingNote}</p>}</div>}
  {error&&<p role="alert" className="text-destructive">{error}</p>}
  {statusUnavailable&&tasks.length>0&&!failedTask&&<div className="space-y-2"><p className="text-sm text-muted-foreground">The saved comparison may still be processing. Check its status instead of queueing another request.</p><Button variant="outline" onClick={()=>{setError('');setStatusUnavailable(false);setStatusVersion(value=>value+1);}}>Check comparison status</Button></div>}
  {analysis&&<section className="space-y-5" aria-label="Comparison results">
   {visibleResult?.stale&&<p role="alert" className="rounded border border-amber-400 p-3 text-sm">The candidate profile or job has changed since this comparison. Queue a fresh comparison before relying on these results.</p>}
   <div className="rounded-lg border bg-muted/30 p-4"><p className="text-xl font-semibold">{analysis.coverage===null?'Insufficient evidence':`${analysis.coverage}% evidence coverage`}</p><p className="mt-1 text-sm font-medium">{analysis.requirements.filter(row=>row.status==='met').length} supported · {analysis.requirements.filter(row=>row.status==='unknown').length} unknown</p><p className="mt-1 text-sm text-muted-foreground">{analysis.requirements.filter(row=>row.status==='met').length} of {analysis.requirements.length} requirements supported by reviewed candidate facts. Unknown answers need review.</p><p className="mt-2 text-xs text-muted-foreground">Unknown means the reviewed resume does not prove this requirement; it does not mean the candidate is unqualified.</p></div>
   <section className="space-y-3"><h3 className="font-semibold">Requirement evidence</h3>{analysis.requirements.length===0?<p className="text-sm text-muted-foreground">No supported job requirements were available to compare.</p>:analysis.requirements.map((requirement,index)=><article key={index} className="space-y-2 rounded-lg border p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><strong>{requirement.requirement}</strong><span className="rounded bg-muted px-2 py-1 text-xs font-medium">{statusLabel[requirement.status]}</span></div><p><span className="font-medium">Job evidence: </span>{requirement.jobEvidence}</p><p><span className="font-medium">Candidate evidence: </span>{requirement.candidateEvidence||'No supporting reviewed fact recorded.'}</p>{requirement.candidateCitations?.length?<ul aria-label="Reviewed resume citations" className="space-y-1 text-xs text-muted-foreground">{requirement.candidateCitations.map((citation,i)=><li key={i}>{citation.field.replaceAll('_',' ')}: {citation.evidence}</li>)}</ul>:requirement.candidateField&&<p className="text-xs text-muted-foreground">Profile field: {requirement.candidateField.replaceAll('_',' ')}</p>}</article>)}</section>
   <section className="space-y-3"><h3 className="font-semibold">Explicit job constraints</h3>{analysis.constraints.length===0?<p className="text-sm text-muted-foreground">No explicit constraints were available. This does not establish eligibility.</p>:analysis.constraints.map((constraint,index)=><article key={index} className="space-y-1 rounded-lg border p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong>{constraintLabels[constraint.field]||constraint.field.replaceAll('_',' ')}</strong><span className={constraint.status==='conflict'?'font-semibold text-destructive':'text-muted-foreground'}>{statusLabel[constraint.status]}</span></div><p>Required answer: {constraint.requiredValue?'Yes':'No'}</p><p>{constraint.jobEvidence}</p>{constraint.status==='conflict'&&<p className="text-xs text-destructive">The reviewed candidate answer conflicts with this explicit requirement.</p>}</article>)}</section>
  </section>}
 </DialogContent></Dialog>;
}
