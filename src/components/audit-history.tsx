"use client";
import {useState} from 'react';
import {api} from '@/lib/api-client';
type Audit={id:string;action:string;created_at:string;actor:{full_name:string|null;email:string}|null;metadata:Record<string,unknown>};
function AuditValue({value,depth=0}:{value:unknown;depth?:number}){
 if(value===null||value===undefined)return <>—</>;
 if(Array.isArray(value))return <>{value.map((item,index)=><div key={index}><AuditValue value={item} depth={depth+1}/></div>)}</>;
 if(typeof value==='object'&&depth<4)return <dl className="space-y-1 border-l border-border pl-3">{Object.entries(value).map(([key,item])=><div key={key}><dt className="text-xs capitalize">{key.replaceAll('_',' ')}</dt><dd><AuditValue value={item} depth={depth+1}/></dd></div>)}</dl>;
 return <>{String(value)}</>;
}
export function AuditHistory({subjectId}:{subjectId:string}){
 const [events,setEvents]=useState<Audit[]|null>(null),[error,setError]=useState('');
 async function load(){if(events)return;setError('');try{setEvents((await api<{events:Audit[]}>('/api/admin/audit?subjectId='+encodeURIComponent(subjectId))).events);}catch(e){setError((e as Error).message);}}
 return <details onToggle={e=>{if(e.currentTarget.open)void load();}}><summary className="cursor-pointer text-sm">Audit history</summary>{error&&<p role="alert">{error}</p>}{events?.length===0&&<p className="text-sm text-muted-foreground">No audit events recorded.</p>}{events?.map(event=><article key={event.id} className="mt-2 rounded border p-3 text-sm"><strong>{event.action.replaceAll('_',' ')}</strong><p>{event.actor?.full_name||event.actor?.email||'Administrator'} · {new Date(event.created_at).toLocaleString()}</p><dl className="mt-2 space-y-1">{Object.entries(event.metadata).map(([key,value])=><div key={key}><dt className="font-medium">{key.replaceAll('_',' ')}</dt><dd className="break-words text-muted-foreground"><AuditValue value={value}/></dd></div>)}</dl></article>)}</details>;
}
