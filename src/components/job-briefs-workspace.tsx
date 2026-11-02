"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { WorkflowTaskStatus } from '@/components/workflow-task-status';

type Criterion = { requirement: string; jobEvidence: string; importance: 'required' | 'preferred' };
type Constraint = { field: string; requiredValue: boolean; jobEvidence: string };
type Criteria = { requirements: Criterion[]; constraints: Constraint[] };
type Brief = { id: string; title: string; company: string; description: string; status: string; version: number; task_id: string; requirements: Criteria };
type Match = {
  candidateId: string;
  name: string;
  coverage: number | null;
  supported: number;
  unknown: number;
  requiredUnknown: number;
  shortlisted: boolean;
  assignedRecruiterId?: string | null;
  requirements: (Criterion & { status: string; candidateEvidence: string | null })[];
  constraints: (Constraint & { status: string })[];
};
type Results = { matches: Match[]; totalCandidates: number; hasMore: boolean; briefVersion: number };

const emptyCriteria: Criteria = { requirements: [], constraints: [] };

function SparklesIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
      <path d="M5 3v4" /><path d="M19 17v4" /><path d="M3 5h4" /><path d="M17 19h4" />
    </svg>
  );
}

function FileTextIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" /><path d="M16 13H8" /><path d="M16 17H8" />
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

function UploadCloudIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
      <path d="M12 12v9" /><path d="m16 16-4-4-4 4" />
    </svg>
  );
}

function PlusIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14" /><path d="M12 5v14" />
    </svg>
  );
}

function TrashIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
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

function CheckCircleIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function ArrowRightIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
    </svg>
  );
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return 'CD';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function JobBriefsWorkspace({ embedded = false, onAssign }: { embedded?: boolean; onAssign?: (candidateId: string) => void }) {
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [criteria, setCriteria] = useState<Criteria>(emptyCriteria);
  const [confirmed, setConfirmed] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [results, setResults] = useState<Results | null>(null);
  const [page, setPage] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const activeBrief = useRef('');

  const refreshList = useCallback(async () => {
    const data = await api<{ briefs: Brief[] }>('/api/admin/job-briefs');
    setBriefs(data.briefs);
  }, []);

  useEffect(() => {
    let active = true;
    void api<{ briefs: Brief[] }>('/api/admin/job-briefs')
      .then((data) => {
        if (active) setBriefs(data.briefs);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
      activeBrief.current = '';
    };
  }, []);

  const loadBrief = useCallback(async (id: string) => {
    activeBrief.current = id;
    const data = await api<{ brief: Brief }>(`/api/admin/job-briefs/${id}`);
    if (activeBrief.current !== id) return;
    setBrief(data.brief);
    setCriteria(data.brief.requirements || emptyCriteria);
    setConfirmed(false);
    setDirty(false);
    setResults(null);
    setPage(0);
    setError('');
  }, []);

  const complete = useCallback(async () => {
    if (brief) await loadBrief(brief.id);
    await refreshList();
  }, [brief, loadBrief, refreshList]);

  function edit(next: Criteria) {
    setCriteria(next);
    setDirty(true);
    setConfirmed(false);
    setResults(null);
  }

  async function review() {
    if (!brief) return;
    setBusy(true);
    try {
      const data = await api<{ brief: Brief }>(`/api/admin/job-briefs/${brief.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ version: brief.version, requirements: criteria, confirmRequirements: confirmed }),
      });
      if (activeBrief.current !== brief.id) return;
      setBrief(data.brief);
      setCriteria(data.brief.requirements);
      setConfirmed(false);
      setDirty(false);
      setResults(null);
      await refreshList();
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function match(nextPage = 0) {
    if (!brief) return;
    setBusy(true);
    try {
      const data = await api<Results>(`/api/admin/job-briefs/${brief.id}/matches?page=${nextPage}`);
      if (activeBrief.current !== brief.id) return;
      if (data.briefVersion !== brief.version) throw new Error('JD changed. Reload it and match again.');
      setResults(data);
      setPage(nextPage);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function shortlist(row: Match) {
    if (!brief) return;
    setBusy(true);
    try {
      await api(`/api/admin/job-briefs/${brief.id}/matches`, {
        method: 'POST',
        body: JSON.stringify({ candidateId: row.candidateId, shortlisted: !row.shortlisted }),
      });
      await match(page);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="JD candidate matching" className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary mb-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            AI Candidate Sourcing & Matching
          </div>
          {embedded ? (
            <h2 className="text-xl font-bold tracking-tight text-foreground">Find candidates by JD</h2>
          ) : (
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Find candidates by JD</h1>
          )}
          <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
            Upload a job description, review its requirements, and compare active reviewed candidates already saved in NextKinHR.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 border border-border/70 rounded-xl px-3 py-2">
          <SparklesIcon className="h-4 w-4 text-primary shrink-0" />
          <span>Factual resume evidence matching with zero AI hallucination</span>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-center gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm font-medium text-destructive">
          <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span>{error}</span>
        </div>
      )}

      {/* New Job Description Form Card */}
      <form
        className="rounded-2xl border border-border/70 bg-card p-6 shadow-xs space-y-6 relative overflow-hidden"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          setBusy(true);
          setError('');
          try {
            const data = await api<{ briefId: string; taskId: string }>('/api/admin/job-briefs', {
              method: 'POST',
              body: new FormData(form),
            });
            await loadBrief(data.briefId);
            await refreshList();
            form.reset();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="flex items-center justify-between pb-4 border-b border-border/60">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FileTextIcon className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-semibold text-base text-foreground">New job description</h3>
              <p className="text-xs text-muted-foreground">Extract structured criteria, priorities, and constraints directly from job text</p>
            </div>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
            <SparklesIcon className="h-3 w-3" />
            AI Extraction
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-xs font-medium text-foreground">
            <span>JD title <span className="text-destructive">*</span></span>
            <input
              className="h-10 rounded-xl border border-input bg-background/80 px-3.5 text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 placeholder:text-muted-foreground/60 shadow-xs"
              name="title"
              aria-label="JD title"
              placeholder="e.g. Senior Backend Engineer (Python / AWS)"
              required
              maxLength={200}
            />
          </label>
          <label className="grid gap-1.5 text-xs font-medium text-foreground">
            <span>Company (optional)</span>
            <input
              className="h-10 rounded-xl border border-input bg-background/80 px-3.5 text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 placeholder:text-muted-foreground/60 shadow-xs"
              name="company"
              placeholder="e.g. Scale AI, Stripe, or Stealth Startup"
              maxLength={200}
            />
          </label>
        </div>

        <label className="grid gap-1.5 text-xs font-medium text-foreground">
          <span>Paste job description</span>
          <textarea
            className="min-h-36 rounded-xl border border-input bg-background/80 p-3.5 text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 placeholder:text-muted-foreground/60 shadow-xs leading-relaxed"
            name="description"
            aria-label="Paste job description"
            placeholder="Paste raw job description, roles & responsibilities, and required qualifications here..."
            maxLength={100000}
          />
        </label>

        {/* Upload Dropzone Area */}
        <div className="space-y-2">
          <label className="grid gap-2 text-xs font-medium text-foreground">
            <div className="flex items-center justify-between">
              <span>Or upload PDF / DOCX</span>
              <div className="flex items-center gap-1.5">
                <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">PDF</span>
                <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">DOCX</span>
                <span className="text-[10px] text-muted-foreground">Up to 10 MiB</span>
              </div>
            </div>
            <div className="relative rounded-xl border border-dashed border-border/80 bg-muted/10 hover:bg-muted/20 hover:border-primary/50 transition-all p-4 text-center cursor-pointer">
              <input
                type="file"
                name="file"
                accept=".pdf,.docx"
                aria-label="Upload job description"
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
              />
              <div className="flex flex-col items-center justify-center gap-1.5 pointer-events-none">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-background border border-border/70 text-muted-foreground shadow-2xs">
                  <UploadCloudIcon className="h-4 w-4 text-primary" />
                </div>
                <div className="text-xs font-medium text-foreground">
                  <span className="text-primary hover:underline">Choose file</span> or drag & drop here
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Private JDs stay separate from public job listings. Up to 20 PDF pages.
                </p>
              </div>
            </div>
          </label>
        </div>

        {/* Permission Checkbox Callout */}
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 transition-all">
          <label className="flex items-start gap-3 text-xs font-medium text-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              name="consent"
              value="true"
              required
              className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary accent-primary cursor-pointer"
            />
            <span className="leading-relaxed">
              I have permission to process this JD with the configured AI provider.
            </span>
          </label>
        </div>

        <div>
          <Button
            disabled={busy}
            type="submit"
            className="h-10 rounded-xl px-5 font-semibold bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 transition-all flex items-center gap-2 cursor-pointer"
          >
            {busy ? (
              <>
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-r-transparent" />
                Working…
              </>
            ) : (
              <>
                <SparklesIcon className="h-4 w-4" />
                Extract JD requirements
              </>
            )}
          </Button>
        </div>
      </form>

      {/* Saved JDs Dropdown Selector */}
      {!!briefs.length && (
        <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground">
              <BriefcaseIcon className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Active Workspace</div>
              <div className="text-sm font-semibold text-foreground">Saved job descriptions ({briefs.length})</div>
            </div>
          </div>
          <label className="grid gap-1 text-sm min-w-[280px] sm:min-w-[360px]">
            <span className="sr-only">Saved JDs</span>
            <select
              aria-label="Saved JDs"
              className="h-10 rounded-xl border border-input bg-background px-3.5 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 shadow-xs cursor-pointer"
              value={brief?.id || ''}
              onChange={(event) => {
                if (event.target.value) void loadBrief(event.target.value).catch((e) => setError(e.message));
              }}
            >
              <option value="">Choose a saved JD</option>
              {briefs.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.title} · {row.company || 'Company not set'} · {row.status}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {/* Active Brief & Criteria Review Panel */}
      {brief && (
        <>
          <article className="rounded-2xl border border-border/70 bg-card p-6 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border/60">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-lg text-foreground">
                    {brief.title}
                    {brief.company ? ` · ${brief.company}` : ''}
                  </h3>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      brief.status === 'ready'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                        : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                    }`}
                  >
                    {brief.status === 'ready' ? 'Reviewed' : 'Review required'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  JD version {brief.version} · {brief.status === 'ready' ? 'Ready for candidate matching' : 'Review and confirm requirements below'}
                </p>
              </div>
            </div>

            {/* Expandable Original JD Text */}
            <details className="group rounded-xl border border-border/60 bg-muted/20 overflow-hidden">
              <summary className="flex items-center justify-between p-3.5 text-xs font-semibold cursor-pointer select-none text-foreground hover:bg-muted/40 transition-colors">
                <span className="flex items-center gap-2">
                  <FileTextIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  Original JD text
                </span>
                <ChevronDownIcon className="h-4 w-4 transition-transform group-open:rotate-180 text-muted-foreground" />
              </summary>
              <div className="p-4 border-t border-border/50 text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap font-mono bg-background/50 max-h-72 overflow-y-auto">
                {brief.description}
              </div>
            </details>

            {brief.status === 'queued' ? (
              <WorkflowTaskStatus taskId={brief.task_id} onComplete={complete} />
            ) : (
              <>
                <div className="rounded-xl border border-border/60 bg-muted/30 p-3.5 text-xs text-muted-foreground leading-relaxed">
                  Correct extracted terms and exact JD evidence. Required criteria count twice as much as preferred criteria. Unknown candidate facts remain unknown.
                </div>

                {/* Criteria / Requirements List */}
                <div className="space-y-3">
                  {criteria.requirements.map((row, index) => (
                    <div
                      key={index}
                      className="group rounded-xl border border-border/70 bg-card p-4 transition-all hover:border-primary/40 hover:shadow-2xs space-y-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/10 text-primary text-[10px] font-bold">
                            {index + 1}
                          </span>
                          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Requirement {index + 1}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <select
                            aria-label={`Priority ${index + 1}`}
                            className="h-8 rounded-lg border border-input bg-background/90 px-2.5 text-xs font-medium text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
                            value={row.importance}
                            onChange={(event) =>
                              edit({
                                ...criteria,
                                requirements: criteria.requirements.map((item, i) =>
                                  i === index ? { ...item, importance: event.target.value as Criterion['importance'] } : item
                                ),
                              })
                            }
                          >
                            <option value="required">Required (2x weight)</option>
                            <option value="preferred">Preferred (1x weight)</option>
                          </select>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive cursor-pointer"
                            onClick={() =>
                              edit({
                                ...criteria,
                                requirements: criteria.requirements.filter((_, i) => i !== index),
                              })
                            }
                          >
                            <TrashIcon className="h-3.5 w-3.5 mr-1" />
                            Remove
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-2.5">
                        <label className="grid gap-1 text-xs font-medium text-foreground">
                          <span className="sr-only">Requirement {index + 1}</span>
                          <input
                            aria-label={`Requirement ${index + 1}`}
                            className="h-9 rounded-lg border border-input bg-background px-3 text-xs font-semibold text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shadow-2xs"
                            value={row.requirement}
                            placeholder="e.g. 5+ years experience with Python, FastAPI and distributed systems"
                            onChange={(event) =>
                              edit({
                                ...criteria,
                                requirements: criteria.requirements.map((item, i) =>
                                  i === index ? { ...item, requirement: event.target.value } : item
                                ),
                              })
                            }
                          />
                        </label>
                        <label className="grid gap-1 text-xs font-medium text-muted-foreground">
                          <div className="flex items-center justify-between text-[11px]">
                            <span>Exact JD evidence</span>
                            <span className="text-muted-foreground/60 italic">Verbatim from JD</span>
                          </div>
                          <textarea
                            aria-label={`JD evidence ${index + 1}`}
                            className="min-h-16 rounded-lg border border-border/80 bg-muted/15 p-2.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shadow-2xs leading-relaxed"
                            value={row.jobEvidence}
                            placeholder="Exact sentence or bullet point quoting from the JD..."
                            onChange={(event) =>
                              edit({
                                ...criteria,
                                requirements: criteria.requirements.map((item, i) =>
                                  i === index ? { ...item, jobEvidence: event.target.value } : item
                                ),
                              })
                            }
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>

                <div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 rounded-xl border-dashed border-border/80 hover:border-primary/50 text-xs font-medium cursor-pointer"
                    disabled={criteria.requirements.length >= 60}
                    onClick={() =>
                      edit({
                        ...criteria,
                        requirements: [...criteria.requirements, { requirement: '', jobEvidence: '', importance: 'required' }],
                      })
                    }
                  >
                    <PlusIcon className="h-3.5 w-3.5 mr-1.5" />
                    Add quoted requirement
                  </Button>
                </div>

                {/* Explicit Constraints details */}
                {!!criteria.constraints.length && (
                  <details className="group rounded-xl border border-border/60 bg-muted/20 overflow-hidden text-xs">
                    <summary className="flex items-center justify-between p-3.5 font-semibold cursor-pointer select-none text-foreground hover:bg-muted/40 transition-colors">
                      <span>Review explicit constraints ({criteria.constraints.length})</span>
                      <ChevronDownIcon className="h-4 w-4 transition-transform group-open:rotate-180 text-muted-foreground" />
                    </summary>
                    <div className="p-4 border-t border-border/50 space-y-3">
                      {criteria.constraints.map((row, index) => (
                        <div key={index} className="flex items-start justify-between gap-3 border-b border-border/50 pb-3 last:border-b-0 last:pb-0">
                          <div>
                            <div className="font-semibold text-foreground">
                              {row.field.replaceAll('_', ' ')} · required answer: <span className="text-primary">{row.requiredValue ? 'Yes' : 'No'}</span>
                            </div>
                            <p className="mt-1 text-muted-foreground italic font-mono text-[11px]">{row.jobEvidence}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-destructive hover:bg-destructive/10"
                            onClick={() =>
                              edit({
                                ...criteria,
                                constraints: criteria.constraints.filter((_, i) => i !== index),
                              })
                            }
                          >
                            Remove constraint
                          </Button>
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                {/* Confirmation Box */}
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 transition-all">
                  <label className="flex items-start gap-3 text-xs font-medium text-foreground cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={(event) => setConfirmed(event.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary accent-primary cursor-pointer"
                    />
                    <span className="leading-relaxed">
                      I reviewed these requirements and priorities.
                    </span>
                  </label>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <Button
                    disabled={busy || !confirmed || !criteria.requirements.length}
                    onClick={() => void review()}
                    className="h-10 rounded-xl px-5 font-semibold bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 transition-all cursor-pointer"
                  >
                    Save reviewed requirements
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy || brief.status !== 'ready' || dirty}
                    onClick={() => void match()}
                    className="h-10 rounded-xl px-5 font-semibold border-border/80 shadow-xs hover:border-primary/50 transition-all cursor-pointer"
                  >
                    Find matching candidates
                  </Button>
                </div>
              </>
            )}
          </article>

          {/* Matched Database Candidates Results Section */}
          {results && (
            <section aria-label="Matched database candidates" className="space-y-4">
              <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <CheckCircleIcon className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Matched candidates breakdown</h3>
                    <p className="text-xs text-muted-foreground">
                      Compared {results.totalCandidates} active reviewed candidates · JD version {results.briefVersion}. Scores measure supported resume evidence, not hiring probability. Unreviewed and inactive profiles are excluded.
                    </p>
                  </div>
                </div>
              </div>

              {!results.matches.length && (
                <div className="rounded-2xl border border-dashed border-border/80 bg-muted/20 p-8 text-center space-y-2">
                  <p className="text-sm font-medium text-foreground">No active reviewed candidate profiles are available.</p>
                  <p className="text-xs text-muted-foreground">Review candidate resumes and bench status first in the Talent workspace.</p>
                </div>
              )}

              <div className="space-y-4">
                {results.matches.map((row) => (
                  <article
                    key={row.candidateId}
                    className="rounded-2xl border border-border/70 bg-card p-5 shadow-xs space-y-4 hover:border-primary/40 hover:shadow-sm transition-all"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 text-xs font-bold text-primary shadow-2xs">
                          {getInitials(row.name)}
                        </div>
                        <div>
                          <h3 className="text-base font-bold text-foreground">{row.name}</h3>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {row.supported} supported · {row.unknown} unknown · {row.requiredUnknown} required criteria need evidence
                          </p>
                        </div>
                      </div>

                      <div>
                        {row.coverage === null ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground">
                            <strong>Insufficient evidence</strong>
                          </span>
                        ) : (
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                              row.coverage >= 75
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                                : row.coverage >= 40
                                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                                : 'bg-muted text-muted-foreground border border-border'
                            }`}
                          >
                            <strong>{row.coverage}% evidence coverage</strong>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Requirement Evidence Details */}
                    <details className="group rounded-xl border border-border/60 bg-muted/20 overflow-hidden text-xs">
                      <summary className="flex items-center justify-between p-3 font-semibold cursor-pointer select-none text-foreground hover:bg-muted/40 transition-colors">
                        <span>View requirement evidence</span>
                        <ChevronDownIcon className="h-4 w-4 transition-transform group-open:rotate-180 text-muted-foreground" />
                      </summary>
                      <div className="p-4 border-t border-border/50 space-y-3">
                        <ul className="space-y-2.5">
                          {row.requirements.map((item, index) => (
                            <li key={index} className="rounded-lg border border-border/60 bg-background/60 p-3 space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <div className="font-semibold text-foreground">
                                  <strong>{item.requirement}</strong> · <span className="text-muted-foreground font-normal">{item.importance}</span>
                                </div>
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
                                    item.status === 'met'
                                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                      : 'bg-muted text-muted-foreground'
                                  }`}
                                >
                                  {item.status === 'met' ? 'Supported' : 'Unknown'}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground leading-relaxed">
                                {item.candidateEvidence || 'No supporting reviewed fact recorded.'}
                              </p>
                            </li>
                          ))}
                        </ul>
                        {row.constraints.map((item, index) => (
                          <div key={index} className="text-xs font-mono text-muted-foreground pt-1">
                            {item.field.replaceAll('_', ' ')}: <span className="font-semibold text-foreground">{item.status}</span>
                          </div>
                        ))}
                      </div>
                    </details>

                    {/* Action Bar */}
                    <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-border/60">
                      <Button
                        size="sm"
                        variant={row.shortlisted ? 'default' : 'outline'}
                        className={`h-8 rounded-lg px-3.5 text-xs font-semibold cursor-pointer ${
                          row.shortlisted ? 'bg-primary text-primary-foreground' : 'border-border/80'
                        }`}
                        disabled={busy}
                        onClick={() => void shortlist(row)}
                      >
                        {row.shortlisted ? 'Remove from shortlist' : 'Shortlist candidate'}
                      </Button>
                      {onAssign ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 rounded-lg px-3.5 text-xs font-medium cursor-pointer"
                          onClick={() => onAssign(row.candidateId)}
                        >
                          Assign recruiter
                        </Button>
                      ) : (
                        <Link
                          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                          href="/dashboard/team"
                        >
                          Manage recruiter assignment
                        </Link>
                      )}
                      <Link
                        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:underline ml-auto"
                        href={`/dashboard/candidates/${row.candidateId}/edit`}
                      >
                        View profile
                        <ArrowRightIcon className="h-3 w-3" />
                      </Link>
                    </div>
                  </article>
                ))}
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between pt-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-lg px-3 text-xs font-medium cursor-pointer"
                  disabled={busy || page === 0}
                  onClick={() => void match(page - 1)}
                >
                  Previous candidates
                </Button>
                <span className="text-xs text-muted-foreground">Page {page + 1}</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-lg px-3 text-xs font-medium cursor-pointer"
                  disabled={busy || !results.hasMore}
                  onClick={() => void match(page + 1)}
                >
                  Next candidates
                </Button>
              </div>
            </section>
          )}
        </>
      )}
    </section>
  );
}
