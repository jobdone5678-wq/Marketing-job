"use client";

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
      <div className="relative overflow-hidden rounded-3xl border border-border/80 bg-gradient-to-br from-card via-card to-primary/5 p-6 sm:p-7 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide bg-primary/10 text-primary border border-primary/20 shadow-2xs">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                CANDIDATE INTELLIGENCE HUB
              </span>
              <span className="text-xs text-muted-foreground font-medium">
                · Direct ATS Integration Active
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
              Candidate Workspace
            </h1>

            <p className="text-xs sm:text-sm text-muted-foreground max-w-2xl leading-relaxed">
              Find software and tech roles matching your confirmed resume, track application intents, and sync real-time email confirmation receipts.
            </p>
          </div>

          <div className="flex items-center gap-2.5 self-start sm:self-center">
            <Button
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => void load()}
              className="h-9 gap-2 rounded-xl border-border/70 text-xs font-semibold shadow-2xs hover:bg-accent hover:border-border active:scale-95 transition-all cursor-pointer"
            >
              <RefreshCw className={loading ? 'size-3.5 animate-spin' : 'size-3.5'} />
              <span>{loading ? 'Refreshing...' : 'Refresh Totals'}</span>
            </Button>

            <Link
              href="/dashboard/jobs"
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs hover:shadow transition-all cursor-pointer"
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
          className="rounded-2xl border border-destructive/30 bg-destructive/10 p-5 text-xs text-destructive space-y-2.5"
        >
          <div className="flex items-center gap-2 font-bold text-sm">
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
          <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
            <span className="flex items-center gap-1.5 font-medium">
              <ShieldCheck className="size-3.5 text-emerald-600" />
              <span>Records authenticated</span>
              <span className="text-muted-foreground/60">•</span>
              <span>{updated ? `Updated at ${updated.toLocaleTimeString()}` : 'Previously loaded data'}</span>
            </span>
            <span className="text-[11px] font-mono">
              Software Jobs: {metrics.contractJobs} indexed
            </span>
          </div>

          {/* Metric KPI Cards (4-column grid) */}
          <section
            aria-label="Key metrics"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
          >
            {cards.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.key}
                  href={item.url}
                  className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-b from-card to-card/75 p-5 shadow-xs transition-all duration-300 hover:border-primary/45 hover:shadow-md hover:-translate-y-1 active:scale-[0.99] cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        {item.label}
                      </span>
                      <p className="text-[11px] text-muted-foreground/80 mt-0.5 line-clamp-1">
                        {item.subtext}
                      </p>
                    </div>
                    <div
                      className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${item.bg} ${item.color} border shadow-2xs group-hover:scale-110 transition-transform duration-200`}
                    >
                      <Icon className="size-5 stroke-[2]" />
                    </div>
                  </div>

                  <div className="mt-4 flex items-baseline justify-between">
                    <p className="text-3xl font-extrabold tracking-tight tabular-nums text-foreground">
                      {item.value}
                    </p>
                    <div className="flex items-center gap-1 text-xs font-semibold text-muted-foreground group-hover:text-primary transition-colors">
                      <span>View</span>
                      <ArrowUpRight className="size-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </section>

          {/* Application Pipeline Stepper */}
          <section className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border/60">
              <div className="flex items-center gap-2">
                <div className="size-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold">
                  <Zap className="size-3.5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-foreground">
                    Candidate Application Lifecycle
                  </h2>
                  <p className="text-[11px] text-muted-foreground">
                    End-to-end flow from resume verification to receipt confirmation
                  </p>
                </div>
              </div>
              <span className="text-xs font-semibold text-primary">Stage 1 to 4</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                    Step 1 · Profile
                  </span>
                  <CheckCircle2 className="size-3.5 text-emerald-600" />
                </div>
                <h3 className="text-xs font-bold text-foreground">Resume Fact Review</h3>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Verified skills, work history, and visa status anchored to your profile.
                </p>
              </div>

              <div className="rounded-xl border border-primary/25 bg-primary/5 p-3.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                    Step 2 · Discovery
                  </span>
                  <Sparkles className="size-3.5 text-primary" />
                </div>
                <h3 className="text-xs font-bold text-foreground">Public ATS Search</h3>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Direct feeds from Greenhouse, Ashby, Lever, and SmartRecruiters.
                </p>
              </div>

              <div className="rounded-xl border border-border/70 bg-muted/20 p-3.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Step 3 · Autofill
                  </span>
                  <FileCheck2 className="size-3.5 text-muted-foreground" />
                </div>
                <h3 className="text-xs font-bold text-foreground">Autofill & Draft</h3>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Candidate extension fills employer ATS forms without hallucinations.
                </p>
              </div>

              <div className="rounded-xl border border-border/70 bg-muted/20 p-3.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Step 4 · Confirm
                  </span>
                  <Inbox className="size-3.5 text-muted-foreground" />
                </div>
                <h3 className="text-xs font-bold text-foreground">Receipt Ingestion</h3>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Gmail sync captures official employer submission confirmations.
                </p>
              </div>
            </div>
          </section>

          {/* Interactive Activity Chart */}
          <ChartAreaInteractive data={metrics.activity} />

          {/* Top Companies Hiring Spotlight Ribbon */}
          <section className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-foreground">
                  Companies In Your Network
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Direct job openings indexed from top tech employers
                </p>
              </div>
              <Link
                href="/dashboard/jobs"
                className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
              >
                <span>Browse all</span>
                <ChevronRight className="size-3.5" />
              </Link>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
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
                  className="flex items-center gap-2.5 p-2.5 rounded-xl border border-border/60 bg-muted/15 hover:bg-muted/40 hover:border-primary/40 transition-all group cursor-pointer"
                >
                  <CompanyLogo company={co.name} size="sm" />
                  <span className="text-xs font-bold text-foreground group-hover:text-primary transition-colors truncate">
                    {co.name}
                  </span>
                </Link>
              ))}
            </div>
          </section>

          {/* Zero state prompt */}
          {metrics.candidates === 0 && (
            <div className="rounded-2xl border border-dashed border-border/80 bg-card p-8 text-center text-xs text-muted-foreground space-y-2">
              <p className="font-semibold text-foreground text-sm">No candidate profiles reviewed yet</p>
              <p>Upload a resume to automatically match software engineering & tech roles.</p>
              <div className="pt-2">
                <Link
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-semibold text-xs shadow-xs hover:bg-primary/90"
                  href="/dashboard/candidates/new"
                >
                  <span>Upload & Review Resume</span>
                  <ArrowUpRight className="size-3.5" />
                </Link>
              </div>
            </div>
          )}

          {/* Quick Actions Footer Hub */}
          <section className="rounded-2xl border border-border/70 bg-card p-5 sm:p-6 shadow-xs space-y-3">
            <h2 className="text-sm font-bold text-foreground tracking-tight">
              Direct Workspace Hub
            </h2>
            <div className="flex flex-wrap gap-2.5 text-xs">
              <Link
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-border/70 bg-muted/20 font-semibold text-foreground hover:bg-accent/80 hover:border-primary/40 transition-all shadow-2xs"
                href="/dashboard/jobs"
              >
                <Briefcase className="size-3.5 text-primary" />
                <span>Search Public Jobs</span>
                <ArrowUpRight className="size-3 text-muted-foreground" />
              </Link>
              <Link
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-border/70 bg-muted/20 font-semibold text-foreground hover:bg-accent/80 hover:border-primary/40 transition-all shadow-2xs"
                href="/dashboard/candidates"
              >
                <Users className="size-3.5 text-primary" />
                <span>My Resume Profile</span>
                <ArrowUpRight className="size-3 text-muted-foreground" />
              </Link>
              <Link
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-border/70 bg-muted/20 font-semibold text-foreground hover:bg-accent/80 hover:border-primary/40 transition-all shadow-2xs"
                href="/dashboard/email-confirmations"
              >
                <MailCheck className="size-3.5 text-primary" />
                <span>Connect Gmail Receipts</span>
                <ArrowUpRight className="size-3 text-muted-foreground" />
              </Link>
              <Link
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-border/70 bg-muted/20 font-semibold text-foreground hover:bg-accent/80 hover:border-primary/40 transition-all shadow-2xs"
                href="/dashboard/submissions"
              >
                <SendHorizontal className="size-3.5 text-primary" />
                <span>Tracked Applications</span>
                <ArrowUpRight className="size-3 text-muted-foreground" />
              </Link>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
