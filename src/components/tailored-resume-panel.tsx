"use client";
import {useCallback,useEffect,useState} from 'react';
import {api} from '@/lib/api-client';
import {getCandidates} from '@/lib/candidates';
import {Button} from '@/components/ui/button';
import {WorkflowTaskStatus} from '@/components/workflow-task-status';
import {ResumePreview} from '@/components/resume-preview';
import type {AtsReport} from '../../browser-extension/resume-engine.js';
type CandidateOption={id:string;full_name:string;provenance_status?:string};
type Resume={id:string;candidate_id:string;job_id:string|null;brief_id:string|null;status:string;task_id:string;content:string;revision:number;reviewed_revision:number|null;stale:boolean;atsStale?:boolean;model:string|null;created_at?:string;data?:{sourceTitle?:string;ats?:AtsReport;facts?:{id:string;text:string;field:string}[];selectedFactIds?:string[]}};
export function TailoredResumePanel({jobId,briefId,candidateId,candidateName,candidates}:{jobId?:string;briefId?:string;candidateId?:string;candidateName?:string;candidates?:CandidateOption[]}){
 const [options,setOptions]=useState<CandidateOption[]>([]),[selected,setSelected]=useState(''),[records,setRecords]=useState<Resume[]>([]),[resume,setResume]=useState<Resume|null>(null),[content,setContent]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[consent,setConsent]=useState(false),[confirmed,setConfirmed]=useState(false);
 const [viewMode,setViewMode]=useState<'preview'|'edit'>('edit');
 const available=candidates||options;
 const activeCandidate=candidateId||selected||(available.length===1?available[0].id:'');
 const sourceQuery=jobId?'jobId='+encodeURIComponent(jobId):'briefId='+encodeURIComponent(briefId||'');
 useEffect(()=>{if(candidates||candidateId)return;let active=true;getCandidates().then(rows=>{if(active)setOptions(rows.filter(row=>row.provenance_status==='confirmed'));}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[candidates,candidateId]);
 useEffect(()=>{let active=true;if(activeCandidate)void api<{resumes:Resume[]}>(`/api/tailored-resumes?candidateId=${encodeURIComponent(activeCandidate)}&${sourceQuery}`).then(result=>{if(active)setRecords(result.resumes);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[activeCandidate,sourceQuery]);
 const current=resume?.candidate_id===activeCandidate&&(jobId?resume.job_id===jobId:resume.brief_id===briefId)?resume:null;
 const history=records.filter(row=>row.candidate_id===activeCandidate&&(jobId?row.job_id===jobId:row.brief_id===briefId));
 const loadResume=useCallback(async(id:string)=>{const result=await api<{resume:Resume}>(`/api/tailored-resumes/${id}`);setResume(result.resume);setContent(result.resume.content||'');setConfirmed(false);setError('');setViewMode('edit');},[]);
 const refreshCurrent=useCallback(async()=>{if(current)await loadResume(current.id);},[current,loadResume]);
 async function generate(){setBusy(true);setError('');try{const result=await api<{resumeId:string;taskId:string}>('/api/tailored-resumes',{method:'POST',body:JSON.stringify({candidateId:activeCandidate,...(jobId?{jobId}:{briefId}),consent})});await loadResume(result.resumeId);const history=await api<{resumes:Resume[]}>(`/api/tailored-resumes?candidateId=${encodeURIComponent(activeCandidate)}&${sourceQuery}`);setRecords(history.resumes);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function save(){if(!current)return;setBusy(true);try{const result=await api<{resume:Resume}>(`/api/tailored-resumes/${current.id}`,{method:'PATCH',body:JSON.stringify({revision:current.revision,content,confirmFacts:confirmed})});setResume(result.resume);setContent(result.resume.content);setConfirmed(false);setError('');setViewMode('preview');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
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
   <section aria-label="ATS assessment" className="space-y-3 rounded-lg border p-4 text-sm">
    <h3 className="font-semibold">ATS assessment</h3>
    {current.stale||current.atsStale||content!==current.content||!current.data?.ats?
     <p role="status" className="text-amber-700">{current.data?.ats?'This assessment applies to the original generated resume. The current content, candidate or JD changed; its ATS score is unavailable.':'No ATS assessment is available for this saved version.'}</p>:
     <>
      <p className="font-medium">Estimated JD coverage: {current.data.ats.score===null?'Unavailable':`${current.data.ats.score}%`}</p>
      <p className="text-muted-foreground">{current.data.ats.method}</p>
      <div className="grid gap-3 sm:grid-cols-2">
       <div><h4 className="font-medium">Supported requirements</h4><p>{current.data.ats.matched.join(', ')||'No supported requirements identified.'}</p></div>
       <div><h4 className="font-medium">Missing evidence</h4><p>{current.data.ats.missing.join(', ')||'No gaps identified in the extracted requirements.'}</p></div>
      </div>
      <details><summary>Requirement evidence ({current.data.ats.requirements.length})</summary><ul className="mt-2 space-y-2">{current.data.ats.requirements.map(requirement=><li key={requirement.label}><strong>{requirement.label}</strong> — {requirement.matched?'Supported':'Evidence needed'}<p className="text-muted-foreground">JD: {requirement.source}</p>{requirement.evidence&&<p>Candidate evidence: {requirement.evidence}</p>}</li>)}</ul></details>
      <div><h4 className="font-medium">Resume checks</h4><ul>{current.data.ats.checks.map(check=><li key={check.label}>{check.passed?'Pass':'Review'}: {check.label}</li>)}</ul></div>
      <ul className="space-y-1 text-muted-foreground">{current.data.ats.warnings.map(warning=><li key={warning}>{warning}</li>)}</ul>
     </>}
   </section>
   <div className="flex items-center justify-between gap-3 flex-wrap">
    <p className="text-xs text-muted-foreground">Version {current.revision} · {current.status==='ready'?'Reviewed':'Review required'} · {current.model||'Configured AI provider'}</p>
    <div className="resume-view-toggle">
     <button type="button" data-active={viewMode==='preview'} onClick={()=>setViewMode('preview')}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
      Preview
     </button>
     <button type="button" data-active={viewMode==='edit'} onClick={()=>setViewMode('edit')}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      Edit
     </button>
    </div>
   </div>
   {viewMode==='preview'?(
    <ResumePreview content={content}/>
   ):(
    <label className="grid gap-2 text-sm font-medium">Tailored resume content<textarea aria-label="Tailored resume content" className="ops-input min-h-80 font-mono text-sm" value={content} readOnly={current.stale} onChange={e=>{setContent(e.target.value);setConfirmed(false);}}/></label>
   )}
   <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} disabled={current.stale} onChange={e=>setConfirmed(e.target.checked)}/>I reviewed this version and confirm its facts are accurate.</label>
   <div className="flex flex-wrap items-center gap-3">
    <Button disabled={busy||!confirmed||current.stale||!content.trim()} onClick={()=>void save()}>{busy?'Saving…':'Save reviewed version'}</Button>
    <Button variant="outline" title={current.stale?'Source changed. Generate a new version.':current.status!=='ready'?'Check review confirmation and click Save reviewed version to enable download':content!==current.content?'Save reviewed version before downloading':undefined} disabled={busy||current.stale||current.status!=='ready'||current.reviewed_revision!==current.revision||content!==current.content} onClick={()=>void download()}>Download DOCX</Button>
    {current.status!=='ready'&&<span className="text-xs text-muted-foreground">Check the confirmation box and click &ldquo;Save reviewed version&rdquo; to unlock DOCX download.</span>}
    {current.status==='ready'&&content!==current.content&&<span className="text-xs text-amber-600">Unsaved edits. Click &ldquo;Save reviewed version&rdquo; before downloading.</span>}
   </div>
   {!!current.data?.facts?.length&&<details className="text-xs"><summary>Reviewed source facts used for prioritization</summary><ul className="mt-2 space-y-1">{current.data.facts.map(fact=><li key={fact.id}>{fact.field.replaceAll('_',' ')}: {fact.text}</li>)}</ul></details>}
  </div>}
  {!!history.length&&<details className="text-sm"><summary>Recent saved versions for this candidate and job ({history.length})</summary><ul className="mt-2 space-y-2">{history.map(row=><li key={row.id}><button className="text-primary underline" onClick={()=>void loadResume(row.id).catch(e=>setError(e.message))}>Version {row.revision} · {row.status}{row.created_at?' · '+new Date(row.created_at).toLocaleDateString():''}{row.stale?' · outdated candidate profile':''}</button></li>)}</ul></details>}
 </section>;
}
