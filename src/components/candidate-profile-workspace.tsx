'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Download,
  FileText,
  Building2,
  Calendar,
  MapPin,
  Coins,
  CheckCircle2,
  AlertCircle,
  Briefcase,
  GraduationCap,
  Wand2,
  ShieldCheck,
  Send,
  FileCode,
  Copy,
  Check,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { getCandidateById } from '@/lib/candidates';
import { exportCandidateResume, candidateResumeMarkdown } from '@/lib/candidate-resume-export';
import type { Candidate } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  WorkspaceHeading,
  WorkspaceSkeleton,
  WorkspaceError,
  WorkspaceEmpty,
} from '@/components/workspace-ui';

type Document = {
  id: string;
  filename: string;
  status: string;
  created_at: string;
};

function FactCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: unknown;
  icon?: typeof MapPin;
}) {
  const displayVal =
    typeof value === 'string' && value.trim()
      ? value
      : typeof value === 'boolean'
        ? value
          ? 'Yes'
          : 'No'
        : 'Not specified';

  return (
    <div className="border-border/70 bg-card hover:border-border rounded-[12px] border p-3.5 transition-colors">
      <div className="text-muted-foreground flex items-center gap-1.5 text-[13px] font-medium">
        {Icon && <Icon className="text-muted-foreground/70 size-3.5" />}
        <span>{label}</span>
      </div>
      <p className="text-foreground mt-1.5 text-[13px] font-medium tracking-tight break-words">
        {displayVal}
      </p>
    </div>
  );
}

