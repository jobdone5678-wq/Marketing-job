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
  Sparkles,
  MapPin,
  Globe,
  HelpCircle,
  FileText,
} from "lucide-react";
import { toast } from "sonner";

const GENDER_OPTIONS = [
  { value: "", label: "Select Gender" },
  { value: "Male", label: "Male" },
  { value: "Female", label: "Female" },
  { value: "Non-Binary", label: "Non-Binary" },
  { value: "Prefer not to say", label: "Prefer not to say / Decline to self-identify" },
];

const VETERAN_OPTIONS = [
  { value: "", label: "Select Veteran Status" },
  { value: "I am not a protected veteran", label: "I am not a protected veteran" },
  { value: "I identify as one or more classifications of protected veteran", label: "I identify as one or more classifications of protected veteran" },
  { value: "I do not wish to self-identify", label: "I do not wish to self-identify / Prefer not to say" },
];

const DISABILITY_OPTIONS = [
  { value: "", label: "Select Disability Status" },
  { value: "No, I do not have a disability", label: "No, I do not have a disability" },
  { value: "Yes, I have a disability", label: "Yes, I have a disability" },
  { value: "I do not wish to answer", label: "I do not wish to answer / Prefer not to say" },
];

const VISA_OPTIONS = [
  { value: "", label: "Select Work Authorization / Visa Status" },
  { value: "US Citizen", label: "US Citizen" },
  { value: "Permanent Resident (Green Card)", label: "Permanent Resident (Green Card)" },
  { value: "H-1B", label: "H-1B Specialty Occupation" },
  { value: "STEM OPT / OPT EAD", label: "STEM OPT / OPT EAD" },
  { value: "F-1 (CPT)", label: "F-1 (CPT)" },
  { value: "TN Visa", label: "TN Visa (NAFTA)" },
  { value: "L-2 / H-4 EAD", label: "L-2 / H-4 EAD" },
  { value: "Employment Authorization Document (EAD)", label: "Employment Authorization Document (EAD)" },
  { value: "Requires Sponsorship", label: "Requires Sponsorship" },
  { value: "Other", label: "Other" },
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
    ...(initialCandidate?.confirmed_facts || {}),
    ...initialCandidate,
    gender: initialCandidate?.gender || (initialCandidate?.confirmed_facts as Record<string, unknown>)?.gender || "",
    veteran_status: initialCandidate?.veteran_status || initialCandidate?.veteran || (initialCandidate?.confirmed_facts as Record<string, unknown>)?.veteran_status || (initialCandidate?.confirmed_facts as Record<string, unknown>)?.veteran || "",
    veteran: initialCandidate?.veteran || initialCandidate?.veteran_status || (initialCandidate?.confirmed_facts as Record<string, unknown>)?.veteran || "",
    disability_status: initialCandidate?.disability_status || initialCandidate?.disability || (initialCandidate?.confirmed_facts as Record<string, unknown>)?.disability_status || (initialCandidate?.confirmed_facts as Record<string, unknown>)?.disability || "",
    disability: initialCandidate?.disability || initialCandidate?.disability_status || (initialCandidate?.confirmed_facts as Record<string, unknown>)?.disability || "",
    work_authorization: initialCandidate?.work_authorization || (initialCandidate?.confirmed_facts as Record<string, unknown>)?.work_authorization || initialCandidate?.visa_status || "",
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
          setFields({
            ...emptyCandidateFields(),
            ...(c.confirmed_facts || {}),
            ...c,
            gender: c.gender || (c.confirmed_facts as Record<string, unknown>)?.gender || "",
            veteran_status: c.veteran_status || c.veteran || (c.confirmed_facts as Record<string, unknown>)?.veteran_status || (c.confirmed_facts as Record<string, unknown>)?.veteran || "",
            veteran: c.veteran || c.veteran_status || (c.confirmed_facts as Record<string, unknown>)?.veteran || "",
            disability_status: c.disability_status || c.disability || (c.confirmed_facts as Record<string, unknown>)?.disability_status || (c.confirmed_facts as Record<string, unknown>)?.disability || "",
            disability: c.disability || c.disability_status || (c.confirmed_facts as Record<string, unknown>)?.disability || "",
            work_authorization: c.work_authorization || (c.confirmed_facts as Record<string, unknown>)?.work_authorization || c.visa_status || "",
          });
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
        return {
          ...previous,
          ...draft,
          // If manual fields were already provided, preserve them unless draft has a value
          gender: draft.gender || previous.gender || "",
          veteran_status: draft.veteran_status || draft.veteran || previous.veteran_status || previous.veteran || "",
          disability_status: draft.disability_status || draft.disability || previous.disability_status || previous.disability || "",
          work_authorization: draft.work_authorization || draft.visa_status || previous.work_authorization || previous.visa_status || "",
        };
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

    // Mandatory Field Validations
    const name = typeof fields.full_name === "string" ? fields.full_name.trim() : "";
    if (!name) {
      setError("Full name is required.");
      setBusy(false);
      return;
    }

    const linkedin = typeof fields.linkedin_url === "string" ? fields.linkedin_url.trim() : "";
    if (!linkedin) {
      setError("LinkedIn profile URL is mandatory. First-time candidates must enter their LinkedIn URL for job portals.");
      setBusy(false);
      return;
    }

    const city = typeof fields.current_city === "string" ? fields.current_city.trim() : "";
    const addr = typeof fields.full_address === "string" ? fields.full_address.trim() : "";
    const prefLoc = typeof fields.preferred_locations === "string" ? fields.preferred_locations.trim() : "";
    if (!city && !addr && !prefLoc) {
      setError("Location (City or Address) is mandatory. Please enter your location.");
      setBusy(false);
      return;
    }

    try {
      // Prepare normalized payload
      const preparedFields = {
        ...fields,
        work_authorization: fields.work_authorization || fields.visa_status || null,
        visa_status: fields.visa_status || fields.work_authorization || null,
        veteran: fields.veteran_status || fields.veteran || null,
        veteran_status: fields.veteran_status || fields.veteran || null,
        disability: fields.disability_status || fields.disability || null,
        disability_status: fields.disability_status || fields.disability || null,
      };

      const payload = candidatePayload(preparedFields);
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

      // BROADCAST TO CHROME EXTENSION FOR IMMEDIATE AUTOFILL
      if (typeof window !== "undefined") {
        try {
          const loc = [candidate.current_city || city, candidate.current_state].filter(Boolean).join(", ") || candidate.full_address || addr || prefLoc;
          const skillsList = Array.isArray(candidate.primary_skills)
            ? candidate.primary_skills
            : String(candidate.primary_skills || fields.primary_skills || "").split(/[,;]+/).map((s: string) => s.trim()).filter(Boolean);

          const candPayload = {
            ...candidate,
            id: candidate.id,
            candidate_id: candidate.id,
            full_name: candidate.full_name || name,
            first_name: (candidate.full_name || name).split(/\s+/)[0] || "",
            last_name: (candidate.full_name || name).split(/\s+/).slice(1).join(" ") || "",
            email: candidate.email || fields.email || "",
            phone: candidate.phone || fields.phone || "",
            linkedin_url: candidate.linkedin_url || linkedin,
            current_city: candidate.current_city || city,
            current_state: candidate.current_state || fields.current_state || "",
            location: loc,
            current_location: loc,
            full_address: candidate.full_address || addr,
            gender: candidate.gender || fields.gender || "",
            veteran: candidate.veteran || fields.veteran_status || fields.veteran || "",
            veteran_status: candidate.veteran_status || fields.veteran_status || "",
            disability: candidate.disability || fields.disability_status || fields.disability || "",
            disability_status: candidate.disability_status || fields.disability_status || "",
            visa_status: candidate.visa_status || fields.visa_status || "",
            work_authorization: candidate.work_authorization || fields.work_authorization || candidate.visa_status || fields.visa_status || "",
            work_auth: candidate.work_authorization || fields.work_authorization || candidate.visa_status || fields.visa_status || "",
            authorized_in_usa: candidate.authorized_in_usa !== undefined ? candidate.authorized_in_usa : fields.authorized_in_usa,
            need_sponsorship_now: candidate.need_sponsorship_now !== undefined ? candidate.need_sponsorship_now : fields.need_sponsorship_now,
            need_sponsorship_future: candidate.need_sponsorship_future !== undefined ? candidate.need_sponsorship_future : fields.need_sponsorship_future,
            open_to_relocation: candidate.open_to_relocation !== undefined ? candidate.open_to_relocation : fields.open_to_relocation,
            current_job_title: candidate.current_job_title || fields.current_job_title || "",
            current_employer: candidate.current_employer || fields.current_employer || "",
            skills: skillsList,
            primary_skills: Array.isArray(skillsList) ? skillsList.join(", ") : String(skillsList || ""),
            highest_qualification: candidate.highest_qualification || fields.highest_qualification || "",
            university_name: candidate.university_name || fields.university_name || "",
            graduation_year: candidate.graduation_year || fields.graduation_year || "",
            total_experience_years: candidate.total_experience_years || fields.total_experience_years || null,
            confirmed_facts: {
              ...(candidate.confirmed_facts || {}),
              ...fields,
              full_name: candidate.full_name || name,
              email: candidate.email || fields.email,
              phone: candidate.phone || fields.phone,
              linkedin_url: candidate.linkedin_url || linkedin,
              current_city: candidate.current_city || city,
              current_state: candidate.current_state || fields.current_state,
              location: loc,
              current_location: loc,
              gender: candidate.gender || fields.gender,
              veteran: candidate.veteran || fields.veteran_status || fields.veteran,
              veteran_status: candidate.veteran_status || fields.veteran_status,
              disability: candidate.disability || fields.disability_status || fields.disability,
              disability_status: candidate.disability_status || fields.disability_status,
              visa_status: candidate.visa_status || fields.visa_status,
              work_authorization: candidate.work_authorization || fields.work_authorization || fields.visa_status,
              work_auth: candidate.work_authorization || fields.work_authorization || fields.visa_status,
              authorized_in_usa: candidate.authorized_in_usa !== undefined ? candidate.authorized_in_usa : fields.authorized_in_usa,
              need_sponsorship_now: candidate.need_sponsorship_now !== undefined ? candidate.need_sponsorship_now : fields.need_sponsorship_now,
              need_sponsorship_future: candidate.need_sponsorship_future !== undefined ? candidate.need_sponsorship_future : fields.need_sponsorship_future,
            }
          };

          window.postMessage({
            type: "candidate_updated",
            candidate: candPayload,
            data: candPayload
          }, "*");

          window.postMessage({
            type: "NEXTKIN_RESUME_UPLOADED",
            candidate: candPayload
          }, "*");
        } catch (syncErr) {
          console.warn("[CandidateSyncBroadcastErr]", syncErr);
        }
      }

      toast.success("Profile saved successfully! Details are ready for autofill.");
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
          <span>Back to My Applications and Resume</span>
        </Link>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-border/70">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {id ? "Edit Profile & Resume Details" : "Upload Resume & Complete Profile"}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
            Fill in your manual details (LinkedIn, Location, Gender, Work Authorization, Veteran Status). Autofill uses these saved details for all job applications.
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
            Imported details need verification. Confirm mandatory fields (LinkedIn, Location) and common portal questions before saving.
          </span>
        </div>
      )}

      {/* Resume Upload & Review Component */}
      <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Upload Source Resume
          </h2>
          <span className="text-[11px] text-muted-foreground">
            PDF or DOCX supported
          </span>
        </div>
        <ResumeUploadReview candidateId={id || undefined} onDraft={onDraft} />
      </div>

      {changes.length > 0 && (
        <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 text-xs text-primary flex items-start gap-2">
          <Sparkles className="size-4 shrink-0 mt-0.5" />
          <span>
            Resume parsed! Extracted fields: {changes.map((k) => k.replaceAll("_", " ")).join(", ")}. Review and complete missing manual fields below.
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

      {/* Profile Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="space-y-6"
      >
        {/* Section 1: Contact & Mandatory Information */}
        <div className="rounded-2xl border border-border/80 bg-card p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Contact & Mandatory Location / LinkedIn
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                First-time resumes usually lack LinkedIn and specific location formatting. Both are mandatory for job portal autofill.
              </p>
            </div>
          </div>

          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {/* Full Name */}
            <label className="space-y-1 text-xs font-medium text-foreground">
              <span className="flex items-center gap-1.5">
                Full Name <span className="text-destructive">*</span>
                {extracted.includes("full_name") && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                    <Sparkles className="size-2.5" /> From resume
                  </span>
                )}
              </span>
              <Input
                required
                aria-label="Full Name"
                value={typeof fields.full_name === "string" ? fields.full_name : ""}
                onChange={(e) => setField("full_name", e.target.value || null)}
                placeholder="e.g. Jane Doe"
                className="h-9 text-xs"
              />
            </label>

            {/* Email */}
            <label className="space-y-1 text-xs font-medium text-foreground">
              <span className="flex items-center gap-1.5">
                Email Address
                {extracted.includes("email") && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                    <Sparkles className="size-2.5" /> From resume
                  </span>
                )}
              </span>
              <Input
                type="email"
                aria-label="Email Address"
                value={typeof fields.email === "string" ? fields.email : ""}
                onChange={(e) => setField("email", e.target.value || null)}
                placeholder="candidate@example.com"
                className="h-9 text-xs"
              />
            </label>

            {/* Phone */}
            <label className="space-y-1 text-xs font-medium text-foreground">
              <span className="flex items-center gap-1.5">
                Phone Number
                {extracted.includes("phone") && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                    <Sparkles className="size-2.5" /> From resume
                  </span>
                )}
              </span>
              <Input
                type="tel"
                aria-label="Phone Number"
                value={typeof fields.phone === "string" ? fields.phone : ""}
                onChange={(e) => setField("phone", e.target.value || null)}
                placeholder="e.g. 555-123-4567"
                className="h-9 text-xs"
              />
            </label>

            {/* LinkedIn URL - MANDATORY */}
            <label className="space-y-1 text-xs font-semibold text-foreground sm:col-span-2 lg:col-span-3">
              <span className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-primary">
                  <Globe className="size-3.5" />
                  LinkedIn Profile URL <span className="text-destructive">* (Mandatory)</span>
                </span>
                {extracted.includes("linkedin_url") && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                    <Sparkles className="size-2.5" /> From resume
                  </span>
                )}
              </span>
              <Input
                required
                type="url"
                aria-label="LinkedIn Profile URL"
                value={typeof fields.linkedin_url === "string" ? fields.linkedin_url : ""}
                onChange={(e) => setField("linkedin_url", e.target.value || null)}
                placeholder="https://www.linkedin.com/in/username"
                className="h-9 text-xs border-primary/40 focus-visible:border-primary focus-visible:ring-primary/20"
              />
              <p className="text-[11px] text-muted-foreground font-normal">
                Job portals (Greenhouse, Lever, Workday) require LinkedIn. Autofill automatically injects this into job applications.
              </p>
            </label>

            {/* City - MANDATORY */}
            <label className="space-y-1 text-xs font-semibold text-foreground">
              <span className="flex items-center gap-1.5 text-primary">
                <MapPin className="size-3.5" />
                Current City <span className="text-destructive">* (Mandatory)</span>
                {extracted.includes("current_city") && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                    <Sparkles className="size-2.5" /> From resume
                  </span>
                )}
              </span>
              <Input
                required
                aria-label="Current City"
                value={typeof fields.current_city === "string" ? fields.current_city : ""}
                onChange={(e) => setField("current_city", e.target.value || null)}
                placeholder="e.g. Austin, New York, Seattle"
                className="h-9 text-xs border-primary/40"
              />
            </label>

            {/* State */}
            <label className="space-y-1 text-xs font-medium text-foreground">
              <span className="flex items-center gap-1.5">
                Current State / Province
                {extracted.includes("current_state") && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                    <Sparkles className="size-2.5" /> From resume
                  </span>
                )}
              </span>
              <Input
                aria-label="Current State"
                value={typeof fields.current_state === "string" ? fields.current_state : ""}
                onChange={(e) => setField("current_state", e.target.value || null)}
                placeholder="e.g. TX, CA, WA"
                className="h-9 text-xs"
              />
            </label>

            {/* Street Address */}
            <label className="space-y-1 text-xs font-medium text-muted-foreground">
              <span className="flex items-center gap-1.5">
                Full Street Address
                {extracted.includes("full_address") && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                    <Sparkles className="size-2.5" /> From resume
                  </span>
                )}
              </span>
              <Input
                aria-label="Full Address"
                value={typeof fields.full_address === "string" ? fields.full_address : ""}
                onChange={(e) => setField("full_address", e.target.value || null)}
                placeholder="e.g. 123 Main St, Apt 4B"
                className="h-9 text-xs"
              />
            </label>
          </div>
        </div>

        {/* Section 2: Demographics & Common Job Portal Questions (Autofill) */}
        <div className="rounded-2xl border border-border/80 bg-card p-5 sm:p-6 shadow-xs space-y-4">
          <div className="border-b border-border/60 pb-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Demographics & Common Job Portal Questions
            </h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              These questions (Gender, Veteran status, Disability) are asked in almost every job portal. First-time resumes never list them, so save them here to empower automatic 1-click autofill.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Gender */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground block">
                Gender Identity
              </label>
              <select
                aria-label="Gender"
                value={typeof fields.gender === "string" ? fields.gender : ""}
                onChange={(e) => setField("gender", e.target.value || null)}
                className="h-9.5 w-full rounded-xl border border-border/70 bg-background px-3 py-1.5 text-xs text-foreground shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary cursor-pointer"
              >
                {GENDER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Veteran Details */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground block">
                Veteran Status (Military)
              </label>
              <select
                aria-label="Veteran Status"
                value={typeof fields.veteran_status === "string" ? fields.veteran_status : (typeof fields.veteran === "string" ? fields.veteran : "")}
                onChange={(e) => {
                  setField("veteran_status", e.target.value || null);
                  setField("veteran", e.target.value || null);
                }}
                className="h-9.5 w-full rounded-xl border border-border/70 bg-background px-3 py-1.5 text-xs text-foreground shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary cursor-pointer"
              >
                {VETERAN_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Disability Details */}
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
              <label className="text-xs font-medium text-foreground block">
                Disability Status
              </label>
              <select
                aria-label="Disability Status"
                value={typeof fields.disability_status === "string" ? fields.disability_status : (typeof fields.disability === "string" ? fields.disability : "")}
                onChange={(e) => {
                  setField("disability_status", e.target.value || null);
                  setField("disability", e.target.value || null);
                }}
                className="h-9.5 w-full rounded-xl border border-border/70 bg-background px-3 py-1.5 text-xs text-foreground shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary cursor-pointer"
              >
                {DISABILITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Section 3: Work Authorization & Visa Details */}
        <div className="rounded-2xl border border-border/80 bg-card p-5 sm:p-6 shadow-xs space-y-4">
          <div className="border-b border-border/60 pb-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Work Authorization & Visa Details
            </h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Specify your current visa status, legal work authorization, and sponsorship requirements.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Visa / Work Auth dropdown */}
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-medium text-foreground block">
                Work Authorization / Visa Status
              </label>
              <select
                aria-label="Work Authorization Status"
                value={typeof fields.visa_status === "string" ? fields.visa_status : (typeof fields.work_authorization === "string" ? fields.work_authorization : "")}
                onChange={(e) => {
                  const val = e.target.value || null;
                  setField("visa_status", val);
                  setField("work_authorization", val);
                  // Auto-tune authorization & sponsorship defaults
                  if (val === "US Citizen" || val === "Permanent Resident (Green Card)") {
                    setField("authorized_in_usa", true);
                    setField("need_sponsorship_now", false);
                    setField("need_sponsorship_future", false);
                  } else if (val === "Requires Sponsorship") {
                    setField("need_sponsorship_now", true);
                    setField("need_sponsorship_future", true);
                  } else if (val && val !== "Other") {
                    setField("authorized_in_usa", true);
                  }
                }}
                className="h-9.5 w-full rounded-xl border border-border/70 bg-background px-3 py-1.5 text-xs text-foreground shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary cursor-pointer"
              >
                {VISA_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Checkboxes for Work Auth */}
            <label className="flex items-start gap-2.5 text-xs font-medium text-foreground p-3 rounded-xl border border-border/60 bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors">
              <input
                type="checkbox"
                aria-label="Authorized to work in the US"
                className="size-4 mt-0.5 accent-primary rounded cursor-pointer"
                checked={fields.authorized_in_usa === true}
                onChange={(e) => setField("authorized_in_usa", e.target.checked)}
              />
              <div>
                <span className="block font-semibold">Authorized to work in the US</span>
                <span className="text-[11px] text-muted-foreground font-normal">
                  Legally eligible to work in the United States without employer restriction.
                </span>
              </div>
            </label>

            <label className="flex items-start gap-2.5 text-xs font-medium text-foreground p-3 rounded-xl border border-border/60 bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors">
              <input
                type="checkbox"
                aria-label="Will require sponsorship now"
                className="size-4 mt-0.5 accent-primary rounded cursor-pointer"
                checked={fields.need_sponsorship_now === true}
                onChange={(e) => setField("need_sponsorship_now", e.target.checked)}
              />
              <div>
                <span className="block font-semibold">Needs sponsorship now</span>
                <span className="text-[11px] text-muted-foreground font-normal">
                  Requires current visa transfer or employment sponsorship.
                </span>
              </div>
            </label>

            <label className="flex items-start gap-2.5 text-xs font-medium text-foreground p-3 rounded-xl border border-border/60 bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors">
              <input
                type="checkbox"
                aria-label="Will require sponsorship in future"
                className="size-4 mt-0.5 accent-primary rounded cursor-pointer"
                checked={fields.need_sponsorship_future === true}
                onChange={(e) => setField("need_sponsorship_future", e.target.checked)}
              />
              <div>
                <span className="block font-semibold">Needs sponsorship in future</span>
                <span className="text-[11px] text-muted-foreground font-normal">
                  Will require future visa sponsorship (e.g. STEM OPT to H-1B transition).
                </span>
              </div>
            </label>

            <label className="flex items-start gap-2.5 text-xs font-medium text-foreground p-3 rounded-xl border border-border/60 bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors">
              <input
                type="checkbox"
                aria-label="Open to relocation"
                className="size-4 mt-0.5 accent-primary rounded cursor-pointer"
                checked={fields.open_to_relocation === true}
                onChange={(e) => setField("open_to_relocation", e.target.checked)}
              />
              <div>
                <span className="block font-semibold">Open to relocation</span>
                <span className="text-[11px] text-muted-foreground font-normal">
                  Willing to move for on-site or hybrid opportunities.
                </span>
              </div>
            </label>
          </div>
        </div>

        {/* Section 4: Professional & Career Details */}
        <div className="rounded-2xl border border-border/80 bg-card p-5 sm:p-6 shadow-xs space-y-4">
          <div className="border-b border-border/60 pb-2">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Professional & Skills Information
            </h2>
          </div>

          <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            <label className="space-y-1 text-xs font-medium text-foreground">
              <span>Current Role / Job Title</span>
              <Input
                aria-label="Current Role"
                value={typeof fields.current_job_title === "string" ? fields.current_job_title : ""}
                onChange={(e) => setField("current_job_title", e.target.value || null)}
                placeholder="e.g. Senior Software Engineer"
                className="h-9 text-xs"
              />
            </label>

            <label className="space-y-1 text-xs font-medium text-foreground">
              <span>Current Employer</span>
              <Input
                aria-label="Current Employer"
                value={typeof fields.current_employer === "string" ? fields.current_employer : ""}
                onChange={(e) => setField("current_employer", e.target.value || null)}
                placeholder="e.g. Acme Corporation"
                className="h-9 text-xs"
              />
            </label>

            <label className="space-y-1 text-xs font-medium text-foreground">
              <span>Target Role Titles</span>
              <Input
                aria-label="Target Roles"
                value={typeof fields.target_job_titles === "string" ? fields.target_job_titles : ""}
                onChange={(e) => setField("target_job_titles", e.target.value || null)}
                placeholder="e.g. Full Stack Developer, Tech Lead"
                className="h-9 text-xs"
              />
            </label>

            <label className="space-y-1 text-xs font-medium text-foreground">
              <span>Total Experience (years)</span>
              <Input
                aria-label="Total Experience"
                value={typeof fields.total_experience_years === "string" || typeof fields.total_experience_years === "number" ? String(fields.total_experience_years) : ""}
                onChange={(e) => setField("total_experience_years", e.target.value || null)}
                placeholder="e.g. 5"
                className="h-9 text-xs"
              />
            </label>

            <label className="space-y-1 text-xs font-medium text-foreground">
              <span>Available to Join</span>
              <Input
                aria-label="Available to Join"
                value={typeof fields.available_to_join === "string" ? fields.available_to_join : ""}
                onChange={(e) => setField("available_to_join", e.target.value || null)}
                placeholder="e.g. Immediately / 2 weeks"
                className="h-9 text-xs"
              />
            </label>

            <label className="space-y-1 text-xs font-medium text-foreground">
              <span>Expected Salary / Compensation</span>
              <Input
                aria-label="Expected Salary"
                value={typeof fields.expected_salary === "string" ? fields.expected_salary : ""}
                onChange={(e) => setField("expected_salary", e.target.value || null)}
                placeholder="e.g. $120,000 / $65/hr"
                className="h-9 text-xs"
              />
            </label>

            {/* Primary Skills */}
            <label className="space-y-1 text-xs font-medium text-foreground sm:col-span-2 lg:col-span-3">
              <span className="flex items-center gap-1.5">
                Primary Skills (comma-separated)
                {extracted.includes("primary_skills") && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                    <Sparkles className="size-2.5" /> From resume
                  </span>
                )}
              </span>
              <Input
                aria-label="Primary Skills"
                value={typeof fields.primary_skills === "string" ? fields.primary_skills : ""}
                onChange={(e) => setField("primary_skills", e.target.value || null)}
                placeholder="React, TypeScript, Next.js, Node.js, Python, PostgreSQL"
                className="h-9 text-xs"
              />
            </label>

            {/* Education Summary */}
            <label className="space-y-1 text-xs font-medium text-foreground">
              <span>Highest Qualification</span>
              <Input
                aria-label="Highest Qualification"
                value={typeof fields.highest_qualification === "string" ? fields.highest_qualification : ""}
                onChange={(e) => setField("highest_qualification", e.target.value || null)}
                placeholder="e.g. Bachelor's / Master's Degree"
                className="h-9 text-xs"
              />
            </label>

            <label className="space-y-1 text-xs font-medium text-foreground">
              <span>University / College</span>
              <Input
                aria-label="University"
                value={typeof fields.university_name === "string" ? fields.university_name : ""}
                onChange={(e) => setField("university_name", e.target.value || null)}
                placeholder="e.g. University of Texas"
                className="h-9 text-xs"
              />
            </label>

            <label className="space-y-1 text-xs font-medium text-foreground">
              <span>Graduation Year</span>
              <Input
                aria-label="Graduation Year"
                value={typeof fields.graduation_year === "string" ? fields.graduation_year : ""}
                onChange={(e) => setField("graduation_year", e.target.value || null)}
                placeholder="e.g. 2021"
                className="h-9 text-xs"
              />
            </label>
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
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-xs font-medium text-destructive flex items-center gap-2">
            <AlertCircle className="size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Footer save bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
          <p className="text-xs text-muted-foreground">
            Saved facts are directly synchronized to the browser extension for instant job portal autofill.
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
              className="cursor-pointer gap-1.5 font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs"
            >
              {busy ? "Saving & Syncing Details…" : "Confirm & Save Profile"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
