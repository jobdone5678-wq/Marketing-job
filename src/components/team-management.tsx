"use client";
import {WorkspaceSkeleton} from "@/components/workspace-ui";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {AuditHistory} from '@/components/audit-history';
import {ActionSheet,StatusLabel} from '@/components/operations-ui';
import { api } from '@/lib/api-client';
import {getAdminProfiles} from '@/lib/admin-profiles';
import {getCandidates} from '@/lib/candidates';
import type { Candidate, UserProfile } from '@/types/database';

type Staff = Pick<UserProfile, 'id'|'email'|'full_name'|'role'|'status'>;



export function TeamManagement({embedded=false,focusCandidateId,onUpdated}:{embedded?:boolean;focusCandidateId?:string;onUpdated?:()=>void|Promise<void>}) {
  const [loading,setLoading]=useState(true);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [search, setSearch] = useState('');
  const [staffSearch, setStaffSearch] = useState('');
  const [notice,setNotice]=useState('');

  async function refresh() {
    const [staffResult, candidateResult] = await Promise.all([
      getAdminProfiles(), getCandidates(),
    ]);
    setStaff(staffResult);
    setCandidates(candidateResult);
    await onUpdated?.();
  }
  useEffect(() => { let active=true;Promise.all([getAdminProfiles(),getCandidates()]).then(([staffResult,candidateResult])=>{if(!active)return;setStaff(staffResult);setCandidates(candidateResult);if(focusCandidateId)setSearch(candidateResult.find(candidate=>candidate.id===focusCandidateId)?.full_name||'');}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;}; }, [focusCandidateId]);

  const filtered = useMemo(() => candidates.filter(candidate =>
    `${candidate.full_name} ${candidate.email || ''}`.toLowerCase().includes(search.toLowerCase())), [candidates, search]);

  async function setStatus(profile: Staff, status: Staff['status']) {
    setBusy(profile.id); setError('');
    try { await api('/api/admin/profiles', { method: 'PATCH', body: JSON.stringify({ id: profile.id, status }) }); await refresh(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(''); }
  }

  async function assignment(candidateId: string, role: 'recruiter'|'technical_recruiter', profileId: string, remove = false) {
    setBusy(`${candidateId}:${role}`); setError('');
    try {
      await api('/api/admin/assignments', { method: remove ? 'DELETE' : 'POST', body: JSON.stringify({ candidateId, profileId, assignmentRole: role }) });
      await refresh();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(''); }
  }

  async function correctRole(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();const values=new FormData(event.currentTarget);
    setBusy('role-correction');setError('');setNotice('');
    try{await api('/api/admin/profiles',{method:'PATCH',body:JSON.stringify({id:values.get('id'),role:values.get('role'),reason:values.get('reason')})});await refresh();setNotice('Role corrected. Approve the pending staff account before granting access.');}
    catch(e){setError((e as Error).message);}finally{setBusy('');}
  }

  const pending = staff.filter(person => person.role !== 'client' && person.status === 'pending');
  const staffFor = (role: 'recruiter'|'technical_recruiter') => staff.filter(person => person.role === role && person.status === 'active');
  const filteredStaff=staff.filter(person=>person.role!=='client'&&`${person.full_name||''} ${person.email} ${person.role} ${person.status}`.toLowerCase().includes(staffSearch.toLowerCase()));

  const Root=embedded?'section':'main';
  if(loading)return <div className="portal-page"><WorkspaceSkeleton/></div>;
  return <Root className={embedded?"space-y-6":"mx-auto w-full max-w-[1600px] space-y-6 p-4 sm:p-6"}>
    <div>{embedded?<h2 className="text-xl font-semibold">Team and assignments</h2>:<h1 className="text-2xl font-semibold">Team and assignments</h1>}<p className="mt-1 text-sm text-muted-foreground">Approve staff accounts and control which candidates each staff member can access.</p></div>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {notice&&<p role="status" className="text-sm text-primary">{notice}</p>}
    <ActionSheet title="Correct an account role" description="For an existing candidate account registered with the wrong role. Only the super admin can request this correction; staff access stays pending until separately approved.">
      {error&&<p role="alert" className="text-destructive">{error}</p>}{notice&&<p role="status" className="text-primary">{notice}</p>}
      <form onSubmit={event=>void correctRole(event)} className="space-y-4">
        <label className="grid gap-1 text-sm">Existing candidate account<select className="ops-input" name="id" required><option value="">Choose the affected account</option>{staff.filter(person=>person.role==='client').map(person=><option key={person.id} value={person.id}>{person.full_name||person.email} · {person.email}</option>)}</select></label>
        <label className="grid gap-1 text-sm">Correct staff role<select className="ops-input" name="role" required><option value="technical_recruiter">Technical recruiter</option><option value="recruiter">Recruiter</option></select></label>
        <label className="grid gap-1 text-sm">Reason for correction<input className="ops-input" name="reason" required maxLength={500}/></label>
        <p className="text-xs text-muted-foreground">This preserves account identity and audit history. Salary terms and candidate assignments are managed separately.</p>
        <button className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50" disabled={!!busy}>Correct role and require approval</button>
      </form>
    </ActionSheet>
    <section className="space-y-3"><h2 className="text-lg font-semibold">Pending staff ({pending.length})</h2>
      {pending.length === 0 ? <p className="text-sm text-muted-foreground">No staff approvals are waiting.</p> : <div className="space-y-2">{pending.map(person => <article key={person.id} className="flex flex-wrap items-center justify-between gap-3 rounded border p-3">
        <div><strong>{person.full_name || person.email}</strong><p className="text-sm text-muted-foreground">{person.email} · {person.role === 'technical_recruiter' ? 'Technical recruiter' : 'Recruiter'}</p></div>
        <div className="flex gap-2"><button className="rounded bg-primary px-3 py-2 text-primary-foreground" disabled={!!busy} onClick={() => void setStatus(person,'active')}>Approve</button><button className="rounded border px-3 py-2" disabled={!!busy} onClick={() => void setStatus(person,'rejected')}>Reject</button></div>
      </article>)}</div>}
    </section>
    <section className="space-y-3"><h2 className="text-lg font-semibold">Staff accounts</h2><input aria-label="Search staff" value={staffSearch} onChange={e=>setStaffSearch(e.target.value)} placeholder="Search staff by name, role or status" className="w-full max-w-sm rounded border bg-background p-2"/><div className="overflow-auto rounded border"><table className="ops-table"><thead><tr className="border-b"><th className="p-3">Name</th><th>Email</th><th>Role</th><th>Status</th><th>Action</th></tr></thead><tbody>{filteredStaff.map(person=><tr key={person.id} className="border-b last:border-0"><td className="p-3">{person.full_name || '—'}<AuditHistory subjectId={person.id}/></td><td>{person.email}</td><td className="capitalize">{person.role.replaceAll('_',' ')}</td><td><StatusLabel value={person.status}/></td><td><select aria-label={`Update ${person.full_name || person.email} status`} disabled={!!busy || person.role==='super_admin'} value={person.status} onChange={e=>void setStatus(person,e.target.value as Staff['status'])} className="rounded border bg-background p-1"><option value="pending">Pending</option><option value="active">Active</option><option value="rejected">Rejected</option><option value="suspended">Suspended</option></select></td></tr>)}</tbody></table></div></section>
    <section className="space-y-3"><div><h2 className="text-lg font-semibold">Candidate assignments</h2><p className="text-sm text-muted-foreground">Assign the recruiter who applies for the candidate’s jobs. Credit the technical recruiter who brought the candidate to NextKinHR; their commission follows a successful placement.</p></div>
      <input value={search} onChange={e=>setSearch(e.target.value)} aria-label="Search candidate assignments" placeholder="Search candidates" className="w-full max-w-sm rounded border bg-background p-2" />
      <div className="space-y-3">{filtered.map(candidate=><article key={candidate.id} className="grid gap-3 rounded border p-3 md:grid-cols-3 md:items-center"><div><strong>{candidate.full_name}</strong><p className="text-sm text-muted-foreground">{candidate.email || 'No email'}</p></div>
        {(['recruiter','technical_recruiter'] as const).map(role=>{const current=role==='recruiter'?candidate.assigned_recruiter_id:candidate.assigned_technical_recruiter_id;const options=staffFor(role);return <div key={role} className="space-y-1"><label className="text-xs capitalize text-muted-foreground">{role.replace('_',' ')}</label><div className="flex gap-2"><select aria-label={`${role} assignment for ${candidate.full_name}`} disabled={!!busy} value={current||''} onChange={e=>e.target.value?void assignment(candidate.id,role,e.target.value):current?void assignment(candidate.id,role,current,true):undefined} className="min-w-0 flex-1 rounded border bg-background p-2"><option value="">Unassigned</option>{options.map(person=><option key={person.id} value={person.id}>{person.full_name || person.email}</option>)}</select>{current&&<button className="rounded border px-2" disabled={!!busy} onClick={()=>void assignment(candidate.id,role,current,true)}>Remove</button>}</div></div>})}<div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 md:col-span-3"><Link href={'/dashboard/candidates/'+candidate.id+'/edit'} className="text-xs font-medium text-primary hover:underline">Review candidate & resume</Link><AuditHistory subjectId={candidate.id}/></div>
      </article>)}</div>
      {filtered.length===0&&<p className="text-sm text-muted-foreground">No matching candidates.</p>}
    </section>
  </Root>;
}

