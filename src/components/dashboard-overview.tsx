"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {api} from '@/lib/api-client';
import {WorkspaceSkeleton} from '@/components/workspace-ui';
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
 return <main className="portal-page space-y-6">{role==='super_admin'?<AdminOperationsDashboard/>:<>
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div>
    <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{candidate?'Your saved profile, application records and email confirmations.':role==='technical_recruiter'?'Candidate referrals you can access, their applications and placement commissions.':'Candidate profiles you can access and their saved application activity.'}</p>
   </div>
   <Button variant="outline" size="sm" disabled={loading} onClick={()=>void load()} className="text-xs">Refresh</Button>
  </div>
  {error&&<div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3.5 text-xs text-destructive space-y-2"><p className="font-medium">{error}</p>{metrics&&<p className="text-muted-foreground">Showing previously loaded data. Refresh to get the latest totals.</p>}<Button variant="outline" size="sm" disabled={loading} onClick={()=>void load()} className="text-xs">Try again</Button></div>}
  {loading&&!metrics&&!error&&<WorkspaceSkeleton rows={5}/>}
  {metrics&&<>
   <p role="status" className="text-[11px] text-muted-foreground">Saved records you can access · {updated?`Updated ${updated.toLocaleTimeString()}`:'Previously loaded data'}. Application records include drafts; email confirmations track submission receipts.</p>
   <section aria-label="Key metrics" className="grid grid-cols-2 divide-x divide-y md:divide-y-0 rounded-xl border border-border bg-card overflow-hidden md:grid-cols-4">
    {cards.map(item=>(
     <Link key={item.key} href={item.url} className="group p-4 hover:bg-muted/20 transition-colors">
      <p className="text-[11px] font-medium text-muted-foreground group-hover:text-foreground transition-colors">{item.label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-foreground">{item.value}</p>
     </Link>
    ))}
   </section>
   <ChartAreaInteractive data={metrics.activity}/>
   {metrics.candidates===0&&<div className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-xs text-muted-foreground">No candidate profiles yet. <Link className="font-medium text-primary underline" href="/dashboard/candidates/new">Upload a resume and review details</Link>.</div>}
   <section className="border-y border-border/60 py-5">
    <h2 className="text-sm font-semibold text-foreground">Continue in your workspace</h2>
    <div className="mt-3 flex flex-wrap gap-4 text-xs">
     <Link className="font-medium text-primary hover:underline" href="/dashboard/jobs">Public Jobs</Link>
     <Link className="font-medium text-primary hover:underline" href="/dashboard/placements">{candidate?'My service fees & placement':role==='technical_recruiter'?'Placements & referral commissions':'Placements & recruiter payroll'}</Link>
     <Link className="font-medium text-primary hover:underline" href="/dashboard/email-confirmations">Connect Gmail & review receipts</Link>
    </div>
    <p className="mt-2.5 text-[11px] text-muted-foreground">Public Jobs uses your reviewed resume to find relevant roles. Fees, salary and commissions show saved records in their respective sections.</p>
   </section>
  </>}
 </>}</main>;
}
