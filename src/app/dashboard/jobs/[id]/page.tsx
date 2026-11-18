'use client';

import Link from 'next/link';
import { use, useEffect, useMemo, useState } from 'react';
import { WorkspaceError, WorkspaceSkeleton } from '@/components/workspace-ui';
import { JobDates } from '@/components/job-dates';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SkillMatcherDialog } from '@/components/skill-matcher-dialog';
import { CompanyLogo } from '@/components/company-logo';
import { SkillBadge } from '@/components/skill-badge';
import { getCandidates } from '@/lib/candidates';
import type { Candidate } from '@/types/database';
import type { StoredJob } from '@/lib/jobs/types';
import { applicationLaunchUrl } from '@/lib/jobs/application-state';
import { useUserProfile } from '@/hooks/use-user-profile';
import {
  extractCompleteJobDetails,
  analyzeCandidateFit,
  type StructuredJobDetails,
} from '@/lib/jobs/skills-extractor';
import { sanitizeJobHtml } from '@/lib/html-sanitizer';
import {
  ArrowLeft,
  MapPin,
  Building2,
  Briefcase,
  Globe,
  Sparkles,
  Send,
  FileCheck,
  CheckCircle2,
  AlertCircle,
  Layers,
  Target,
  Star,
  ChevronDown,
  Info,
  Check,
  Copy,
  ExternalLink,
  ShieldCheck,
  UserCheck,
  FileText,
  Clock,
  Flame,
} from 'lucide-react';

