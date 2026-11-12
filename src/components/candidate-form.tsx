"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CandidateHistoryEditor } from "./candidate-history-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { textFields, booleanFields, emptyCandidateFields } from "@/lib/ai/schemas";
import { ResumeUploadReview } from "./resume-upload-review";
import { api } from "@/lib/api-client";
import { getCandidateById, getCandidates } from "@/lib/candidates";
import type { Candidate } from "@/types/database";
import {
  ArrowLeft,
  AlertCircle,
  ShieldCheck,
  User,
  Briefcase,
  Check,
  RotateCcw,
  Sparkles,
} from "lucide-react";

export function CandidateForm({
  initialCandidate,
  candidateId,
  backUrl = "/dashboard/candidates",
  onSuccess,
}: {
  initialCandidate?: Candidate | null;
  candidateId?: string;
  backUrl?: string;
  onSuccess?: (candidate: Candidate) => void;
}) {
  const router = useRouter();
  const [fields, setFields] = useState<Record<string, unknown>>({
    ...emptyCandidateFields(),
    ...initialCandidate,
  });
  const [id, setId] = useState(initialCandidate?.id || candidateId || "");
  const [version, setVersion] = useState<number | null>(
    initialCandidate?.version || null
  );
  const [documentId, setDocumentId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [changes, setChanges] = useState<string[]>([]);
  const [permittedCandidates, setPermittedCandidates] = useState<Candidate[]>([]);
  const [contactCheckError, setContactCheckError] = useState("");

  useEffect(() => {
    let active = true;
    getCandidates()
      .then((rows) => {
        if (active) setPermittedCandidates(rows);
      })
      .catch(() => {
        if (active)
          setContactCheckError(
            "Existing profiles could not be checked. You may continue saving and review duplicates later."
          );
      });
    return () => {
      active = false;
    };
  }, []);

  const email =
    typeof fields.email === "string" ? fields.email.trim().toLowerCase() : "";
  const phone =
    typeof fields.phone === "string" ? fields.phone.replace(/\D/g, "") : "";

  const possibleDuplicates = permittedCandidates
    .filter((candidate) => candidate.id !== id)
    .map((candidate) => ({
      candidate,
      contacts: [
        ...(email && candidate.email?.trim().toLowerCase() === email
          ? ["email"]
          : []),
        ...(phone.length >= 7 && candidate.phone?.replace(/\D/g, "") === phone
          ? ["phone"]
          : []),
      ],
    }))
    .filter((match) => match.contacts.length);

  useEffect(() => {
    if (candidateId && !initialCandidate) {
      void getCandidateById(candidateId)
        .then((c) => {
          setFields({ ...emptyCandidateFields(), ...c });
          setId(c.id);
          setVersion(c.version || null);
        })
        .catch((e) => setError(e.message));
    }
  }, [candidateId, initialCandidate]);

  const onDraft = useCallback(
    (draft: Record<string, unknown>, doc: string, v: number | null) => {
      setFields((previous) => {
        setChanges(
          Object.keys(draft).filter(
            (k) => draft[k] !== null && previous[k] !== draft[k]
          )
        );
        return { ...previous, ...draft };
      });
      setDocumentId(doc);
      setVersion(v);
    },
    []
  );

  async function save() {
    setBusy(true);
    setError("");
    try {
      let candidate: Candidate;
      if (documentId) {
        const r = await api<{ candidateId: string }>(
          `/api/resumes/${documentId}/confirm`,
          {
            method: "POST",
            body: JSON.stringify({ version, fields }),
          }
        );
        candidate = await getCandidateById(r.candidateId);
      } else {
        candidate = (
          await api<{ candidate: Candidate }>(
            id ? `/api/candidates/${id}` : "/api/candidates",
            {
              method: id ? "PATCH" : "POST",
              body: JSON.stringify(id ? { version, fields } : fields),
            }
          )
        ).candidate;
      }
      setId(candidate.id);
      setVersion(candidate.version || null);
      onSuccess?.(candidate);
      router.push(backUrl);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="portal-page max-w-4xl space-y-6 animate-fade-rise">
      {/* Back button */}
      <div>
        <Link
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors group"
          href={backUrl}
        >
          <ArrowLeft className="size-3.5 group-hover:-translate-x-0.5 transition-transform" />
          <span>Back to candidates</span>
        </Link>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-border/70">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {id ? "Review & Edit Candidate Profile" : "Create New Candidate Profile"}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Maintain verified candidate facts, target roles, and source documents.
          </p>
        </div>
        {id && (
          <span className="text-xs font-mono text-muted-foreground self-start sm:self-center">
            ID: {id.slice(0, 8)}…
          </span>
        )}
      </div>

      {/* Legacy unconfirmed warning if applicable */}
      {initialCandidate?.provenance_status === "legacy_unconfirmed" && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2.5">
          <AlertCircle className="size-4 shrink-0 mt-0.5" />
          <span>
            Existing imported details need recruiter verification before saving as an official confirmed profile.
          </span>
        </div>
      )}

      {/* Resume Upload & Review Component */}
      <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-xs">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Upload Source Resume
        </h2>
        <ResumeUploadReview candidateId={id || undefined} onDraft={onDraft} />
      </div>

      {changes.length > 0 && (
        <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 text-xs text-primary flex items-start gap-2">
          <Sparkles className="size-4 shrink-0 mt-0.5" />
          <span>
            Extracted draft updated: {changes.map((k) => k.replaceAll("_", " ")).join(", ")}. Review and confirm below.
          </span>
        </div>
      )}

      {/* Main Profile Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="space-y-6"
      >
        {/* Duplicate Contact Alert */}
        {possibleDuplicates.length > 0 && (
          <section
            role="status"
            aria-label="Duplicate contact warning"
            className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-900 dark:text-amber-200 space-y-1.5"
          >
            <h3 className="font-semibold text-sm flex items-center gap-1.5">
              <AlertCircle className="size-4 text-amber-600 dark:text-amber-400" />
              <span>Possible duplicate candidate contact</span>
            </h3>
            <p className="text-muted-foreground">
              An existing profile shares this contact information. Profiles are never automatically merged.
            </p>
            <ul className="mt-2 space-y-1 pl-4 list-disc">
              {possibleDuplicates.map(({ candidate, contacts }) => (
                <li key={candidate.id}>
                  <Link
                    className="font-semibold underline hover:text-foreground"
                    href={`/dashboard/candidates/${candidate.id}/edit`}
                  >
                    {candidate.full_name}
                  </Link>{" "}
                  (matched by {contacts.join(" and ")})
                </li>
              ))}
            </ul>
          </section>
        )}

        {contactCheckError && (email || phone) && (
          <p role="status" className="text-xs text-muted-foreground">
            {contactCheckError}
          </p>
        )}

        {/* Candidate Information Card */}
        <div className="rounded-2xl border border-border/80 bg-card p-5 sm:p-6 shadow-xs space-y-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/60 pb-2">
            Core Candidate Facts
          </h2>

          <div className="grid sm:grid-cols-2 gap-4">
            {textFields.map((field) => (
              <div key={field} className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground capitalize">
                  {field.replaceAll("_", " ")}
                  {field === "full_name" && <span className="text-destructive"> *</span>}
                </label>
                <Input
                  aria-label={field.replaceAll("_", " ")}
                  required={field === "full_name"}
                  value={
                    typeof fields[field] === "string"
                      ? (fields[field] as string)
                      : ""
                  }
                  onChange={(e) =>
                    setFields({ ...fields, [field]: e.target.value || null })
                  }
                  className="h-9 text-xs"
                />
              </div>
            ))}

            {booleanFields.map((field) => (
              <div key={field} className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground capitalize">
                  {field.replaceAll("_", " ")}
                </label>
                <select
                  aria-label={field.replaceAll("_", " ")}
                  className="w-full h-9 rounded-lg border border-input bg-background px-3 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={
                    fields[field] === true
                      ? "yes"
                      : fields[field] === false
                      ? "no"
                      : "unknown"
                  }
                  onChange={(e) =>
                    setFields({
                      ...fields,
                      [field]:
                        e.target.value === "unknown"
                          ? null
                          : e.target.value === "yes",
                    })
                  }
                >
                  <option value="unknown">Unknown</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
            ))}

            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-semibold text-foreground">
                Employment Arrangements (comma-separated: Full-time, Contract, C2C)
              </label>
              <Input
                value={
                  Array.isArray(fields.employment_types)
                    ? fields.employment_types.join(", ")
                    : ""
                }
                onChange={(e) =>
                  setFields({
                    ...fields,
                    employment_types: e.target.value
                      ? e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
                      : null,
                  })
                }
                className="h-9 text-xs"
              />
            </div>

            <div className="sm:col-span-2 pt-1">
              <label className="flex items-center gap-2.5 text-xs font-medium text-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={fields.is_active_bench === true}
                  onChange={(e) =>
                    setFields({ ...fields, is_active_bench: e.target.checked })
                  }
                  className="size-4 rounded accent-primary cursor-pointer"
                />
                <span>Active on recruitment bench (ready for active matching)</span>
              </label>
            </div>
          </div>
        </div>

        {/* Work & Education History Cards */}
        <div className="rounded-2xl border border-border/80 bg-card p-5 sm:p-6 shadow-xs space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/60 pb-2">
            Work Experience Timeline
          </h2>
          <CandidateHistoryEditor
            label="Employment history records"
            columns={["employer", "title", "start", "end", "location"]}
            value={fields.employment_history}
            limit={60}
            onChange={(rows) =>
              setFields({ ...fields, employment_history: rows })
            }
          />
        </div>

        <div className="rounded-2xl border border-border/80 bg-card p-5 sm:p-6 shadow-xs space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/60 pb-2">
            Education Credentials
          </h2>
          <CandidateHistoryEditor
            label="Education records"
            columns={["degree", "institution", "start", "end"]}
            value={fields.education_history}
            limit={30}
            onChange={(rows) =>
              setFields({ ...fields, education_history: rows })
            }
          />
        </div>

        {/* Error message */}
        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-xs text-destructive">
            {error}
          </div>
        )}

        {/* Footer save bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <p className="text-xs text-muted-foreground">
            Blank fields remain unrecorded. Confirming makes candidate facts accessible to active matching.
          </p>
          <div className="flex items-center gap-2.5 self-end sm:self-auto">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => router.push(backUrl)}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={busy}
              className="cursor-pointer gap-1.5"
            >
              {busy ? "Saving Profile…" : "Confirm & Save Profile"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
