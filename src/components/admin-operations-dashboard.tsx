"use client";

import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarClock,
  CalendarCheck2,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  CircleDollarSign,
  CheckCircle2,
  Users,
  Sparkles,
  Layers,
  Building2,
  Clock,
  TrendingUp,
  Receipt,
  CreditCard,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PlacementsWorkspace } from '@/components/placements-workspace';
import { TeamManagement } from '@/components/team-management';
import { JobBriefsWorkspace } from '@/components/job-briefs-workspace';
import { StatusLabel, formatMoney, OperationsCard } from '@/components/operations-ui';

type Panel = 'overview' | 'jd' | 'team' | 'placements' | 'salary' | 'commissions' | 'payments' | 'collections';
type Money = { currency: string; amount: number }[];
type Ops = {
  collections?: { received: Money; outstanding: Money; due: Money; duePeriods: number };
  pendingStaff: { id: string; full_name: string | null; email: string; role: string }[];
  unassignedCandidates: { id: string; full_name: string; provenance_status: string; assigned_recruiter_id?: string | null; assigned_technical_recruiter_id?: string | null }[];
  placements: { id: string; candidate: { full_name: string } | null; company: string; role_title: string; status: string; planned_start_date: string | null; actual_join_date: string | null; expected_end_date: string | null; actual_end_date: string | null; recruiter?: { full_name: string } | null; technical_recruiter?: { full_name: string } | null }[];
  salaryPeriods: { id: string; currency: string; balance: number; status: string; due_date: string; employment: { profile: { full_name: string | null; email: string } } }[];
  commissions: { id: string; currency: string; balance: number; status: string; profile: { full_name: string | null; email: string }; placement: { company: string; role_title: string } }[];
  commissionApprovals?: Ops['commissions'];
  captureIssues: { id: string; company_name: string; job_title: string; capture_status: string; candidate: { full_name: string } | null }[];
  money: { salaryOutstanding: Money; salaryPaid: Money; commissionOutstanding: Money; commissionPaid: Money };
  counts: { activePlacements: number; joinsNext30Days: number; endsNext30Days: number; captureIssues: number; pendingStaff?: number; assignmentReview?: number; commissionApproval?: number };
};

const panels: [Panel, string][] = [
  ['overview', 'Overview'],
  ['jd', 'JD matching'],
  ['team', 'Team'],
  ['collections', 'Collections'],
  ['placements', 'Job placements'],
  ['salary', 'Recruiter payroll'],
  ['commissions', 'Commissions'],
  ['payments', 'Outgoing payments'],
];

const empty = (message: string) => (
  <div className="flex flex-col items-center justify-center py-6 text-center">
    <CheckCircle2 className="size-6 text-muted-foreground/40 mb-1.5" />
    <p className="text-xs text-muted-foreground">{message}</p>
  </div>
);

function CurrencyTotals({ rows, label }: { rows: Money; label: string }) {
  return (
    <div className="rounded-lg bg-muted/40 p-3.5 border border-border/40 hover:bg-muted/60 transition-colors">
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      {rows.length ? (
        rows.map(row => (
          <p key={row.currency} className="mt-1 text-lg font-bold tabular-nums text-foreground tracking-tight">
            {formatMoney(row.amount, row.currency)}
          </p>
        ))
      ) : (
        <p className="mt-1 text-lg font-bold text-muted-foreground tracking-tight">—</p>
      )}
    </div>
  );
}

