"use client";
import { useState } from 'react';
import { api } from '@/lib/api-client';

type Snapshot = { id:string; attempt:number; revision:number; portal:string; portal_url:string; answers:{key:string;label:string;value:string}[]; observed_at:string; created_at:string };
export function ApplicationAnswerSnapshot({submissionId}:{submissionId:string}) {
  const [snapshots,setSnapshots]=useState<Snapshot[]|null>(null),[error,setError]=useState('');
  async function load(){if(snapshots)return;try{setSnapshots((await api<{snapshots:Snapshot[]}>(`/api/submissions/${submissionId}/answers`)).snapshots);}catch(e){setError((e as Error).message);}}
  return <details className="mt-2 text-xs" onToggle={e=>{if(e.currentTarget.open)void load();}}><summary className="cursor-pointer text-primary">View captured application answers</summary>
    <p className="mt-2 text-muted-foreground">Captured fields show the answers observed by the extension. Submission observation and email confirmation are tracked separately.</p>
    {error&&<p role="alert" className="text-destructive">{error}</p>}
    {snapshots&&snapshots.length===0&&<p className="mt-2 text-muted-foreground">No answer snapshot was available. Review this application manually.</p>}
    {snapshots?.map(snapshot=><section key={snapshot.id} className="mt-2 rounded border p-2"><p className="font-medium">{snapshot.portal} · Attempt {snapshot.attempt} · Revision {snapshot.revision}</p><p className="text-muted-foreground">Observed {new Date(snapshot.observed_at).toLocaleString()}</p><dl className="mt-2 space-y-1">{snapshot.answers.map(answer=><div key={answer.key}><dt className="font-medium">{answer.label}</dt><dd className="break-words text-muted-foreground">{answer.value}</dd></div>)}</dl></section>)}
  </details>;
}
