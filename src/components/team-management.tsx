"use client";

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api-client';
import {getCandidates} from '@/lib/candidates';
import type { Candidate, UserProfile } from '@/types/database';

type Staff = Pick<UserProfile, 'id'|'email'|'full_name'|'role'|'status'>;

type StaffList = { profiles: Staff[] };

export function TeamManagement({embedded=false,onUpdated}:{embedded?:boolean;onUpdated?:()=>void|Promise<void>}) {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [search, setSearch] = useState('');
  const [staffSearch, setStaffSearch] = useState('');

  async function refresh() {
    const [staffResult, candidateResult] = await Promise.all([
      api<StaffList>('/api/admin/profiles'), getCandidates(),
    ]);
    setStaff(staffResult.profiles);
    setCandidates(candidateResult);
    await onUpdated?.();
  }
  useEffect(() => { let active=true;Promise.all([api<StaffList>('/api/admin/profiles'),getCandidates()]).then(([staffResult,candidateResult])=>{if(!active)return;setStaff(staffResult.profiles);setCandidates(candidateResult);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;}; }, []);

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

  const pending = staff.filter(person => person.role !== 'client' && person.status === 'pending');
  const staffFor = (role: 'recruiter'|'technical_recruiter') => staff.filter(person => person.role === role && person.status === 'active');
  const filteredStaff=staff.filter(person=>person.role!=='client'&&`${person.full_name||''} ${person.email} ${person.role} ${person.status}`.toLowerCase().includes(staffSearch.toLowerCase()));

  const Root=embedded?'section':'main';
  return <Root className="space-y-8 p-6">
    <div><h1 className="text-2xl font-bold">Team and assignments</h1><p className="text-muted-foreground">Approve staff accounts and control which candidates each staff member can access.</p></div>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <section className="space-y-3"><h2 className="text-lg font-semibold">Pending staff ({pending.length})</h2>
      {pending.length === 0 ? <p className="text-sm text-muted-foreground">No staff approvals are waiting.</p> : <div className="space-y-2">{pending.map(person => <article key={person.id} className="flex flex-wrap items-center justify-between gap-3 rounded border p-3">
        <div><strong>{person.full_name || person.email}</strong><p className="text-sm text-muted-foreground">{person.email} · {person.role === 'technical_recruiter' ? 'Technical recruiter' : 'Recruiter'}</p></div>
        <div className="flex gap-2"><button className="rounded bg-primary px-3 py-2 text-primary-foreground" disabled={!!busy} onClick={() => void setStatus(person,'active')}>Approve</button><button className="rounded border px-3 py-2" disabled={!!busy} onClick={() => void setStatus(person,'rejected')}>Reject</button></div>
      </article>)}</div>}
    </section>
    <section className="space-y-3"><h2 className="text-lg font-semibold">Staff accounts</h2><input aria-label="Search staff" value={staffSearch} onChange={e=>setStaffSearch(e.target.value)} placeholder="Search staff by name, role or status" className="w-full max-w-sm rounded border bg-background p-2"/><div className="overflow-auto rounded border"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="p-3">Name</th><th>Email</th><th>Role</th><th>Status</th><th>Action</th></tr></thead><tbody>{filteredStaff.map(person=><tr key={person.id} className="border-b last:border-0"><td className="p-3">{person.full_name || '—'}</td><td>{person.email}</td><td>{person.role}</td><td>{person.status}</td><td><select aria-label={`Update ${person.full_name || person.email} status`} disabled={!!busy || person.role==='super_admin'} value={person.status} onChange={e=>void setStatus(person,e.target.value as Staff['status'])} className="rounded border bg-background p-1"><option value="pending">Pending</option><option value="active">Active</option><option value="rejected">Rejected</option><option value="suspended">Suspended</option></select></td></tr>)}</tbody></table></div></section>
    <section className="space-y-3"><div><h2 className="text-lg font-semibold">Candidate assignments</h2><p className="text-sm text-muted-foreground">A candidate can have one assigned recruiter and one assigned technical recruiter.</p></div>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search candidates" className="w-full max-w-sm rounded border bg-background p-2" />
      <div className="space-y-3">{filtered.map(candidate=><article key={candidate.id} className="grid gap-3 rounded border p-3 md:grid-cols-3 md:items-center"><div><strong>{candidate.full_name}</strong><p className="text-sm text-muted-foreground">{candidate.email || 'No email'}</p></div>
        {(['recruiter','technical_recruiter'] as const).map(role=>{const current=role==='recruiter'?candidate.assigned_recruiter_id:candidate.assigned_technical_recruiter_id;const options=staffFor(role);return <div key={role} className="space-y-1"><label className="text-xs capitalize text-muted-foreground">{role.replace('_',' ')}</label><div className="flex gap-2"><select aria-label={`${role} assignment for ${candidate.full_name}`} disabled={!!busy} value={current||''} onChange={e=>e.target.value?void assignment(candidate.id,role,e.target.value):current?void assignment(candidate.id,role,current,true):undefined} className="min-w-0 flex-1 rounded border bg-background p-2"><option value="">Unassigned</option>{options.map(person=><option key={person.id} value={person.id}>{person.full_name || person.email}</option>)}</select>{current&&<button className="rounded border px-2" disabled={!!busy} onClick={()=>void assignment(candidate.id,role,current,true)}>Remove</button>}</div></div>})}
      </article>)}</div>
      {filtered.length===0&&<p className="text-sm text-muted-foreground">No matching candidates.</p>}
    </section>
  </Root>;
}

