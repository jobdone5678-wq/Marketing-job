"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getCandidates } from "@/lib/candidates";
import { createSubmission, updateSubmission, checkDuplicate } from "@/lib/submissions";
import type {
  Candidate,
  JobSubmission,
  JobSubmissionFormData,
  SubmissionStatus,
  RTRDocumentReference,
} from "@/types/database";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileSignature,
  UploadCloud,
  Sparkles,
  CheckCircle2,
  Loader2,
  FileText,
  Building2,
} from "lucide-react";
import { toast } from "sonner";
import { findCandidateMatch } from "@/components/rtr-submission-dialog";

const fields = [
  "company_name",
  "job_title",
  "job_url",
  "portal_source",
  "job_location",
  "vendor_company",
  "vendor_contact_name",
  "vendor_contact_email",
  "vendor_contact_phone",
  "submitted_rate",
  "client_pay_rate",
  "interview_time",
  "interview_mode",
  "interview_meeting_link",
  "notes",
] as const;

const statuses: SubmissionStatus[] = [
  "Draft",
  "Applied",
  "Vendor_Screening",
  "Submitted_to_Client",
  "Interview_Scheduled",
  "Round_1",
  "Round_2",
  "Offer_Received",
  "Rejected",
  "No_Response",
];

export function SubmissionForm({
  initialSubmission,
  initialCandidateId,
  initialJob,
  backUrl = "/dashboard/submissions",
  onSuccess,
}: {
  initialSubmission?: JobSubmission | null;
  initialCandidateId?: string;
  initialJob?: Partial<JobSubmission>;
  backUrl?: string;
  onSuccess?: (s: JobSubmission) => void;
}) {
  const router = useRouter();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [duplicate, setDuplicate] = useState(false);
  const [scanningRtr, setScanningRtr] = useState(false);
  const [detectedCompanies, setDetectedCompanies] = useState<string[]>([]);
  const [attachedRtr, setAttachedRtr] = useState<RTRDocumentReference | null>(
    (initialSubmission?.rtr_document as RTRDocumentReference) || null
  );

  const rtrInputRef = useRef<HTMLInputElement>(null);

  const [data, setData] = useState<Record<string, unknown>>(() => ({
    ...Object.fromEntries(fields.map((k) => [k, null])),
    ...Object.fromEntries(
      fields
        .filter((key) => (initialSubmission || initialJob)?.[key] !== undefined)
        .map((key) => [key, (initialSubmission || initialJob)?.[key]])
    ),
    candidate_id: initialSubmission?.candidate_id || initialCandidateId || "",
    job_id: initialSubmission?.job_id || initialJob?.job_id || null,
    status: initialSubmission?.status || "Draft",
    submission_date:
      initialSubmission?.submission_date || new Date().toISOString().slice(0, 10),
    rtr_document: initialSubmission?.rtr_document || null,
  }));

  useEffect(() => {
    void getCandidates()
      .then(setCandidates)
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const company = String(data.company_name || "");
    const id = String(data.candidate_id || "");
    if (company && id) {
      const timer = setTimeout(
        () =>
          void checkDuplicate(id, company)
            .then((d) => !cancelled && setDuplicate(d))
            .catch((e) => !cancelled && setError(e.message)),
        300
      );
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }
  }, [data.company_name, data.candidate_id]);

  // Handle RTR Image / Document OCR
  const handleRtrScan = async (file: File) => {
    setScanningRtr(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (data.candidate_id) {
        formData.append("candidateId", String(data.candidate_id));
      }

      const res = await fetch("/api/rtr/ocr", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to scan RTR.");

      const ext = json.extracted || {};
      const nextData: Record<string, unknown> = { ...data };

      // Populate all different companies detected in the image/document
      const allDetected = new Set<string>();
      if (Array.isArray(ext.detected_companies)) {
        ext.detected_companies.forEach((c: string) => c && allDetected.add(c.trim()));
      }
      if (ext.company_name) allDetected.add(String(ext.company_name).trim());
      if (ext.vendor_name) allDetected.add(String(ext.vendor_name).trim());
      setDetectedCompanies(Array.from(allDetected).filter(Boolean));

      // Candidate matching
      if (!nextData.candidate_id && ext.candidate_name && candidates.length > 0) {
        const found = findCandidateMatch(ext.candidate_name, candidates);
        if (found) nextData.candidate_id = found.id;
      }

      if (ext.company_name) nextData.company_name = ext.company_name;
      if (ext.job_title) nextData.job_title = ext.job_title;
      if (ext.vendor_name) nextData.vendor_company = ext.vendor_name;
      if (ext.vendor_contact_name) nextData.vendor_contact_name = ext.vendor_contact_name;
      if (ext.vendor_contact_email) nextData.vendor_contact_email = ext.vendor_contact_email;
      if (ext.vendor_contact_phone) nextData.vendor_contact_phone = ext.vendor_contact_phone;
      if (ext.hourly_rate) nextData.submitted_rate = `$${ext.hourly_rate}/hr`;
      if (ext.rtr_status === "signed") nextData.status = "Submitted_to_Client";
      else if (ext.rtr_status === "received") nextData.status = "Vendor_Screening";

      const rtrRef: RTRDocumentReference = {
        id: crypto.randomUUID(),
        filename: json.filename,
        mime_type: json.mime_type,
        vendor_name: ext.vendor_name || null,
        vendor_contact_name: ext.vendor_contact_name || null,
        vendor_contact_email: ext.vendor_contact_email || null,
        vendor_contact_phone: ext.vendor_contact_phone || null,
        rtr_type: ext.rtr_type || "vendor_rtr",
        rtr_status: ext.rtr_status || "received",
        rtr_date: ext.rtr_date || new Date().toISOString().slice(0, 10),
        expiration_date: ext.expiration_date || null,
        hourly_rate: ext.hourly_rate || null,
        currency: ext.currency || "USD",
        created_at: new Date().toISOString(),
      };

      nextData.rtr_document = rtrRef;
      setAttachedRtr(rtrRef);
      setData(nextData);
      setDuplicate(false);

      toast.success("RTR details auto-filled into form!", {
        description: `Client: ${ext.company_name || "Extracted"} | Vendor: ${ext.vendor_name || "Direct"} | Rate: ${ext.hourly_rate ? `$${ext.hourly_rate}/hr` : "N/A"}`,
      });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "RTR scan failed");
    } finally {
      setScanningRtr(false);
    }
  };

  async function save() {
    setBusy(true);
    setError("");
    try {
      const rtrToAttach = attachedRtr || (data.rtr_document as RTRDocumentReference | null) || null;
      let finalNotes = String(data.notes || "");
      if (rtrToAttach) {
        const cleanNotes = finalNotes.replace(/<!-- RTR_METADATA:[\s\S]*?-->/g, "").trim();
        const rtrTag = `<!-- RTR_METADATA: ${JSON.stringify(rtrToAttach)} -->`;
        finalNotes = cleanNotes ? `${cleanNotes}\n\n${rtrTag}` : rtrTag;
      }

      const payload: JobSubmissionFormData = {
        ...(data as unknown as JobSubmissionFormData),
        notes: finalNotes || null,
        rtr_document: rtrToAttach,
      };

      const result = initialSubmission
        ? await updateSubmission(initialSubmission.id, payload)
        : await createSubmission(payload);

      if (result.error || !result.data) {
        throw new Error(result.error || "Save failed");
      }
      onSuccess?.(result.data);
      router.push(backUrl);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="portal-page max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <Link className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1" href={backUrl}>
          ← Back to submissions
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {initialSubmission ? "Edit submission" : "Create submission draft"}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Log marketing and client submissions with optional RTR authorization records.
          </p>
        </div>

        {/* RTR OCR Auto-Fill Action */}
        <div>
          <input
            ref={rtrInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleRtrScan(f);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={scanningRtr}
            onClick={() => rtrInputRef.current?.click()}
            className="h-9 px-3 text-xs gap-1.5 cursor-pointer rounded-lg border-primary/40 bg-primary/5 text-primary hover:bg-primary/10 transition-all font-semibold"
          >
            {scanningRtr ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Scanning RTR...
              </>
            ) : (
              <>
                <Sparkles className="size-3.5" />
                Auto-Fill from RTR Image
              </>
            )}
          </Button>
        </div>
      </div>

      {attachedRtr && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div>
              <span className="font-semibold text-emerald-900 dark:text-emerald-200">
                Attached RTR Document: {attachedRtr.filename}
              </span>
              <p className="text-[11px] text-emerald-700/80 dark:text-emerald-300/80">
                Status: {attachedRtr.rtr_status} • Vendor: {attachedRtr.vendor_name || "Direct"} • Date: {attachedRtr.rtr_date}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setAttachedRtr(null);
              setData({ ...data, rtr_document: null });
            }}
            className="h-7 text-xs text-destructive hover:bg-destructive/10"
          >
            Remove
          </Button>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="workspace-form space-y-5"
      >
        <label className="block text-xs font-semibold">
          Candidate <span className="text-destructive">*</span>
          <select
            required
            disabled={Boolean(initialSubmission)}
            className="block w-full border rounded-lg p-2 mt-1 text-xs bg-background"
            value={String(data.candidate_id || "")}
            onChange={(e) => {
              setData({ ...data, candidate_id: e.target.value });
              setDuplicate(false);
            }}
          >
            <option value="">Choose candidate</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name} {c.visa_status ? `(${c.visa_status})` : ""}
              </option>
            ))}
          </select>
        </label>

        {/* Different Companies Detected in RTR Document */}
        {detectedCompanies.length > 0 && (
          <div className="p-3.5 rounded-xl border border-primary/20 bg-primary/5 space-y-2 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
                <Building2 className="size-3.5" />
                Different Companies Found in RTR ({detectedCompanies.length}):
              </span>
              <span className="text-[10px] text-muted-foreground">
                Click to quickly assign as Company or Vendor
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {detectedCompanies.map((cName) => {
                const currentComp = String(data.company_name || "").toLowerCase().trim();
                const currentVendor = String(data.vendor_company || "").toLowerCase().trim();
                const isCompany = currentComp === cName.toLowerCase().trim();
                const isVendor = currentVendor === cName.toLowerCase().trim();
                return (
                  <div
                    key={cName}
                    className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs transition-all ${
                      isCompany
                        ? "bg-primary/10 border-primary/40 text-primary font-medium"
                        : isVendor
                        ? "bg-amber-500/10 border-amber-500/40 text-amber-700 dark:text-amber-300 font-medium"
                        : "bg-background border-border/80 text-foreground"
                    }`}
                  >
                    <span className="font-semibold truncate max-w-[180px]" title={cName}>
                      {cName}
                    </span>
                    <div className="flex items-center gap-1 border-l border-border/60 pl-1.5 text-[10px]">
                      <button
                        type="button"
                        onClick={() => {
                          setData((prev) => ({ ...prev, company_name: cName }));
                          setDuplicate(false);
                        }}
                        className={`px-1.5 py-0.5 rounded font-semibold transition-colors ${
                          isCompany
                            ? "bg-primary text-primary-foreground shadow-2xs"
                            : "hover:bg-primary/10 text-muted-foreground hover:text-primary"
                        }`}
                        title={`Assign "${cName}" as Company Name`}
                      >
                        {isCompany ? "✓ Company" : "Set Company"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setData((prev) => ({ ...prev, vendor_company: cName }));
                        }}
                        className={`px-1.5 py-0.5 rounded font-semibold transition-colors ${
                          isVendor
                            ? "bg-amber-500 text-white shadow-2xs"
                            : "hover:bg-amber-500/10 text-muted-foreground hover:text-amber-600 dark:hover:text-amber-400"
                        }`}
                        title={`Assign "${cName}" as Vendor Company`}
                      >
                        {isVendor ? "✓ Vendor" : "Set Vendor"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4">
          {fields.map((k) => (
            <label key={k} className="text-xs font-semibold capitalize">
              {k.replaceAll("_", " ")}
              {k === "company_name" || k === "job_title" ? (
                <span className="text-destructive"> *</span>
              ) : null}
              <Input
                type={k === "interview_time" ? "datetime-local" : "text"}
                required={k === "company_name" || k === "job_title"}
                value={typeof data[k] === "string" ? String(data[k]) : ""}
                onChange={(e) => {
                  setData({ ...data, [k]: e.target.value || null });
                  setDuplicate(false);
                }}
                className="mt-1 h-9 text-xs"
              />
            </label>
          ))}
          <label className="text-xs font-semibold">
            Recruiting status
            <select
              className="block w-full border rounded-lg p-2 mt-1 text-xs bg-background"
              value={String(data.status)}
              onChange={(e) => setData({ ...data, status: e.target.value })}
            >
              {statuses.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold">
            Record date <span className="text-destructive">*</span>
            <Input
              required
              type="date"
              value={String(data.submission_date)}
              onChange={(e) => setData({ ...data, submission_date: e.target.value })}
              className="mt-1 h-9 text-xs"
            />
          </label>
        </div>

        {duplicate && (
          <p className="text-xs font-medium text-amber-700 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 p-2.5 rounded-lg">
            Another submission to this company exists in the last 30 days. Review it before adding another.
          </p>
        )}
        {error && (
          <p role="alert" className="text-xs font-medium text-destructive bg-destructive/10 border border-destructive/20 p-2.5 rounded-lg">
            {error}
          </p>
        )}

        <div className="flex items-center gap-2 pt-2">
          <Button type="submit" disabled={busy || !data.candidate_id}>
            {busy ? "Saving..." : "Save submission record"}
          </Button>
          <Link href={backUrl}>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </Link>
        </div>
      </form>
    </main>
  );
}
