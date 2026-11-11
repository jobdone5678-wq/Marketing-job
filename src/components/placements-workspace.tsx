"use client";
import {useEffect,useState} from 'react';
import {api} from '@/lib/api-client';
import {RecordSheet,StatusLabel,formatMoney} from '@/components/operations-ui';
import {ServiceCollectionsWorkspace} from '@/components/service-collections-workspace';
import {WorkspaceSkeleton} from '@/components/workspace-ui';

type Month={id:string;covered_start:string;covered_end:string;status:string;agreed_amount:string|null;currency:string|null;notes?:string|null};
type Placement={id:string;candidate:{full_name:string}|null;company:string;role_title:string;status:string;planned_start_date:string|null;actual_join_date:string|null;expected_end_date:string|null;actual_end_date:string|null;candidate_monthly_amount:string|null;candidate_currency:string|null;candidate_compensation_visible:boolean;months?:Month[]};

type Panel='collections'|'placements';
const inputClass='ops-input';

export function PlacementsWorkspace({initialPanel='placements'}:{initialPanel?:Panel}){
  const [selected,setSelected]=useState<string|null>(null);
  const [data,setData]=useState<Placement[]|null>(null);
  const [panel,setPanel]=useState<Panel>(initialPanel);
  const [search,setSearch]=useState('');
  const [status,setStatus]=useState('');
  const [error,setError]=useState('');

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(()=>{let active=true;setData(null);api<{placements:Placement[]}>('/api/placements').then(result=>{if(active)setData(result.placements||[]);}).catch(e=>{if(active)setError((e as Error).message);});return()=>{active=false;};},[]);

  const matches=(text:string,rowStatus:string)=>text.toLowerCase().includes(search.toLowerCase())&&(!status||rowStatus===status);
  const placements=(data||[]).filter(row=>matches([row.candidate?.full_name,row.company,row.role_title,row.status].join(' '),row.status));
  const statuses=['offer_accepted','joining_scheduled','active','completed','ended_early','cancelled'];
  return <main className="mx-auto w-full max-w-[1600px] space-y-5 p-4 sm:p-6">
  <div><h1 className="text-2xl font-bold">My service fees and placements</h1><p className="text-sm text-muted-foreground">Candidates pay NextKinHR for job application services. Track the service joining date, monthly fee and next payment due date here. Job joining dates belong to successful placements.</p></div>
  {error&&<p role="alert" className="text-destructive">{error}</p>}
  <nav aria-label="Compensation sections" className="flex flex-wrap gap-2">{(['collections','placements'] as Panel[]).map(value=><button type="button" key={value} aria-pressed={panel===value} className={inputClass+(panel===value?' bg-primary text-primary-foreground':'')} onClick={()=>{setPanel(value);setSelected(null);setStatus('');setSearch('');}}>{value==='collections'?'Collections':'Job placements'}</button>)}</nav>
  {panel==='collections'&&<ServiceCollectionsWorkspace/>}
  {panel==='placements'&&<section className="space-y-4">
  <div className="flex flex-wrap gap-3"><label className="grid gap-1 text-sm">Search placements<input aria-label="Search records" className={inputClass} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Name, company, date or currency"/></label><label className="grid gap-1 text-sm">Status<select className={inputClass} value={status} onChange={e=>setStatus(e.target.value)}><option value="">All statuses</option>{statuses.map(value=><option key={value} value={value}>{value.replaceAll('_',' ')}</option>)}</select></label></div>
  {!data&&<WorkspaceSkeleton/>}
  <h2 className="text-lg font-semibold">Candidate placement timeline</h2>{data&&!placements.length&&<p className="text-sm text-muted-foreground">No placements match.</p>}
  <RecordsTable headings={['Role / company','Joining / end dates','Agreed pay','Status']} rows={placements.map(row=>({id:row.id,label:row.candidate?.full_name||row.company,cells:[<div key="role"><p className="font-medium">{row.role_title}</p><p className="text-xs text-muted-foreground">{row.company}</p></div>,<div key="dates" className="text-xs"><p>{row.actual_join_date?'Joined: ':'Planned: '}{row.actual_join_date||row.planned_start_date||'Not set'}</p><p className="text-muted-foreground">{row.actual_end_date?'Ended: ':'Expected end: '}{row.actual_end_date||row.expected_end_date||'Ongoing'}</p></div>,row.candidate_monthly_amount!=null?formatMoney(row.candidate_monthly_amount,row.candidate_currency||'USD')+'/month':'Not shared / not set',<StatusLabel key="status" value={row.status}/>]}))} onView={setSelected}/>
  <RecordSheet title="Candidate placement details" open={!!selected} onOpenChange={open=>{if(!open)setSelected(null);}}>{placements.filter(row=>row.id===selected).map(row=><article key={row.id} className="space-y-3 rounded border p-4"><strong>{row.candidate?.full_name||'Candidate'} · {row.company} / {row.role_title}</strong><p className="text-sm">{row.status.replaceAll('_',' ')} · planned join {row.planned_start_date||'not set'} · joined {row.actual_join_date||'not recorded'} · expected end {row.expected_end_date||'not set'} · actual end {row.actual_end_date||'not recorded'}</p><details><summary className="cursor-pointer text-sm">Monthly employment records ({row.months?.length||0})</summary><div className="mt-3 space-y-3">{row.months?.map(month=><div key={month.id} className="rounded border p-3"><p className="text-sm">{month.covered_start} to {month.covered_end} · {month.status} · {month.agreed_amount!==null?month.currency+' '+month.agreed_amount:'partial month amount needs review'}</p>{month.notes&&<p className="text-xs text-muted-foreground">{month.notes}</p>}</div>)}</div></details></article>)}</RecordSheet>
  </section>}
  </main>;
}

function RecordsTable({headings,rows,onView}:{headings:string[];rows:{id:string;label:string;cells:React.ReactNode[]}[];onView:(id:string)=>void}){return <div className="overflow-x-auto rounded-xl border border-border bg-card"><table className="ops-table"><thead><tr>{headings.map(heading=><th key={heading}>{heading}</th>)}<th><span className="sr-only">Action</span></th></tr></thead><tbody>{rows.map(row=><tr key={row.id}>{row.cells.map((cell,index)=><td key={index}>{cell}</td>)}<td className="text-right"><button className="text-primary" onClick={()=>onView(row.id)}>View details<span className="sr-only"> for {row.label}</span></button></td></tr>)}</tbody></table>{!rows.length&&<p className="p-6 text-sm text-muted-foreground">No matching records. Adjust filters or create a record to get started.</p>}</div>;}
