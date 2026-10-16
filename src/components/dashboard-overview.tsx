"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {api} from '@/lib/api-client';
import {Button} from '@/components/ui/button';
import {ChartAreaInteractive} from './chart-area-interactive';
import {AdminOperationsDashboard} from './admin-operations-dashboard';
type Metrics={candidates:number;submissions:number;confirmed:number;contractJobs:number;vendors:number|null;activity:{date:string;submissions:number}[]};
export function DashboardOverview({initialRole=''}:{initialRole?:string}){
 const [metrics,setMetrics]=useState<Metrics|null>(null),[role,setRole]=useState(initialRole),[error,setError]=useState('');
 const [loading,setLoading]=useState(true),[updated,setUpdated]=useState<Date|null>(null);
 const generation=useRef(0);
 const load=useCallback(async()=>{
  const current=++generation.current;setLoading(true);
  try{
   const response=await api<{metrics:Metrics|null;role:string}>('/api/dashboard');
   if(current!==generation.current)return;
   if(response.role!=='super_admin'&&!response.metrics)throw new Error('Dashboard totals are unavailable. Please retry.');
   setMetrics(response.metrics);setRole(response.role);setUpdated(new Date());setError('');
  }catch(e){if(current===generation.current)setError((e as Error).message);}
  finally{if(current===generation.current)setLoading(false);}
 },[]);
 useEffect(()=>{
  if(initialRole==='super_admin')return;
  let active=true;
  queueMicrotask(()=>{if(active)void load();});
  return ()=>{active=false;generation.current+=1;};
 },[initialRole,load]);
 const candidate=role==='client';
 const title=candidate?'Candidate workspace':role==='technical_recruiter'?'Technical recruiter workspace':role==='recruiter'?'Recruiter workspace':'Workspace';
 const cards=metrics?[
  {key:'candidates',label:candidate?'My candidate profiles':'Candidate profiles',value:metrics.candidates,url:'/dashboard/candidates'},
  {key:'submissions',label:candidate?'My application records':'Submission records',value:metrics.submissions,url:'/dashboard/submissions'},
  {key:'confirmed',label:'Email confirmed applications',value:metrics.confirmed,url:'/dashboard/email-confirmations'},
  ...(metrics.vendors!==null?[{key:'vendors',label:'Saved vendors',value:metrics.vendors,url:'/dashboard/vendors'}]:[]),
 ]:[];
 return <main className="mx-auto w-full max-w-[1600px] space-y-6 p-4 sm:p-6 lg:p-7">{role==='super_admin'?<AdminOperationsDashboard/>:<>
  <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold tracking-tight">{title}</h1><p className="mt-1 text-sm text-muted-foreground">{candidate?'Your saved profile, application records and email confirmations.':role==='technical_recruiter'?'Candidate referrals you can access, their applications and placement commissions.':'Candidate profiles you can access and their saved application activity.'}</p></div><Button variant="outline" disabled={loading} onClick={()=>void load()}>Refresh</Button></div>
  {error&&<div role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive"><p>{error}</p>{metrics&&<p>Showing previously loaded data. Refresh to get the latest totals.</p>}<Button variant="outline" disabled={loading} onClick={()=>void load()}>Try again</Button></div>}
  {loading&&!metrics&&!error&&<p role="status" className="text-sm text-muted-foreground">Loading saved workspace data…</p>}
  {metrics&&<>
   <p role="status" className="text-xs text-muted-foreground">Saved records you can access · {updated?`Updated ${updated.toLocaleTimeString()}`:'Previously loaded data'}. Application records include drafts; email confirmations track submission receipts.</p>
   <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(item=><Link key={item.key} className="rounded-xl border border-border bg-card p-4 hover:border-primary/40" href={item.url}><p className="text-xs text-muted-foreground">{item.label}</p><p className="mt-2 text-3xl font-semibold tabular-nums">{item.value}</p></Link>)}</div>
   <ChartAreaInteractive data={metrics.activity}/>
   {metrics.candidates===0&&<p className="text-sm text-muted-foreground">No candidate profiles yet. <Link className="text-primary underline" href="/dashboard/candidates/new">Upload a resume and review details</Link>.</p>}
   <section className="rounded-xl border border-border bg-card p-4"><h2 className="font-semibold">Continue in your workspace</h2><div className="mt-3 flex flex-wrap gap-4 text-sm"><Link className="text-primary underline" href="/dashboard/jobs">Public Jobs</Link><Link className="text-primary underline" href="/dashboard/placements">{candidate?'My service fees & placement':role==='technical_recruiter'?'Placements & referral commissions':'Placements & recruiter payroll'}</Link><Link className="text-primary underline" href="/dashboard/email-confirmations">Connect Gmail & review receipts</Link></div><p className="mt-3 text-xs text-muted-foreground">Public Jobs uses your reviewed resume to find relevant roles. Fees, salary and commissions show saved records in their respective sections.</p></section>
  </>}
 </>}</main>;
}