export default function JobDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ candidateId?: string }>;
}) {
  const { id } = use(params);
  const requestedCandidate = use(searchParams).candidateId || '';
  const { isCandidate } = useUserProfile();
  const canRecruit = false;

  const [job, setJob] = useState<StoredJob | null>(null);
  const [error, setError] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [candidateId, setCandidate] = useState(requestedCandidate);
  const [matcher, setMatcher] = useState(false);
  const [notice, setNotice] = useState('');
  const [packet, setPacket] = useState<unknown>(null);
  const [rawExpanded, setRawExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'fit' | 'company'>('overview');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    void api<{ job: StoredJob }>(`/api/jobs/${id}`)
      .then((r) => setJob(r.job))
      .catch((e) => setError(e.message));
    void getCandidates()
      .then((items) =>
        setCandidates(items.filter((candidate) => candidate.provenance_status === 'confirmed'))
      )
      .catch((e) => setError(e.message));
  }, [id]);

  const activeCandidate = useMemo(() => {
    return candidates.find((c) => c.id === candidateId);
  }, [candidates, candidateId]);

  // Complete structured extraction
  const structured: StructuredJobDetails | null = useMemo(() => {
    if (!job?.description) return null;
    return extractCompleteJobDetails(job.description, job.title);
  }, [job]);

  const fitAnalysis = useMemo(() => {
    if (!job?.description || !activeCandidate) return null;
    return analyzeCandidateFit(activeCandidate, job.description, job.title);
  }, [job, activeCandidate]);

  // Group extracted skills by category
  const skillsByCategory = useMemo(() => {
    if (!structured?.skills) return [];
    const grouped = new Map<string, typeof structured.skills>();
    for (const skill of structured.skills) {
      if (!grouped.has(skill.category)) {
        grouped.set(skill.category, []);
      }
      grouped.get(skill.category)!.push(skill);
    }
    return Array.from(grouped.entries());
  }, [structured]);

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  async function apply() {
    const applicant = candidates.find((candidate) => candidate.id === candidateId) ?? candidates[0];
    if (!job || !applicant) return;
    const tab = window.open('about:blank', '_blank');
    try {
      if (tab) tab.opener = null;
      const r = await api<{ intent: { id: string; job: { application_url: string } } }>(
        '/api/application-intents',
        {
          method: 'POST',
          body: JSON.stringify({ candidateId: applicant.id, jobId: id }),
        }
      );
      if (tab) tab.location.href = applicationLaunchUrl(r.intent.job.application_url, r.intent.id);
      else setNotice('Application linked and started as a draft.');
      setNotice(
        'Application started as a Draft. The extension or email receipt will update its status.'
      );
    } catch (e) {
      tab?.close();
      setError((e as Error).message);
    }
  }

  async function draft() {
    try {
      const r = await api<{ tasks: { taskId: string }[] }>('/api/packets', {
        method: 'POST',
        body: JSON.stringify({ candidateId, jobIds: [id], allowOtherEmployment: true }),
      });
      setNotice('Packet queued. Waiting for the worker...');
      const taskId = r.tasks[0].taskId;
      let attempts = 0;
      async function poll() {
        if (attempts++ > 150) return;
        const t = await api<{ task: { status: string; error: string | null } }>(
          `/api/tasks/${taskId}`
        );
        if (t.task.status === 'failed') {
          setError(t.task.error || 'Packet failed');
          return;
        }
        if (t.task.status === 'succeeded') {
          setPacket(await api(`/api/packets?candidateId=${candidateId}`));
          setNotice('Factual packet saved with a Draft submission.');
          return;
        }
        setTimeout(() => void poll().catch((e) => setError(e.message)), 2000);
      }
      void poll().catch((e) => setError(e.message));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (error) {
    return (
      <main className="portal-page mx-auto max-w-5xl space-y-4">
        <Link
          href="/dashboard/jobs"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs font-semibold"
        >
          <ArrowLeft className="size-3.5" />
          Back to public jobs
        </Link>
        <WorkspaceError message={error} />
      </main>
    );
  }

  if (!job) {
    return (
      <main className="portal-page mx-auto max-w-5xl space-y-4">
        <WorkspaceSkeleton />
      </main>
    );
  }

  return (
    <main className="portal-page mx-auto w-full max-w-6xl space-y-6 pb-16">
      <script
        id="nextkin-job-details"
        type="application/json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            title: job.title,
            company: job.company,
            applicationUrl: job.application_url,
            location: job.location,
            department: job.department,
            description: job.description,
            descriptionHtml: job.description_html,
            employmentType: job.employment_type,
            compensation: job.compensation,
            arrangements: job.arrangements,
            externalId: job.external_id,
            postedAt: job.posted_at,
            closesAt: job.closes_at,
            portalSource: job.source?.provider,
          }).replace(/</g, '\\u003c'),
        }}
      />
      {/* Top back navigation & quick tools */}
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/dashboard/jobs"
          className="text-muted-foreground hover:text-foreground group inline-flex items-center gap-1.5 py-1 text-xs font-semibold transition-colors"
        >
          <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
          <span>Back to public jobs</span>
        </Link>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyLink}
            className="border-border/70 h-8 gap-1.5 rounded-lg text-xs"
          >
            {copied ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
            <span>{copied ? 'Link Copied' : 'Share Role'}</span>
          </Button>

          <Button
            size="sm"
            onClick={() => setMatcher(true)}
            className="h-8 gap-1.5 rounded-lg bg-emerald-600 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700"
          >
            <Sparkles className="size-3" />
            <span>AI Match Score</span>
          </Button>
        </div>
      </div>

      {/* ======================= HERO JOB BANNER ======================= */}
      <section className="border-border/80 from-card via-card to-card/70 relative overflow-hidden rounded-3xl border bg-gradient-to-b p-6 shadow-sm sm:p-8">
        {/* Subtle decorative background glow */}
        <div className="bg-primary/5 pointer-events-none absolute top-0 right-0 -mt-10 -mr-10 size-60 rounded-full blur-3xl" />

        <div className="relative flex flex-col justify-between gap-6 md:flex-row md:items-start">
          <div className="flex items-start gap-4 sm:gap-5">
            <CompanyLogo company={job.company} size="lg" className="mt-1 shadow-sm" />

            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-primary bg-primary/10 border-primary/20 rounded-full border px-2.5 py-0.5 text-xs font-bold tracking-wider uppercase">
                  {job.company}
                </span>
                <span className="text-muted-foreground font-mono text-xs">
                  ID: {job.id.slice(0, 8)}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                  Verified ATS Posting
                </span>
              </div>

              <h1 className="text-foreground text-2xl leading-tight font-extrabold tracking-tight sm:text-3xl lg:text-4xl">
                {job.title}
              </h1>

              <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-2 pt-1 text-xs sm:text-sm">
                <span className="text-foreground flex items-center gap-1.5 font-semibold">
                  <Building2 className="text-primary size-4 shrink-0" />
                  {job.company}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1.5">
                  <MapPin className="text-muted-foreground size-4 shrink-0" />
                  {job.location || 'Remote / Unknown'}
                </span>
                {job.department && (
                  <>
                    <span>•</span>
                    <span className="text-muted-foreground/90 font-medium">
                      Dept: {job.department}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Quick Apply Action Button in Hero */}
          <div className="flex shrink-0 flex-col items-stretch gap-2.5 sm:flex-row md:flex-col md:items-end">
            <a
              href={job.application_url}
              onClick={(event) => {
                if (
                  !candidates.length ||
                  job.state === 'closed' ||
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey
                )
                  return;
                event.preventDefault();
                void apply();
              }}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl px-6 text-sm font-bold shadow-sm transition-all hover:scale-[1.01] hover:shadow active:scale-98"
            >
              <span>
                Apply on{' '}
                {job.source?.provider ? job.source.provider.toUpperCase() : 'Company Portal'}
              </span>
              <ExternalLink className="size-4" />
            </a>
            <span className="text-muted-foreground text-center text-[11px] md:text-right">
              Direct official employer application link
            </span>
          </div>
        </div>

        {/* Quick Facts Strip */}
        <div className="border-border/60 mt-6 grid grid-cols-2 gap-3 border-t pt-6 sm:grid-cols-4">
          <div className="border-border/60 bg-muted/20 space-y-1 rounded-xl border p-3">
            <div className="text-muted-foreground flex items-center gap-1.5 text-[10.5px] font-bold tracking-wider uppercase">
              <Briefcase className="text-primary size-3.5" />
              Role Type
            </div>
            <div className="text-foreground text-xs font-bold capitalize">
              {job.employment_type.replace('_', ' ')}
            </div>
          </div>

          <div className="border-border/60 bg-muted/20 space-y-1 rounded-xl border p-3">
            <div className="text-muted-foreground flex items-center gap-1.5 text-[10.5px] font-bold tracking-wider uppercase">
              <Globe className="text-primary size-3.5" />
              ATS System
            </div>
            <div className="text-foreground text-xs font-bold uppercase">
              {job.source?.provider || 'Direct'}
            </div>
          </div>

          <div className="border-border/60 bg-muted/20 space-y-1 rounded-xl border p-3">
            <div className="text-muted-foreground flex items-center gap-1.5 text-[10.5px] font-bold tracking-wider uppercase">
              <Clock className="text-primary size-3.5" />
              Posting Timeline
            </div>
            <div className="text-foreground text-xs font-medium">
              <JobDates
                posted_at={job.posted_at}
                closes_at={job.closes_at}
                provider={job.source?.provider}
              />
            </div>
          </div>

          <div className="border-border/60 bg-muted/20 space-y-1 rounded-xl border p-3">
            <div className="text-muted-foreground flex items-center gap-1.5 text-[10.5px] font-bold tracking-wider uppercase">
              <Flame className="size-3.5 text-emerald-500" />
              Posting Status
            </div>
            <div className="flex items-center gap-1 text-xs font-bold text-emerald-600 capitalize dark:text-emerald-400">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
              <span>{job.state || 'Active'}</span>
            </div>
          </div>
        </div>

        {/* Core Tech Stack Ribbon */}
        {structured && structured.topTechStack.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-4">
            <span className="text-muted-foreground flex items-center gap-1 text-[11px] font-bold tracking-wider uppercase">
              <Layers className="text-primary size-3.5" />
              Key Stack:
            </span>
            {structured.topTechStack.map((tech) => (
              <SkillBadge key={tech} name={tech} size="xs" />
            ))}
          </div>
        )}
      </section>

      {/* ======================= TAB NAVIGATION ======================= */}
      <div className="border-border/60 flex items-center gap-2 border-b pb-1">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all ${
            activeTab === 'overview'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
          }`}
        >
          <FileText className="size-3.5" />
          <span>Job Description & Scope</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('fit')}
          className={`flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all ${
            activeTab === 'fit'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
          }`}
        >
          <Sparkles className="size-3.5" />
          <span>Skills Catalog & Fit ({structured?.skills.length || 0})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('company')}
          className={`flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all ${
            activeTab === 'company'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
          }`}
        >
          <Building2 className="size-3.5" />
          <span>Company & Source Details</span>
        </button>
      </div>

      {/* ======================= TAB CONTENTS & SIDEBAR ======================= */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Left main content column */}
        <div className="space-y-6">
          {/* TAB 1: OVERVIEW & EDITORIAL JD */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Critical Constraints Callout */}
              {structured && structured.constraints.length > 0 && (
                <section className="space-y-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 shadow-xs">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="size-4.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <h2 className="text-foreground text-sm font-bold">
                      Critical Role Constraints & Work Eligibility
                    </h2>
                  </div>
                  <div className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2">
                    {structured.constraints.map((c, i) => (
                      <div
                        key={i}
                        className="bg-card/80 space-y-1 rounded-xl border border-amber-500/20 p-3"
                      >
                        <div className="text-[11px] font-bold tracking-wide text-amber-700 uppercase dark:text-amber-400">
                          {c.title}
                        </div>
                        <p className="text-foreground/90 text-xs leading-snug">{c.description}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Responsibilities */}
              {structured && structured.responsibilities.length > 0 && (
                <section className="border-border/70 bg-card space-y-4 rounded-2xl border p-6 shadow-xs">
                  <div className="border-border/60 flex items-center gap-2.5 border-b pb-3">
                    <div className="bg-primary/10 text-primary flex size-8 items-center justify-center rounded-xl font-bold">
                      <Target className="size-4" />
                    </div>
                    <div>
                      <h2 className="text-foreground text-sm font-bold">
                        Core Responsibilities & Deliverables
                      </h2>
                      <p className="text-muted-foreground text-[11px]">
                        Key day-to-day deliverables and expectations extracted from the description
                      </p>
                    </div>
                  </div>

                  <ul className="space-y-2.5 pt-1">
                    {structured.responsibilities.map((resp, i) => (
                      <li
                        key={i}
                        className="text-foreground/90 flex items-start gap-3 text-xs leading-relaxed sm:text-sm"
                      >
                        <span className="bg-primary mt-2 size-1.5 shrink-0 rounded-full" />
                        <span>{resp}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Required Qualifications & Must-Haves */}
              {structured && structured.mustHaves.length > 0 && (
                <section className="border-border/70 bg-card space-y-4 rounded-2xl border p-6 shadow-xs">
                  <div className="border-border/60 flex items-center gap-2.5 border-b pb-3">
                    <div className="flex size-8 items-center justify-center rounded-xl bg-emerald-500/10 font-bold text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="size-4" />
                    </div>
                    <div>
                      <h2 className="text-foreground text-sm font-bold">
                        Required Qualifications & Must-Haves
                      </h2>
                      <p className="text-muted-foreground text-[11px]">
                        Essential qualifications, competencies, and requirements
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2.5 pt-1">
                    {structured.mustHaves.map((req, i) => (
                      <div
                        key={i}
                        className="border-border/60 bg-muted/15 flex items-start gap-3 rounded-xl border p-3.5 text-xs sm:text-sm"
                      >
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        <span className="text-foreground leading-snug font-semibold">{req}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Preferred / Bonus Qualifications */}
              {structured && structured.niceToHaves.length > 0 && (
                <section className="border-border/70 bg-card space-y-4 rounded-2xl border p-6 shadow-xs">
                  <div className="border-border/60 flex items-center gap-2.5 border-b pb-3">
                    <div className="flex size-8 items-center justify-center rounded-xl bg-amber-500/10 font-bold text-amber-600 dark:text-amber-400">
                      <Star className="size-4" />
                    </div>
                    <div>
                      <h2 className="text-foreground text-sm font-bold">
                        Preferred & Bonus Qualifications
                      </h2>
                      <p className="text-muted-foreground text-[11px]">
                        Nice-to-have capabilities that give candidates an edge
                      </p>
                    </div>
                  </div>

                  <ul className="space-y-2.5 pt-1">
                    {structured.niceToHaves.map((nice, i) => (
                      <li
                        key={i}
                        className="text-foreground/90 flex items-start gap-2.5 text-xs leading-relaxed sm:text-sm"
                      >
                        <Star className="mt-1 size-3.5 shrink-0 text-amber-500" />
                        <span>{nice}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Full Editorial Job Description Text */}
              <section className="border-border/70 bg-card space-y-4 rounded-2xl border p-6 shadow-xs">
                <div className="border-border/60 flex items-center justify-between border-b pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="bg-primary/10 text-primary flex size-8 items-center justify-center rounded-xl font-bold">
                      <FileText className="size-4" />
                    </div>
                    <h2 className="text-foreground text-sm font-bold">
                      Full Job Description & Specifications
                    </h2>
                  </div>
                  <a
                    href={job.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary inline-flex items-center gap-1 text-xs font-semibold hover:underline"
                  >
                    <span>Source Posting</span>
                    <ExternalLink className="size-3" />
                  </a>
                </div>

                <div
                  className="jd-prose text-foreground/90 max-h-[560px] max-w-none scrollbar-thin overflow-y-auto pr-2 leading-relaxed"
                  dangerouslySetInnerHTML={{
                    __html: sanitizeJobHtml(
                      job.description_html || job.description.replace(/\n/g, '<br/>')
                    ),
                  }}
                />
              </section>
            </div>
          )}

          {/* TAB 2: SKILLS & CANDIDATE FIT */}
          {activeTab === 'fit' && (
            <div className="space-y-6">
              {/* Fit analysis card if candidate selected */}
              {activeCandidate && fitAnalysis && (
                <section className="border-primary/30 bg-primary/5 space-y-4 rounded-2xl border p-6 shadow-xs">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-foreground text-base font-bold">
                        Candidate Fit: {activeCandidate.full_name}
                      </h2>
                      <p className="text-muted-foreground text-xs">
                        Automated deterministic evidence matching based on confirmed resume
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-primary text-2xl font-black tabular-nums">
                        {fitAnalysis.matchScore}%
                      </span>
                      <p className="text-muted-foreground text-[10.5px] font-bold uppercase">
                        {fitAnalysis.verdict}
                      </p>
                    </div>
                  </div>

                  {/* Matched skills */}
                  <div className="border-primary/20 space-y-2 border-t pt-2">
                    <h3 className="text-foreground flex items-center gap-1.5 text-xs font-bold">
                      <CheckCircle2 className="size-3.5 text-emerald-600" />
                      <span>Matched Skills ({fitAnalysis.matchedSkills.length})</span>
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {fitAnalysis.matchedSkills.map((m) => (
                        <SkillBadge key={m.skill} name={m.skill} isMatched={true} size="sm" />
                      ))}
                    </div>
                  </div>

                  {/* Missing skills */}
                  {fitAnalysis.missingSkills.length > 0 && (
                    <div className="border-primary/20 space-y-2 border-t pt-2">
                      <h3 className="text-foreground flex items-center gap-1.5 text-xs font-bold">
                        <AlertCircle className="size-3.5 text-amber-600" />
                        <span>
                          Highlighted Gaps / Missing Skills ({fitAnalysis.missingSkills.length})
                        </span>
                      </h3>
                      <div className="flex flex-wrap gap-1.5">
                        {fitAnalysis.missingSkills.map((s) => (
                          <span
                            key={s}
                            className="inline-flex items-center rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-800 dark:text-amber-300"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              )}

              {/* Complete Categorized Skills Matrix */}
              <section className="border-border/70 bg-card space-y-5 rounded-2xl border p-6 shadow-xs">
                <div className="border-border/60 flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="bg-primary/10 text-primary flex size-8 items-center justify-center rounded-xl font-bold">
                      <Layers className="size-4" />
                    </div>
                    <div>
                      <h2 className="text-foreground text-sm font-bold">
                        Categorized Skills & Technology Stack
                      </h2>
                      <p className="text-muted-foreground text-[11px]">
                        {structured?.skills.length || 0} skills detected and categorized
                      </p>
                    </div>
                  </div>
                </div>

                {skillsByCategory.length === 0 ? (
                  <p className="text-muted-foreground text-xs">
                    No specific skills detected in the posting text.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {skillsByCategory.map(([category, skills]) => (
                      <div
                        key={category}
                        className="border-border/60 bg-muted/15 space-y-2.5 rounded-xl border p-4"
                      >
                        <div className="text-muted-foreground flex items-center justify-between text-[11px] font-bold tracking-wider uppercase">
                          <span>{category}</span>
                          <span className="bg-muted border-border/60 rounded-full border px-2 py-0.5 text-[10px] font-semibold">
                            {skills.length}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {skills.map((skill) => {
                            const isMatched = fitAnalysis?.matchedSkills.some(
                              (m) => m.skill.toLowerCase() === skill.name.toLowerCase()
                            );
                            return (
                              <SkillBadge
                                key={skill.name}
                                name={skill.name}
                                category={skill.category}
                                isMatched={isMatched}
                                count={skill.count}
                                size="sm"
                              />
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* TAB 3: COMPANY & SOURCE DETAILS */}
          {activeTab === 'company' && (
            <div className="space-y-6">
              <section className="border-border/70 bg-card space-y-4 rounded-2xl border p-6 shadow-xs">
                <div className="flex items-center gap-4">
                  <CompanyLogo company={job.company} size="lg" />
                  <div>
                    <h2 className="text-foreground text-lg font-bold">{job.company}</h2>
                    <p className="text-muted-foreground text-xs">
                      Public ATS Provider:{' '}
                      <strong className="text-foreground uppercase">
                        {job.source?.provider || 'Unknown'}
                      </strong>
                    </p>
                  </div>
                </div>

                <div className="divide-border/60 border-border/70 bg-muted/10 divide-y overflow-hidden rounded-xl border text-xs">
                  <div className="flex justify-between p-3.5">
                    <span className="text-muted-foreground font-semibold">Board / Source ID</span>
                    <span className="text-foreground font-mono">
                      {(job as unknown as { board_slug?: string }).board_slug ||
                        job.source_id?.slice(0, 8) ||
                        'public'}
                    </span>
                  </div>
                  <div className="flex justify-between p-3.5">
                    <span className="text-muted-foreground font-semibold">External Posting ID</span>
                    <span className="text-foreground font-mono">{job.external_id}</span>
                  </div>
                  <div className="flex justify-between p-3.5">
                    <span className="text-muted-foreground font-semibold">
                      Official Application URL
                    </span>
                    <a
                      href={job.application_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary max-w-xs truncate hover:underline"
                    >
                      {job.application_url}
                    </a>
                  </div>
                  <div className="flex justify-between p-3.5">
                    <span className="text-muted-foreground font-semibold">Employment Evidence</span>
                    <span className="text-foreground/80 italic">
                      {job.employment_evidence || 'Standard job description'}
                    </span>
                  </div>
                </div>
              </section>

              {/* Raw posting viewer */}
              <section className="border-border/70 bg-card overflow-hidden rounded-2xl border shadow-xs">
                <button
                  type="button"
                  onClick={() => setRawExpanded(!rawExpanded)}
                  className="text-foreground hover:bg-muted/30 flex w-full cursor-pointer items-center justify-between p-5 text-left font-bold transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="text-primary size-4" />
                    <span className="text-sm">Complete Raw Job Posting Text</span>
                  </div>
                  <span className="text-muted-foreground flex items-center gap-1 text-xs">
                    {rawExpanded ? 'Hide Raw Text' : 'View Raw Posting'}
                    <ChevronDown
                      className={`size-4 transition-transform ${rawExpanded ? 'rotate-180' : ''}`}
                    />
                  </span>
                </button>
                {rawExpanded && (
                  <div className="border-border/50 border-t p-6 pt-0">
                    <div className="text-foreground/80 bg-muted/20 mt-4 max-h-96 overflow-y-auto rounded-xl p-4 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap">
                      {job.description}
                    </div>
                  </div>
                )}
              </section>
            </div>
          )}
        </div>

        {/* Right Column: Sticky Action Console */}
        <aside className="border-border/70 bg-card space-y-5 rounded-2xl border p-5 shadow-xs backdrop-blur-xs lg:sticky lg:top-6">
          <div className="border-border/60 space-y-1 border-b pb-3">
            <div className="flex items-center gap-2">
              <div className="bg-primary/10 text-primary flex size-7 items-center justify-center rounded-lg font-bold">
                <Sparkles className="size-3.5" />
              </div>
              <h2 className="text-foreground text-sm font-bold">Action Console</h2>
            </div>
            <p className="text-muted-foreground text-[11px]">
              Review qualifications and initiate linked applications
            </p>
          </div>

          <Button
            variant="outline"
            className="border-primary/25 bg-primary/5 hover:bg-primary/10 text-primary flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-xl text-xs font-semibold shadow-xs transition-all"
            onClick={() => setMatcher(true)}
          >
            <Sparkles className="size-3.5" />
            <span>Compare with AI Matcher</span>
          </Button>

          {/* Primary CTA: Open Application */}
          <div className="pt-1">
            <a
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-4 text-xs font-bold shadow-xs transition-all hover:shadow"
              href={job.application_url}
              onClick={(event) => {
                if (
                  !candidates.length ||
                  job.state === 'closed' ||
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey
                )
                  return;
                event.preventDefault();
                void apply();
              }}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span>Apply on {job.company}</span>
              <ExternalLink className="size-3.5" />
            </a>
          </div>

          {canRecruit && (
            <div className="border-border/60 space-y-4 border-t pt-2">
              <label className="text-foreground grid gap-1.5 text-xs font-semibold">
                <span>Select Candidate Profile</span>
                <select
                  aria-label="Candidate for application"
                  className="border-input bg-background focus-visible:ring-ring h-10 cursor-pointer rounded-xl border px-3 text-xs font-medium shadow-xs focus-visible:ring-2 focus-visible:outline-none"
                  value={candidateId}
                  onChange={(event) => setCandidate(event.target.value)}
                >
                  <option value="">Choose candidate...</option>
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-2">
                <Button
                  disabled={!candidates.some((c) => c.id === candidateId) || job.state === 'closed'}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 flex h-10 w-full items-center justify-center gap-2 rounded-xl text-xs font-semibold shadow-xs transition-all"
                  onClick={() => void apply()}
                >
                  <Send className="size-3.5" />
                  <span>Start linked application</span>
                </Button>

                <Button
                  disabled={!candidates.some((c) => c.id === candidateId)}
                  variant="outline"
                  className="border-border/80 hover:border-primary/50 flex h-10 w-full items-center justify-center gap-2 rounded-xl text-xs font-semibold shadow-xs transition-all"
                  onClick={() => void draft()}
                >
                  <FileCheck className="size-3.5" />
                  <span>Prepare draft packet</span>
                </Button>
              </div>

              {candidateId && (
                <Link
                  href={`/dashboard/candidates/${candidateId}`}
                  className="text-primary inline-flex items-center gap-1.5 text-xs font-semibold hover:underline"
                >
                  <UserCheck className="size-3.5" />
                  <span>Review candidate facts & documents</span>
                </Link>
              )}
            </div>
          )}

          {/* Status notice */}
          {notice && (
            <div
              role="status"
              className="border-primary/20 bg-primary/5 text-primary animate-in fade-in-50 flex items-start gap-2.5 rounded-xl border p-3.5 text-xs font-medium"
            >
              <Info className="mt-0.5 size-4 shrink-0" />
              <span>{notice}</span>
            </div>
          )}

          <div className="border-border/60 bg-muted/20 text-muted-foreground flex items-start gap-2 rounded-xl border p-3 text-[11px] leading-relaxed">
            <ShieldCheck className="text-primary mt-0.5 size-4 shrink-0" />
            <span>Applications are verified directly with the employer’s public job board.</span>
          </div>
        </aside>
      </div>

      {/* AI Skill Matcher Dialog */}
      <SkillMatcherDialog
        open={matcher}
        onOpenChange={setMatcher}
        job={{
          id: job.id,
          title: job.title,
          company: job.company,
          description: job.description,
          location: job.location || undefined,
          url: job.application_url,
        }}
      />
    </main>
  );
}
