'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Briefcase,
  Download,
  FileText,
  ShieldCheck,
  MapPin,
  Mail,
  Phone,
  ExternalLink,
  Pencil,
  Globe,
  User,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { WorkspaceError, WorkspaceSkeleton } from '@/components/workspace-ui';
import { api } from '@/lib/api-client';
import { candidateResumeMarkdown, exportCandidateResume } from '@/lib/candidate-resume-export';
import type { Candidate } from '@/types/database';

type Document = { id: string; filename: string; status: string };
export function CandidateDetailDialog({
  candidate,
  open,
  onOpenChange,
  onEdit,
  onSubmitJob,
}: {
  candidate: Candidate | null;
  open: boolean;
  onOpenChange: (value: boolean) => void;
  onEdit?: (candidate: Candidate) => void;
  onSubmitJob?: (candidate: Candidate) => void;
}) {
  const [documents, setDocuments] = useState<Document[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(''),
    [tab, setTab] = useState('profile');
  useEffect(() => {
    let active = true;
    if (candidate && open)
      void api<{ documents: Document[] }>(`/api/candidates/${candidate.id}/documents`)
        .then((result) => {
          if (active) setDocuments(result.documents);
        })
        .catch((e) => active && setError(e.message))
        .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [candidate, open]);
  if (!candidate) return null;
  const verified = candidate.provenance_status === 'confirmed';
  async function downloadOriginal(document?: Document) {
    if (!candidate) return;
    setError('');
    setBusy('original');
    try {
      const selected = document || documents[0];
      if (!selected)
        throw new Error(
          'No resume document is saved for this candidate. Upload a PDF or DOCX in Review / edit.'
        );
      const response = await api<{ url: string }>(`/api/resumes/${selected.id}/download`);
      window.open(response.url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  async function exportFile(format: 'docx' | 'pdf') {
    if (!candidate) return;
    setBusy(format);
    setError('');
    try {
      await exportCandidateResume(candidate, format);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-border/60 border-b p-5 pr-12">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className={`status-chip ${verified ?'status-positive' : 'status-warning'}`}>
              <ShieldCheck className="size-3" />
              {verified ? 'Reviewed profile' : 'Unconfirmed import'}
            </span>
            <span className="text-muted-foreground text-[11px]">
              Profile version {candidate.version || 1}
            </span>
          </div>
          <DialogTitle className="text-[20px] tracking-tight">{candidate.full_name}</DialogTitle>
          <DialogDescription>
            {candidate.target_job_titles ||
              candidate.current_job_title ||
              'Target role not recorded'}
          </DialogDescription>
        </DialogHeader>
        <div
          className="bg-muted/20 flex items-center gap-1 border-b px-5 py-2"
          aria-label="Profile sections"
        >
          {[
            { id: 'profile', label: 'Profile overview' },
            { id: 'resume', label: 'Resume preview' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={tab === item.id}
              onClick={() => setTab(item.id)}
              className={`rounded-[8px] px-3 py-2 text-[13px] font-medium ${tab === item.id ?'bg-card text-foreground ' : 'text-muted-foreground hover:bg-muted'}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          {error && <WorkspaceError message={error} />}
          {tab === 'profile' ? (
            <>
              <div className="border-border/60 bg-muted/20 grid gap-3 rounded-[10px] border p-4 text-[13px] sm:grid-cols-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Mail className="text-muted-foreground size-3.5 shrink-0" />
                  <span className="break-words">{candidate.email || 'Email not recorded'}</span>
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  <Phone className="text-muted-foreground size-3.5 shrink-0" />
                  <span className="break-words">{candidate.phone || 'Phone not recorded'}</span>
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  <MapPin className="text-primary size-3.5 shrink-0" />
                  <span className="font-medium break-words">
                    {[candidate.current_city, candidate.current_state].filter(Boolean).join(', ') ||
                      candidate.full_address ||
                      candidate.preferred_locations ||
                      'Location not recorded'}
                  </span>
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  <Globe className="text-primary size-3.5 shrink-0" />
                  <span className="font-medium break-words">
                    {candidate.linkedin_url ? (
                      <a
                        href={
                          candidate.linkedin_url.startsWith('http')
                            ? candidate.linkedin_url
                            : `https://${candidate.linkedin_url}`
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline"
                      >
                        {candidate.linkedin_url}
                      </a>
                    ) : (
                      'LinkedIn not recorded'
                    )}
                  </span>
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  <User className="text-muted-foreground size-3.5 shrink-0" />
                  <span className="break-words">
                    Gender:{' '}
                    {candidate.gender ||
                      (candidate.confirmed_facts as any)?.gender ||
                      'Not specified'}
                  </span>
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  <User className="text-muted-foreground size-3.5 shrink-0" />
                  <span className="break-words">
                    Race:{' '}
                    {candidate.race ||
                      (candidate.confirmed_facts as any)?.race ||
                      candidate.race_ethnicity ||
                      (candidate.confirmed_facts as any)?.race_ethnicity ||
                      'Not specified'}
                  </span>
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  <ShieldCheck className="text-muted-foreground size-3.5 shrink-0" />
                  <span className="break-words">
                    Veteran:{' '}
                    {candidate.veteran ||
                      candidate.veteran_status ||
                      (candidate.confirmed_facts as any)?.veteran ||
                      (candidate.confirmed_facts as any)?.veteran_status ||
                      'Not specified'}
                  </span>
                </div>
                <div className="flex min-w-0 items-center gap-2 sm:col-span-2">
                  <Briefcase className="text-muted-foreground size-3.5 shrink-0" />
                  <span className="break-words">
                    Work Auth:{' '}
                    {candidate.work_authorization ||
                      candidate.visa_status ||
                      (candidate.authorized_in_usa ? 'Authorized in USA' : 'Requires Sponsorship')}
                  </span>
                </div>
              </div>
              <section>
                <h3 className="section-label">Skills & work authorization</h3>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(candidate.primary_skills || 'Skills not recorded')
                    .split(/[,;\n]/)
                    .filter(Boolean)
                    .map((skill) => (
                      <span key={skill} className="bg-muted/40 rounded-[8px] border px-2 py-1 text-[13px]">
                        {skill.trim()}
                      </span>
                    ))}
                </div>
                {candidate.secondary_skills && (
                  <p className="text-muted-foreground mt-2 text-[13px]">
                    Additional · {candidate.secondary_skills}
                  </p>
                )}
                <p className="mt-3 text-[13px]">
                  {candidate.visa_status || candidate.work_authorization || 'Visa not recorded'} ·{' '}
                  {candidate.is_active_bench ? 'Active on bench' : 'Not on active bench'}
                </p>
              </section>
              <section>
                <h3 className="section-label">Work history</h3>
                {candidate.employment_history?.length ? (
                  <ol className="border-border mt-4 space-y-5 border-l pl-5">
                    {candidate.employment_history.map((job, index) => (
                      <li key={index} className="relative">
                        <span className="border-card bg-primary ring-border absolute top-1 -left-[25px] size-2 rounded-full border-2 ring-2" />
                        <p className="text-[13px] font-medium">
                          {String(job.title || 'Title not recorded')}
                        </p>
                        <p className="text-muted-foreground mt-0.5 text-[13px]">
                          {String(job.employer || 'Employer not recorded')}
                        </p>
                        <p className="text-muted-foreground mt-1 text-[11px]">
                          {[job.start, job.end].filter(Boolean).map(String).join(' – ') ||
                            'Dates not recorded'}
                        </p>
                        {typeof job.description === 'string' && (
                          <p className="text-muted-foreground mt-2 text-[13px] leading-relaxed whitespace-pre-wrap">
                            {job.description}
                          </p>
                        )}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-muted-foreground mt-3 text-[13px]">
                    Work history has not been recorded. Review / edit to add employment facts.
                  </p>
                )}
              </section>
              {!!candidate.education_history?.length && (
                <section>
                  <h3 className="section-label">Education</h3>
                  <div className="mt-3 space-y-3">
                    {candidate.education_history.map((education, index) => (
                      <div key={index}>
                        <p className="text-[13px] font-medium">
                          {String(education.degree || 'Qualification not recorded')}
                        </p>
                        <p className="text-muted-foreground text-[13px]">
                          {String(
                            education.institution || education.school || 'Institution not recorded'
                          )}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              )}
              {!!candidate.evidence?.length && (
                <details className="rounded-[10px] border p-3 text-[13px]">
                  <summary className="font-medium">
                    Source evidence ({candidate.evidence.length})
                  </summary>
                  <dl className="mt-3 space-y-3">
                    {candidate.evidence.map((item, index) => (
                      <div key={index}>
                        <dt className="font-medium">{item.field.replaceAll('_', ' ')}</dt>
                        <dd className="text-muted-foreground mt-1">
                          {item.snippet}
                          {item.page !== null && ` · Page ${item.page}`}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </details>
              )}
            </>
          ) : (
            <section aria-label="Resume preview">
              {verified ? (
                <>
                  <p className="text-muted-foreground mb-3 text-[13px]">
                    Profile resume generated from confirmed facts. Original uploaded documents are
                    listed below.
                  </p>
                  <pre className="resume-preview max-h-none font-sans text-[13px] leading-relaxed whitespace-pre-wrap">
                    {candidateResumeMarkdown(candidate)}
                  </pre>
                </>
              ) : (
                <p className="rounded-[10px] border border-amber-500/30 bg-amber-500/5 p-4 text-[13px]">
                  Review and confirm this profile before generating a resume. Original uploaded
                  documents remain available below.
                </p>
              )}
            </section>
          )}
          <section className="border-border/60 border-t pt-4">
            <h3 className="section-label">Resume documents</h3>
            {loading ? (
              <WorkspaceSkeleton rows={1} />
            ) : documents.length ? (
              <div className="mt-3 space-y-2">
                {documents.map((document) => (
                  <div
                    key={document.id}
                    className="border-border/60 flex flex-wrap items-center gap-2 rounded-[10px] border p-3"
                  >
                    <FileText className="text-muted-foreground size-4 shrink-0" />
                    <span className="min-w-0 flex-1 text-[13px] break-all">
                      {document.filename}
                      <span className="text-muted-foreground ml-2">{document.status}</span>
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!!busy}
                      onClick={() => void downloadOriginal(document)}
                    >
                      <Download className="size-3.5" />
                      Download
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        if (
                          !window.confirm(
                            'Delete this private resume file? Reviewed profile facts remain saved.'
                          )
                        )
                          return;
                        try {
                          await api(`/api/resumes/${document.id}`, { method: 'DELETE' });
                          setDocuments((items) => items.filter((item) => item.id !== document.id));
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground mt-2 text-[13px]">
                No original resume document is saved.
              </p>
            )}
          </section>
        </div>
        <footer className="border-border/60 bg-muted/20 flex flex-wrap items-center justify-between gap-2 border-t p-4">
          <Button
            variant="default"
            size="sm"
            render={
              <Link
                href={`/dashboard/candidates/${candidate.id}/edit`}
                onClick={() => onEdit?.(candidate)}
              />
            }
          >
            {' '}
            <Pencil className="mr-1.5 size-3.5" /> Edit Profile & Resume{' '}
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!!busy || loading}
              onClick={() => void downloadOriginal()}
            >
              Original resume
            </Button>
            {(['docx', 'pdf'] as const).map((format) => (
              <Button
                key={format}
                size="sm"
                variant={format === 'docx' ? 'default' : 'outline'}
                disabled={!verified || !!busy}
                onClick={() => void exportFile(format)}
              >
                <Download className="size-3.5" />
                {busy === format ? 'Exporting…' : format.toUpperCase()}
              </Button>
            ))}
            {onSubmitJob && (
              <Button onClick={() => onSubmitJob(candidate)}>Create submission draft</Button>
            )}
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
