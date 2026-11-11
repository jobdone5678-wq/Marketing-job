"use client";
import {useEffect,useState} from 'react';
import {api} from '@/lib/api-client';
import {RecordSheet,StatusLabel,formatMoney} from '@/components/operations-ui';
type Receipt={id:string;amount:number;currency:string;received_on:string;method:string;external_reference:string|null;correction_of:string|null;reason:string|null};
type Bill={id:string;start_date:string;end_date_exclusive:string;due_date:string;amount:number;currency:string;received_amount:number;balance:number;status:string;receipts:Receipt[]};
type Enrollment={id:string;candidate:{id:string;full_name:string};joining_date:string;end_date:string|null;monthly_fee:number;currency:string;bills:Bill[]};
const today=()=>new Date().toISOString().slice(0,10);
const lastDay=(s:string)=>new Date(Date.parse(s+'T00:00:00Z')-86400000).toISOString().slice(0,10);
export function ServiceCollectionsWorkspace(){
  const [rows,setRows]=useState<Enrollment[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(true),[selected,setSelected]=useState<string|null>(null),[search,setSearch]=useState(''),[limited,setLimited]=useState(false);
  async function refresh(){const result=await api<{enrollments:Enrollment[];limited:boolean}>('/api/service-collections');setRows(result.enrollments);setLimited(result.limited);}
  useEffect(()=>{let active=true;api<{enrollments:Enrollment[];limited:boolean}>('/api/service-collections').then(result=>{if(active){setRows(result.enrollments);setLimited(result.limited);}}).catch(e=>{if(active)setError((e as Error).message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[]);
  const bills=rows.flatMap(e=>e.bills.map(b=>({...b,enrollment:e}))).filter(b=>`${b.enrollment.candidate.full_name} ${b.start_date} ${b.currency} ${b.status}`.toLowerCase().includes(search.toLowerCase()));
  const chosen=bills.find(b=>b.id===selected);
  return <section className="space-y-4" aria-label="Service collections"><div><h2 className="text-lg font-semibold">My service fees</h2><p className="text-sm text-muted-foreground">Candidates pay NextKinHR for job application services. Track the service joining date, monthly fee, next payment due date and received / outstanding amounts here.</p></div>
  {error&&<p role="alert" className="text-destructive">{error}</p>}{loading&&<p>Loading collections…</p>}
  <label className="grid max-w-md gap-1 text-sm">Search collections<input className="ops-input" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name, date, currency or status"/></label>
  {limited&&<p className="text-sm text-muted-foreground">Showing the latest 500 service agreements. Dashboard totals cover all agreements.</p>}
  <div className="overflow-x-auto rounded-xl border"><table className="ops-table"><thead><tr><th>Candidate / service joining</th><th>Service period</th><th>Due</th><th>Fee</th><th>Received / outstanding</th><th>Status</th><th>Details</th></tr></thead><tbody>{bills.map(b=><tr key={b.id}><td>{b.enrollment.candidate.full_name}<span className="block text-xs text-muted-foreground">Service joined {b.enrollment.joining_date}</span></td><td>{b.start_date} – {lastDay(b.end_date_exclusive)}</td><td>{b.due_date}</td><td>{formatMoney(b.amount,b.currency)}</td><td><p>Received {formatMoney(b.received_amount,b.currency)}</p><p className="text-muted-foreground">Outstanding {formatMoney(b.balance,b.currency)}</p></td><td><StatusLabel value={b.status}/></td><td><button className="text-primary" onClick={()=>setSelected(b.id)}>View bill</button></td></tr>)}</tbody></table>{!bills.length&&!loading&&<p className="p-4 text-sm text-muted-foreground">No service bills match. Future service agreements start billing on their joining date.</p>}</div>
  <details><summary className="cursor-pointer text-sm">Service agreements ({rows.length})</summary>{rows.map(e=><article className="mt-3 rounded border p-3" key={e.id}><p className="text-sm">{e.candidate.full_name} · service joined {e.joining_date} · ends {e.end_date||'ongoing'} · {formatMoney(e.monthly_fee,e.currency)}/month</p></article>)}</details>
  <RecordSheet title="Service bill and received payments" open={!!chosen} onOpenChange={open=>{if(!open)setSelected(null);}}>{chosen&&<><p>{chosen.enrollment.candidate.full_name} · {chosen.start_date} – {lastDay(chosen.end_date_exclusive)} · due {chosen.due_date}</p><p>Received {formatMoney(chosen.received_amount,chosen.currency)} · outstanding {formatMoney(chosen.balance,chosen.currency)}</p>{error&&<p role="alert" className="text-destructive">{error}</p>}
  <h3 className="text-sm font-semibold">Receipt and correction history</h3>{chosen.receipts.map(r=><article key={r.id} className="space-y-2 rounded border p-3"><p className="text-sm">{formatMoney(r.amount,r.currency)} · {r.received_on} · {r.method} · {r.external_reference||'No reference'}{r.correction_of?' · reversal':''}{r.reason?' · '+r.reason:''}</p></article>)}</>}</RecordSheet>
  </section>;
}
