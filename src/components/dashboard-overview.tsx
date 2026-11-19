'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { WorkspaceSkeleton } from '@/components/workspace-ui';
import { ChartAreaInteractive } from './chart-area-interactive';
import { CompanyLogo } from '@/components/company-logo';
import { VerifiedStamp } from '@/components/brand-mark';
import { ArrowRight, RefreshCw } from 'lucide-react';

type Metrics = {
  candidates: number;
  submissions: number;
  confirmed: number;
  contractJobs: number;
  activity: { date: string; submissions: number }[];
};

const STEPS = [
  {
    key: 'profile',
    title: 'Resume reviewed',
    note: 'Skills, work history and visa status anchored to your profile',
  },
  {
    key: 'discovery',
    title: 'Roles indexed',
    note: 'Direct feeds from Greenhouse, Ashby, Lever and SmartRecruiters',
  },
  {
    key: 'autofill',
    title: 'Application drafted',
    note: 'The extension fills employer forms from your reviewed facts',
  },
  {
    key: 'confirm',
    title: 'Receipt confirmed',
    note: 'Gmail sync captures the submission email the employer sends',
  },
] as const;

const COMPANIES = [
  { name: 'Stripe', domain: 'stripe.com' },
  { name: 'Figma', domain: 'figma.com' },
  { name: 'OpenAI', domain: 'openai.com' },
  { name: 'Ramp', domain: 'ramp.com' },
  { name: 'Datadog', domain: 'datadoghq.com' },
  { name: 'Snowflake', domain: 'snowflake.com' },
];

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

  const loggedInPeriod = metrics?.activity.reduce((sum, row) => sum + row.submissions, 0) ?? 0;
  const confirmedShare =
    metrics && metrics.submissions > 0
      ? Math.round((metrics.confirmed / metrics.submissions) * 100)
      : null;

  const stats = metrics
    ? [
        {
          key: 'candidates',
          label: 'Candidate profiles',
          value: metrics.candidates,
          note: metrics.candidates ? 'Reviewed and verified' : 'None reviewed yet',
          url: '/dashboard/candidates',
          stamped: metrics.candidates > 0,
        },
        {
          key: 'submissions',
          label: 'Applications tracked',
          value: metrics.submissions,
          note: metrics.submissions
            ? loggedInPeriod + ' logged in the last 30 days'
            : 'None logged yet',
          url: '/dashboard/submissions',
          stamped: false,
        },
        {
          key: 'confirmed',
          label: 'Confirmed receipts',
          value: metrics.confirmed,
          note:
            confirmedShare === null
              ? 'Waiting on your first application'
              : confirmedShare + '% of tracked applications',
          url: '/dashboard/email-confirmations',
          stamped: metrics.confirmed > 0,
        },
        {
          key: 'contractJobs',
          label: 'Open roles indexed',
          value: metrics.contractJobs,
          note: 'Live on connected ATS feeds',
          url: '/dashboard/jobs',
          stamped: false,
        },
      ]
    : [];

  const stepDone = metrics
    ? [
        metrics.candidates > 0,
        metrics.contractJobs > 0,
        metrics.submissions > 0,
        metrics.confirmed > 0,
      ]
    : [false, false, false, false];

  const pipeline = metrics
    ? [
        { label: 'Profiles reviewed', value: metrics.candidates, lead: false },
        { label: 'Applications tracked', value: metrics.submissions, lead: false },
        { label: 'Receipts confirmed', value: metrics.confirmed, lead: true },
      ]
    : [];
  const pipelineMax = Math.max(1, ...pipeline.map((row) => row.value));

  return (
    <main className="portal-page animate-fade-rise space-y-8">
      {/* Page heading */}
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-xl">
          <h1 className="text-foreground text-[22px] leading-7 font-medium tracking-tight">
            Candidate workspace
          </h1>
          <p className="text-muted-foreground mt-2 text-[13px] leading-5">
            Your reviewed resume, the roles you applied to, and the employer receipts that confirm
            them
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => void load()}
            className="border-border text-foreground hover:bg-accent disabled:text-muted-foreground flex h-9 items-center gap-2 rounded-[10px] border px-3 text-[13px] transition-colors disabled:cursor-not-allowed"
          >
            <RefreshCw
              aria-hidden="true"
              className={loading ? 'size-4 animate-spin stroke-[1.5]' : 'size-4 stroke-[1.5]'}
            />
            <span>{loading ? 'Refreshing' : 'Refresh'}</span>
          </button>
          <Link
            href="/dashboard/jobs"
            className="bg-primary text-primary-foreground hover:bg-primary/90 flex h-9 items-center gap-2 rounded-[10px] px-4 text-[13px] font-medium transition-colors"
          >
            <span>Browse jobs</span>
            <ArrowRight aria-hidden="true" className="size-4 stroke-[1.5]" />
          </Link>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/5 rounded-[14px] border p-4"
        >
          <p className="text-destructive text-[13px] font-medium">Could not refresh totals</p>
          <p className="text-muted-foreground mt-1 text-[13px] leading-5">{error}</p>
          {metrics && (
            <p className="text-muted-foreground mt-1 text-[13px] leading-5">
              The figures below are the last ones loaded
            </p>
          )}
          <button
            type="button"
            disabled={loading}
            onClick={() => void load()}
            className="border-border text-foreground hover:bg-accent mt-3 flex h-8 items-center rounded-[8px] border px-3 text-[13px] transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {loading && !metrics && !error && <WorkspaceSkeleton rows={4} />}

      {metrics && (
        <>
          {/* Record provenance */}
          <div className="border-border text-muted-foreground flex flex-wrap items-center justify-between gap-2 border-y py-3 text-[13px]">
            <span className="flex items-center gap-2">
              <VerifiedStamp className="size-4" />
              <span className="text-foreground">Records verified</span>
              <span aria-hidden="true">·</span>
              <span>
                {updated
                  ? 'Updated ' +
                    updated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : 'Previously loaded'}
              </span>
            </span>
            <span className="figure text-[11px]">{metrics.contractJobs} roles indexed</span>
          </div>

          {/* Totals */}
          <section
            aria-label="Totals"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
          >
            {stats.map((item) => (
              <Link
                key={item.key}
                href={item.url}
                className="panel hover:border-input flex flex-col gap-4 p-5 transition-colors"
              >
                <span className="text-muted-foreground text-[13px] leading-5">{item.label}</span>
                <span className="flex items-start gap-2">
                  <span className="figure text-foreground text-[32px] leading-8">{item.value}</span>
                  {item.stamped && <VerifiedStamp className="mt-1 size-4" />}
                </span>
                <span className="text-muted-foreground text-[13px] leading-5">{item.note}</span>
              </Link>
            ))}
          </section>

          {/* Lifecycle rail */}
          <section aria-labelledby="lifecycle-heading" className="panel p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="lifecycle-heading" className="text-foreground text-[15px] font-medium">
                How an application gets confirmed
              </h2>
              <span className="figure text-muted-foreground text-[11px]">
                {stepDone.filter(Boolean).length} of 4 reached
              </span>
            </div>

            <ol className="mt-5 grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((step, index) => (
                <li key={step.key} className="border-border relative pt-4 lg:border-t">
                  <span
                    aria-hidden="true"
                    className={
                      stepDone[index]
                        ? 'bg-primary absolute top-0 left-0 hidden h-px w-full lg:block'
                        : 'hidden'
                    }
                  />
                  <div className="flex items-center gap-2">
                    <span className="figure text-muted-foreground text-[11px]">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="text-foreground text-[13px] font-medium">{step.title}</span>
                    {stepDone[index] && <VerifiedStamp className="size-4" />}
                  </div>
                  <p className="text-muted-foreground mt-2 text-[13px] leading-5">{step.note}</p>
                </li>
              ))}
            </ol>
          </section>

          {/* Activity ledger and pipeline */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <ChartAreaInteractive data={metrics.activity} />
            </div>

            <section aria-labelledby="pipeline-heading" className="panel flex flex-col p-6">
              <h2 id="pipeline-heading" className="text-foreground text-[15px] font-medium">
                Where your records stand
              </h2>
              <p className="text-muted-foreground mt-1 text-[13px] leading-5">
                Everything saved to your workspace so far
              </p>

              <ul className="mt-6 flex flex-col gap-5">
                {pipeline.map((row) => (
                  <li key={row.label}>
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="text-foreground text-[13px]">{row.label}</span>
                      <span className="figure text-foreground text-[13px]">{row.value}</span>
                    </div>
                    <div className="well mt-2 h-1.5 w-full overflow-hidden rounded-full">
                      <div
                        className={
                          row.lead
                            ? 'bg-primary h-full rounded-full'
                            : 'bg-muted-foreground/35 h-full rounded-full'
                        }
                        style={{ width: Math.round((row.value / pipelineMax) * 100) + '%' }}
                      />
                    </div>
                  </li>
                ))}
              </ul>

              <p className="text-muted-foreground border-border mt-auto border-t pt-4 text-[13px] leading-5">
                {metrics.confirmed > 0
                  ? 'Confirmed receipts are the only records backed by an employer email'
                  : 'A receipt is confirmed once the employer sends its own email to your inbox'}
              </p>
            </section>
          </div>

          {/* Employers */}
          <section aria-labelledby="employers-heading" className="panel p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="employers-heading" className="text-foreground text-[15px] font-medium">
                Employers on your feeds
              </h2>
              <Link
                href="/dashboard/jobs"
                className="text-primary text-[13px] font-medium hover:underline"
              >
                Browse all
              </Link>
            </div>

            <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {COMPANIES.map((company) => (
                <li key={company.name}>
                  <Link
                    href={'/dashboard/jobs?company=' + encodeURIComponent(company.name)}
                    className="border-border hover:border-input hover:bg-accent/50 flex h-11 items-center gap-2.5 rounded-[12px] border px-3 transition-colors"
                  >
                    <CompanyLogo company={company.name} size="sm" />
                    <span className="text-foreground truncate text-[13px]">{company.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          {/* First-run prompt */}
          {metrics.candidates === 0 && (
            <section className="border-border flex flex-wrap items-center justify-between gap-4 rounded-[16px] border border-dashed p-6">
              <div>
                <p className="text-foreground text-[13px] font-medium">No resume reviewed yet</p>
                <p className="text-muted-foreground mt-1 text-[13px] leading-5">
                  Upload one and the workspace starts matching software roles against its verified
                  facts
                </p>
              </div>
              <Link
                href="/dashboard/candidates/new"
                className="bg-primary text-primary-foreground hover:bg-primary/90 flex h-9 shrink-0 items-center gap-2 rounded-[10px] px-4 text-[13px] font-medium transition-colors"
              >
                <span>Upload resume</span>
                <ArrowRight aria-hidden="true" className="size-4 stroke-[1.5]" />
              </Link>
            </section>
          )}
        </>
      )}
    </main>
  );
}
