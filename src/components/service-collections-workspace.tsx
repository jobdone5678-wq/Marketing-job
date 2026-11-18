'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import { RecordSheet, StatusLabel, formatMoney } from '@/components/operations-ui';
import { Search, Receipt, Calendar, CreditCard, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Receipt = {
  id: string;
  amount: number;
  currency: string;
  received_on: string;
  method: string;
  external_reference: string | null;
  correction_of: string | null;
  reason: string | null;
};

type Bill = {
  id: string;
  start_date: string;
  end_date_exclusive: string;
  due_date: string;
  amount: number;
  currency: string;
  received_amount: number;
  balance: number;
  status: string;
  receipts: Receipt[];
};

type Enrollment = {
  id: string;
  candidate: { id: string; full_name: string };
  joining_date: string;
  end_date: string | null;
  monthly_fee: number;
  currency: string;
  bills: Bill[];
};

const lastDay = (s: string) =>
  new Date(Date.parse(s + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);

export function ServiceCollectionsWorkspace() {
  const [rows, setRows] = useState<Enrollment[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [limited, setLimited] = useState(false);

  const fetchCollections = async () => {
    setLoading(true);
    try {
      const result = await api<{
        enrollments: Enrollment[];
        limited: boolean;
      }>('/api/service-collections');
      setRows(result.enrollments);
      setLimited(result.limited);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    api<{ enrollments: Enrollment[]; limited: boolean }>('/api/service-collections')
      .then((result) => {
        if (active) {
          setRows(result.enrollments);
          setLimited(result.limited);
        }
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const bills = rows
    .flatMap((e) => e.bills.map((b) => ({ ...b, enrollment: e })))
    .filter((b) =>
      `${b.enrollment.candidate.full_name} ${b.start_date} ${b.currency} ${b.status}`
        .toLowerCase()
        .includes(search.toLowerCase())
    );

  const chosen = bills.find((b) => b.id === selected);

  return (
    <section className="animate-fade-rise space-y-5" aria-label="Service collections">
      <div className="border-border/70 flex flex-col justify-between gap-3 border-b pb-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-foreground text-base font-bold">Service Fees & Billing</h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Track service joining dates, recurring monthly agreements, and reconciled invoices.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={fetchCollections}
          disabled={loading}
          className="cursor-pointer gap-1.5 self-start sm:self-auto"
        >
          <RefreshCw className={loading ? 'size-3.5 animate-spin' : 'size-3.5'} />
          <span>Refresh</span>
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}

      {/* Search Input */}
      <div className="relative max-w-sm">
        <Search className="text-muted-foreground absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
        <input
          className="border-input bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-ring h-9 w-full rounded-xl border pr-3 pl-9 text-xs focus-visible:ring-2 focus-visible:outline-none"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by candidate, date, or status…"
        />
      </div>

      {limited && (
        <p className="text-muted-foreground text-xs">
          Showing latest 500 service records. Comprehensive totals available in Dashboard.
        </p>
      )}

      {/* Bills Table */}
      <div className="border-border/80 bg-card overflow-x-auto rounded-2xl border shadow-xs">
        <table className="ops-table">
          <thead>
            <tr>
              <th>Candidate / Service Joined</th>
              <th>Service Period</th>
              <th>Due Date</th>
              <th>Fee</th>
              <th>Received / Balance</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="text-muted-foreground h-28 text-center text-xs">
                  <RefreshCw className="text-primary mx-auto mb-2 size-4 animate-spin" />
                  Loading service billing records…
                </td>
              </tr>
            ) : bills.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-muted-foreground h-28 text-center text-xs">
                  No service billing records match your search filter.
                </td>
              </tr>
            ) : (
              bills.map((b) => (
                <tr key={b.id} className="hover:bg-muted/30 transition-colors">
                  <td>
                    <span className="text-foreground block text-xs font-semibold">
                      {b.enrollment.candidate.full_name}
                    </span>
                    <span className="text-muted-foreground text-[11px]">
                      Joined {b.enrollment.joining_date}
                    </span>
                  </td>
                  <td className="font-mono text-xs">
                    {b.start_date} – {lastDay(b.end_date_exclusive)}
                  </td>
                  <td className="font-mono text-xs">{b.due_date}</td>
                  <td className="font-mono text-xs font-semibold">
                    {formatMoney(b.amount, b.currency)}
                  </td>
                  <td className="text-xs">
                    <p className="font-medium text-emerald-600 dark:text-emerald-400">
                      Rec: {formatMoney(b.received_amount, b.currency)}
                    </p>
                    <p className="text-muted-foreground text-[11px]">
                      Bal: {formatMoney(b.balance, b.currency)}
                    </p>
                  </td>
                  <td>
                    <StatusLabel value={b.status} />
                  </td>
                  <td>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setSelected(b.id)}
                      className="text-primary cursor-pointer text-xs hover:underline"
                    >
                      View Invoice
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Details Accordion */}
      <details className="group border-border/60 border-t pt-3">
        <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-xs font-semibold select-none">
          Active Agreements ({rows.length})
        </summary>
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
          {rows.map((e) => (
            <article
              key={e.id}
              className="border-border/70 bg-card space-y-1 rounded-xl border p-3.5 text-xs shadow-2xs"
            >
              <p className="text-foreground font-bold">{e.candidate.full_name}</p>
              <p className="text-muted-foreground text-[11px]">
                Joined: {e.joining_date} · Ends: {e.end_date || 'Ongoing'}
              </p>
              <p className="text-primary font-mono font-semibold">
                {formatMoney(e.monthly_fee, e.currency)} / month
              </p>
            </article>
          ))}
        </div>
      </details>

      <RecordSheet
        title="Service Bill & Payment History"
        open={!!chosen}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        {chosen && (
          <div className="space-y-4 text-xs">
            <div className="border-border/80 bg-muted/20 space-y-1.5 rounded-xl border p-4">
              <h4 className="text-foreground text-sm font-bold">
                {chosen.enrollment.candidate.full_name}
              </h4>
              <p className="text-muted-foreground">
                Period: {chosen.start_date} – {lastDay(chosen.end_date_exclusive)} · Due:{' '}
                {chosen.due_date}
              </p>
              <div className="flex gap-4 pt-1 font-mono">
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  Paid: {formatMoney(chosen.received_amount, chosen.currency)}
                </span>
                <span className="text-muted-foreground">
                  Outstanding: {formatMoney(chosen.balance, chosen.currency)}
                </span>
              </div>
            </div>

            <h3 className="text-muted-foreground pt-2 text-xs font-bold tracking-wider uppercase">
              Payment & Correction Receipts
            </h3>
            {chosen.receipts.length > 0 ? (
              <div className="space-y-2">
                {chosen.receipts.map((r) => (
                  <article
                    key={r.id}
                    className="border-border/70 bg-card space-y-1 rounded-xl border p-3 shadow-2xs"
                  >
                    <div className="flex items-center justify-between font-mono">
                      <span className="text-foreground font-bold">
                        {formatMoney(r.amount, r.currency)}
                      </span>
                      <span className="text-muted-foreground text-[11px]">{r.received_on}</span>
                    </div>
                    <p className="text-muted-foreground text-[11px]">
                      Method: {r.method} · Ref: {r.external_reference || 'None'}
                      {r.correction_of ? ' · (Reversal)' : ''}
                      {r.reason ? ` · ${r.reason}` : ''}
                    </p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">No individual payment receipts recorded.</p>
            )}
          </div>
        )}
      </RecordSheet>
    </section>
  );
}
