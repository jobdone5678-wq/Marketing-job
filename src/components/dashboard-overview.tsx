'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { WorkspaceSkeleton } from '@/components/workspace-ui';
import { Button } from '@/components/ui/button';
import { ChartAreaInteractive } from './chart-area-interactive';
import { CompanyLogo } from '@/components/company-logo';
import {
  Users,
  SendHorizontal,
  Inbox,
  RefreshCw,
  ArrowUpRight,
  Briefcase,
  TrendingUp,
  MailCheck,
  Sparkles,
  Compass,
  FileCheck2,
  CheckCircle2,
  ChevronRight,
  ShieldCheck,
  Zap,
} from 'lucide-react';

type Metrics = {
  candidates: number;
  submissions: number;
  confirmed: number;
  contractJobs: number;
  activity: { date: string; submissions: number }[];
};

export function DashboardOverview({ initialMetrics }: { initialMetrics?: Metrics | null }) {
  const [metrics, setMetrics] = useState<Metrics | null>(initialMetrics || null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(!initialMetrics);
  const [updated, setUpdated] = useState<Date | null>(initialMetrics ? new Date() : null);
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
        const resumeRes = await api<{ candidate?: Record<string, unknown> | null }>(
          '/api/jobseeker/resume'
        );
        if (resumeRes?.candidate) {
          window.postMessage(
            {
              type: 'NEXTKIN_CANDIDATE_CHANGED',
              candidate: resumeRes.candidate,
            },
            '*'
          );
          document.documentElement.setAttribute('data-nextkin-paired', 'true');
          document.documentElement.setAttribute(
            'data-nextkin-candidate',
            JSON.stringify(resumeRes.candidate)
          );
        }
      } catch {}
    } catch (e) {
      if (current === generation.current) setError((e as Error).message);
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialMetrics) {
      void load();
    }
  }, [load, initialMetrics]);

  const cards = metrics
    ? [
        {
          key: 'candidates',
          label: 'Candidate Profiles',
          subtext: 'Reviewed factual profiles',
          value: metrics.candidates,
          url: '/dashboard/candidates',
          icon: Users,
          color: 'text-blue-600 dark:text-blue-400',
          bg: 'bg-blue-500/10 border-blue-500/20',
          gradient: 'from-blue-500/10 to-transparent',
        },
        {
          key: 'submissions',
          label: 'Application Records',
          subtext: 'Tracked & drafted applications',
          value: metrics.submissions,
          url: '/dashboard/submissions',
          icon: SendHorizontal,
          color: 'text-violet-600 dark:text-violet-400',
          bg: 'bg-violet-500/10 border-violet-500/20',
          gradient: 'from-violet-500/10 to-transparent',
        },
        {
          key: 'confirmed',
          label: 'Confirmed Receipts',
          subtext: 'Verified Gmail confirmations',
          value: metrics.confirmed,
          url: '/dashboard/email-confirmations',
          icon: Inbox,
          color: 'text-emerald-600 dark:text-emerald-400',
          bg: 'bg-emerald-500/10 border-emerald-500/20',
          gradient: 'from-emerald-500/10 to-transparent',
        },
        {
          key: 'contractJobs',
          label: 'Tech & Contract Jobs',
          subtext: 'Verified live portal roles',
          value: metrics.contractJobs,
          url: '/dashboard/jobs',
          icon: Briefcase,
          color: 'text-amber-600 dark:text-amber-400',
          bg: 'bg-amber-500/10 border-amber-500/20',
          gradient: 'from-amber-500/10 to-transparent',
        },
      ]
    : [];

  return (
    <main className="portal-page space-y-6">
      {/* Top Hero Banner */}
      <div className="border-border/80 from-card via-card to-primary/5 relative overflow-hidden rounded-3xl border bg-gradient-to-br p-6 shadow-xs sm:p-7">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="bg-primary/10 text-primary border-primary/20 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold tracking-wide shadow-2xs">
                <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                CANDIDATE INTELLIGENCE HUB
              </span>
              <span className="text-muted-foreground text-xs font-medium">
                · Direct ATS Integration Active
              </span>
            </div>

            <h1 className="text-foreground text-2xl font-extrabold tracking-tight sm:text-3xl">
              Candidate Workspace
            </h1>

            <p className="text-muted-foreground max-w-2xl text-xs leading-relaxed sm:text-sm">
              Find software and tech roles matching your confirmed resume, track application
              intents, and sync real-time email confirmation receipts.
            </p>
          </div>

          <div className="flex items-center gap-2.5 self-start sm:self-center">
            <Button
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => void load()}
              className="border-border/70 hover:bg-accent hover:border-border h-9 cursor-pointer gap-2 rounded-xl text-xs font-semibold shadow-2xs transition-all active:scale-95"
            >
              <RefreshCw className={loading ? 'size-3.5 animate-spin' : 'size-3.5'} />
              <span>{loading ? 'Refreshing...' : 'Refresh Totals'}</span>
            </Button>

            <Link
              href="/dashboard/jobs"
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl px-4 text-xs font-bold shadow-xs transition-all hover:shadow"
            >
              <Compass className="size-3.5" />
              <span>Explore Tech Jobs</span>
            </Link>
          </div>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/10 text-destructive space-y-2.5 rounded-2xl border p-5 text-xs"
        >
          <div className="flex items-center gap-2 text-sm font-bold">
            <span>Unable to refresh some metrics</span>
          </div>
          <p className="font-medium">{error}</p>
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
            className="h-8 text-xs font-semibold"
          >
            Try again
          </Button>
        </div>
      )}

      {loading && !metrics && !error && <WorkspaceSkeleton rows={5} />}

      {metrics && (
        <>
          {/* Status bar */}
          <div className="text-muted-foreground flex items-center justify-between px-1 text-xs">
            <span className="flex items-center gap-1.5 font-medium">
              <ShieldCheck className="size-3.5 text-emerald-600" />
              <span>Records authenticated</span>
              <span className="text-muted-foreground/60">•</span>
              <span>
                {updated ? `Updated at ${updated.toLocaleTimeString()}` : 'Previously loaded data'}
              </span>
            </span>
            <span className="font-mono text-[11px]">
              Software Jobs: {metrics.contractJobs} indexed
            </span>
          </div>

          {/* Metric KPI Cards (4-column grid) */}
          <section
            aria-label="Key metrics"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            {cards.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.key}
                  href={item.url}
                  className="group border-border/70 from-card to-card/75 hover:border-primary/45 relative flex cursor-pointer flex-col justify-between overflow-hidden rounded-2xl border bg-gradient-to-b p-5 shadow-xs transition-all duration-300 hover:-translate-y-1 hover:shadow-md active:scale-[0.99]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="text-muted-foreground text-xs font-bold tracking-wider uppercase">
                        {item.label}
                      </span>
                      <p className="text-muted-foreground/80 mt-0.5 line-clamp-1 text-[11px]">
                        {item.subtext}
                      </p>
                    </div>
                    <div
                      className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${item.bg} ${item.color} border shadow-2xs transition-transform duration-200 group-hover:scale-110`}
                    >
                      <Icon className="size-5 stroke-[2]" />
                    </div>
                  </div>

                  <div className="mt-4 flex items-baseline justify-between">
                    <p className="text-foreground text-3xl font-extrabold tracking-tight tabular-nums">
                      {item.value}
                    </p>
                    <div className="text-muted-foreground group-hover:text-primary flex items-center gap-1 text-xs font-semibold transition-colors">
                      <span>View</span>
                      <ArrowUpRight className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </section>

          {/* Application Pipeline Stepper */}
          <section className="border-border/70 bg-card space-y-4 rounded-2xl border p-5 shadow-xs sm:p-6">
            <div className="border-border/60 flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <div className="bg-primary/10 text-primary flex size-7 items-center justify-center rounded-lg font-bold">
                  <Zap className="size-3.5" />
                </div>
                <div>
                  <h2 className="text-foreground text-sm font-bold">
                    Candidate Application Lifecycle
                  </h2>
                  <p className="text-muted-foreground text-[11px]">
                    End-to-end flow from resume verification to receipt confirmation
                  </p>
                </div>
              </div>
              <span className="text-primary text-xs font-semibold">Stage 1 to 4</span>
            </div>

            <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold tracking-wider text-emerald-700 uppercase dark:text-emerald-300">
                    Step 1 · Profile
                  </span>
                  <CheckCircle2 className="size-3.5 text-emerald-600" />
                </div>
                <h3 className="text-foreground text-xs font-bold">Resume Fact Review</h3>
                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  Verified skills, work history, and visa status anchored to your profile.
                </p>
              </div>

              <div className="border-primary/25 bg-primary/5 space-y-1.5 rounded-xl border p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-primary text-[10px] font-bold tracking-wider uppercase">
                    Step 2 · Discovery
                  </span>
                  <Sparkles className="text-primary size-3.5" />
                </div>
                <h3 className="text-foreground text-xs font-bold">Public ATS Search</h3>
                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  Direct feeds from Greenhouse, Ashby, Lever, and SmartRecruiters.
                </p>
              </div>

              <div className="border-border/70 bg-muted/20 space-y-1.5 rounded-xl border p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-[10px] font-bold tracking-wider uppercase">
                    Step 3 · Autofill
                  </span>
                  <FileCheck2 className="text-muted-foreground size-3.5" />
                </div>
                <h3 className="text-foreground text-xs font-bold">Autofill & Draft</h3>
                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  Candidate extension fills employer ATS forms without hallucinations.
                </p>
              </div>

              <div className="border-border/70 bg-muted/20 space-y-1.5 rounded-xl border p-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-[10px] font-bold tracking-wider uppercase">
                    Step 4 · Confirm
                  </span>
                  <Inbox className="text-muted-foreground size-3.5" />
                </div>
                <h3 className="text-foreground text-xs font-bold">Receipt Ingestion</h3>
                <p className="text-muted-foreground text-[11px] leading-relaxed">
                  Gmail sync captures official employer submission confirmations.
                </p>
              </div>
            </div>
          </section>

          {/* Interactive Activity Chart */}
          <ChartAreaInteractive data={metrics.activity} />

          {/* Top Companies Hiring Spotlight Ribbon */}
          <section className="border-border/70 bg-card space-y-4 rounded-2xl border p-5 shadow-xs sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-foreground text-sm font-bold">Companies In Your Network</h2>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  Direct job openings indexed from top tech employers
                </p>
              </div>
              <Link
                href="/dashboard/jobs"
                className="text-primary flex items-center gap-1 text-xs font-semibold hover:underline"
              >
                <span>Browse all</span>
                <ChevronRight className="size-3.5" />
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6">
              {[
                { name: 'Stripe', domain: 'stripe.com' },
                { name: 'Figma', domain: 'figma.com' },
                { name: 'OpenAI', domain: 'openai.com' },
                { name: 'Ramp', domain: 'ramp.com' },
                { name: 'Datadog', domain: 'datadoghq.com' },
                { name: 'Snowflake', domain: 'snowflake.com' },
              ].map((co) => (
                <Link
                  key={co.name}
                  href={`/dashboard/jobs?company=${encodeURIComponent(co.name)}`}
                  className="border-border/60 bg-muted/15 hover:bg-muted/40 hover:border-primary/40 group flex cursor-pointer items-center gap-2.5 rounded-xl border p-2.5 transition-all"
                >
                  <CompanyLogo company={co.name} size="sm" />
                  <span className="text-foreground group-hover:text-primary truncate text-xs font-bold transition-colors">
                    {co.name}
                  </span>
                </Link>
              ))}
            </div>
          </section>

          {/* Zero state prompt */}
          {metrics.candidates === 0 && (
            <div className="border-border/80 bg-card text-muted-foreground space-y-2 rounded-2xl border border-dashed p-8 text-center text-xs">
              <p className="text-foreground text-sm font-semibold">
                No candidate profiles reviewed yet
              </p>
              <p>Upload a resume to automatically match software engineering & tech roles.</p>
              <div className="pt-2">
                <Link
                  className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold shadow-xs"
                  href="/dashboard/candidates/new"
                >
                  <span>Upload & Review Resume</span>
                  <ArrowUpRight className="size-3.5" />
                </Link>
              </div>
            </div>
          )}

          {/* Quick Actions Footer Hub */}
          <section className="border-border/70 bg-card space-y-3 rounded-2xl border p-5 shadow-xs sm:p-6">
            <h2 className="text-foreground text-sm font-bold tracking-tight">
              Direct Workspace Hub
            </h2>
            <div className="flex flex-wrap gap-2.5 text-xs">
              <Link
                className="border-border/70 bg-muted/20 text-foreground hover:bg-accent/80 hover:border-primary/40 inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 font-semibold shadow-2xs transition-all"
                href="/dashboard/jobs"
              >
                <Briefcase className="text-primary size-3.5" />
                <span>Search Public Jobs</span>
                <ArrowUpRight className="text-muted-foreground size-3" />
              </Link>
              <Link
                className="border-border/70 bg-muted/20 text-foreground hover:bg-accent/80 hover:border-primary/40 inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 font-semibold shadow-2xs transition-all"
                href="/dashboard/candidates"
              >
                <Users className="text-primary size-3.5" />
                <span>My Resume Profile</span>
                <ArrowUpRight className="text-muted-foreground size-3" />
              </Link>
              <Link
                className="border-border/70 bg-muted/20 text-foreground hover:bg-accent/80 hover:border-primary/40 inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 font-semibold shadow-2xs transition-all"
                href="/dashboard/email-confirmations"
              >
                <MailCheck className="text-primary size-3.5" />
                <span>Connect Gmail Receipts</span>
                <ArrowUpRight className="text-muted-foreground size-3" />
              </Link>
              <Link
                className="border-border/70 bg-muted/20 text-foreground hover:bg-accent/80 hover:border-primary/40 inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 font-semibold shadow-2xs transition-all"
                href="/dashboard/submissions"
              >
                <SendHorizontal className="text-primary size-3.5" />
                <span>Tracked Applications</span>
                <ArrowUpRight className="text-muted-foreground size-3" />
              </Link>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
