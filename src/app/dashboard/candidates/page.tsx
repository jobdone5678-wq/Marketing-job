"use client";

import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {Search,Plus,ShieldCheck,Clock,Users,ChevronLeft,ChevronRight} from 'lucide-react';
import {api} from '@/lib/api-client';
import type {Candidate} from '@/types/database';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {CandidateRoster} from '@/components/candidate-roster';
import {CandidateDetailDialog} from '@/components/candidate-detail-dialog';
import {WorkspaceHeading,WorkspaceSkeleton,WorkspaceEmpty,WorkspaceError} from '@/components/workspace-ui';

export default function CandidatesPage() {
 const [items,setItems]=useState<Candidate[]>([]),[total,setTotal]=useState(0),[page,setPage]=useState(0),[hasMore,setMore]=useState(false),[role,setRole]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(true),[selected,setSelected]=useState<Candidate|null>(null),[query,setQuery]=useState(''),[filter,setFilter]=useState('all'),[revision,setRevision]=useState(0);
 useEffect(()=>{let active=true;void api<{candidates:Candidate[];total:number;hasMore:boolean;role:string}>(`/api/candidates?page=${page}`).then(r=>{if(active){setItems(r.candidates);setTotal(r.total);setMore(r.hasMore);setRole(r.role);setError('');}}).catch(e=>active&&setError(e.message)).finally(()=>active&&setLoading(false));return()=>{active=false;};},[page,revision]);
 const visible=useMemo(()=>items.filter(candidate=>{
  const haystack=[candidate.full_name,candidate.target_job_titles,candidate.current_job_title,candidate.primary_skills,candidate.secondary_skills,candidate.visa_status,candidate.preferred_locations].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(query.trim().toLowerCase())&&(filter==='all'||filter==='active'&&candidate.is_active_bench||filter==='review'&&candidate.provenance_status!=='confirmed');
 }),[items,query,filter]);
 const active=items.filter(c=>c.is_active_bench).length;const verified=items.filter(c=>c.provenance_status==='confirmed').length;
 return <main className="portal-page space-y-6">
  <WorkspaceHeading eyebrow="Talent workspace" title={role==='client'?'My profile & resume':'Bench candidates'} description="Reviewed talent, ready for the right opportunity. Keep candidate facts and documents together." actions={(role!=='client'||!total)&&<Button render={<Link href="/dashboard/candidates/new"/>}><Plus className="size-4"/>Add candidate</Button>}/>
  <section aria-label="Candidate metrics" className="grid grid-cols-3 divide-x divide-border border border-border bg-card">
   {[['Saved profiles',total,Users],['Active on this page',active,Clock],['Reviewed on this page',verified,ShieldCheck]].map(([label,value,Icon])=>{const MetricIcon=Icon as typeof Users;return <div key={String(label)} className="p-3 sm:p-4"><p className="flex items-center justify-between gap-2 text-xs font-medium text-muted-foreground">{String(label)}<MetricIcon className="hidden size-3.5 text-muted-foreground sm:block"/></p><p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums font-mono">{loading?'—':String(value)}</p></div>;})}
  </section>
  <section aria-label="Candidate filters" className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-1 border border-border p-0.5 bg-muted/30" aria-label="Candidate availability">{[{id:'all',label:'All candidates'},{id:'active',label:'Active bench'},{id:'review',label:'Needs review'}].map(tab=><button type="button" key={tab.id} aria-pressed={filter===tab.id} onClick={()=>setFilter(tab.id)} className={`px-2.5 py-1 text-xs font-medium transition-colors ${filter===tab.id?'bg-card text-foreground shadow-2xs font-semibold':'text-muted-foreground hover:text-foreground'}`}>{tab.label}</button>)}</div><div className="relative w-full sm:w-72"><Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground"/><Input type="search" aria-label="Search candidates" placeholder="Name, skill, location or visa…" value={query} onChange={event=>setQuery(event.target.value)} className="h-9 bg-card pl-9 text-xs"/></div></div><p className="text-xs text-muted-foreground">Search and availability filters apply to this page of saved profiles.</p></section>
  {error&&<WorkspaceError message={error}><Button variant="outline" className="mt-2" onClick={()=>{setLoading(true);setRevision(v=>v+1);}}>Try again</Button></WorkspaceError>}
  {loading?<WorkspaceSkeleton/>:!visible.length?<WorkspaceEmpty title={items.length?'No matching candidates':'Build your talent bench'} description={items.length?'Try another skill, name or availability filter.':'Upload a resume, review the extracted facts, and confirm the candidate profile.'} action={items.length?<Button variant="outline" onClick={()=>{setQuery('');setFilter('all');}}>Clear filters</Button>:<Button render={<Link href="/dashboard/candidates/new"/>}>Add your first candidate</Button>}/>:<CandidateRoster candidates={visible} onView={setSelected}/>}
  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4"><p className="text-xs text-muted-foreground">{visible.length} shown · {total} saved profiles · Page {page+1}</p><div className="flex gap-2"><Button variant="outline" disabled={!page||loading} onClick={()=>{setLoading(true);setPage(v=>v-1);}}><ChevronLeft className="size-3.5"/>Previous</Button><Button variant="outline" disabled={!hasMore||loading} onClick={()=>{setLoading(true);setPage(v=>v+1);}}>Next<ChevronRight className="size-3.5"/></Button></div></div>
  <CandidateDetailDialog key={selected?.id||'none'} candidate={selected} open={!!selected} onOpenChange={open=>!open&&setSelected(null)}/>
 </main>;
}
