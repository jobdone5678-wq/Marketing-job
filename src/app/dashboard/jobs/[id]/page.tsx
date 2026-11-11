"use client";

import Link from 'next/link';
import { use, useEffect, useMemo, useState } from 'react';
import { WorkspaceHeading, WorkspaceError, WorkspaceSkeleton } from '@/components/workspace-ui';
import { JobDates } from '@/components/job-dates';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { SkillMatcherDialog } from '@/components/skill-matcher-dialog';
import { getCandidates } from '@/lib/candidates';
import type { Candidate } from '@/types/database';
import type { StoredJob } from '@/lib/jobs/types';
import { useUserProfile } from '@/hooks/use-user-profile';
import {
  extractCompleteJobDetails,
  analyzeCandidateFit,
  type StructuredJobDetails
} from '@/lib/jobs/skills-extractor';

function ArrowLeftIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m12 19-7-7 7-7" /><path d="M19 12H5" />
    </svg>
  );
}

function BuildingIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="16" height="20" x="4" y="2" rx="2" ry="2" />
      <path d="M9 22v-4h6v4" /><path d="M8 6h.01" /><path d="M16 6h.01" /><path d="M12 6h.01" /><path d="M12 10h.01" /><path d="M12 14h.01" /><path d="M16 10h.01" /><path d="M16 14h.01" /><path d="M8 10h.01" /><path d="M8 14h.01" />
    </svg>
  );
}

function MapPinIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function BriefcaseIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="20" height="14" x="2" y="7" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
}

function GlobeIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><path d="M2 12h20" />
    </svg>
  );
}

function FileTextIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M10 9H8" /><path d="M16 13H8" /><path d="M16 17H8" />
    </svg>
  );
}

function ShieldCheckIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function SparklesIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
      <path d="M5 3v4" /><path d="M19 17v4" /><path d="M3 5h4" /><path d="M17 19h4" />
    </svg>
  );
}

function SendIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" />
    </svg>
  );
}

function FileCheckIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="m9 15 2 2 4-4" />
    </svg>
  );
}

function UserCheckIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <polyline points="16 11 18 13 22 9" />
    </svg>
  );
}

function ChevronDownIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function InfoIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
    </svg>
  );
}

function CheckCircleIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function AlertCircleIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" x2="12" y1="8" y2="12" />
      <line x1="12" x2="12.01" y1="16" y2="16" />
    </svg>
  );
}

function LayersIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.9a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
      <path d="m22 12.5-9.42 4.28a2 2 0 0 1-1.66 0L2 12.5" />
      <path d="m22 17.5-9.42 4.28a2 2 0 0 1-1.66 0L2 17.5" />
    </svg>
  );
}

function TargetIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function CheckListIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 11 3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

function StarIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function CpuIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="16" height="16" x="4" y="4" rx="2" />
      <rect width="6" height="6" x="9" y="9" rx="1" />
      <path d="M15 2v2" /><path d="M15 20v2" /><path d="M2 15h2" /><path d="M2 9h2" /><path d="M20 15h2" /><path d="M20 9h2" /><path d="M9 2v2" /><path d="M9 20v2" />
    </svg>
  );
}

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

  useEffect(() => {
    void api<{ job: StoredJob }>(`/api/jobs/${id}`)
      .then((r) => setJob(r.job))
      .catch((e) => setError(e.message));
    void getCandidates()
      .then((items) => setCandidates(items.filter((candidate) => candidate.provenance_status === 'confirmed')))
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

  async function apply() {
    const tab = window.open('about:blank', '_blank');
    try {
      if (tab) tab.opener = null;
      const r = await api<{ intent: { id: string; job: { application_url: string } } }>('/api/application-intents', {
        method: 'POST',
        body: JSON.stringify({ candidateId, jobId: id }),
      });
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

  return (
    <main className="portal-page space-y-6 max-w-6xl w-full mx-auto pb-12">
      {/* Top back navigation */}
      <div>
        <Link
          href="/dashboard/jobs"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors group py-1"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
          Back to public jobs
        </Link>
      </div>

      {error && <WorkspaceError message={error} />}

      {!job && !error ? (
        <WorkspaceSkeleton />
      ) : (
        job && (
          <>
            {/* Header Card */}
            <div className="rounded-2xl border border-border/70 bg-card p-6 shadow-xs space-y-4">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2.5 py-0.5 rounded-full">
                      Job detail
                    </span>
                    <span className="text-xs text-muted-foreground">· ID: {job.id.slice(0, 8)}</span>
                    <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                      Complete Extraction Active
                    </span>
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
                    {job.title}
                  </h1>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground pt-1">
                    <span className="flex items-center gap-1.5 font-semibold text-foreground">
                      <BuildingIcon className="h-4 w-4 text-primary" />
                      {job.company}
                    </span>
                    <span>·</span>
                    <span className="flex items-center gap-1.5">
                      <MapPinIcon className="h-4 w-4 text-muted-foreground" />
                      {job.location || 'Location unknown'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-start">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                      job.state === 'active'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                        : job.state === 'stale'
                        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                        : 'bg-muted text-muted-foreground border border-border'
                    }`}
                  >
                    <span
                      className={`inline-block h-1.5 w-1.5 rounded-full ${
                        job.state === 'active' ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground'
                      }`}
                    />
                    {job.state}
                  </span>
                </div>
              </div>

              {/* Quick Metadata Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-3 border-t border-border/60">
                <div className="rounded-xl border border-border/60 bg-muted/15 p-3 space-y-1">
                  <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
                    <BriefcaseIcon className="h-3.5 w-3.5 text-primary" />
                    Employment Type
                  </div>
                  <div className="text-xs font-semibold text-foreground capitalize">
                    {job.employment_type.replaceAll('_', ' ')}
                  </div>
                </div>

                <div className="rounded-xl border border-border/60 bg-muted/15 p-3 space-y-1">
                  <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider flex items-center gap-1.5">
                    <GlobeIcon className="h-3.5 w-3.5 text-primary" />
                    ATS Provider
                  </div>
                  <div className="text-xs font-semibold text-foreground uppercase">
                    {job.source?.provider || 'Source not recorded'}
                  </div>
                </div>

                <div className="col-span-2 sm:col-span-1 rounded-xl border border-border/60 bg-muted/15 p-3 space-y-1">
                  <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                    Posting Timeline
                  </div>
                  <JobDates posted_at={job.posted_at} closes_at={job.closes_at} provider={job.source?.provider} />
                </div>
              </div>

              {/* Top Tech Stack Highlights */}
              {structured && structured.topTechStack.length > 0 && (
                <div className="pt-2 flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <CpuIcon className="h-3 w-3 text-primary" />
                    Core Tech Stack:
                  </span>
                  {structured.topTechStack.map((tech) => (
                    <span
                      key={tech}
                      className="inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-lg bg-primary/10 text-primary border border-primary/20"
                    >
                      {tech}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Main Content Grid */}
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
              {/* Left Column: Complete Structured Extraction */}
              <article className="min-w-0 space-y-6">

                {/* 1. EXTRACTED EXPLICIT CONSTRAINTS & ELIGIBILITY */}
                {structured && structured.constraints.length > 0 && (
                  <section className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 shadow-xs space-y-3">
                    <div className="flex items-center gap-2">
                      <AlertCircleIcon className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                      <h2 className="text-sm font-bold text-foreground">Critical Role Constraints & Work Eligibility</h2>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      {structured.constraints.map((c, i) => (
                        <div key={i} className="rounded-xl border border-amber-500/20 bg-background/80 p-3 space-y-1">
                          <div className="text-[11px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide">
                            {c.title}
                          </div>
                          <p className="text-xs text-foreground/90 leading-snug">
                            {c.description}
                          </p>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* 2. COMPLETE SKILLS CATALOG (Categorized & Verified) */}
                <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-xs space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-border/60">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        <LayersIcon className="h-4 w-4" />
                      </div>
                      <div>
                        <h2 className="text-sm font-bold text-foreground">Complete Extracted Skills Catalog</h2>
                        <p className="text-[11px] text-muted-foreground">
                          {structured?.skills.length || 0} skills & technologies comprehensively extracted across the entire posting
                        </p>
                      </div>
                    </div>
                    {activeCandidate && (
                      <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                        Comparing with {activeCandidate.full_name}
                      </span>
                    )}
                  </div>

                  {skillsByCategory.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No specific skills detected in the posting text.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {skillsByCategory.map(([category, skills]) => (
                        <div key={category} className="rounded-xl border border-border/50 bg-muted/10 p-3.5 space-y-2">
                          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                            <span>{category}</span>
                            <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-muted text-muted-foreground">
                              {skills.length}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {skills.map((skill) => {
                              const isMatched = fitAnalysis?.matchedSkills.some(
                                (m) => m.skill.toLowerCase() === skill.name.toLowerCase()
                              );
                              return (
                                <span
                                  key={skill.name}
                                  title={skill.sourceSnippet}
                                  className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg border transition-all ${
                                    isMatched
                                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-700 dark:text-emerald-300 font-semibold shadow-2xs'
                                      : 'bg-background border-border/80 text-foreground/80'
                                  }`}
                                >
                                  {isMatched && <CheckCircleIcon className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />}
                                  {skill.name}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                {/* 3. CORE RESPONSIBILITIES & DELIVERABLES */}
                {structured && structured.responsibilities.length > 0 && (
                  <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-xs space-y-4">
                    <div className="flex items-center gap-2 pb-3 border-b border-border/60">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <CheckListIcon className="h-4 w-4" />
                      </div>
                      <div>
                        <h2 className="text-sm font-bold text-foreground">Extracted Core Responsibilities & Impact</h2>
                        <p className="text-[11px] text-muted-foreground">
                          Specific deliverables and daily expectations parsed from the job description
                        </p>
                      </div>
                    </div>
                    <ul className="space-y-2.5 pt-1">
                      {structured.responsibilities.map((resp, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-xs text-foreground/90 leading-relaxed">
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                          <span>{resp}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {/* 4. REQUIRED QUALIFICATIONS & MUST-HAVES */}
                {structured && structured.mustHaves.length > 0 && (
                  <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-xs space-y-4">
                    <div className="flex items-center gap-2 pb-3 border-b border-border/60">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        <TargetIcon className="h-4 w-4" />
                      </div>
                      <div>
                        <h2 className="text-sm font-bold text-foreground">Required Qualifications & Must-Haves</h2>
                        <p className="text-[11px] text-muted-foreground">
                          Essential experience, technical competencies, and education required by the employer
                        </p>
                      </div>
                    </div>
                    <div className="space-y-2.5 pt-1">
                      {structured.mustHaves.map((req, i) => (
                        <div key={i} className="rounded-xl border border-border/60 bg-muted/15 p-3 text-xs flex items-start gap-2.5">
                          <CheckCircleIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                          <div className="space-y-1">
                            <p className="font-semibold text-foreground leading-snug">{req}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {/* 5. PREFERRED / NICE-TO-HAVE QUALIFICATIONS */}
                {structured && structured.niceToHaves.length > 0 && (
                  <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-xs space-y-4">
                    <div className="flex items-center gap-2 pb-3 border-b border-border/60">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                        <StarIcon className="h-4 w-4" />
                      </div>
                      <div>
                        <h2 className="text-sm font-bold text-foreground">Preferred / Bonus Qualifications</h2>
                        <p className="text-[11px] text-muted-foreground">
                          Desirable skills that give the candidate an edge
                        </p>
                      </div>
                    </div>
                    <ul className="space-y-2 pt-1">
                      {structured.niceToHaves.map((nice, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-xs text-foreground/90 leading-relaxed">
                          <StarIcon className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                          <span>{nice}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {/* 6. FULL RAW JOB DESCRIPTION (Collapsible) */}
                <section className="rounded-2xl border border-border/70 bg-card overflow-hidden shadow-xs">
                  <button
                    type="button"
                    onClick={() => setRawExpanded(!rawExpanded)}
                    className="w-full flex items-center justify-between p-5 text-left font-bold text-foreground hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <FileTextIcon className="h-4 w-4 text-primary" />
                      <span className="text-sm">Complete Raw Job Description Text</span>
                    </div>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      {rawExpanded ? 'Hide Raw Text' : 'View Raw Posting'}
                      <ChevronDownIcon className={`h-4 w-4 transition-transform ${rawExpanded ? 'rotate-180' : ''}`} />
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

                <div className="rounded-xl border border-border/70 bg-muted/20 p-4 text-xs text-muted-foreground flex items-start gap-2.5 shadow-2xs">
                  <ShieldCheckIcon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-foreground">Employment evidence:</span>{' '}
                    {job.employment_evidence || 'No explicit evidence recorded.'}
                  </div>
                </div>
              </article>

              {/* Right Column: Candidate & Next Action Console */}
              <aside className="space-y-5 rounded-2xl border border-border/70 bg-card p-5 shadow-xs lg:sticky lg:top-6 backdrop-blur-xs">
                <div className="space-y-1 pb-3 border-b border-border/60">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <SparklesIcon className="h-3.5 w-3.5" />
                    </div>
                    <h2 className="text-sm font-bold text-foreground">Candidate & next action</h2>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Match candidate skills and initiate linked applications
                  </p>
                </div>

                <Button
                  variant="outline"
                  className="w-full h-10 rounded-xl border-primary/25 bg-primary/5 hover:bg-primary/10 text-primary text-xs font-semibold shadow-xs flex items-center justify-center gap-2 cursor-pointer transition-all"
                  onClick={() => setMatcher(true)}
                >
                  <SparklesIcon className="h-3.5 w-3.5" />
                  Compare reviewed candidate with AI
                </Button>

                {canRecruit ? (
                  <section className="space-y-4 pt-1">
                    <label className="grid gap-1.5 text-xs font-semibold text-foreground">
                      <span>Candidate</span>
                      <select
                        aria-label="Candidate for application"
                        className="h-10 rounded-xl border border-input bg-background px-3 text-xs font-medium shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                        value={candidateId}
                        onChange={(event) => setCandidate(event.target.value)}
                      >
                        <option value="">Choose candidate</option>
                        {candidates.map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.full_name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="grid gap-2 pt-1">
                      <Button
                        disabled={!candidates.some((candidate) => candidate.id === candidateId) || job.state === 'closed'}
                        className="w-full h-10 rounded-xl font-semibold bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 transition-all flex items-center justify-center gap-2 cursor-pointer text-xs"
                        onClick={() => void apply()}
                      >
                        <SendIcon className="h-3.5 w-3.5" />
                        Start linked application
                      </Button>

                      <Button
                        disabled={!candidates.some((candidate) => candidate.id === candidateId)}
                        variant="outline"
                        className="w-full h-10 rounded-xl font-semibold border-border/80 shadow-xs hover:border-primary/50 transition-all flex items-center justify-center gap-2 cursor-pointer text-xs"
                        onClick={() => void draft()}
                      >
                        <FileCheckIcon className="h-3.5 w-3.5" />
                        Prepare factual packet draft
                      </Button>
                    </div>

                    <div className="rounded-xl border border-border/60 bg-muted/20 p-3 text-[11px] leading-relaxed text-muted-foreground">
                      Starting opens the external form and creates a draft. It does not mean an application was submitted.
                    </div>

                    {candidateId && (
                      <div className="pt-1">
                        <Link
                          href={`/dashboard/candidates/${candidateId}`}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                        >
                          <UserCheckIcon className="h-3.5 w-3.5" />
                          Review candidate facts & documents
                        </Link>
                      </div>
                    )}
                  </section>
                ) : (
                  <div className="pt-2">
                    <a
                      className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-all"
                      href={job.application_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open public application
                    </a>
                  </div>
                )}
              </aside>
            </div>

            {/* Status notice */}
            {notice && (
              <div
                role="status"
                className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs font-medium text-primary flex items-center gap-2.5 animate-in fade-in-50"
              >
                <InfoIcon className="h-4 w-4 shrink-0" />
                <span>{notice}</span>
              </div>
            )}

            {/* Prepared packet details */}
            {!!packet && (
              <details className="group rounded-2xl border border-border/70 bg-card overflow-hidden text-xs shadow-xs">
                <summary className="flex items-center justify-between p-4 font-semibold cursor-pointer select-none text-foreground hover:bg-muted/40 transition-colors">
                  <span>Prepared packet details</span>
                  <ChevronDownIcon className="h-4 w-4 transition-transform group-open:rotate-180 text-muted-foreground" />
                </summary>
                <pre className="p-4 border-t border-border/50 text-xs font-mono bg-muted/20 max-h-80 overflow-y-auto leading-relaxed">
                  {JSON.stringify(packet, null, 2)}
                </pre>
              </details>
            )}

            {/* Dialog */}
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
          </>
        )
      )}
    </main>
  );
}
