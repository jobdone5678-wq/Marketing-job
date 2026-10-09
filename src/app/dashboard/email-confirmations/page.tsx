"use client";

import * as React from 'react';
import Link from 'next/link';
import {MailIcon,RefreshCwIcon,UploadIcon,CheckCircle2Icon,AlertCircleIcon,ExternalLinkIcon} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {toast} from 'sonner';
import type {ApplicationIdentity,CandidateIdentity,EmailConnectionSummary,EmailReceiptRecord} from '@/lib/email-confirmations/types';

async function api<T>(url:string,options?:RequestInit):Promise<T> {
  const response=await fetch(url,{...options,cache:'no-store'});
  const result=await response.json();
  if(!response.ok) throw new Error(result.error || 'Request failed.');
  return result as T;
}

export default function EmailConfirmationsPage() {
  const [receipts,setReceipts]=React.useState<EmailReceiptRecord[]>([]);
  const [connections,setConnections]=React.useState<EmailConnectionSummary[]>([]);
  const [candidates,setCandidates]=React.useState<CandidateIdentity[]>([]);
  const [applications,setApplications]=React.useState<ApplicationIdentity[]>([]);
  const [configured,setConfigured]=React.useState(false);
  const [loading,setLoading]=React.useState(true);
  const [error,setError]=React.useState('');
  const [busy,setBusy]=React.useState<string|null>(null);
  const [selected,setSelected]=React.useState<EmailReceiptRecord|null>(null);
  const [candidateId,setCandidateId]=React.useState('');
  const [company,setCompany]=React.useState('');
  const [jobTitle,setJobTitle]=React.useState('');
  const [submissionId,setSubmissionId]=React.useState('');
  const [filter,setFilter]=React.useState('needs_review');
  const [page,setPage]=React.useState(0);
  const [total,setTotal]=React.useState(0);
  const [hasMore,setHasMore]=React.useState(false);
  const uploadRef=React.useRef<HTMLInputElement>(null);
  const loadGeneration=React.useRef(0);
  const load=React.useCallback(async()=>{
    const generation=++loadGeneration.current;
    setLoading(true);setError('');
    try {
      const [data,mail]=await Promise.all([
        api<{receipts:EmailReceiptRecord[];candidates:CandidateIdentity[];applications:ApplicationIdentity[];total:number;hasMore:boolean}>(`/api/email-confirmations?disposition=${filter}&page=${page}`),
        api<{connections:EmailConnectionSummary[];gmailConfigured:boolean}>('/api/email-connections'),
      ]);
      if(generation!==loadGeneration.current) return;
      setReceipts(data.receipts);setCandidates(data.candidates);setApplications(data.applications);
      setTotal(data.total);setHasMore(data.hasMore);
      setConnections(mail.connections);setConfigured(mail.gmailConfigured);
    } catch(reason) {if(generation===loadGeneration.current)setError(reason instanceof Error?reason.message:'Could not load confirmations.');}
    finally {if(generation===loadGeneration.current)setLoading(false);}
  },[filter,page]);
  React.useEffect(()=>{void Promise.resolve().then(load);
    const status=new URLSearchParams(window.location.search).get('mail');
    if(status==='connected') toast.success('Mailbox connected. Sync now to import recent receipts.');
    if(status==='connection_failed') toast.error('Mailbox was not connected. Check configuration and consent, then retry.');
    if(status) window.history.replaceState(null,'',window.location.pathname);
    return ()=>{loadGeneration.current++;};
  },[load]);

  async function run(key:string,work:()=>Promise<void>) {
    setBusy(key);try {await work();} catch(reason) {toast.error(reason instanceof Error?reason.message:'Operation failed.');}finally{setBusy(null);}
  }
  function openReview(receipt:EmailReceiptRecord) {
    setSelected(receipt);setCandidateId(receipt.candidate_id||'');setCompany(receipt.extracted_company||'');
    setJobTitle(receipt.extracted_job_title||'');setSubmissionId(receipt.submission_id||'');
  }
  const related=applications.filter(application=>application.candidate_id===candidateId);
  const visible=receipts.filter(receipt=>filter==='all'||receipt.disposition===filter);

  return <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6 max-w-6xl w-full mx-auto">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div><h1 className="text-2xl font-bold flex items-center gap-2"><MailIcon className="size-6"/>Email confirmations</h1>
        <p className="text-sm text-muted-foreground mt-1">Capture application receipts and review only the details that need your attention.</p></div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={loading||!!busy} onClick={()=>void load()}><RefreshCwIcon className="size-4"/>Refresh</Button>
        <Button variant="outline" disabled={!!busy} onClick={()=>uploadRef.current?.click()}><UploadIcon className="size-4"/>Import receipt</Button>
        <Button variant="outline" render={<Link href="/dashboard/submissions"/>}>Applications<ExternalLinkIcon className="size-4"/></Button>
      </div>
      <input ref={uploadRef} type="file" accept=".eml,message/rfc822" className="hidden" aria-label="Import email receipt" onChange={event=>{
        const file=event.target.files?.[0];event.target.value='';if(!file)return;
        void run('import',async()=>{
          const form=new FormData();form.append('receipt',file);
          const result=await api<{disposition:string;duplicate:boolean}>('/api/email-confirmations/import',{method:'POST',body:form});
          toast.success(result.duplicate?'This receipt was already imported.':result.disposition==='ignored'?'This email is not an application receipt.':'Receipt imported for review.');await load();
        });
      }}/>
    </div>
    <section className="border rounded-xl bg-card p-5 space-y-4">
      <div className="flex flex-wrap justify-between gap-3"><div><h2 className="font-semibold">Connected mailboxes</h2>
        <p className="text-xs text-muted-foreground mt-1">Read-only Gmail access. No messages are sent. Scheduled capture runs when the email worker is configured.</p></div>
        <Button disabled={!configured||!!busy} onClick={()=>void run('connect',async()=>{
          const result=await api<{url:string}>('/api/email-connections/gmail/connect',{method:'POST'});window.location.assign(result.url);
        })}>Connect Gmail</Button>
      </div>
      {!configured && <p className="text-sm text-amber-700 dark:text-amber-300">Gmail is not configured yet. Your administrator must complete the email capture setup. Imported .eml receipts require review.</p>}
      {connections.length===0 && !loading && !error && <p className="text-sm text-muted-foreground">No connected mailboxes.</p>}
      {connections.map(connection=><MailboxCard key={connection.id} connection={connection} busy={!!busy} onSync={()=>void run(connection.id,async()=>{
        const result=await api<{processed:number;confirmed:number;review:number;hasMore:boolean}>(`/api/email-connections/${connection.id}/sync`,{method:'POST'});
        toast.success(`${result.confirmed} confirmed, ${result.review} for review.${result.hasMore?' More messages remain; sync again or let the worker continue.':''}`);await load();
      })} onSave={domains=>void run(connection.id,async()=>{
        await api(`/api/email-connections/${connection.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({senderDomains:domains})});
        toast.success('Approved sender domains saved. Existing receipts still require their recorded review.');await load();
      })} onDisconnect={()=>void run(connection.id,async()=>{
        const result=await api<{providerRevoked:boolean}>(`/api/email-connections/${connection.id}`,{method:'DELETE'});
        toast.success(result.providerRevoked?'Mailbox disconnected and Google access revoked.':'Mailbox disconnected locally. Also remove access in your Google account if provider revocation failed.');await load();
      })}/>)}
    </section>
    {error && <div role="alert" className="border border-destructive/40 rounded-lg p-4 text-sm text-destructive flex gap-2"><AlertCircleIcon className="size-4 shrink-0"/>{error}</div>}
    <section className="space-y-3">
      <div className="flex justify-between gap-3 items-center"><h2 className="font-semibold">Recent receipts</h2>
        <select aria-label="Filter receipt status" className="border rounded-md bg-background px-3 py-2 text-sm" value={filter} onChange={event=>{setFilter(event.target.value);setPage(0);}}>
          <option value="needs_review">Needs review</option><option value="confirmed">Confirmed</option><option value="dismissed">Dismissed</option><option value="all">All receipts</option>
        </select></div>
      <p className="text-xs text-muted-foreground">{total} receipts in this view · Page {page+1}. Automatic confirmation requires an authenticated approved sender and an unambiguous candidate and job match.</p>
      <div className="flex gap-2"><Button variant="outline" disabled={loading||!!busy||page===0} onClick={()=>setPage(value=>value-1)}>Previous page</Button>
        <Button variant="outline" disabled={loading||!!busy||!hasMore} onClick={()=>setPage(value=>value+1)}>Next page</Button></div>
      {loading?<p className="text-sm text-muted-foreground">Loading receipts…</p>:!error && visible.length===0?<div className="border rounded-xl p-8 text-center text-muted-foreground text-sm">No receipts in this view. Connect a mailbox or import an application receipt.</div>:null}
      {!loading&&!error&&visible.map(receipt=><article key={receipt.id} className="border rounded-xl bg-card p-4 flex flex-wrap justify-between gap-3">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="font-medium break-words">{receipt.subject}</h3><Badge variant="outline">{receipt.disposition.replaceAll('_',' ')}</Badge></div>
          <p className="text-xs text-muted-foreground mt-1 break-words">{receipt.sender} · {new Date(receipt.received_at).toLocaleString()}</p>
          <p className="text-sm mt-2">{receipt.extracted_job_title||'Role needs review'} · {receipt.extracted_company||'Company needs review'}</p>
          <p className="text-xs text-muted-foreground mt-1">{receipt.review_reason}</p></div>
        <Button variant="outline" onClick={()=>openReview(receipt)}>{receipt.disposition==='needs_review'?'Review receipt':'View evidence'}</Button>
      </article>)}
    </section>
    {selected&&<section className="border rounded-xl bg-card p-5 space-y-4" aria-label="Receipt review">
      <div className="flex justify-between items-center gap-2"><h2 className="font-semibold">{selected.disposition==='needs_review'?'Review application receipt':'Receipt evidence'}</h2><Button variant="ghost" onClick={()=>setSelected(null)}>Close</Button></div>
      <p className="text-sm text-muted-foreground">{selected.source==='manual_import'?'User-imported evidence: confirm its authenticity and details before recording the application.':'Mailbox receipt: check candidate and application details.'}</p>
      <pre className="text-xs whitespace-pre-wrap break-words max-h-64 overflow-y-auto bg-muted/40 rounded-lg p-4">{selected.body_text}</pre>
      {selected.disposition==='needs_review'&&<>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2"><Label htmlFor="receipt-candidate">Candidate</Label><select id="receipt-candidate" className="w-full h-9 border rounded-md bg-background px-3 text-sm" value={candidateId} onChange={event=>{setCandidateId(event.target.value);setSubmissionId('');}}>
            <option value="">Select candidate</option>{candidates.map(candidate=><option key={candidate.id} value={candidate.id}>{candidate.full_name}{candidate.email?` · ${candidate.email}`:''}</option>)}</select></div>
          <div className="space-y-2"><Label htmlFor="receipt-application">Existing application</Label><select id="receipt-application" className="w-full h-9 border rounded-md bg-background px-3 text-sm" value={submissionId} onChange={event=>{
            setSubmissionId(event.target.value);const application=applications.find(item=>item.id===event.target.value);
            if(application){setCompany(application.company_name);setJobTitle(application.job_title);}
          }}><option value="">Match automatically or create a record</option>{related.map(application=><option key={application.id} value={application.id}>{application.job_title} · {application.company_name}</option>)}</select></div>
          <div className="space-y-2"><Label htmlFor="receipt-company">Company</Label><Input id="receipt-company" maxLength={160} value={company} onChange={event=>setCompany(event.target.value)}/></div>
          <div className="space-y-2"><Label htmlFor="receipt-role">Job title</Label><Input id="receipt-role" maxLength={160} value={jobTitle} onChange={event=>setJobTitle(event.target.value)}/></div>
        </div>
        <div className="flex flex-wrap gap-2"><Button disabled={!!busy||!candidateId||!company.trim()||!jobTitle.trim()} onClick={()=>void run('review',async()=>{
          await api(`/api/email-confirmations/${selected.id}/review`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'confirm',candidateId,company,jobTitle,submissionId:submissionId||null})});
          toast.success('Application confirmation saved. Existing recruiting status is preserved.');setSelected(null);await load();
        })}><CheckCircle2Icon className="size-4"/>Confirm application</Button>
          <Button variant="outline" disabled={!!busy} onClick={()=>void run('dismiss',async()=>{
            await api(`/api/email-confirmations/${selected.id}/review`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'dismiss'})});setSelected(null);await load();
          })}>Dismiss unrelated receipt</Button></div>
      </>}
      {selected.submission_id&&<Button variant="outline" render={<Link href="/dashboard/submissions"/>}>Open application tracker</Button>}
    </section>}
  </div>;
}

function MailboxCard({connection,busy,onSync,onSave,onDisconnect}:{connection:EmailConnectionSummary;busy:boolean;onSync:()=>void;onSave:(domains:string[])=>void;onDisconnect:()=>void}) {
  const [domains,setDomains]=React.useState(connection.sender_domains.join(', '));
  return <div className="border rounded-lg p-4 space-y-3">
    <div className="flex flex-wrap justify-between gap-3"><div><p className="font-medium">{connection.mailbox_email} <Badge variant="outline">{connection.status.replaceAll('_',' ')}</Badge></p>
      <p className="text-xs text-muted-foreground mt-1">Last checked: {connection.last_synced_at?new Date(connection.last_synced_at).toLocaleString():'Not yet synchronized'}</p></div>
      <div className="flex gap-2"><Button variant="outline" disabled={busy||connection.status!=='connected'} onClick={onSync}>Sync now</Button><Button variant="ghost" disabled={busy||connection.status==='disconnected'} onClick={onDisconnect}>Disconnect</Button></div></div>
    {connection.last_error&&<p className="text-sm text-destructive">{connection.last_error}</p>}
    <div className="space-y-2"><Label htmlFor={`senders-${connection.id}`}>Approved receipt sender domains</Label>
      <div className="flex flex-wrap gap-2"><Input id={`senders-${connection.id}`} className="flex-1 min-w-48" placeholder="Enter exact domains from verified receipts" value={domains} onChange={event=>setDomains(event.target.value)}/>
        <Button variant="outline" disabled={busy} onClick={()=>onSave(domains.split(',').map(value=>value.trim()).filter(Boolean))}>Save domains</Button></div>
      <p className="text-xs text-muted-foreground">Start with review. Approve only known application receipt senders; other messages always need review.</p></div>
  </div>;
}
