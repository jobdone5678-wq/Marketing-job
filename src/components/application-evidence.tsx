"use client";
import {useState} from 'react';
import Link from 'next/link';
import {api} from '@/lib/api-client';
import {WorkspaceError,WorkspaceSkeleton} from '@/components/workspace-ui';

const states:Record<string,{label:string;description:string}>={
 started:{label:'Started',description:'A recruiter began this application.'},
 in_progress:{label:'In progress',description:'An external application form was detected.'},
 submit_attempted:{label:'Submission attempted',description:'Final interaction detected; success has not been verified.'},
 submitted:{label:'Submitted — awaiting confirmation',description:'A submission-specific success signal was observed. A receipt has not yet confirmed it.'},
 confirmed:{label:'Confirmed',description:'A matching receipt or authorized confirmation was recorded.'},
 failed:{label:'Failed',description:'An explicit failure was recorded. Review the evidence before retrying.'},
};
export function CaptureState({state,confirmedAt}:{state?:string|null;confirmedAt?:string|null}) {
 const key=state||'';const entry=states[key];
 return <div className="space-y-1.5"><span className={`status-chip ${entry?`status-${key}`:'status-neutral'}`}>{entry?.label||'Capture not recorded'}</span><p className="max-w-sm text-xs leading-relaxed text-muted-foreground">{entry?.description||'No external form or submission observation is available.'}</p>{key==='confirmed'&&confirmedAt&&<p className="text-xs text-muted-foreground">Receipt recorded {new Date(confirmedAt).toLocaleString()}</p>}</div>;
}
type Event={id:string;status:string;source?:string;evidence?:string;attempt?:number;observed_at?:string;created_at?:string};
export function ApplicationEvidence({intentId,state,confirmedAt}:{intentId?:string;state?:string|null;confirmedAt?:string|null}) {
 const [events,setEvents]=useState<Event[]|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 async function load(){if(!intentId||loading)return;setLoading(true);setError('');try{setEvents((await api<{events:Event[]}>(`/api/application-intents/${intentId}/events`)).events);}catch(e){setError((e as Error).message);}finally{setLoading(false);}}
 return <section aria-label="Application capture evidence" className="space-y-3"><CaptureState state={state} confirmedAt={confirmedAt}/>{intentId&&<details className="text-xs" onToggle={event=>{if(event.currentTarget.open&&events===null&&!loading)void load();}}><summary className="py-2 font-medium text-primary">View application evidence</summary>{loading&&<WorkspaceSkeleton rows={2}/>} {error&&<WorkspaceError message={error}><button type="button" className="mt-2 underline" onClick={()=>void load()}>Retry evidence lookup</button></WorkspaceError>}{events?.length===0&&<p className="py-3 text-muted-foreground">No browser events are available for this application. A start record does not prove submission.</p>}{!!events?.length&&<ol className="mt-3 divide-y border-y border-border/60">{events.map(event=><li key={event.id} className="space-y-2 py-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{states[event.status]?.label||event.status.replaceAll('_',' ')}</span><span className="font-mono text-[11px] text-muted-foreground">Attempt {event.attempt??'unknown'}</span></div><p className="text-muted-foreground">{event.source==='recruiter_attestation'?'Recruiter attestation':event.source==='extension_observation'?'Extension observation':event.source||'Recorded observation'} · {event.observed_at||event.created_at?new Date(event.observed_at||event.created_at!).toLocaleString():'Time not recorded'}</p><p className="whitespace-pre-wrap break-words leading-relaxed">{event.evidence||'Evidence detail not recorded.'}</p></li>)}</ol>}</details>}{state==='confirmed'&&<Link href="/dashboard/email-confirmations" className="inline-block text-xs text-primary underline underline-offset-4">Review confirmation receipts</Link>}</section>;
}
