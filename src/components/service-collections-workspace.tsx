"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import { RecordSheet, StatusLabel, formatMoney } from "@/components/operations-ui";
import { Search, Receipt, Calendar, CreditCard, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  new Date(Date.parse(s + "T00:00:00Z") - 86400000).toISOString().slice(0, 10);

export function ServiceCollectionsWorkspace() {
  const [rows, setRows] = useState<Enrollment[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [limited, setLimited] = useState(false);

  const fetchCollections = async () => {
    setLoading(true);
    try {
      const result = await api<{
        enrollments: Enrollment[];
        limited: boolean;
      }>("/api/service-collections");
      setRows(result.enrollments);
      setLimited(result.limited);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    api<{ enrollments: Enrollment[]; limited: boolean }>(
      "/api/service-collections"
    )
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
    <section className="space-y-5 animate-fade-rise" aria-label="Service collections">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/70 pb-3">
        <div>
          <h2 className="text-base font-bold text-foreground">
            Service Fees & Billing
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Track service joining dates, recurring monthly agreements, and reconciled invoices.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={fetchCollections}
          disabled={loading}
          className="gap-1.5 cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className={loading ? "size-3.5 animate-spin" : "size-3.5"} />
          <span>Refresh</span>
        </Button>
      </div>

      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}

      {/* Search Input */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
        <input
          className="w-full h-9 rounded-xl border border-input bg-background pl-9 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by candidate, date, or status…"
        />
      </div>

      {limited && (
        <p className="text-xs text-muted-foreground">
          Showing latest 500 service records. Comprehensive totals available in Dashboard.
        </p>
      )}

      {/* Bills Table */}
      <div className="overflow-x-auto rounded-2xl border border-border/80 bg-card shadow-xs">
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
                <td colSpan={7} className="h-28 text-center text-xs text-muted-foreground">
                  <RefreshCw className="size-4 animate-spin mx-auto mb-2 text-primary" />
                  Loading service billing records…
                </td>
              </tr>
            ) : bills.length === 0 ? (
              <tr>
                <td colSpan={7} className="h-28 text-center text-xs text-muted-foreground">
                  No service billing records match your search filter.
                </td>
              </tr>
            ) : (
              bills.map((b) => (
                <tr key={b.id} className="hover:bg-muted/30 transition-colors">
                  <td>
                    <span className="font-semibold text-foreground text-xs block">
                      {b.enrollment.candidate.full_name}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Joined {b.enrollment.joining_date}
                    </span>
                  </td>
                  <td className="text-xs font-mono">
                    {b.start_date} – {lastDay(b.end_date_exclusive)}
                  </td>
                  <td className="text-xs font-mono">{b.due_date}</td>
                  <td className="text-xs font-mono font-semibold">
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
                      className="cursor-pointer text-primary hover:underline text-xs"
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
      <details className="group border-t border-border/60 pt-3">
        <summary className="cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground select-none">
          Active Agreements ({rows.length})
        </summary>
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
          {rows.map((e) => (
            <article
              key={e.id}
              className="rounded-xl border border-border/70 bg-card p-3.5 shadow-2xs space-y-1 text-xs"
            >
              <p className="font-bold text-foreground">
                {e.candidate.full_name}
              </p>
              <p className="text-muted-foreground text-[11px]">
                Joined: {e.joining_date} · Ends: {e.end_date || "Ongoing"}
              </p>
              <p className="font-mono text-primary font-semibold">
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
            <div className="p-4 rounded-xl border border-border/80 bg-muted/20 space-y-1.5">
              <h4 className="font-bold text-sm text-foreground">
                {chosen.enrollment.candidate.full_name}
              </h4>
              <p className="text-muted-foreground">
                Period: {chosen.start_date} – {lastDay(chosen.end_date_exclusive)} · Due: {chosen.due_date}
              </p>
              <div className="flex gap-4 pt-1 font-mono">
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                  Paid: {formatMoney(chosen.received_amount, chosen.currency)}
                </span>
                <span className="text-muted-foreground">
                  Outstanding: {formatMoney(chosen.balance, chosen.currency)}
                </span>
              </div>
            </div>

            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground pt-2">
              Payment & Correction Receipts
            </h3>
            {chosen.receipts.length > 0 ? (
              <div className="space-y-2">
                {chosen.receipts.map((r) => (
                  <article
                    key={r.id}
                    className="p-3 rounded-xl border border-border/70 bg-card shadow-2xs space-y-1"
                  >
                    <div className="flex justify-between items-center font-mono">
                      <span className="font-bold text-foreground">
                        {formatMoney(r.amount, r.currency)}
                      </span>
                      <span className="text-muted-foreground text-[11px]">
                        {r.received_on}
                      </span>
                    </div>
                    <p className="text-muted-foreground text-[11px]">
                      Method: {r.method} · Ref: {r.external_reference || "None"}
                      {r.correction_of ? " · (Reversal)" : ""}
                      {r.reason ? ` · ${r.reason}` : ""}
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
