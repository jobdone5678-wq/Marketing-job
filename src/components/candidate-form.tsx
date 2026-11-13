"use client";

	import { useCallback, useEffect, useState } from "react";
	import Link from "next/link";
	import { useRouter } from "next/navigation";
	import { CandidateHistoryEditor } from "./candidate-history-editor";
	import { Button } from "@/components/ui/button";
	import { Input } from "@/components/ui/input";
	import { emptyCandidateFields } from "@/lib/ai/schemas";
	import { candidatePayload } from "@/lib/candidate-input";
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

	// The core facts a recruiter matches on. Every field here is stored on the
	// candidate record, so the extracted values can be reviewed and corrected.
	const CORE_FIELDS: { name: string; label: string; type?: string; wide?: boolean }[] = [
	  { name: "full_name", label: "Full name" },
	  { name: "email", label: "Email", type: "email" },
	  { name: "phone", label: "Phone", type: "tel" },
	  { name: "linkedin_url", label: "LinkedIn", type: "url" },
	  { name: "current_job_title", label: "Current role" },
	  { name: "current_employer", label: "Current employer" },
	  { name: "current_city", label: "City" },
	  { name: "current_state", label: "State" },
	  { name: "target_job_titles", label: "Target roles" },
	  { name: "total_experience_years", label: "Total experience (years)" },
	  { name: "employment_status", label: "Employment status" },
	  { name: "primary_skills", label: "Primary skills", wide: true },
	  { name: "secondary_skills", label: "Secondary skills", wide: true },
	  { name: "highest_qualification", label: "Highest qualification" },
	  { name: "university_name", label: "University" },
	  { name: "graduation_year", label: "Graduation year" },
	  { name: "certifications", label: "Certifications", wide: true },
	  { name: "visa_status", label: "Visa status" },
	  { name: "preferred_locations", label: "Preferred locations" },
	  { name: "available_to_join", label: "Available to join" },
	  { name: "expected_salary", label: "Expected salary" },
	];

	const TOGGLE_FIELDS: { name: string; label: string }[] = [
	  { name: "authorized_in_usa", label: "Authorized to work in the US" },
	  { name: "need_sponsorship_now", label: "Needs sponsorship now" },
	  { name: "need_sponsorship_future", label: "Needs sponsorship later" },
	  { name: "open_to_relocation", label: "Open to relocation" },
	];

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
	    is_active_bench: true,
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
	  const [extracted, setExtracted] = useState<string[]>([]);

	  const setField = useCallback((name: string, value: unknown) => {
	    setFields((previous) => ({ ...previous, [name]: value }));
	  }, []);

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
	      // Remember which core facts the resume filled in, so they can be marked in the form.
	      setExtracted(
	        Object.keys(draft).filter((key) => {
	          const value = draft[key];
	          if (value === null || value === undefined) return false;
	          if (Array.isArray(value)) return value.length > 0;
	          return typeof value === "string" ? value.trim().length > 0 : true;
	        })
	      );
	      setDocumentId(doc);
	      setVersion(v);
	    },
	    []
	  );

	  async function save() {
	    setBusy(true);
	    setError("");
	    try {
	      // Only the fields the database stores are sent, so a saved profile never
	      // fails validation because of row metadata carried over from the record.
	      const payload = candidatePayload(fields);
	      let candidate: Candidate;
	      if (documentId) {
	        const r = await api<{ candidateId: string }>(
	          `/api/resumes/${documentId}/confirm`,
	          {
	            method: "POST",
	            body: JSON.stringify({ version, fields: payload }),
	          }
	        );
	        candidate = await getCandidateById(r.candidateId);
	      } else {
	        candidate = (
	          await api<{ candidate: Candidate }>(
	            id ? `/api/candidates/${id}` : "/api/candidates",
	            {
	              method: id ? "PATCH" : "POST",
	              body: JSON.stringify(id ? { version, fields: payload } : payload),
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

	      {/* Work & Education History Forms */}
	      <form
	        onSubmit={(e) => {
	          e.preventDefault();
	          void save();
	        }}
	        className="space-y-6"
	      >
	        {/* Core candidate details */}
	        <div className="rounded-2xl border border-border/80 bg-card p-5 sm:p-6 shadow-xs space-y-4">
	          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
	            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
	              Core Candidate Details
	            </h2>
	            {extracted.length > 0 && (
	              <p className="text-[11px] text-muted-foreground">
	                Facts marked from resume were extracted from the uploaded document. Edit
	                anything that is wrong before saving.
	              </p>
	            )}
	          </div>
	          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
	            {CORE_FIELDS.map((field) => (
	              <label
	                key={field.name}
	                className={`space-y-1 text-xs font-medium text-muted-foreground ${
	                  field.wide ? "sm:col-span-2 lg:col-span-3" : ""
	                }`}
	              >
	                <span className="flex items-center gap-1.5">
	                  {field.label}
	                  {extracted.includes(field.name) && (
	                    <span className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
	                      <Sparkles className="size-2.5" />
	                      From resume
	                    </span>
	                  )}
	                </span>
	                <Input
	                  aria-label={field.label}
	                  type={field.type || "text"}
	                  value={
	                    typeof fields[field.name] === "string"
	                      ? (fields[field.name] as string)
	                      : ""
	                  }
	                  onChange={(event) =>
	                    setField(field.name, event.target.value || null)
	                  }
	                  className="h-9 text-xs"
	                />
	              </label>
	            ))}
	          </div>
	          <div className="grid gap-2 border-t border-border/60 pt-3 sm:grid-cols-2">
	            {TOGGLE_FIELDS.map((field) => (
	              <label
	                key={field.name}
	                className="flex items-center gap-2 text-xs font-medium text-foreground"
	              >
	                <input
	                  type="checkbox"
	                  aria-label={field.label}
	                  className="size-3.5 accent-primary"
	                  checked={fields[field.name] === true}
	                  onChange={(event) => setField(field.name, event.target.checked)}
	                />
	                {field.label}
	              </label>
	            ))}
	          </div>
	        </div>

	        {/* Work History Card */}
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

	        {/* Education Card */}
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