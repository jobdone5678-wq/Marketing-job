"use client";

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
    const tab = window.open('about:blank', '_blank');
    try {
      if (tab) tab.opener = null;
      const r = await api<{ intent: { id: string; job: { application_url: string } } }>(
        '/api/application-intents',
        {
          method: 'POST',
          body: JSON.stringify({ candidateId, jobId: id }),
        }
      );
      const u = new URL(r.intent.job.application_url);
      u.hash = 'marketing-intent=' + r.intent.id;
      if (tab) tab.location.href = u.toString();
      else setNotice('Application linked and started as a draft.');
      setNotice('Application started as a Draft. The extension or email receipt will update its status.');
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
        const t = await api<{ task: { status: string; error: string | null } }>(`/api/tasks/${taskId}`);
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
      <main className="portal-page max-w-5xl mx-auto space-y-4">
        <Link
          href="/dashboard/jobs"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
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
      <main className="portal-page max-w-5xl mx-auto space-y-4">
        <WorkspaceSkeleton />
      </main>
    );
  }

  return (
    <main className="portal-page space-y-6 max-w-6xl w-full mx-auto pb-16">
      {/* Top back navigation & quick tools */}
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/dashboard/jobs"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors group py-1"
        >
          <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
          <span>Back to public jobs</span>
        </Link>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyLink}
            className="h-8 text-xs gap-1.5 rounded-lg border-border/70"
          >
            {copied ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
            <span>{copied ? 'Link Copied' : 'Share Role'}</span>
          </Button>

          <Button
            size="sm"
            onClick={() => setMatcher(true)}
            className="h-8 text-xs gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-xs"
          >
            <Sparkles className="size-3" />
            <span>AI Match Score</span>
          </Button>
        </div>
      </div>

      {/* ======================= HERO JOB BANNER ======================= */}
      <section className="relative overflow-hidden rounded-3xl border border-border/80 bg-gradient-to-b from-card via-card to-card/70 p-6 sm:p-8 shadow-sm">
        {/* Subtle decorative background glow */}
        <div className="absolute top-0 right-0 -mt-10 -mr-10 size-60 rounded-full bg-primary/5 blur-3xl pointer-events-none" />

        <div className="relative flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div className="flex items-start gap-4 sm:gap-5">
            <CompanyLogo company={job.company} size="lg" className="mt-1 shadow-sm" />

            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-primary bg-primary/10 px-2.5 py-0.5 rounded-full border border-primary/20">
                  {job.company}
                </span>
                <span className="text-xs text-muted-foreground font-mono">
                  ID: {job.id.slice(0, 8)}
                </span>
                <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300 font-semibold bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                  <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Verified ATS Posting
                </span>
              </div>

              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-foreground leading-tight">
                {job.title}
              </h1>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs sm:text-sm text-muted-foreground pt-1">
                <span className="flex items-center gap-1.5 font-semibold text-foreground">
                  <Building2 className="size-4 text-primary shrink-0" />
                  {job.company}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1.5">
                  <MapPin className="size-4 text-muted-foreground shrink-0" />
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
          <div className="flex flex-col sm:flex-row md:flex-col items-stretch md:items-end gap-2.5 shrink-0">
            <a
              href={job.application_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 h-11 px-6 rounded-xl bg-primary text-primary-foreground font-bold text-sm shadow-sm hover:bg-primary/90 hover:shadow hover:scale-[1.01] active:scale-98 transition-all cursor-pointer"
            >
              <span>Apply on {job.source?.provider ? job.source.provider.toUpperCase() : 'Company Portal'}</span>
              <ExternalLink className="size-4" />
            </a>
            <span className="text-[11px] text-muted-foreground text-center md:text-right">
              Direct official employer application link
            </span>
          </div>
        </div>

        {/* Quick Facts Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-6 mt-6 border-t border-border/60">
          <div className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-1">
            <div className="text-[10.5px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
              <Briefcase className="size-3.5 text-primary" />
              Role Type
            </div>
            <div className="text-xs font-bold text-foreground capitalize">
              {job.employment_type.replace('_', ' ')}
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-1">
            <div className="text-[10.5px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
              <Globe className="size-3.5 text-primary" />
              ATS System
            </div>
            <div className="text-xs font-bold text-foreground uppercase">
              {job.source?.provider || 'Direct'}
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-1">
            <div className="text-[10.5px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
              <Clock className="size-3.5 text-primary" />
              Posting Timeline
            </div>
            <div className="text-xs font-medium text-foreground">
              <JobDates posted_at={job.posted_at} closes_at={job.closes_at} provider={job.source?.provider} />
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-1">
            <div className="text-[10.5px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
              <Flame className="size-3.5 text-emerald-500" />
              Posting Status
            </div>
            <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 capitalize flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>{job.state || 'Active'}</span>
            </div>
          </div>
        </div>

        {/* Core Tech Stack Ribbon */}
        {structured && structured.topTechStack.length > 0 && (
          <div className="pt-4 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <Layers className="size-3.5 text-primary" />
              Key Stack:
            </span>
            {structured.topTechStack.map((tech) => (
              <SkillBadge key={tech} name={tech} size="xs" />
            ))}
          </div>
        )}
      </section>

      {/* ======================= TAB NAVIGATION ======================= */}
      <div className="flex items-center gap-2 border-b border-border/60 pb-1">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
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
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
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
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl transition-all cursor-pointer ${
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
                <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 shadow-xs space-y-3">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="size-4.5 text-amber-600 dark:text-amber-400 shrink-0" />
                    <h2 className="text-sm font-bold text-foreground">
                      Critical Role Constraints & Work Eligibility
                    </h2>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    {structured.constraints.map((c, i) => (
                      <div
                        key={i}
                        className="rounded-xl border border-amber-500/20 bg-card/80 p-3 space-y-1"
                      >
                        <div className="text-[11px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide">
                          {c.title}
                        </div>
                        <p className="text-xs text-foreground/90 leading-snug">{c.description}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Responsibilities */}
              {structured && structured.responsibilities.length > 0 && (
                <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-xs space-y-4">
                  <div className="flex items-center gap-2.5 pb-3 border-b border-border/60">
                    <div className="size-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
                      <Target className="size-4" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-foreground">
                        Core Responsibilities & Deliverables
                      </h2>
                      <p className="text-[11px] text-muted-foreground">
                        Key day-to-day deliverables and expectations extracted from the description
                      </p>
                    </div>
                  </div>

                  <ul className="space-y-2.5 pt-1">
                    {structured.responsibilities.map((resp, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-3 text-xs sm:text-sm text-foreground/90 leading-relaxed"
                      >
                        <span className="size-1.5 rounded-full bg-primary mt-2 shrink-0" />
                        <span>{resp}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Required Qualifications & Must-Haves */}
              {structured && structured.mustHaves.length > 0 && (
                <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-xs space-y-4">
                  <div className="flex items-center gap-2.5 pb-3 border-b border-border/60">
                    <div className="size-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                      <CheckCircle2 className="size-4" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-foreground">
                        Required Qualifications & Must-Haves
                      </h2>
                      <p className="text-[11px] text-muted-foreground">
                        Essential qualifications, competencies, and requirements
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2.5 pt-1">
                    {structured.mustHaves.map((req, i) => (
                      <div
                        key={i}
                        className="rounded-xl border border-border/60 bg-muted/15 p-3.5 text-xs sm:text-sm flex items-start gap-3"
                      >
                        <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                        <span className="font-semibold text-foreground leading-snug">{req}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Preferred / Bonus Qualifications */}
              {structured && structured.niceToHaves.length > 0 && (
                <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-xs space-y-4">
                  <div className="flex items-center gap-2.5 pb-3 border-b border-border/60">
                    <div className="size-8 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
                      <Star className="size-4" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-foreground">
                        Preferred & Bonus Qualifications
                      </h2>
                      <p className="text-[11px] text-muted-foreground">
                        Nice-to-have capabilities that give candidates an edge
                      </p>
                    </div>
                  </div>

                  <ul className="space-y-2.5 pt-1">
                    {structured.niceToHaves.map((nice, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2.5 text-xs sm:text-sm text-foreground/90 leading-relaxed"
                      >
                        <Star className="size-3.5 text-amber-500 shrink-0 mt-1" />
                        <span>{nice}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Full Editorial Job Description Text */}
              <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-border/60">
                  <div className="flex items-center gap-2.5">
                    <div className="size-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
                      <FileText className="size-4" />
                    </div>
                    <h2 className="text-sm font-bold text-foreground">
                      Full Job Description & Specifications
                    </h2>
                  </div>
                  <a
                    href={job.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline font-semibold inline-flex items-center gap-1"
                  >
                    <span>Source Posting</span>
                    <ExternalLink className="size-3" />
                  </a>
                </div>

                <div
                  className="jd-prose max-w-none text-foreground/90 leading-relaxed max-h-[560px] overflow-y-auto pr-2 scrollbar-thin"
                  dangerouslySetInnerHTML={{
                    __html: sanitizeJobHtml(job.description_html || job.description.replace(/\n/g, '<br/>')),
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
                <section className="rounded-2xl border border-primary/30 bg-primary/5 p-6 shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-bold text-foreground">
                        Candidate Fit: {activeCandidate.full_name}
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        Automated deterministic evidence matching based on confirmed resume
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-2xl font-black text-primary tabular-nums">
                        {fitAnalysis.matchScore}%
                      </span>
                      <p className="text-[10.5px] uppercase font-bold text-muted-foreground">
                        {fitAnalysis.verdict}
                      </p>
                    </div>
                  </div>

                  {/* Matched skills */}
                  <div className="space-y-2 pt-2 border-t border-primary/20">
                    <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <CheckCircle2 className="size-3.5 text-emerald-600" />
                      <span>Matched Skills ({fitAnalysis.matchedSkills.length})</span>
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {fitAnalysis.matchedSkills.map((m) => (
                        <SkillBadge
                          key={m.skill}
                          name={m.skill}
                          isMatched={true}
                          size="sm"
                        />
                      ))}
                    </div>
                  </div>

                  {/* Missing skills */}
                  {fitAnalysis.missingSkills.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-primary/20">
                      <h3 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <AlertCircle className="size-3.5 text-amber-600" />
                        <span>Highlighted Gaps / Missing Skills ({fitAnalysis.missingSkills.length})</span>
                      </h3>
                      <div className="flex flex-wrap gap-1.5">
                        {fitAnalysis.missingSkills.map((s) => (
                          <span
                            key={s}
                            className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300"
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
              <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-xs space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-border/60">
                  <div className="flex items-center gap-2.5">
                    <div className="size-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
                      <Layers className="size-4" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-foreground">
                        Categorized Skills & Technology Stack
                      </h2>
                      <p className="text-[11px] text-muted-foreground">
                        {structured?.skills.length || 0} skills detected and categorized
                      </p>
                    </div>
                  </div>
                </div>

                {skillsByCategory.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No specific skills detected in the posting text.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {skillsByCategory.map(([category, skills]) => (
                      <div
                        key={category}
                        className="rounded-xl border border-border/60 bg-muted/15 p-4 space-y-2.5"
                      >
                        <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                          <span>{category}</span>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted border border-border/60">
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
              <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-xs space-y-4">
                <div className="flex items-center gap-4">
                  <CompanyLogo company={job.company} size="lg" />
                  <div>
                    <h2 className="text-lg font-bold text-foreground">{job.company}</h2>
                    <p className="text-xs text-muted-foreground">
                      Public ATS Provider: <strong className="text-foreground uppercase">{job.source?.provider || 'Unknown'}</strong>
                    </p>
                  </div>
                </div>

                <div className="divide-y divide-border/60 border border-border/70 rounded-xl overflow-hidden bg-muted/10 text-xs">
                  <div className="p-3.5 flex justify-between">
                    <span className="font-semibold text-muted-foreground">Board / Source ID</span>
                    <span className="font-mono text-foreground">{(job as unknown as { board_slug?: string }).board_slug || job.source_id?.slice(0, 8) || 'public'}</span>
                  </div>
                  <div className="p-3.5 flex justify-between">
                    <span className="font-semibold text-muted-foreground">External Posting ID</span>
                    <span className="font-mono text-foreground">{job.external_id}</span>
                  </div>
                  <div className="p-3.5 flex justify-between">
                    <span className="font-semibold text-muted-foreground">Official Application URL</span>
                    <a
                      href={job.application_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline truncate max-w-xs"
                    >
                      {job.application_url}
                    </a>
                  </div>
                  <div className="p-3.5 flex justify-between">
                    <span className="font-semibold text-muted-foreground">Employment Evidence</span>
                    <span className="italic text-foreground/80">{job.employment_evidence || 'Standard job description'}</span>
                  </div>
                </div>
              </section>

              {/* Raw posting viewer */}
              <section className="rounded-2xl border border-border/70 bg-card overflow-hidden shadow-xs">
                <button
                  type="button"
                  onClick={() => setRawExpanded(!rawExpanded)}
                  className="w-full flex items-center justify-between p-5 text-left font-bold text-foreground hover:bg-muted/30 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <FileText className="size-4 text-primary" />
                    <span className="text-sm">Complete Raw Job Posting Text</span>
                  </div>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    {rawExpanded ? 'Hide Raw Text' : 'View Raw Posting'}
                    <ChevronDown className={`size-4 transition-transform ${rawExpanded ? 'rotate-180' : ''}`} />
                  </span>
                </button>
                {rawExpanded && (
                  <div className="p-6 pt-0 border-t border-border/50">
                    <div className="whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground/80 font-mono bg-muted/20 p-4 rounded-xl mt-4 max-h-96 overflow-y-auto">
                      {job.description}
                    </div>
                  </div>
                )}
              </section>
            </div>
          )}
        </div>

        {/* Right Column: Sticky Action Console */}
        <aside className="space-y-5 rounded-2xl border border-border/70 bg-card p-5 shadow-xs lg:sticky lg:top-6 backdrop-blur-xs">
          <div className="space-y-1 pb-3 border-b border-border/60">
            <div className="flex items-center gap-2">
              <div className="size-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold">
                <Sparkles className="size-3.5" />
              </div>
              <h2 className="text-sm font-bold text-foreground">Action Console</h2>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Review qualifications and initiate linked applications
            </p>
          </div>

          <Button
            variant="outline"
            className="w-full h-10 rounded-xl border-primary/25 bg-primary/5 hover:bg-primary/10 text-primary text-xs font-semibold shadow-xs flex items-center justify-center gap-2 cursor-pointer transition-all"
            onClick={() => setMatcher(true)}
          >
            <Sparkles className="size-3.5" />
            <span>Compare with AI Matcher</span>
          </Button>

          {/* Primary CTA: Open Application */}
          <div className="pt-1">
            <a
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground shadow-xs hover:bg-primary/90 hover:shadow transition-all cursor-pointer"
              href={job.application_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span>Apply on {job.company}</span>
              <ExternalLink className="size-3.5" />
            </a>
          </div>

          {canRecruit && (
            <div className="space-y-4 pt-2 border-t border-border/60">
              <label className="grid gap-1.5 text-xs font-semibold text-foreground">
                <span>Select Candidate Profile</span>
                <select
                  aria-label="Candidate for application"
                  className="h-10 rounded-xl border border-input bg-background px-3 text-xs font-medium shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
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
                  className="w-full h-10 rounded-xl font-semibold bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 transition-all flex items-center justify-center gap-2 text-xs"
                  onClick={() => void apply()}
                >
                  <Send className="size-3.5" />
                  <span>Start linked application</span>
                </Button>

                <Button
                  disabled={!candidates.some((c) => c.id === candidateId)}
                  variant="outline"
                  className="w-full h-10 rounded-xl font-semibold border-border/80 shadow-xs hover:border-primary/50 transition-all flex items-center justify-center gap-2 text-xs"
                  onClick={() => void draft()}
                >
                  <FileCheck className="size-3.5" />
                  <span>Prepare draft packet</span>
                </Button>
              </div>

              {candidateId && (
                <Link
                  href={`/dashboard/candidates/${candidateId}`}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
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
              className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 text-xs font-medium text-primary flex items-start gap-2.5 animate-in fade-in-50"
            >
              <Info className="size-4 shrink-0 mt-0.5" />
              <span>{notice}</span>
            </div>
          )}

          <div className="rounded-xl border border-border/60 bg-muted/20 p-3 text-[11px] leading-relaxed text-muted-foreground flex items-start gap-2">
            <ShieldCheck className="size-4 text-primary shrink-0 mt-0.5" />
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
