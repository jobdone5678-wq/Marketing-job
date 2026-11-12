"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
  Sparkles,
  ShieldCheck,
  Send,
  FileCode,
  Copy,
  Check,
} from "lucide-react";
import { api } from "@/lib/api-client";
import { getCandidateById } from "@/lib/candidates";
import { exportCandidateResume, candidateResumeMarkdown } from "@/lib/candidate-resume-export";
import type { Candidate } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  WorkspaceHeading,
  WorkspaceSkeleton,
  WorkspaceError,
  WorkspaceEmpty,
} from "@/components/workspace-ui";

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
    typeof value === "string" && value.trim()
      ? value
      : typeof value === "boolean"
      ? value
        ? "Yes"
        : "No"
      : "Not specified";

  return (
    <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-xs transition-all hover:border-border">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
        {Icon && <Icon className="size-3.5 text-muted-foreground/70" />}
        <span>{label}</span>
      </div>
      <p className="mt-1.5 text-sm font-semibold text-foreground tracking-tight break-words">
        {displayVal}
      </p>
    </div>
  );
}

export function CandidateProfileWorkspace({
  candidateId,
}: {
  candidateId: string;
}) {
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [error, setError] = useState("");
  const [docError, setDocError] = useState("");
  const [loading, setLoading] = useState(true);
  const [docLoading, setDocLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [revision, setRevision] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    getCandidateById(candidateId)
      .then((value) => {
        if (active) {
          setCandidate(value);
          setError("");
        }
      })
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));

    void api<{ documents: Document[] }>(`/api/candidates/${candidateId}/documents`)
      .then((result) => {
        if (active) {
          setDocuments(result.documents);
          setDocError("");
        }
      })
      .catch((e) => active && setDocError(e.message))
      .finally(() => active && setDocLoading(false));

    return () => {
      active = false;
    };
  }, [candidateId, revision]);

  async function exportFile(format: "docx" | "pdf") {
    if (!candidate) return;
    setBusy(format);
    setDocError("");
    try {
      await exportCandidateResume(candidate, format);
    } catch (e) {
      setDocError((e as Error).message);
    } finally {
      setBusy("");
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
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((n) => n[0].toUpperCase())
        .join("")
    : "C";

  return (
    <main className="portal-page space-y-6 animate-fade-rise">
      {/* Top back navigation */}
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard/candidates"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors group"
        >
          <ArrowLeft className="size-3.5 group-hover:-translate-x-0.5 transition-transform" />
          <span>Back to candidates bench</span>
        </Link>

        {candidate && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground">
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
            <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-5">
                <div className="flex items-start gap-4">
                  <div className="size-14 rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent text-primary text-xl font-bold flex items-center justify-center border border-primary/25 shadow-2xs shrink-0">
                    {initials}
                  </div>
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h1 className="text-2xl font-bold tracking-tight text-foreground">
                        {candidate.full_name}
                      </h1>
                      <span
                        className={`status-chip ${
                          candidate.provenance_status === "confirmed"
                            ? "status-positive"
                            : "status-warning"
                        }`}
                      >
                        {candidate.provenance_status === "confirmed" ? (
                          <>
                            <ShieldCheck className="size-3 text-emerald-600 dark:text-emerald-400" />
                            <span>Confirmed Profile</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="size-3 text-amber-600 dark:text-amber-400" />
                            <span>Unconfirmed Import</span>
                          </>
                        )}
                      </span>
                    </div>

                    <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                      <Briefcase className="size-3.5" />
                      <span>
                        {candidate.target_job_titles ||
                          candidate.current_job_title ||
                          "Target role not specified"}
                      </span>
                    </p>

                    <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-muted/50 border border-border/60">
                        <span
                          className={`size-1.5 rounded-full ${
                            candidate.is_active_bench ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/60"
                          }`}
                        />
                        {candidate.is_active_bench ? "Active on bench" : "Inactive"}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-muted/50 border border-border/60">
                        {candidate.visa_status || "Visa unknown"}
                      </span>
                      {candidate.preferred_locations && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-muted/50 border border-border/60">
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
                    className="gap-1.5 cursor-pointer"
                  >
                    <Sparkles className="size-3.5" />
                    <span>Find Matching Jobs</span>
                  </Button>
                </div>
              </div>
            </div>

            {/* Main Tabs Navigation */}
            <Tabs defaultValue="overview" className="space-y-6">
              <TabsList variant="line" className="w-full justify-start border-b border-border/70 pb-px">
                <TabsTrigger value="overview" className="cursor-pointer">Overview & Fit</TabsTrigger>
                <TabsTrigger value="history" className="cursor-pointer">Work Experience</TabsTrigger>
                <TabsTrigger value="documents" className="cursor-pointer">Documents & Resume</TabsTrigger>
                <TabsTrigger value="evidence" className="cursor-pointer">Source Citations</TabsTrigger>
              </TabsList>

              {/* Overview Tab Content */}
              <TabsContent value="overview" className="space-y-6 pt-2">
                <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                  <FactCard label="Direct Email" value={candidate.email} />
                  <FactCard label="Phone Contact" value={candidate.phone} />
                  <FactCard label="Target Location" value={candidate.preferred_locations} icon={MapPin} />
                  <FactCard label="Expected Compensation" value={candidate.expected_salary} icon={Coins} />
                  <FactCard
                    label="Availability to Join"
                    value={candidate.available_to_join || candidate.notice_period}
                    icon={Calendar}
                  />
                  <FactCard
                    label="Total Years Experience"
                    value={candidate.total_experience_years ? `${candidate.total_experience_years} years` : null}
                    icon={Briefcase}
                  />
                  <FactCard label="US Work Authorization" value={candidate.authorized_in_usa} />
                  <FactCard label="Visa Sponsorship Needed" value={candidate.need_sponsorship_now} />
                  <FactCard label="Open to Relocation" value={candidate.open_to_relocation} />
                </div>

                {/* Primary Skills Cloud */}
                <div className="rounded-2xl border border-border/80 bg-card p-5 space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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
                            className="inline-flex items-center px-3 py-1 rounded-lg text-xs font-medium bg-primary/10 text-primary border border-primary/20"
                          >
                            {skill}
                          </span>
                        ))
                    ) : (
                      <p className="text-xs text-muted-foreground">No primary skills recorded.</p>
                    )}
                  </div>
                  {candidate.secondary_skills && (
                    <p className="text-xs text-muted-foreground pt-1">
                      <span className="font-semibold text-foreground">Additional: </span>
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
                    className="gap-2 cursor-pointer"
                  >
                    <Briefcase className="size-3.5 text-primary" />
                    <span>Find Matching Openings</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    render={<Link href={`/dashboard/submissions?candidateId=${candidate.id}`} />}
                    className="gap-2 cursor-pointer"
                  >
                    <Send className="size-3.5 text-primary" />
                    <span>View Application Submissions</span>
                  </Button>
                </div>
              </TabsContent>

              {/* Work History Tab Content */}
              <TabsContent value="history" className="space-y-6 pt-2">
                <section className="rounded-2xl border border-border/80 bg-card p-6 space-y-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Employment History
                  </h3>
                  {candidate.employment_history?.length ? (
                    <div className="divide-y divide-border/60">
                      {candidate.employment_history.map((row, index) => (
                        <div key={index} className="py-4 first:pt-0 last:pb-0 grid sm:grid-cols-[180px_1fr] gap-3">
                          <div className="font-mono text-xs text-muted-foreground">
                            {[row.start, row.end].filter(Boolean).map(String).join(" – ") || "Dates unrecorded"}
                          </div>
                          <div className="space-y-1">
                            <h4 className="text-sm font-bold text-foreground">
                              {String(row.title || "Position Title")}
                            </h4>
                            <p className="text-xs font-semibold text-primary">
                              {String(row.employer || "Employer")}
                            </p>
                            {typeof row.description === "string" && (
                              <p className="mt-2 text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">
                                {row.description}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No employment history recorded.</p>
                  )}
                </section>

                <section className="rounded-2xl border border-border/80 bg-card p-6 space-y-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Education & Credentials
                  </h3>
                  {candidate.education_history?.length ? (
                    <div className="divide-y divide-border/60">
                      {candidate.education_history.map((row, index) => (
                        <div key={index} className="py-3 first:pt-0 last:pb-0 flex items-start gap-3">
                          <GraduationCap className="size-4 text-primary shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs font-bold text-foreground">
                              {String(row.degree || "Degree")}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {String(row.institution || row.school || "Institution")}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No education history recorded.</p>
                  )}
                </section>
              </TabsContent>

              {/* Documents & Resume Tab Content */}
              <TabsContent value="documents" className="space-y-6 pt-2">
                {docError && <WorkspaceError message={docError} />}

                {/* Original Document Files */}
                <section className="rounded-2xl border border-border/80 bg-card p-6 space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-border/60">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Original Uploaded Documents
                    </h3>
                  </div>

                  {docLoading ? (
                    <WorkspaceSkeleton rows={2} />
                  ) : documents.length ? (
                    <div className="divide-y divide-border/60">
                      {documents.map((doc) => (
                        <div
                          key={doc.id}
                          className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                              <FileText className="size-4" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-foreground truncate">
                                {doc.filename}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
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
                                window.open(result.url, "_blank", "noopener,noreferrer");
                              } catch (e) {
                                setDocError((e as Error).message);
                              }
                            }}
                            className="gap-1.5 cursor-pointer"
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
                <section className="rounded-2xl border border-border/80 bg-card p-6 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/60">
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Confirmed Profile Resume
                      </h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Generated exclusively from verified career facts
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={copyResumeMarkdown}
                        className="gap-1.5 cursor-pointer text-xs"
                      >
                        {copied ? (
                          <>
                            <Check className="size-3.5 text-emerald-600" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="size-3.5" />
                            <span>Copy Text</span>
                          </>
                        )}
                      </Button>

                      {(["docx", "pdf"] as const).map((fmt) => (
                        <Button
                          key={fmt}
                          size="sm"
                          variant="outline"
                          disabled={candidate.provenance_status !== "confirmed" || !!busy}
                          onClick={() => void exportFile(fmt)}
                          className="text-xs cursor-pointer"
                        >
                          {busy === fmt ? "Exporting…" : `Export ${fmt.toUpperCase()}`}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {candidate.provenance_status === "confirmed" ? (
                    <pre className="whitespace-pre-wrap rounded-xl border border-border/70 bg-muted/20 p-5 font-mono text-xs leading-relaxed max-h-96 overflow-y-auto">
                      {candidateResumeMarkdown(candidate)}
                    </pre>
                  ) : (
                    <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 text-xs text-amber-800 dark:text-amber-300">
                      Review and confirm this imported profile before generating an official profile resume export.
                    </div>
                  )}
                </section>
              </TabsContent>

              {/* Source Evidence Citations Tab Content */}
              <TabsContent value="evidence" className="pt-2">
                <section className="rounded-2xl border border-border/80 bg-card p-6 space-y-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Source Evidence & Facts Provenance
                  </h3>
                  {candidate.evidence?.length ? (
                    <dl className="divide-y divide-border/60">
                      {candidate.evidence.map((item, index) => (
                        <div key={index} className="py-3 first:pt-0 last:pb-0">
                          <dt className="text-xs font-bold text-foreground uppercase tracking-wide">
                            {item.field.replaceAll("_", " ")}
                          </dt>
                          <dd className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            &ldquo;{item.snippet}&rdquo;
                            {item.page !== null && (
                              <span className="font-mono text-primary font-semibold ml-1.5">
                                [Page {item.page}]
                              </span>
                            )}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      No source citations recorded. Confirmed facts indicate candidate or recruiter review; they do not imply automated third-party verification.
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