export function AdminOperationsDashboard() {
  const [viewVersion, setViewVersion] = useState(0);
  const [data, setData] = useState<Ops | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [tab, setTab] = useState<Panel>('overview');
  const [updated, setUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [placementStatus, setPlacementStatus] = useState('');
  const [focusId, setFocusId] = useState<string | undefined>();

  async function refresh() {
    setRefreshing(true);
    try {
      setData(await api<Ops>('/api/admin/operations'));
      setUpdated(new Date());
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    let active = true;
    api<Ops>('/api/admin/operations')
      .then(response => {
        if (active) {
          setData(response);
          setUpdated(new Date());
        }
      })
      .catch(e => {
        if (active) setError((e as Error).message);
      });
    return () => {
      active = false;
    };
  }, []);

  function openPanel(panel: Panel, id?: string) {
    setFocusId(id);
    setTab(panel);
  }

  async function decide(id: string, status: 'active' | 'rejected') {
    setBusy(id);
    try {
      await api('/api/admin/profiles', {
        method: 'PATCH',
        body: JSON.stringify({ id, status }),
      });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  const candidates = data?.unassignedCandidates || [];
  const commissions =
    data?.commissionApprovals ||
    data?.commissions.filter(row => row.status === 'awaiting_approval') ||
    [];
  const placements = (data?.placements || []).filter(
    row =>
      `${row.candidate?.full_name} ${row.company} ${row.role_title} ${row.recruiter?.full_name} ${row.technical_recruiter?.full_name}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (!placementStatus || row.status === placementStatus)
  );

  return (
    <section className="space-y-6" aria-label="Super admin operations">
      {/* Header Banner */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/40 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold tracking-wide bg-primary/10 text-primary border border-primary/20 shadow-2xs">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Super admin
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Operations overview</h1>
          <p className="mt-1.5 text-xs sm:text-sm text-muted-foreground max-w-3xl leading-relaxed">
            Candidate fees received by NextKinHR, recruiter salary paid by NextKinHR, and referral commissions after successful placement.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground font-medium" role="status">
            {updated
              ? `Updated ${updated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : 'Loading data'}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={refreshing}
            onClick={() => void refresh().then(() => setViewVersion(value => value + 1))}
            className="h-8 gap-2 rounded-lg border-border/60 text-xs shadow-2xs hover:bg-accent/80 active:scale-95 transition-all cursor-pointer"
          >
            <RefreshCw className={refreshing ? 'size-3.5 animate-spin' : 'size-3.5'} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-xs text-destructive space-y-1.5">
          <div className="flex items-center gap-2 font-semibold">
            <span>{error}</span>
            <button className="underline font-bold cursor-pointer hover:text-destructive/80" onClick={() => void refresh()}>
              Try again
            </button>
          </div>
        </div>
      )}

      {!data && !error && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Loading operations">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 animate-pulse rounded-xl border border-border/40 bg-muted/30" />
          ))}
        </div>
      )}

      {data && (
        <Tabs
          value={tab}
          onValueChange={value => {
            setFocusId(undefined);
            setTab(value as Panel);
          }}
          className="gap-6"
        >
          {/* Interactive Navigation Tabs */}
          <div className="overflow-x-auto border-b border-border/60 pb-px">
            <TabsList variant="line" aria-label="Operations sections" className="h-11 gap-1">
              {panels.map(([value, label]) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="group relative flex items-center gap-1.5 px-3.5 pb-3 text-xs font-medium text-muted-foreground transition-all duration-150 hover:text-foreground data-[state=active]:font-semibold data-[state=active]:text-foreground"
                >
                  <span>{label}</span>
                  {value === 'team' && (data.counts.pendingStaff ?? data.pendingStaff.length) > 0 && (
                    <span className="ml-1 rounded-full bg-primary/15 border border-primary/20 px-1.5 py-0.2 text-[10px] font-bold text-primary">
                      {data.counts.pendingStaff ?? data.pendingStaff.length}
                    </span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="overview" className="space-y-6 pt-2">
            {/* Top 3 Interactive Metric Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {[
                ['Active placements', data.counts.activePlacements, BriefcaseBusiness, 'placements'],
                ['Joining in 30 days', data.counts.joinsNext30Days, CalendarCheck2, 'placements'],
                ['Ending in 30 days', data.counts.endsNext30Days, CalendarClock, 'placements'],
              ].map(([label, value, Icon]) => {
                const MetricIcon = Icon as typeof BriefcaseBusiness;
                return (
                  <button
                    key={String(label)}
                    type="button"
                    className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-border/60 bg-gradient-to-b from-card to-card/70 p-5 text-left shadow-2xs transition-all duration-200 hover:border-primary/40 hover:shadow-xs active:scale-[0.99] cursor-pointer"
                    onClick={() => openPanel('placements')}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
                        {String(label)}
                      </span>
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20 shadow-2xs group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-200">
                        <MetricIcon className="size-4.5 stroke-[2]" />
                      </div>
                    </div>
                    <p className="mt-3 text-3xl font-bold tabular-nums tracking-tight text-foreground">
                      {String(value)}
                    </p>
                    <div className="mt-3 flex items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-primary transition-colors">
                      <span>View candidate timelines</span>
                      <ArrowUpRight className="size-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform duration-150" />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Needs Attention Section */}
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold tracking-tight text-foreground">Needs attention</h2>
                  <span className="size-2 rounded-full bg-amber-500 animate-pulse" />
                </div>
                <span className="hidden text-xs text-muted-foreground font-medium sm:inline">
                  Resolve approvals and missing information
                </span>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                {/* 1. Staff Approvals */}
                <OperationsCard
                  title="Staff approvals"
                  count={data.counts.pendingStaff ?? data.pendingStaff.length}
                  action="Manage team"
                  onAction={() => openPanel('team')}
                >
                  <div className="space-y-3">
                    {data.pendingStaff.slice(0, 3).map(person => (
                      <div key={person.id} className="rounded-lg border border-border/40 bg-muted/20 p-3 hover:bg-muted/40 transition-colors">
                        <p className="truncate text-xs font-semibold text-foreground">
                          {person.full_name || person.email}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground capitalize">
                          {person.role.replaceAll('_', ' ')} · access pending
                        </p>
                        <div className="mt-2.5 flex items-center gap-2">
                          <Button
                            size="sm"
                            disabled={!!busy}
                            onClick={() => void decide(person.id, 'active')}
                            className="h-7 px-2.5 text-xs font-semibold cursor-pointer"
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!!busy}
                            onClick={() => void decide(person.id, 'rejected')}
                            className="h-7 px-2.5 text-xs cursor-pointer text-destructive hover:bg-destructive/10 hover:border-destructive/30"
                          >
                            Reject
                          </Button>
                        </div>
                      </div>
                    ))}
                    {!data.pendingStaff.length && empty('No accounts waiting for approval.')}
                  </div>
                </OperationsCard>

                {/* 2. Candidate Review */}
                <OperationsCard
                  title="Candidate review"
                  count={data.counts.assignmentReview ?? candidates.length}
                  action="View assignments"
                  onAction={() => openPanel('team')}
                >
                  <div className="space-y-2">
                    {candidates.slice(0, 3).map(candidate => (
                      <button
                        key={candidate.id}
                        type="button"
                        onClick={() => openPanel('team', candidate.id)}
                        className="group block w-full rounded-lg border border-border/40 bg-muted/20 p-3 text-left transition-all hover:bg-muted/50 hover:border-border cursor-pointer active:scale-[0.99]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                            {candidate.full_name}
                          </p>
                          <ArrowUpRight className="size-3.5 text-muted-foreground opacity-60 group-hover:opacity-100 group-hover:text-primary transition-all shrink-0" />
                        </div>
                        <div className="mt-1.5 flex flex-col gap-0.5 text-[11px]">
                          {!candidate.assigned_recruiter_id && (
                            <span className="font-medium text-amber-600 dark:text-amber-400">
                              Recruiter not assigned
                            </span>
                          )}
                          {!candidate.assigned_technical_recruiter_id && (
                            <span className="font-medium text-amber-600 dark:text-amber-400">
                              Technical recruiter not assigned
                            </span>
                          )}
                          {candidate.provenance_status === 'legacy_unconfirmed' && (
                            <span className="text-muted-foreground">
                              Resume details need confirmation
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                    {!candidates.length && empty('All candidates are assigned and reviewed.')}
                  </div>
                </OperationsCard>

                {/* 3. Commission Approvals */}
                <OperationsCard
                  title="Commission approvals"
                  count={data.counts.commissionApproval ?? commissions.length}
                  action="Review commissions"
                  onAction={() => openPanel('commissions')}
                >
                  <div className="space-y-2">
                    {commissions.slice(0, 3).map(row => (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() => openPanel('commissions', row.id)}
                        className="group block w-full rounded-lg border border-border/40 bg-muted/20 p-3 text-left transition-all hover:bg-muted/50 hover:border-border cursor-pointer active:scale-[0.99]"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                            {row.profile.full_name || row.profile.email}
                          </p>
                          <span className="shrink-0 text-xs font-bold tabular-nums text-foreground">
                            {formatMoney(row.balance, row.currency)}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          {row.placement.company} · {row.placement.role_title}
                        </p>
                        <p className="mt-1 text-[11px] font-semibold text-primary flex items-center gap-1">
                          <span className="size-1 rounded-full bg-primary" />
                          Eligible · awaiting your approval
                        </p>
                      </button>
                    ))}
                    {!commissions.length && empty('No eligible commissions awaiting approval.')}
                  </div>
                </OperationsCard>
              </div>
            </div>

            {/* Candidate / Client Service Collections */}
            <OperationsCard
              title="Candidate / client service collections"
              count={data.collections?.duePeriods}
              action="Manage collections"
              onAction={() => openPanel('collections')}
            >
              <p className="mb-4 text-xs text-muted-foreground leading-relaxed">
                Candidates pay NextKinHR for the assigned recruiter to apply for jobs. Candidate service joining dates anchor monthly fees and payment due dates. NextKinHR pays recruiter salary separately.
              </p>
              {data.collections ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <CurrencyTotals label="Received externally" rows={data.collections.received} />
                    <CurrencyTotals label="Outstanding (all billed periods)" rows={data.collections.outstanding} />
                    <CurrencyTotals label="Due now / overdue" rows={data.collections.due} />
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{data.collections.duePeriods} unpaid service periods</span> are due. Totals are separated by currency.
                  </p>
                </>
              ) : (
                <p role="status" className="text-xs text-muted-foreground py-2">
                  Service collection totals are unavailable. Refresh to retry.
                </p>
              )}
            </OperationsCard>

            {/* Payroll & Commissions Split */}
            <div className="grid gap-5 lg:grid-cols-2">
              {[
                {
                  title: 'Staff payroll',
                  paid: data.money.salaryPaid,
                  outstanding: data.money.salaryOutstanding,
                  panel: 'salary' as Panel,
                  description: 'Monthly periods anchored to each staff member’s actual joining date.',
                },
                {
                  title: 'Technical recruiter commissions',
                  paid: data.money.commissionPaid,
                  outstanding: data.money.commissionOutstanding,
                  panel: 'commissions' as Panel,
                  description: 'Technical recruiters bring candidates to NextKinHR. Commission follows successful placement, eligibility and approval.',
                },
              ].map(card => (
                <OperationsCard
                  key={card.title}
                  title={card.title}
                  action="View details"
                  onAction={() => openPanel(card.panel)}
                >
                  <p className="mb-3 text-xs text-muted-foreground leading-relaxed">
                    {card.description}
                  </p>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <CurrencyTotals label="Outstanding" rows={card.outstanding} />
                    <CurrencyTotals label="Paid externally" rows={card.paid} />
                  </div>
                  {!card.outstanding.length && !card.paid.length && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {card.panel === 'salary' ? 'No staff payroll totals recorded.' : 'No commission totals recorded.'}
                    </p>
                  )}
                  <div className="divide-y divide-border/40">
                    {card.panel === 'salary'
                      ? data.salaryPeriods.slice(0, 3).map(row => (
                          <button
                            key={row.id}
                            type="button"
                            onClick={() => openPanel('salary', row.id)}
                            className="group flex w-full items-center justify-between gap-3 py-2.5 text-left text-xs transition-colors hover:text-primary cursor-pointer"
                          >
                            <span className="truncate">
                              <span className="font-semibold text-foreground group-hover:text-primary">
                                {row.employment?.profile?.full_name || row.employment?.profile?.email}
                              </span>
                              <span className="block text-[11px] text-muted-foreground mt-0.5">
                                Due {row.due_date} · {row.status.replaceAll('_', ' ')}
                              </span>
                            </span>
                            <span className="shrink-0 font-bold tabular-nums text-foreground">
                              {formatMoney(row.balance, row.currency)}
                            </span>
                          </button>
                        ))
                      : data.commissions.slice(0, 3).map(row => (
                          <button
                            key={row.id}
                            type="button"
                            onClick={() => openPanel('commissions', row.id)}
                            className="group flex w-full items-center justify-between gap-3 py-2.5 text-left text-xs transition-colors hover:text-primary cursor-pointer"
                          >
                            <span className="min-w-0">
                              <span className="block font-semibold text-foreground group-hover:text-primary truncate">
                                {row.profile.full_name || row.profile.email}
                              </span>
                              <span className="block truncate text-[11px] text-muted-foreground mt-0.5">
                                {row.placement.company} · {row.placement.role_title}
                              </span>
                              <span className="inline-block mt-1">
                                <StatusLabel value={row.status} />
                              </span>
                            </span>
                            <span className="shrink-0 font-bold tabular-nums text-foreground">
                              {formatMoney(row.balance, row.currency)}
                            </span>
                          </button>
                        ))}
                  </div>
                </OperationsCard>
              ))}
            </div>

            {/* Candidate Employment Timeline */}
            <OperationsCard
              title="Candidate employment timeline"
              action="Manage placements"
              onAction={() => openPanel('placements')}
            >
              <div className="mb-4 flex flex-wrap items-center gap-2.5">
                <input
                  className="ops-input max-w-xs h-8 text-xs rounded-lg border-border/60 bg-muted/20"
                  aria-label="Search placement timeline"
                  placeholder="Search candidate, company or staff"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                <select
                  className="ops-input w-auto h-8 text-xs rounded-lg border-border/60 bg-muted/20"
                  aria-label="Filter placement timeline status"
                  value={placementStatus}
                  onChange={e => setPlacementStatus(e.target.value)}
                >
                  <option value="">All statuses</option>
                  {['offer_accepted', 'joining_scheduled', 'active', 'completed', 'ended_early', 'cancelled'].map(s => (
                    <option key={s} value={s}>
                      {s.replaceAll('_', ' ')}
                    </option>
                  ))}
                </select>
              </div>

              <div className="overflow-x-auto rounded-lg border border-border/50">
                <table className="ops-table text-xs">
                  <thead>
                    <tr className="bg-muted/40 border-b border-border/60">
                      <th className="font-semibold text-muted-foreground uppercase text-[10.5px]">Candidate / role</th>
                      <th className="font-semibold text-muted-foreground uppercase text-[10.5px]">Credited staff</th>
                      <th className="font-semibold text-muted-foreground uppercase text-[10.5px]">Joining date</th>
                      <th className="font-semibold text-muted-foreground uppercase text-[10.5px]">End date</th>
                      <th className="font-semibold text-muted-foreground uppercase text-[10.5px]">Status</th>
                      <th><span className="sr-only">Action</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {placements.slice(0, 8).map(row => (
                      <tr key={row.id} className="hover:bg-muted/20 transition-colors">
                        <td>
                          <p className="font-semibold text-foreground">{row.candidate?.full_name || 'Candidate'}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{row.company} · {row.role_title}</p>
                        </td>
                        <td className="text-[11px]">
                          <p className="font-medium text-foreground">Recruiter: {row.recruiter?.full_name || 'Unassigned'}</p>
                          <p className="text-muted-foreground mt-0.5">Technical: {row.technical_recruiter?.full_name || 'Unassigned'}</p>
                        </td>
                        <td className="text-[11px]">
                          <span className="font-medium text-foreground">{row.actual_join_date || row.planned_start_date || 'Not set'}</span>
                          <span className="block text-[10px] text-muted-foreground">{row.actual_join_date ? 'Actual' : 'Planned'}</span>
                        </td>
                        <td className="text-[11px]">
                          <span className="font-medium text-foreground">{row.actual_end_date || row.expected_end_date || 'Ongoing'}</span>
                          <span className="block text-[10px] text-muted-foreground">{row.actual_end_date ? 'Actual' : 'Expected'}</span>
                        </td>
                        <td>
                          <StatusLabel value={row.status} />
                        </td>
                        <td className="text-right">
                          <Button size="sm" variant="ghost" className="h-7 text-xs font-semibold hover:text-primary cursor-pointer" onClick={() => openPanel('placements', row.id)}>
                            View<span className="sr-only"> {row.candidate?.full_name}</span>
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!placements.length && empty('No placements match. Record a placement when a candidate accepts an offer.')}
              <p className="mt-3 text-[11px] text-muted-foreground">
                Candidate employment uses calendar months. Planned dates stay separate from actual employment dates.
              </p>
            </OperationsCard>
          </TabsContent>

          <TabsContent value="team">
            {tab === 'team' && <TeamManagement key={viewVersion} embedded focusCandidateId={focusId} onUpdated={refresh} />}
          </TabsContent>
          <TabsContent value="jd">
            {tab === 'jd' && <JobBriefsWorkspace embedded onAssign={candidateId => openPanel('team', candidateId)} />}
          </TabsContent>
          {(['collections', 'placements', 'salary', 'commissions', 'payments'] as const).map(panel => (
            <TabsContent key={panel} value={panel}>
              {tab === panel && (
                <PlacementsWorkspace
                  key={panel + viewVersion}
                  initialPanel={panel}
                  embedded
                  focusRecordId={focusId}
                  onUpdated={refresh}
                />
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </section>
  );
}
