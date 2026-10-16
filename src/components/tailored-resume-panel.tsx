"use client";
import {useCallback,useEffect,useState} from 'react';
import {api} from '@/lib/api-client';
import {getCandidates} from '@/lib/candidates';
import {Button} from '@/components/ui/button';
import {WorkflowTaskStatus} from '@/components/workflow-task-status';
type CandidateOption={id:string;full_name:string;provenance_status?:string};
type Resume={id:string;candidate_id:string;job_id:string|null;brief_id:string|null;status:string;task_id:string;content:string;revision:number;reviewed_revision:number|null;stale:boolean;model:string|null;created_at?:string;data?:{sourceTitle?:string;facts?:{id:string;text:string;field:string}[];selectedFactIds?:string[]}};
export function TailoredResumePanel({jobId,briefId,candidateId,candidateName,candidates}:{jobId?:string;briefId?:string;candidateId?:string;candidateName?:string;candidates?:CandidateOption[]}){
 const [options,setOptions]=useState<CandidateOption[]>([]),[selected,setSelected]=useState(''),[records,setRecords]=useState<Resume[]>([]),[resume,setResume]=useState<Resume|null>(null),[content,setContent]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[consent,setConsent]=useState(false),[confirmed,setConfirmed]=useState(false);
 const available=candidates||options;
 const activeCandidate=candidateId||selected||(available.length===1?available[0].id:'');
 const sourceQuery=jobId?'jobId='+encodeURIComponent(jobId):'briefId='+encodeURIComponent(briefId||'');
 useEffect(()=>{if(candidates||candidateId)return;let active=true;getCandidates().then(rows=>{if(active)setOptions(rows.filter(row=>row.provenance_status==='confirmed'));}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[candidates,candidateId]);
 useEffect(()=>{let active=true;if(activeCandidate)void api<{resumes:Resume[]}>(`/api/tailored-resumes?candidateId=${encodeURIComponent(activeCandidate)}&${sourceQuery}`).then(result=>{if(active)setRecords(result.resumes);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[activeCandidate,sourceQuery]);
 const current=resume?.candidate_id===activeCandidate&&(jobId?resume.job_id===jobId:resume.brief_id===briefId)?resume:null;
 const loadResume=useCallback(async(id:string)=>{const result=await api<{resume:Resume}>(`/api/tailored-resumes/${id}`);setResume(result.resume);setContent(result.resume.content||'');setConfirmed(false);setError('');},[]);
 const refreshCurrent=useCallback(async()=>{if(current)await loadResume(current.id);},[current,loadResume]);
 async function generate(){setBusy(true);setError('');try{const result=await api<{resumeId:string;taskId:string}>('/api/tailored-resumes',{method:'POST',body:JSON.stringify({candidateId:activeCandidate,...(jobId?{jobId}:{briefId}),consent})});await loadResume(result.resumeId);const history=await api<{resumes:Resume[]}>(`/api/tailored-resumes?candidateId=${encodeURIComponent(activeCandidate)}&${sourceQuery}`);setRecords(history.resumes);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function save(){if(!current)return;setBusy(true);try{const result=await api<{resume:Resume}>(`/api/tailored-resumes/${current.id}`,{method:'PATCH',body:JSON.stringify({revision:current.revision,content,confirmFacts:confirmed})});setResume(result.resume);setContent(result.resume.content);setConfirmed(false);setError('');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function download(){if(!current)return;setBusy(true);try{const response=await fetch(`/api/tailored-resumes/${current.id}/download`);if(!response.ok){const result=await response.json();throw new Error(result.error||'Download unavailable.');}const url=URL.createObjectURL(await response.blob());const link=document.createElement('a');link.href=url;link.download=`tailored_resume_v${current.revision}.docx`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setError('');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <section aria-label="Tailored resume workspace" className="space-y-4 rounded-xl border bg-card p-5">
  <div><h2 className="text-lg font-semibold">Tailored resume & DOCX</h2><p className="mt-1 text-sm text-muted-foreground">AI prioritizes reviewed skills and professional facts for this JD. Original resumes and employment history stay unchanged. Review wording and accuracy before downloading.</p></div>
  {candidateId?<p className="text-sm font-medium">Candidate: {candidateName||available.find(row=>row.id===candidateId)?.full_name||'Selected candidate'}</p>:<label className="grid gap-1 text-sm">Reviewed candidate<select aria-label="Candidate for tailored resume" className="ops-input" value={activeCandidate} onChange={e=>{setSelected(e.target.value);setError('');setConfirmed(false);}}><option value="">Choose a reviewed candidate</option>{available.map(row=><option key={row.id} value={row.id}>{row.full_name}</option>)}</select></label>}
  <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>I allow AI to prioritize this reviewed resume for the selected job.</label>
  <Button disabled={!activeCandidate||!consent||busy||(current?.status==='queued'&&!current.stale)} onClick={()=>void generate()}>{busy?'Working…':'Generate tailored resume'}</Button>
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
  {current?.status==='queued'&&<><WorkflowTaskStatus taskId={current.task_id} onComplete={refreshCurrent} onFailed={refreshCurrent}/>{current.stale&&<p className="text-sm text-amber-700">The source changed. Generate a new version instead of retrying this outdated task.</p>}</>}
  {current&&current.status!=='queued'&&<div className="space-y-3">
   {current.stale&&<p role="alert" className="text-sm text-amber-700">The candidate or JD changed. Generate a new version before reviewing or downloading.</p>}
   <p className="text-xs text-muted-foreground">Version {current.revision} · {current.status==='ready'?'Reviewed':'Review required'} · {current.model||'Configured AI provider'}</p>
   <label className="grid gap-2 text-sm font-medium">Tailored resume content<textarea aria-label="Tailored resume content" className="ops-input min-h-80 font-mono text-sm" value={content} readOnly={current.stale} onChange={e=>{setContent(e.target.value);setConfirmed(false);}}/></label>
   <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={current.stale} onChange={e=>setConfirmed(e.target.checked)}/>I reviewed this version and confirm its facts are accurate.</label>
   <div className="flex flex-wrap gap-2"><Button disabled={busy||!confirmed||current.stale||!content.trim()} onClick={()=>void save()}>Save reviewed version</Button><Button variant="outline" disabled={busy||current.stale||current.status!=='ready'||current.reviewed_revision!==current.revision||content!==current.content} onClick={()=>void download()}>Download DOCX</Button></div>
   {!!current.data?.facts?.length&&<details className="text-xs"><summary>Reviewed source facts used for prioritization</summary><ul className="mt-2 space-y-1">{current.data.facts.map(fact=><li key={fact.id}>{fact.field.replaceAll('_',' ')}: {fact.text}</li>)}</ul></details>}
  </div>}
  {!!records.length&&<details className="text-sm"><summary>Saved versions for this candidate and job ({records.length})</summary><ul className="mt-2 space-y-2">{records.map(row=><li key={row.id}><button className="text-primary underline" onClick={()=>void loadResume(row.id).catch(e=>setError(e.message))}>Version {row.revision} · {row.status}{row.created_at?' · '+new Date(row.created_at).toLocaleDateString():''}{row.stale?' · outdated candidate profile':''}</button></li>)}</ul></details>}
 </section>;
}