export function CandidateProfileWorkspace({ candidateId }: { candidateId: string }) {
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [error, setError] = useState('');
  const [docError, setDocError] = useState('');
  const [loading, setLoading] = useState(true);
  const [docLoading, setDocLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [revision, setRevision] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    getCandidateById(candidateId)
      .then((value) => {
        if (active) {
          setCandidate(value);
          setError('');
        }
      })
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));

    void api<{ documents: Document[] }>(`/api/candidates/${candidateId}/documents`)
      .then((result) => {
        if (active) {
          setDocuments(result.documents);
          setDocError('');
        }
      })
      .catch((e) => active && setDocError(e.message))
      .finally(() => active && setDocLoading(false));

    return () => {
      active = false;
    };
  }, [candidateId, revision]);

  async function exportFile(format: 'docx' | 'pdf') {
    if (!candidate) return;
    setBusy(format);
    setDocError('');
    try {
      await exportCandidateResume(candidate, format);
    } catch (e) {
      setDocError((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  const copyResumeMarkdown = () => {
    if (!candidate) return;
    navigator.clipboard.writeText(candidateResumeMarkdown(candidate));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const initials = candidate?.full_name
    ? candidate.full_name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((n) => n[0].toUpperCase())
        .join('')
    : 'C';

  return (
    <main className="portal-page animate-fade-rise space-y-6">
      {/* Top back navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard/candidates"
          className="text-muted-foreground hover:text-foreground group inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors"
        >
          <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
          <span>Back to candidates bench</span>
        </Link>

        {candidate && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground font-mono text-[13px]">
              v{candidate.version || 1}
            </span>
          </div>
        )}
      </div>

      {error && (
        <WorkspaceError message={error}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setLoading(true);
              setRevision((v) => v + 1);
            }}
          >
            Try again
          </Button>
        </WorkspaceError>
      )}

      {loading ? (
        <WorkspaceSkeleton rows={5} />
      ) : (
        candidate && (
          <>
            {/* Candidate 360 Profile Hero Card */}
            <div className="border-border/80 bg-card rounded-[16px] border p-6">
              <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
                <div className="flex items-start gap-4">
                  <div className="bg-surface-sunken text-foreground border-border flex size-14 shrink-0 items-center justify-center rounded-[14px] border text-[17px] font-medium">
                    {initials}
                  </div>
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h1 className="text-foreground text-[24px] font-medium tracking-tight">
                        {candidate.full_name}
                      </h1>
                      <span
                        className={`status-chip ${
 candidate.provenance_status ==='confirmed'
                            ? 'status-positive'
                            : 'status-warning'
                        }`}
                      >
                        {candidate.provenance_status === 'confirmed' ? (
                          <>
                            <ShieldCheck className="size-3 text-primary" />
                            <span>Confirmed Profile</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="size-3 text-amber-700 dark:text-amber-400" />
                            <span>Unconfirmed Import</span>
                          </>
                        )}
                      </span>
                    </div>

                    <p className="text-muted-foreground flex items-center gap-1.5 text-[13px] font-medium">
                      <Briefcase className="size-3.5" />
                      <span>
                        {candidate.target_job_titles ||
                          candidate.current_job_title ||
                          'Target role not specified'}
                      </span>
                    </p>

                    <div className="text-muted-foreground flex flex-wrap items-center gap-2 pt-1 text-[13px]">
                      <span className="bg-muted/50 border-border/60 inline-flex items-center gap-1 rounded-[6px] border px-2.5 py-0.5">
                        <span
                          className={`size-1.5 rounded-full ${
 candidate.is_active_bench
 ?' bg-primary'
                              : 'bg-muted-foreground/60'
                          }`}
                        />
                        {candidate.is_active_bench ? 'Active on bench' : 'Inactive'}
                      </span>
                      <span className="bg-muted/50 border-border/60 inline-flex items-center gap-1 rounded-[6px] border px-2.5 py-0.5">
                        {candidate.visa_status || 'Visa unknown'}
                      </span>
                      {candidate.preferred_locations && (
                        <span className="bg-muted/50 border-border/60 inline-flex items-center gap-1 rounded-[6px] border px-2.5 py-0.5">
                          <MapPin className="size-3" />
                          {candidate.preferred_locations}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Top quick actions */}
                <div className="flex flex-wrap items-center gap-2 self-start">
                  <Button
                    variant="outline"
                    size="sm"
                    render={<Link href={`/dashboard/candidates/${candidate.id}/edit`} />}
                    className="cursor-pointer"
                  >
                    Edit Profile
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    render={<Link href={`/dashboard/jobs?candidateId=${candidate.id}`} />}
                    className="cursor-pointer gap-1.5"
                  >
                    <Wand2 className="size-3.5" />
                    <span>Find Matching Jobs</span>
                  </Button>
                </div>
              </div>
            </div>

            {/* Main Tabs Navigation */}
            <Tabs defaultValue="overview" className="space-y-6">
              <TabsList
                variant="line"
                className="border-border/70 w-full justify-start border-b pb-px"
              >
                <TabsTrigger value="overview" className="cursor-pointer">
                  Overview & Fit
                </TabsTrigger>
                <TabsTrigger value="history" className="cursor-pointer">
                  Work Experience
                </TabsTrigger>
                <TabsTrigger value="documents" className="cursor-pointer">
                  Documents & Resume
                </TabsTrigger>
                <TabsTrigger value="evidence" className="cursor-pointer">
                  Source Citations
                </TabsTrigger>
              </TabsList>

              {/* Overview Tab Content */}
              <TabsContent value="overview" className="space-y-6 pt-2">
                <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                  <FactCard label="Direct Email" value={candidate.email} />
                  <FactCard label="Phone Contact" value={candidate.phone} />
                  <FactCard
                    label="Location (Mandatory)"
                    value={
                      [candidate.current_city, candidate.current_state]
                        .filter(Boolean)
                        .join(', ') ||
                      candidate.full_address ||
                      candidate.preferred_locations
                    }
                    icon={MapPin}
                  />
                  <FactCard label="LinkedIn URL (Mandatory)" value={candidate.linkedin_url} />
                  <FactCard
                    label="Work Authorization / Visa"
                    value={
                      candidate.work_authorization ||
                      candidate.visa_status ||
                      (candidate.authorized_in_usa
                        ? 'Authorized to work in USA'
                        : 'Requires Sponsorship')
                    }
                  />
                  <FactCard
                    label="Gender"
                    value={candidate.gender || (candidate.confirmed_facts as any)?.gender}
                  />
                  <FactCard
                    label="Race / Ethnicity"
                    value={
                      candidate.race ||
                      (candidate.confirmed_facts as any)?.race ||
                      candidate.race_ethnicity ||
                      (candidate.confirmed_facts as any)?.race_ethnicity
                    }
                  />
                  <FactCard
                    label="Veteran Status"
                    value={
                      candidate.veteran ||
                      candidate.veteran_status ||
                      (candidate.confirmed_facts as any)?.veteran ||
                      (candidate.confirmed_facts as any)?.veteran_status
                    }
                  />
                  <FactCard
                    label="Disability Status"
                    value={
                      candidate.disability ||
                      candidate.disability_status ||
                      (candidate.confirmed_facts as any)?.disability ||
                      (candidate.confirmed_facts as any)?.disability_status
                    }
                  />
                  <FactCard
                    label="Expected Compensation"
                    value={candidate.expected_salary}
                    icon={Coins}
                  />
                  <FactCard
                    label="Availability to Join"
                    value={candidate.available_to_join || candidate.notice_period}
                    icon={Calendar}
                  />
                  <FactCard
                    label="Total Years Experience"
                    value={
                      candidate.total_experience_years
                        ? `${candidate.total_experience_years} years`
                        : null
                    }
                    icon={Briefcase}
                  />
                  <FactCard label="US Work Authorization" value={candidate.authorized_in_usa} />
                  <FactCard
                    label="Visa Sponsorship Needed"
                    value={candidate.need_sponsorship_now}
                  />
                  <FactCard label="Open to Relocation" value={candidate.open_to_relocation} />
                </div>

                {/* Primary Skills Cloud */}
                <div className="border-border/80 bg-card space-y-3 rounded-[16px] border p-5">
                  <h3 className="text-muted-foreground text-[13px] font-medium">
                    Technical & Domain Competencies
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {candidate.primary_skills ? (
                      candidate.primary_skills
                        .split(/[,;\n]/)
                        .map((s) => s.trim())
                        .filter(Boolean)
                        .map((skill) => (
                          <span
                            key={skill}
                            className="bg-primary/10 text-primary border-primary/20 inline-flex items-center rounded-[10px] border px-3 py-1 text-[13px] font-medium"
                          >
                            {skill}
                          </span>
                        ))
                    ) : (
                      <p className="text-muted-foreground text-[13px]">No primary skills recorded.</p>
                    )}
                  </div>
                  {candidate.secondary_skills && (
                    <p className="text-muted-foreground pt-1 text-[13px]">
                      <span className="text-foreground font-medium">Additional: </span>
                      {candidate.secondary_skills}
                    </p>
                  )}
                </div>

                {/* Action links */}
                <div className="flex flex-wrap gap-3 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    render={<Link href={`/dashboard/jobs?candidateId=${candidate.id}`} />}
                    className="cursor-pointer gap-2"
                  >
                    <Briefcase className="text-primary size-3.5" />
                    <span>Find Matching Openings</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    render={<Link href={`/dashboard/submissions?candidateId=${candidate.id}`} />}
                    className="cursor-pointer gap-2"
                  >
                    <Send className="text-primary size-3.5" />
                    <span>View Application Submissions</span>
                  </Button>
                </div>
              </TabsContent>

              {/* Work History Tab Content */}
              <TabsContent value="history" className="space-y-6 pt-2">
                <section className="border-border/80 bg-card space-y-4 rounded-[16px] border p-6">
                  <h3 className="text-muted-foreground text-[13px] font-medium">
                    Employment History
                  </h3>
                  {candidate.employment_history?.length ? (
                    <div className="divide-border/60 divide-y">
                      {candidate.employment_history.map((row, index) => (
                        <div
                          key={index}
                          className="grid gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-[180px_1fr]"
                        >
                          <div className="text-muted-foreground font-mono text-[13px]">
                            {[row.start, row.end].filter(Boolean).map(String).join(' – ') ||
                              'Dates unrecorded'}
                          </div>
                          <div className="space-y-1">
                            <h4 className="text-foreground text-[13px] font-medium">
                              {String(row.title || 'Position Title')}
                            </h4>
                            <p className="text-primary text-[13px] font-medium">
                              {String(row.employer || 'Employer')}
                            </p>
                            {typeof row.description === 'string' && (
                              <p className="text-muted-foreground mt-2 text-[13px] leading-relaxed whitespace-pre-wrap">
                                {row.description}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-[13px]">No employment history recorded.</p>
                  )}
                </section>

                <section className="border-border/80 bg-card space-y-4 rounded-[16px] border p-6">
                  <h3 className="text-muted-foreground text-[13px] font-medium">
                    Education & Credentials
                  </h3>
                  {candidate.education_history?.length ? (
                    <div className="divide-border/60 divide-y">
                      {candidate.education_history.map((row, index) => (
                        <div
                          key={index}
                          className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
                        >
                          <GraduationCap className="text-primary mt-0.5 size-4 shrink-0" />
                          <div>
                            <p className="text-foreground text-[13px] font-medium">
                              {String(row.degree || 'Degree')}
                            </p>
                            <p className="text-muted-foreground mt-0.5 text-[13px]">
                              {String(row.institution || row.school || 'Institution')}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-[13px]">No education history recorded.</p>
                  )}
                </section>
              </TabsContent>

              {/* Documents & Resume Tab Content */}
              <TabsContent value="documents" className="space-y-6 pt-2">
                {docError && <WorkspaceError message={docError} />}

                {/* Original Document Files */}
                <section className="border-border/80 bg-card space-y-4 rounded-[16px] border p-6">
                  <div className="border-border/60 flex items-center justify-between border-b pb-2">
                    <h3 className="text-muted-foreground text-[13px] font-medium">
                      Original Uploaded Documents
                    </h3>
                  </div>

                  {docLoading ? (
                    <WorkspaceSkeleton rows={2} />
                  ) : documents.length ? (
                    <div className="divide-border/60 divide-y">
                      {documents.map((doc) => (
                        <div
                          key={doc.id}
                          className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="bg-surface-sunken text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-[10px]">
                              <FileText className="size-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-foreground truncate text-[13px] font-medium">
                                {doc.filename}
                              </p>
                              <p className="text-muted-foreground text-[11px]">
                                {doc.status} · {new Date(doc.created_at).toLocaleDateString()}
                              </p>
                            </div>
                          </div>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              try {
                                const result = await api<{ url: string }>(
                                  `/api/resumes/${doc.id}/download`
                                );
                                window.open(result.url, '_blank', 'noopener,noreferrer');
                              } catch (e) {
                                setDocError((e as Error).message);
                              }
                            }}
                            className="cursor-pointer gap-1.5"
                          >
                            <Download className="size-3.5" />
                            <span>Download Original</span>
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <WorkspaceEmpty
                      title="No original resume saved"
                      description="Upload a PDF or DOCX file via Review / Edit profile."
                      icon={FileText}
                    />
                  )}
                </section>

                {/* Confirmed Profile Resume Preview & Export */}
                <section className="border-border/80 bg-card space-y-4 rounded-[16px] border p-6">
                  <div className="border-border/60 flex flex-col justify-between gap-3 border-b pb-3 sm:flex-row sm:items-center">
                    <div>
                      <h3 className="text-muted-foreground text-[13px] font-medium">
                        Confirmed Profile Resume
                      </h3>
                      <p className="text-muted-foreground mt-0.5 text-[13px]">
                        Generated exclusively from verified career facts
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={copyResumeMarkdown}
                        className="cursor-pointer gap-1.5 text-[13px]"
                      >
                        {copied ? (
                          <>
                            <Check className="size-3.5 text-primary" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="size-3.5" />
                            <span>Copy Text</span>
                          </>
                        )}
                      </Button>

                      {(['docx', 'pdf'] as const).map((fmt) => (
                        <Button
                          key={fmt}
                          size="sm"
                          variant="outline"
                          disabled={candidate.provenance_status !== 'confirmed' || !!busy}
                          onClick={() => void exportFile(fmt)}
                          className="cursor-pointer text-[13px]"
                        >
                          {busy === fmt ? 'Exporting…' : `Export ${fmt.toUpperCase()}`}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {candidate.provenance_status === 'confirmed' ? (
                    <pre className="border-border/70 bg-muted/20 max-h-96 overflow-y-auto rounded-[12px] border p-5 font-mono text-[13px] leading-relaxed whitespace-pre-wrap">
                      {candidateResumeMarkdown(candidate)}
                    </pre>
                  ) : (
                    <div className="rounded-[12px] border border-amber-500/20 bg-amber-500/5 p-4 text-[13px] text-amber-700 dark:text-amber-400">
                      Review and confirm this imported profile before generating an official profile
                      resume export.
                    </div>
                  )}
                </section>
              </TabsContent>

              {/* Source Evidence Citations Tab Content */}
              <TabsContent value="evidence" className="pt-2">
                <section className="border-border/80 bg-card space-y-4 rounded-[16px] border p-6">
                  <h3 className="text-muted-foreground text-[13px] font-medium">
                    Source Evidence & Facts Provenance
                  </h3>
                  {candidate.evidence?.length ? (
                    <dl className="divide-border/60 divide-y">
                      {candidate.evidence.map((item, index) => (
                        <div key={index} className="py-3 first:pt-0 last:pb-0">
                          <dt className="text-foreground text-[13px] font-medium">
                            {item.field.replaceAll('_', ' ')}
                          </dt>
                          <dd className="text-muted-foreground mt-1 text-[13px] leading-relaxed">
                            &ldquo;{item.snippet}&rdquo;
                            {item.page !== null && (
                              <span className="text-primary ml-1.5 font-mono font-medium">
                                [Page {item.page}]
                              </span>
                            )}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="text-muted-foreground text-[13px] leading-relaxed">
                      No source citations recorded. Confirmed facts indicate candidate or recruiter
                      review; they do not imply automated third-party verification.
                    </p>
                  )}
                </section>
              </TabsContent>
            </Tabs>
          </>
        )
      )}
    </main>
  );
}
