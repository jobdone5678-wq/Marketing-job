"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { WorkspaceSkeleton } from '@/components/workspace-ui';
import { Button } from '@/components/ui/button';
import { ChartAreaInteractive } from './chart-area-interactive';
import {
  Users,
  SendHorizontal,
  Inbox,
  RefreshCw,
  ArrowUpRight,
  Briefcase,
  TrendingUp,
  MailCheck,
} from 'lucide-react';

type Metrics = {
  candidates: number;
  submissions: number;
  confirmed: number;
  contractJobs: number;
  activity: { date: string; submissions: number }[];
};

export function DashboardOverview() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [updated, setUpdated] = useState<Date | null>(null);
  const generation = useRef(0);

  const load = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true);
    try {
      const response = await api<{ metrics: Metrics | null }>('/api/dashboard');
      if (current !== generation.current) return;
      if (!response.metrics) {
        throw new Error('Dashboard totals are unavailable. Please retry.');
      }
      setMetrics(response.metrics);
      setUpdated(new Date());
      setError('');
      // Sync candidate profile with extension
      try {
        const resumeRes = await api<{ candidate?: Record<string, unknown> | null }>('/api/jobseeker/resume');
        if (resumeRes?.candidate) {
          window.postMessage({
            type: 'NEXTKIN_CANDIDATE_CHANGED',
            candidate: resumeRes.candidate,
          }, '*');
          document.documentElement.setAttribute('data-nextkin-paired', 'true');
          document.documentElement.setAttribute('data-nextkin-candidate', JSON.stringify(resumeRes.candidate));
        }
      } catch {}
    } catch (e) {
      if (current === generation.current) setError((e as Error).message);
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) void load();
    });
    return () => {
      active = false;
      generation.current += 1;
    };
  }, [load]);

  const cards = metrics
    ? [
        {
          key: 'candidates',
          label: 'My candidate profiles',
          value: metrics.candidates,
          url: '/dashboard/candidates',
          icon: Users,
        },
        {
          key: 'submissions',
          label: 'My application records',
          value: metrics.submissions,
          url: '/dashboard/submissions',
          icon: SendHorizontal,
        },
        {
          key: 'confirmed',
          label: 'Email confirmed applications',
          value: metrics.confirmed,
          url: '/dashboard/email-confirmations',
          icon: Inbox,
        },
      ]
    : [];

  return (
    <main className="portal-page space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/40 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10.5px] font-semibold tracking-wide bg-primary/10 text-primary border border-primary/20 shadow-2xs">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              CANDIDATE
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Candidate workspace</h1>
          <p className="mt-1.5 text-xs sm:text-sm text-muted-foreground max-w-3xl leading-relaxed">
            Your saved profile, application records and email confirmations.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={() => void load()}
          className="h-8 gap-2 rounded-lg border-border/60 text-xs shadow-2xs hover:bg-accent/80 active:scale-95 transition-all cursor-pointer"
        >
          <RefreshCw className={loading ? 'size-3.5 animate-spin' : 'size-3.5'} />
          <span>Refresh</span>
        </Button>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-xs text-destructive space-y-2"
        >
          <p className="font-semibold">{error}</p>
          {metrics && (
            <p className="text-muted-foreground text-[11px]">
              Showing previously loaded data. Refresh to get the latest totals.
            </p>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => void load()}
            className="h-7 text-xs"
          >
            Try again
          </Button>
        </div>
      )}

      {loading && !metrics && !error && <WorkspaceSkeleton rows={5} />}

      {metrics && (
        <>
          <p role="status" className="text-[11px] text-muted-foreground font-medium">
            Saved records you can access ·{' '}
            {updated ? `Updated ${updated.toLocaleTimeString()}` : 'Previously loaded data'}. Application records
            include drafts; email confirmations track submission receipts.
          </p>

          <section aria-label="Key metrics" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {cards.map(item => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.key}
                  href={item.url}
                  className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-border/60 bg-gradient-to-b from-card to-card/70 p-5 shadow-2xs transition-all duration-200 hover:border-primary/40 hover:shadow-xs active:scale-[0.99] cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
                      {item.label}
                    </span>
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20 shadow-2xs group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-200">
                      <Icon className="size-4.5 stroke-[2]" />
                    </div>
                  </div>
                  <p className="mt-3 text-3xl font-bold tracking-tight tabular-nums text-foreground">
                    {item.value}
                  </p>
                  <div className="mt-3 flex items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-primary transition-colors">
                    <span>View records</span>
                    <ArrowUpRight className="size-3.5" />
                  </div>
                </Link>
              );
            })}
          </section>

          <ChartAreaInteractive data={metrics.activity} />

          {metrics.candidates === 0 && (
            <div className="rounded-xl border border-dashed border-border/80 bg-card p-6 text-center text-xs text-muted-foreground">
              No candidate profiles yet.{' '}
              <Link className="font-semibold text-primary underline" href="/dashboard/candidates/new">
                Upload a resume and review details
              </Link>
              .
            </div>
          )}

          <section className="rounded-xl border border-border/60 bg-card p-5 shadow-2xs space-y-3">
            <h2 className="text-sm font-semibold text-foreground tracking-tight">Continue in your workspace</h2>
            <div className="flex flex-wrap gap-2.5 text-xs">
              <Link
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/60 bg-muted/20 font-medium text-foreground hover:bg-accent/80 hover:border-border transition-colors shadow-2xs"
                href="/dashboard/jobs"
              >
                <Briefcase className="size-3.5 text-primary" />
                <span>Public Jobs</span>
                <ArrowUpRight className="size-3" />
              </Link>
              <Link
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/60 bg-muted/20 font-medium text-foreground hover:bg-accent/80 hover:border-border transition-colors shadow-2xs"
                href="/dashboard/placements"
              >
                <TrendingUp className="size-3.5 text-primary" />
                <span>My service fees & placement</span>
                <ArrowUpRight className="size-3" />
              </Link>
              <Link
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/60 bg-muted/20 font-medium text-foreground hover:bg-accent/80 hover:border-border transition-colors shadow-2xs"
                href="/dashboard/email-confirmations"
              >
                <MailCheck className="size-3.5 text-primary" />
                <span>Connect Gmail & review receipts</span>
                <ArrowUpRight className="size-3" />
              </Link>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Public Jobs uses your reviewed resume to find relevant roles. Fees, salary and commissions show saved
              records in their respective sections.
            </p>
          </section>
        </>
      )}
    </main>
  );
}
