'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import { RecordSheet, StatusLabel, formatMoney } from '@/components/operations-ui';
import { ServiceCollectionsWorkspace } from '@/components/service-collections-workspace';
import { WorkspaceSkeleton, WorkspaceHeading, WorkspaceEmpty } from '@/components/workspace-ui';
import { Search, Briefcase, Calendar, Building2, CheckCircle2, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Month = {
  id: string;
  covered_start: string;
  covered_end: string;
  status: string;
  agreed_amount: string | null;
  currency: string | null;
  notes?: string | null;
};

type Placement = {
  id: string;
  candidate: { full_name: string } | null;
  company: string;
  role_title: string;
  status: string;
  planned_start_date: string | null;
  actual_join_date: string | null;
  expected_end_date: string | null;
  actual_end_date: string | null;
  candidate_monthly_amount: string | null;
  candidate_currency: string | null;
  candidate_compensation_visible: boolean;
  months?: Month[];
};

type Panel = 'collections' | 'placements';

export function PlacementsWorkspace({ initialPanel = 'placements' }: { initialPanel?: Panel }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [data, setData] = useState<Placement[] | null>(null);
  const [panel, setPanel] = useState<Panel>(initialPanel);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api<{ placements: Placement[] }>('/api/placements')
      .then((result) => {
        if (active) setData(result.placements || []);
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      });
    return () => {
      active = false;
    };
  }, []);

  const matches = (text: string, rowStatus: string) =>
    text.toLowerCase().includes(search.toLowerCase()) && (!status || rowStatus === status);

  const placements = (data || []).filter((row) =>
    matches(
      [row.candidate?.full_name, row.company, row.role_title, row.status].join(' '),
      row.status
    )
  );

  const statuses = [
    'offer_accepted',
    'joining_scheduled',
    'active',
    'completed',
    'ended_early',
    'cancelled',
  ];

  return (
    <main className="portal-page animate-fade-rise space-y-6">
      <WorkspaceHeading
        eyebrow="Placement Operations"
        title="Candidate Placements & Service Agreements"
        description="Track active candidate placements, scheduled start dates, monthly compensation structures, and reconciled service agreements."
      />

      {error && (
        <p role="alert" className="text-destructive text-[13px]">
          {error}
        </p>
      )}

      {/* Navigation tabs */}
      <nav
        aria-label="Compensation sections"
        className="bg-muted/50 border-border/70 inline-flex gap-1 rounded-[12px] border p-1 text-[13px]"
      >
        {(['placements', 'collections'] as Panel[]).map((value) => (
          <button
            type="button"
            key={value}
            aria-pressed={panel === value}
            className={`cursor-pointer rounded-[10px] px-3.5 py-1.5 font-medium transition-colors ${
 panel === value
 ?'bg-background text-foreground ring-border/60 font-medium ring-1'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => {
              setPanel(value);
              setSelected(null);
              setStatus('');
              setSearch('');
            }}
          >
            {value === 'collections' ? 'Service Fee Collections' : 'Job Placements'}
          </button>
        ))}
      </nav>

      {panel === 'collections' && <ServiceCollectionsWorkspace />}

      {panel === 'placements' && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="text-muted-foreground absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
              <input
                aria-label="Search records"
                className="border-input bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-ring h-9 w-full rounded-[12px] border pr-3 pl-9 text-[13px] focus-visible:ring-2 focus-visible:outline-none"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search candidate, company, role…"
              />
            </div>

            <select
              aria-label="Filter by placement status"
              className="border-input bg-background text-foreground focus-visible:ring-ring h-9 rounded-[12px] border px-3 text-[13px] focus-visible:ring-2 focus-visible:outline-none"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">All Statuses</option>
              {statuses.map((value) => (
                <option key={value} value={value}>
                  {value.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </div>

          {!data && <WorkspaceSkeleton rows={4} />}

          {data && (
            <div className="border-border/80 bg-card overflow-x-auto rounded-[16px] border">
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Candidate</th>
                    <th>Role & Company</th>
                    <th>Joining / End Dates</th>
                    <th>Agreed Rate</th>
                    <th>Status</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {!placements.length ? (
                    <tr>
                      <td colSpan={6} className="text-muted-foreground h-28 text-center text-[13px]">
                        No placements match your criteria.
                      </td>
                    </tr>
                  ) : (
                    placements.map((row) => (
                      <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                        <td className="text-foreground text-[13px] font-medium">
                          {row.candidate?.full_name || 'Confidential Candidate'}
                        </td>
                        <td>
                          <span className="text-foreground block text-[13px] font-medium">
                            {row.role_title}
                          </span>
                          <span className="text-muted-foreground text-[11px]">{row.company}</span>
                        </td>
                        <td className="font-mono text-[13px]">
                          <p>
                            {row.actual_join_date ? 'Joined: ' : 'Planned: '}
                            {row.actual_join_date || row.planned_start_date || 'Not set'}
                          </p>
                          <p className="text-muted-foreground text-[11px]">
                            {row.actual_end_date ? 'Ended: ' : 'Expected: '}
                            {row.actual_end_date || row.expected_end_date || 'Ongoing'}
                          </p>
                        </td>
                        <td className="font-mono text-[13px] font-medium">
                          {row.candidate_monthly_amount != null
                            ? formatMoney(
                                row.candidate_monthly_amount,
                                row.candidate_currency || 'USD'
                              ) + ' / mo'
                            : 'Not shared / unrecorded'}
                        </td>
                        <td>
                          <StatusLabel value={row.status} />
                        </td>
                        <td className="text-right">
                          <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => setSelected(row.id)}
                            className="text-primary cursor-pointer text-[13px] hover:underline"
                          >
                            View Details
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          <RecordSheet
            title="Candidate Placement Summary"
            open={!!selected}
            onOpenChange={(open) => {
              if (!open) setSelected(null);
            }}
          >
            {placements
              .filter((row) => row.id === selected)
              .map((row) => (
                <article key={row.id} className="space-y-4 text-[13px]">
                  <div className="border-border/80 bg-muted/20 space-y-1 rounded-[12px] border p-4">
                    <h4 className="text-foreground text-[13px] font-medium">
                      {row.candidate?.full_name || 'Candidate'} · {row.company}
                    </h4>
                    <p className="text-muted-foreground">
                      {row.role_title} · Status: {row.status.replaceAll('_', ' ')}
                    </p>
                    <p className="text-muted-foreground text-[11px]">
                      Planned Join: {row.planned_start_date || 'Not set'} · Joined:{' '}
                      {row.actual_join_date || 'Not recorded'}
                    </p>
                  </div>

                  <h3 className="text-muted-foreground pt-1 text-[13px] font-medium">
                    Monthly Employment Records ({row.months?.length || 0})
                  </h3>
                  <div className="space-y-2">
                    {row.months?.map((month) => (
                      <div
                        key={month.id}
                        className="border-border/70 bg-card space-y-1 rounded-[12px] border p-3"
                      >
                        <p className="text-foreground font-mono font-medium">
                          {month.covered_start} to {month.covered_end} · {month.status}
                        </p>
                        <p className="text-muted-foreground text-[11px]">
                          {month.agreed_amount !== null
                            ? `${month.currency} ${month.agreed_amount}`
                            : 'Partial month amount needs review'}
                        </p>
                        {month.notes && (
                          <p className="text-muted-foreground pt-1 text-[11px]">{month.notes}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </article>
              ))}
          </RecordSheet>
        </section>
      )}
    </main>
  );
}
