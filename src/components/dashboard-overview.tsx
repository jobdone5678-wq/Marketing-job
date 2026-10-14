"use client";
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {api} from '@/lib/api-client';
import {ChartAreaInteractive} from './chart-area-interactive';
import {AdminOperationsDashboard} from './admin-operations-dashboard';
type Metrics={candidates:number;submissions:number;confirmed:number;contractJobs:number;vendors:number|null;activity:{date:string;submissions:number}[]};
export function DashboardOverview({initialRole=''}:{initialRole?:string}){
 const [metrics,setMetrics]=useState<Metrics|null>(null),[role,setRole]=useState(initialRole),[error,setError]=useState('');
 useEffect(()=>{
  if(initialRole==='super_admin')return;
  void api<{metrics:Metrics|null;role:string}>('/api/dashboard').then(r=>{setMetrics(r.metrics);setRole(r.role);}).catch(e=>setError(e.message));
 },[initialRole]);
 return <main className="mx-auto w-full max-w-[1600px] space-y-6 p-4 sm:p-6 lg:p-7">{error?<p role="alert" className="text-destructive">{error}</p>:role==='super_admin'?<AdminOperationsDashboard/>:!metrics?<p className="text-sm text-muted-foreground">Loading workspace…</p>:<><div><h1 className="text-2xl font-semibold tracking-tight">{role==='client'?'Candidate workspace':role==='technical_recruiter'?'Technical recruiter workspace':'Recruiter workspace'}</h1><p className="mt-1 text-sm text-muted-foreground">Candidate profiles, relevant roles and application activity.</p></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[{key:'candidates',name:'Candidate profiles',url:'/dashboard/candidates'},{key:'contractJobs',name:'Public contract jobs',url:'/dashboard/jobs'},{key:'submissions',name:'Submission records',url:'/dashboard/submissions'},{key:'confirmed',name:'Email confirmed applications',url:'/dashboard/email-confirmations'},...(metrics.vendors!==null?[{key:'vendors',name:'Vendors',url:'/dashboard/vendors'}]:[])].map(item=><Link key={item.key} className="rounded-xl border border-border bg-card p-4 hover:border-primary/40" href={item.url}><p className="text-xs text-muted-foreground">{item.name}</p><p className="mt-2 text-3xl font-semibold tabular-nums">{metrics[item.key as keyof Omit<Metrics,'activity'>]}</p></Link>)}</div><ChartAreaInteractive data={metrics.activity}/>{metrics.candidates===0&&<p className="text-sm text-muted-foreground">No candidate profiles yet. <Link className="text-primary underline" href="/dashboard/candidates/new">Upload a resume and review details</Link>.</p>}</>}</main>;
}
