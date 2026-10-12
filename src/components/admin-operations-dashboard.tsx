"use client";

import {useEffect,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {ArrowUpRight,BriefcaseBusiness,CalendarClock,CalendarCheck2,ClipboardList,RefreshCw} from 'lucide-react';
import {api} from '@/lib/api-client';
import {Button} from '@/components/ui/button';
import {Tabs,TabsList,TabsTrigger,TabsContent} from '@/components/ui/tabs';
import {PlacementsWorkspace} from '@/components/placements-workspace';
import {TeamManagement} from '@/components/team-management';
import {StatusLabel,formatMoney,OperationsCard} from '@/components/operations-ui';

type Panel='overview'|'team'|'placements'|'salary'|'commissions'|'payments';
type Money={currency:string;amount:number}[];
type Ops={
 pendingStaff:{id:string;full_name:string|null;email:string;role:string}[];
 unassignedCandidates:{id:string;full_name:string;provenance_status:string;assigned_recruiter_id?:string|null;assigned_technical_recruiter_id?:string|null}[];
 placements:{id:string;candidate:{full_name:string}|null;company:string;role_title:string;status:string;planned_start_date:string|null;actual_join_date:string|null;expected_end_date:string|null;actual_end_date:string|null;recruiter?:{full_name:string}|null;technical_recruiter?:{full_name:string}|null}[];
 salaryPeriods:{id:string;currency:string;balance:number;status:string;due_date:string;employment:{profile:{full_name:string|null;email:string}}}[];
 commissions:{id:string;currency:string;balance:number;status:string;profile:{full_name:string|null;email:string};placement:{company:string;role_title:string}}[];
 commissionApprovals?:Ops['commissions'];
 captureIssues:{id:string;company_name:string;job_title:string;capture_status:string;candidate:{full_name:string}|null}[];
 money:{salaryOutstanding:Money;salaryPaid:Money;commissionOutstanding:Money;commissionPaid:Money};
 counts:{activePlacements:number;joinsNext30Days:number;endsNext30Days:number;captureIssues:number;pendingStaff?:number;assignmentReview?:number;commissionApproval?:number};
};
const panels:[Panel,string][]=[['overview','Overview'],['team','Team'],['placements','Placements'],['salary','Payroll'],['commissions','Commissions'],['payments','Payments']];
const empty=(message:string)=><p className="py-4 text-sm text-muted-foreground">{message}</p>;
function CurrencyTotals({rows,label}:{rows:Money;label:string}){
 return <div><p className="text-xs text-muted-foreground">{label}</p>{rows.length?rows.map(row=><p key={row.currency} className="mt-1 text-lg font-semibold tabular-nums">{formatMoney(row.amount,row.currency)}</p>):<p className="mt-1 text-lg font-semibold">—</p>}</div>;
}
export function AdminOperationsDashboard(){
 const router=useRouter();
 const [viewVersion,setViewVersion]=useState(0);
 const [data,setData]=useState<Ops|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(''),[tab,setTab]=useState<Panel>('overview'),[updated,setUpdated]=useState<Date|null>(null),[refreshing,setRefreshing]=useState(false),[search,setSearch]=useState(''),[placementStatus,setPlacementStatus]=useState(''),[focusId,setFocusId]=useState<string|undefined>();
 async function refresh(){setRefreshing(true);try{setData(await api<Ops>('/api/admin/operations'));setUpdated(new Date());setError('');}catch(e){setError((e as Error).message);}finally{setRefreshing(false);}}
 useEffect(()=>{let active=true;api<Ops>('/api/admin/operations').then(response=>{if(active){setData(response);setUpdated(new Date());}}).catch(e=>{if(active)setError((e as Error).message);});return()=>{active=false;};},[]);
 function openPanel(panel:Panel,id?:string){setFocusId(id);setTab(panel);}
 async function decide(id:string,status:'active'|'rejected'){setBusy(id);try{await api('/api/admin/profiles',{method:'PATCH',body:JSON.stringify({id,status})});await refresh();}catch(e){setError((e as Error).message);}finally{setBusy('');}}
 const candidates=data?.unassignedCandidates||[];
 const commissions=data?.commissionApprovals||data?.commissions.filter(row=>row.status==='awaiting_approval')||[];
 const placements=(data?.placements||[]).filter(row=>`${row.candidate?.full_name} ${row.company} ${row.role_title} ${row.recruiter?.full_name} ${row.technical_recruiter?.full_name}`.toLowerCase().includes(search.toLowerCase())&&(!placementStatus||row.status===placementStatus));
 return <section className="space-y-5" aria-label="Super admin operations">
  <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="mb-1 text-xs font-medium uppercase tracking-wider text-primary">Super admin</p><h1 className="text-2xl font-semibold tracking-tight">Operations overview</h1><p className="mt-1 text-sm text-muted-foreground">Your team, candidate employment and external payments in one place.</p></div><div className="flex items-center gap-3"><span className="text-xs text-muted-foreground" role="status">{updated?`Updated ${updated.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`:'Loading data'}</span><Button variant="outline" size="sm" disabled={refreshing} onClick={()=>void refresh().then(()=>setViewVersion(value=>value+1))}><RefreshCw className={refreshing?'size-3.5 animate-spin':'size-3.5'}/>Refresh</Button></div></div>
  {error&&<div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error} <button className="underline" onClick={()=>void refresh()}>Try again</button></div>}
  {!data&&!error&&<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Loading operations">{[1,2,3,4].map(i=><div key={i} className="h-28 animate-pulse rounded-xl bg-muted"/>)}</div>}
  {data&&<Tabs value={tab} onValueChange={value=>{setFocusId(undefined);setTab(value as Panel);}} className="gap-5">
   <div className="overflow-x-auto border-b border-border"><TabsList variant="line" aria-label="Operations sections" className="h-11 gap-3">{panels.map(([value,label])=><TabsTrigger key={value} value={value} className="px-3 pb-3">{label}{value==='team'&&(data.counts.pendingStaff??data.pendingStaff.length)>0&&<span className="rounded-full bg-primary/10 px-1.5 text-xs text-primary">{data.counts.pendingStaff??data.pendingStaff.length}</span>}</TabsTrigger>)}</TabsList></div>
   <TabsContent value="overview" className="space-y-5">
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[
     ['Active placements',data.counts.activePlacements,BriefcaseBusiness,'placements'],['Joining in 30 days',data.counts.joinsNext30Days,CalendarCheck2,'placements'],['Ending in 30 days',data.counts.endsNext30Days,CalendarClock,'placements'],['Capture follow-up',data.counts.captureIssues,ClipboardList,'capture']
    ].map(([label,value,Icon,destination])=>{const MetricIcon=Icon as typeof BriefcaseBusiness;return <button key={String(label)} className="group rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-primary" onClick={()=>destination==='capture'?router.push('/dashboard/application-capture'):openPanel('placements')}><div className="flex items-center justify-between gap-2"><span className="text-xs font-medium text-muted-foreground">{String(label)}</span><MetricIcon className="size-4 text-primary/70"/></div><p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">{String(value)}</p><p className="mt-1 text-xs text-muted-foreground">{destination==='capture'?'Review incomplete applications':'View candidate timelines'} <ArrowUpRight className="inline size-3"/></p></button>;})}</div>
    <div className="flex items-center justify-between"><h2 className="shrink-0 text-base font-semibold">Needs attention</h2><span className="hidden text-xs text-muted-foreground sm:inline">Resolve approvals and missing information</span></div>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
     <OperationsCard title="Staff approvals" count={data.counts.pendingStaff??data.pendingStaff.length} action="Manage team" onAction={()=>openPanel('team')}>
      {data.pendingStaff.slice(0,3).map(person=><div key={person.id} className="border-t border-border py-3 first:border-0"><p className="truncate text-sm font-medium">{person.full_name||person.email}</p><p className="mt-0.5 text-xs text-muted-foreground">{person.role.replaceAll('_',' ')} · access pending</p><div className="mt-2 flex gap-2"><Button size="sm" disabled={!!busy} onClick={()=>void decide(person.id,'active')}>Approve</Button><Button size="sm" variant="outline" disabled={!!busy} onClick={()=>void decide(person.id,'rejected')}>Reject</Button></div></div>)}{!data.pendingStaff.length&&empty('No accounts waiting for approval.')}
     </OperationsCard>
     <OperationsCard title="Candidate review" count={data.counts.assignmentReview??candidates.length} action="View assignments" onAction={()=>openPanel('team')}>
      {candidates.slice(0,3).map(candidate=><button key={candidate.id} onClick={()=>openPanel('team',candidate.id)} className="block w-full border-t border-border py-3 text-left first:border-0 hover:text-primary"><p className="truncate text-sm font-medium">{candidate.full_name}</p><p className="mt-1 text-xs text-muted-foreground">{!candidate.assigned_recruiter_id&&<span className="block">Recruiter not assigned</span>}{!candidate.assigned_technical_recruiter_id&&<span className="block">Technical recruiter not assigned</span>}{candidate.provenance_status==='legacy_unconfirmed'&&<span className="block">Resume details need confirmation</span>}</p></button>)}{!candidates.length&&empty('All candidates are assigned and reviewed.')}
     </OperationsCard>
     <OperationsCard title="Commission approvals" count={data.counts.commissionApproval??commissions.length} action="Review commissions" onAction={()=>openPanel('commissions')}>
      {commissions.slice(0,3).map(row=><button key={row.id} onClick={()=>openPanel('commissions',row.id)} className="block w-full border-t border-border py-3 text-left first:border-0 hover:text-primary"><p className="truncate text-sm font-medium">{row.profile.full_name||row.profile.email}</p><p className="truncate text-xs text-muted-foreground">{row.placement.company} · {formatMoney(row.balance,row.currency)}</p><p className="mt-1 text-xs text-primary">Eligible · awaiting your approval</p></button>)}{!commissions.length&&empty('No eligible commissions awaiting approval.')}
     </OperationsCard>
     <OperationsCard title="Application follow-up" count={data.counts.captureIssues} href="/dashboard/application-capture" action="Review applications">
      {data.captureIssues.slice(0,3).map(row=><Link key={row.id} href="/dashboard/application-capture" className="block border-t border-border py-3 first:border-0 hover:text-primary"><p className="truncate text-sm font-medium">{row.candidate?.full_name||row.company_name}</p><p className="truncate text-xs text-muted-foreground">{row.company_name} · {row.job_title}</p><div className="mt-1"><StatusLabel value={row.capture_status}/></div></Link>)}{!data.captureIssues.length&&empty('No incomplete captures to follow up.')}
     </OperationsCard>
    </div>
    <div className="grid gap-4 lg:grid-cols-2">{[
     {title:'Staff payroll',paid:data.money.salaryPaid,outstanding:data.money.salaryOutstanding,panel:'salary' as Panel,rows:data.salaryPeriods,description:'Monthly periods anchored to each staff member’s actual joining date.'},
     {title:'Technical recruiter commissions',paid:data.money.commissionPaid,outstanding:data.money.commissionOutstanding,panel:'commissions' as Panel,rows:[],description:'Agreed placement commissions; payment requires eligibility and approval.'}
    ].map(card=><OperationsCard key={card.title} title={card.title} action="View details" onAction={()=>openPanel(card.panel)}><p className="mb-3 text-xs text-muted-foreground">{card.description}</p><div className="grid grid-cols-2 gap-4 rounded-lg bg-muted/50 p-3"><CurrencyTotals label="Outstanding" rows={card.outstanding}/><CurrencyTotals label="Paid externally" rows={card.paid}/></div>{!card.outstanding.length&&!card.paid.length&&<p className="mt-3 text-xs text-muted-foreground">{card.panel==='salary'?'Set staff joining dates and salary terms to generate periods.':'Add an agreed commission to a candidate placement.'}</p>}{card.rows.slice(0,3).map(row=><button key={row.id} onClick={()=>openPanel('salary',row.id)} className="flex w-full items-center justify-between gap-3 border-b border-border py-3 text-left text-xs last:border-0"><span className="truncate">{row.employment?.profile?.full_name||row.employment?.profile?.email}<span className="block text-muted-foreground">Due {row.due_date} · {row.status.replaceAll('_',' ')}</span></span><span className="shrink-0 font-medium tabular-nums">{formatMoney(row.balance,row.currency)}</span></button>)}</OperationsCard>)}</div>
    <OperationsCard title="Candidate employment timeline" action="Manage placements" onAction={()=>openPanel('placements')}>
     <div className="mb-3 flex flex-wrap gap-2"><input className="ops-input max-w-xs" aria-label="Search placement timeline" placeholder="Search candidate, company or staff" value={search} onChange={e=>setSearch(e.target.value)}/><select className="ops-input w-auto" aria-label="Filter placement timeline status" value={placementStatus} onChange={e=>setPlacementStatus(e.target.value)}><option value="">All statuses</option>{['offer_accepted','joining_scheduled','active','completed','ended_early','cancelled'].map(s=><option key={s} value={s}>{s.replaceAll('_',' ')}</option>)}</select></div>
     <div className="overflow-x-auto"><table className="ops-table"><thead><tr><th>Candidate / role</th><th>Credited staff</th><th>Joining date</th><th>End date</th><th>Status</th><th><span className="sr-only">Action</span></th></tr></thead><tbody>{placements.slice(0,8).map(row=><tr key={row.id}><td><p className="font-medium">{row.candidate?.full_name||'Candidate'}</p><p className="text-xs text-muted-foreground">{row.company} · {row.role_title}</p></td><td className="text-xs"><p>Recruiter: {row.recruiter?.full_name||'Unassigned'}</p><p className="text-muted-foreground">Technical: {row.technical_recruiter?.full_name||'Unassigned'}</p></td><td>{row.actual_join_date||row.planned_start_date||'Not set'}<span className="block text-xs text-muted-foreground">{row.actual_join_date?'Actual':'Planned'}</span></td><td>{row.actual_end_date||row.expected_end_date||'Ongoing'}<span className="block text-xs text-muted-foreground">{row.actual_end_date?'Actual':'Expected'}</span></td><td><StatusLabel value={row.status}/></td><td><Button size="sm" variant="ghost" onClick={()=>openPanel('placements',row.id)}>View<span className="sr-only"> {row.candidate?.full_name}</span></Button></td></tr>)}</tbody></table></div>{!placements.length&&empty('No placements match. Record a placement when a candidate accepts an offer.')}<p className="mt-2 text-xs text-muted-foreground">Candidate employment uses calendar months. Planned dates stay separate from actual employment dates.</p>
    </OperationsCard>
   </TabsContent>
   <TabsContent value="team">{tab==='team'&&<TeamManagement key={viewVersion} embedded focusCandidateId={focusId} onUpdated={refresh}/>}</TabsContent>
   {(['placements','salary','commissions','payments'] as const).map(panel=><TabsContent key={panel} value={panel}>{tab===panel&&<PlacementsWorkspace key={panel+viewVersion} initialPanel={panel} embedded focusRecordId={focusId} onUpdated={refresh}/>}</TabsContent>)}
  </Tabs>}
 </section>;
}
