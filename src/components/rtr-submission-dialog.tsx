"use client";

import * as React from "react";
import {
  FileSignature,
  UploadCloud,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Building2,
  Briefcase,
  User,
  Mail,
  Phone,
  DollarSign,
  Calendar,
  FileText,
  Loader2,
  X,
  RefreshCw,
  BadgeCheck,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { toIsoDate } from "@/lib/rtr-dates";
import type { Candidate } from "@/types/database";

interface RTRSubmissionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidates: Candidate[];
  defaultCandidateId?: string;
  onSuccess?: (submissionId?: string, candidateId?: string) => void;
}

// The agreement travels as multipart form data, so the request body stays the size of the
// original document instead of a base64 blob that is a third larger.
const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;

export function findCandidateMatch(
  extractedName: string | null | undefined,
  list: Candidate[]
): Candidate | null {
  if (!extractedName || !extractedName.trim() || !list?.length) return null;
  const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim();
  const query = clean(extractedName);
  if (!query) return null;

  // 1. Exact match (case-insensitive)
  const exact = list.find((c) => clean(c.full_name) === query);
  if (exact) return exact;

  // 2. Substring match
  const sub = list.find(
    (c) => clean(c.full_name).includes(query) || query.includes(clean(c.full_name))
  );
  if (sub) return sub;

  // 3. Word-based overlap (handles "First Last" vs "Last, First" or middle names)
  const qWords = query.split(/\s+/).filter((w) => w.length > 1);
  if (qWords.length === 0) return null;

  let bestCand: Candidate | null = null;
  let maxMatchedWords = 0;

  for (const c of list) {
    const cWords = clean(c.full_name).split(/\s+/).filter((w) => w.length > 1);
    let matched = 0;
    for (const qw of qWords) {
      if (
        cWords.some(
          (cw) =>
            cw === qw ||
            (cw.length >= 3 && qw.length >= 3 && (cw.startsWith(qw) || qw.startsWith(cw)))
        )
      ) {
        matched++;
      }
    }
    if (matched > 0 && matched > maxMatchedWords) {
      maxMatchedWords = matched;
      bestCand = c;
    }
  }

  return bestCand;
}

interface ExtractedRTR {
  candidate_name?: string | null;
  company_name?: string | null;
  job_title?: string | null;
  vendor_name?: string | null;
  vendor_contact_name?: string | null;
  vendor_contact_email?: string | null;
  vendor_contact_phone?: string | null;
  detected_companies?: string[] | null;
  rtr_type?: "vendor_rtr" | "client_rtr" | "direct_rtr";
  rtr_status?: "received" | "signed" | "expired" | "rejected";
  rtr_date?: string | null;
  expiration_date?: string | null;
  hourly_rate?: string | null;
  currency?: string | null;
  representation_clause?: string | null;
  notes?: string | null;
}

export function RTRSubmissionDialog({
  open,
  onOpenChange,
  candidates,
  defaultCandidateId,
  onSuccess,
}: RTRSubmissionDialogProps) {
  const [file, setFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [scanning, setScanning] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [dragOver, setDragOver] = React.useState(false);

  // Form fields
  const [selectedCandidateId, setSelectedCandidateId] = React.useState<string>(
    defaultCandidateId || ""
  );
  const [candidateName, setCandidateName] = React.useState("");
  const [autoMatchedCandidate, setAutoMatchedCandidate] = React.useState<Candidate | null>(null);
  const [detectedCompanies, setDetectedCompanies] = React.useState<string[]>([]);
  const [companyName, setCompanyName] = React.useState("");
  const [jobTitle, setJobTitle] = React.useState("");
  const [vendorName, setVendorName] = React.useState("");
  const [vendorContactName, setVendorContactName] = React.useState("");
  const [vendorContactEmail, setVendorContactEmail] = React.useState("");
  const [vendorContactPhone, setVendorContactPhone] = React.useState("");
  const [hourlyRate, setHourlyRate] = React.useState("");
  const [rtrType, setRtrType] = React.useState<"vendor_rtr" | "client_rtr" | "direct_rtr">("vendor_rtr");
  const [rtrStatus, setRtrStatus] = React.useState<"received" | "signed" | "expired" | "rejected">("signed");
  const [rtrDate, setRtrDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [expirationDate, setExpirationDate] = React.useState("");
  const [representationClause, setRepresentationClause] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [extractedSummary, setExtractedSummary] = React.useState<ExtractedRTR | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  // Every document gets a sequence number so a slow OCR pass from an earlier document can never
  // overwrite the values of the document that is currently on screen.
  const requestSeq = React.useRef(0);
  const abortRef = React.useRef<AbortController | null>(null);
  // The scan of the current document. Saving waits for it so the extracted terms are stored.
  const scanPromiseRef = React.useRef<Promise<ExtractedRTR | null> | null>(null);
  // The date the dialog starts with, used to tell an untouched field from an edited one.
  const initialRtrDateRef = React.useRef(rtrDate);
  // Mirror of the fields the scan writes. It is reset as soon as a new document is chosen so a
  // previous document can never leak into the record that is being saved.
  const formRef = React.useRef({
    selectedCandidateId,
    candidateName,
    companyName,
    jobTitle,
    vendorName,
    vendorContactName,
    vendorContactEmail,
    vendorContactPhone,
    hourlyRate,
    rtrType,
    rtrStatus,
    rtrDate,
    expirationDate,
    representationClause,
    notes,
  });

  React.useEffect(() => {
    formRef.current = {
      selectedCandidateId,
      candidateName,
      companyName,
      jobTitle,
      vendorName,
      vendorContactName,
      vendorContactEmail,
      vendorContactPhone,
      hourlyRate,
      rtrType,
      rtrStatus,
      rtrDate,
      expirationDate,
      representationClause,
      notes,
    };
  });

  // Sync defaultCandidateId if provided
  React.useEffect(() => {
    if (defaultCandidateId) {
      setSelectedCandidateId(defaultCandidateId);
      const cand = candidates.find((c) => c.id === defaultCandidateId);
      if (cand) setCandidateName(cand.full_name);
    }
  }, [defaultCandidateId, candidates]);

  // Clean up preview object URL on unmount or file change
  React.useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // Reset dialog state when closed
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      // Cancel any OCR pass that is still running for this dialog.
      requestSeq.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
      scanPromiseRef.current = null;
      setFile(null);
      if (previewUrl && previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(null);
      setScanning(false);
      setSaving(false);
      setAutoMatchedCandidate(null);
      if (!defaultCandidateId) {
        setSelectedCandidateId("");
        setCandidateName("");
      }
      setExtractedSummary(null);
      setDetectedCompanies([]);
      setCompanyName("");
      setJobTitle("");
      setVendorName("");
      setVendorContactName("");
      setVendorContactEmail("");
      setVendorContactPhone("");
      setHourlyRate("");
      setRtrType("vendor_rtr");
      setRtrStatus("signed");
      setRtrDate(new Date().toISOString().slice(0, 10));
      setExpirationDate("");
      setRepresentationClause("");
      setNotes("");
    }
    onOpenChange(nextOpen);
  };

  // Process chosen RTR file
  const handleProcessFile = async (chosenFile: File) => {
    if (chosenFile.size > MAX_DOCUMENT_BYTES) {
      toast.error("That document is larger than 4 MB.", {
        description: "Upload a compressed PDF or a lower resolution scan and try again.",
      });
      return;
    }

    // Invalidate anything that is still running for a previous document.
    const seq = ++requestSeq.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setFile(chosenFile);

    // Setup preview
    if (chosenFile.type.startsWith("image/")) {
      const url = URL.createObjectURL(chosenFile);
      setPreviewUrl(url);
    } else {
      setPreviewUrl(null);
    }

    // Clear every value that came from the previous document so a re-upload never keeps stale
    // client, vendor or rate information.
    setScanning(true);
    setExtractedSummary(null);
    setDetectedCompanies([]);
    setCompanyName("");
    setJobTitle("");
    setVendorName("");
    setVendorContactName("");
    setVendorContactEmail("");
    setVendorContactPhone("");
    setHourlyRate("");
    setRepresentationClause("");
    setNotes("");
    formRef.current = {
      ...formRef.current,
      companyName: "",
      jobTitle: "",
      vendorName: "",
      vendorContactName: "",
      vendorContactEmail: "",
      vendorContactPhone: "",
      hourlyRate: "",
      representationClause: "",
      notes: "",
    };

    // Trigger AI OCR Extraction
    const scan = (async (): Promise<ExtractedRTR | null> => {
      try {
        const formData = new FormData();
        formData.append("file", chosenFile);
        if (selectedCandidateId) {
          formData.append("candidateId", selectedCandidateId);
        }

        const res = await fetch("/api/rtr/ocr", {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });

        if (seq !== requestSeq.current) return null;

        const data = await res.json();
        if (seq !== requestSeq.current) return null;
        if (!res.ok) {
          throw new Error(data.error || "Failed to scan RTR document.");
        }

        const ext: ExtractedRTR = data.extracted || {};
        setExtractedSummary(ext);

        // Candidate matching or setting name
        if (ext.candidate_name) {
          setCandidateName(ext.candidate_name);
          if (candidates.length > 0) {
            const matched = findCandidateMatch(ext.candidate_name, candidates);
            if (matched) {
              setSelectedCandidateId(matched.id);
              setAutoMatchedCandidate(matched);
            } else {
              setSelectedCandidateId("");
              setAutoMatchedCandidate(null);
            }
          }
        }

        // Populate all different companies detected in the image/document
        const allDetected = new Set<string>();
        if (Array.isArray(ext.detected_companies)) {
          ext.detected_companies.forEach((c) => c && allDetected.add(c.trim()));
        }
        if (ext.company_name) allDetected.add(ext.company_name.trim());
        if (ext.vendor_name) allDetected.add(ext.vendor_name.trim());
        setDetectedCompanies(Array.from(allDetected).filter(Boolean));

        // Populate extracted terms
        if (ext.company_name) setCompanyName(ext.company_name);
        if (ext.job_title) setJobTitle(ext.job_title);
        if (ext.vendor_name) setVendorName(ext.vendor_name);
        if (ext.vendor_contact_name) setVendorContactName(ext.vendor_contact_name);
        if (ext.vendor_contact_email) setVendorContactEmail(ext.vendor_contact_email);
        if (ext.vendor_contact_phone) setVendorContactPhone(ext.vendor_contact_phone);
        if (ext.hourly_rate) setHourlyRate(ext.hourly_rate.replace(/[^0-9.]/g, ""));
        if (ext.rtr_type) setRtrType(ext.rtr_type);
        if (ext.rtr_status) setRtrStatus(ext.rtr_status);
        if (ext.rtr_date) setRtrDate(toIsoDate(ext.rtr_date) || "");
        if (ext.expiration_date) setExpirationDate(toIsoDate(ext.expiration_date) || "");
        if (ext.representation_clause) setRepresentationClause(ext.representation_clause);
        if (ext.notes) setNotes(ext.notes);

        toast.success("RTR agreement scanned successfully!", {
          description: `Extracted: ${ext.candidate_name || "Candidate"} at ${ext.company_name || "Company"} (${ext.hourly_rate ? `$${ext.hourly_rate}/hr` : "Rate extracted"}).`,
        });
        return ext;
      } catch (err: unknown) {
        // A cancelled request belongs to a document that was replaced. It must not show an error.
        if (controller.signal.aborted || seq !== requestSeq.current) return null;
        toast.error(err instanceof Error ? err.message : "Error scanning RTR document.");
        return null;
      } finally {
        if (seq === requestSeq.current) {
          setScanning(false);
        }
      }
    })();

    scanPromiseRef.current = scan;
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      void handleProcessFile(droppedFile);
    }
  };

  // Resetting the input value is what makes picking the very same file a second time fire the
  // change event again. Without it the second upload was silently ignored.
  const openFilePicker = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosenFile = e.target.files?.[0];
    if (chosenFile) {
      void handleProcessFile(chosenFile);
    }
  };

  // Submit and save RTR Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (saving) return;

    setSaving(true);
    try {
      // The document is always attached to the request, so the agreement file is stored even when
      // the save is triggered before the scan has finished. When a scan is still running the save
      // waits for it so the extracted terms are part of the record.
      let scanned: ExtractedRTR | null = null;
      if (scanPromiseRef.current) {
        scanned = await Promise.race([
          scanPromiseRef.current,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 20000)),
        ]);
      }

      const form = formRef.current;
      const candidateObj = candidates.find((c) => c.id === form.selectedCandidateId);
      const effectiveCandidateName =
        form.candidateName.trim() ||
        candidateObj?.full_name ||
        autoMatchedCandidate?.full_name ||
        scanned?.candidate_name?.trim() ||
        "";

      if (!form.selectedCandidateId && !effectiveCandidateName) {
        toast.error("Please select a candidate or enter a candidate name.");
        setSaving(false);
        return;
      }

      const effectiveCompany = form.companyName.trim() || scanned?.company_name?.trim() || "Client";
      const effectiveJobTitle = form.jobTitle.trim() || scanned?.job_title?.trim() || "Consultant";

      // The vendor recruiter email is mandatory: an agreement without a reachable agency
      // contact cannot be followed up.
      const recruiterEmail = form.vendorContactEmail.trim() || scanned?.vendor_contact_email?.trim() || "";
      if (!recruiterEmail) {
        toast.error("Vendor recruiter email is required.");
        setSaving(false);
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(recruiterEmail)) {
        toast.error("Enter a valid vendor recruiter email address.");
        setSaving(false);
        return;
      }

      // The scan only wins for a field the recruiter has not touched yet.
      const rtrType =
        scanned?.rtr_type && form.rtrType === "vendor_rtr" ? scanned.rtr_type : form.rtrType;
      const rtrStatus =
        scanned?.rtr_status && form.rtrStatus === "signed" ? scanned.rtr_status : form.rtrStatus;
      const rtrDate =
        (form.rtrDate !== initialRtrDateRef.current ? toIsoDate(form.rtrDate) : null) ||
        toIsoDate(scanned?.rtr_date) ||
        toIsoDate(form.rtrDate) ||
        new Date().toISOString().slice(0, 10);

      // Ensure valid UUID or null
      const validCandidateId =
        form.selectedCandidateId &&
        form.selectedCandidateId !== "none" &&
        form.selectedCandidateId !== "__none__" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(form.selectedCandidateId)
          ? form.selectedCandidateId
          : null;

      const payload = {
        candidate_id: validCandidateId,
        candidate_name: effectiveCandidateName || "Consultant",
        filename: file?.name || `RTR_${effectiveCompany.replace(/\s+/g, "_")}.pdf`,
        mime_type: file?.type || "application/pdf",
        rtr_type: rtrType,
        rtr_status: rtrStatus,
        rtr_date: rtrDate,
        expiration_date: toIsoDate(form.expirationDate) || toIsoDate(scanned?.expiration_date) || null,
        company_name: effectiveCompany,
        job_title: effectiveJobTitle,
        vendor_name: form.vendorName.trim() || scanned?.vendor_name?.trim() || null,
        vendor_contact_name: form.vendorContactName.trim() || scanned?.vendor_contact_name?.trim() || null,
        vendor_contact_email: recruiterEmail,
        vendor_contact_phone: form.vendorContactPhone.trim() || scanned?.vendor_contact_phone?.trim() || null,
        hourly_rate: form.hourlyRate.trim() || scanned?.hourly_rate?.replace(/[^0-9.]/g, "") || null,
        currency: "USD",
        representation_clause:
          form.representationClause.trim() || scanned?.representation_clause?.trim() || null,
        notes:
          form.notes.trim() ||
          `RTR Submission created for ${effectiveCandidateName || "Consultant"} at ${effectiveCompany}.`,
        create_submission: true,
      };

      // The document is sent as multipart form data. Encoding it as base64 inside the JSON body
      // made the request a third larger and dropped the file whenever the body was rejected.
      const formData = new FormData();
      formData.append("payload", JSON.stringify(payload));
      if (file) formData.append("file", file);

      const res = await fetch("/api/rtr", {
        method: "POST",
        body: formData,
      });

      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(result.error || "Failed to save RTR submission.");
      }

      const warnings = Array.isArray(result.warnings) ? (result.warnings as string[]) : [];
      toast.success(
        `🎉 RTR Submission recorded for ${effectiveCandidateName || "Candidate"}!`,
        {
          description: warnings.length
            ? warnings[0]
            : `Logged representation at ${effectiveCompany} (${effectiveJobTitle}) with status: ${payload.rtr_status}.`,
        }
      );

      handleOpenChange(false);
      onSuccess?.(result.submission_id, result.candidate_id);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create RTR submission.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-6 sm:p-7">
        <DialogHeader className="pb-3 border-b border-border/70">
          <div className="flex items-center gap-2.5">
            <div className="size-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-2xs">
              <FileSignature className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold flex items-center gap-2">
                Add RTR Submission
                <Badge
                  variant="outline"
                  className="bg-primary/5 text-primary border-primary/20 text-[10px] font-semibold tracking-wide py-0 h-4.5"
                >
                  <Sparkles className="size-2.5 mr-1" />
                  Universal AI OCR
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Upload ANY Right to Represent (RTR) document, vendor email screenshot, or agreement.
                OCR automatically extracts all terms and logs representation without job restrictions.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 pt-3">
          {/* File Upload Dropzone */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp,application/pdf"
              className="hidden"
              onChange={handleFileChange}
            />

            {!file ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={openFilePicker}
                className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center cursor-pointer transition-all ${
                  dragOver
                    ? "border-primary bg-primary/5 scale-[0.99]"
                    : "border-border/80 bg-muted/20 hover:bg-muted/40 hover:border-primary/50"
                }`}
              >
                <div className="size-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mx-auto mb-3 shadow-2xs">
                  <UploadCloud className="size-6" />
                </div>
                <h4 className="text-sm font-semibold text-foreground">
                  Drag and drop any RTR image, email screenshot, or PDF
                </h4>
                <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                  Accepts recruiter emails, vendor submittals, PDF agreements, and screenshot images (up to 4MB).
                </p>
                <div className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-primary">
                  <span>Browse files</span>
                  <span className="text-muted-foreground/60">•</span>
                  <span className="text-muted-foreground">Universal OCR auto-extracts all fields</span>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-border/80 bg-card p-3 sm:p-4 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {previewUrl ? (
                    <div className="relative size-14 shrink-0 rounded-lg overflow-hidden border border-border/80 bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={previewUrl}
                        alt="RTR Preview"
                        className="size-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="size-12 shrink-0 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                      <FileText className="size-6" />
                    </div>
                  )}

                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate max-w-sm">
                      {file.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {(file.size / 1024).toFixed(1)} KB • {file.type || "Document"}
                    </p>
                    {scanning && (
                      <div className="flex items-center gap-1.5 mt-1 text-[11px] font-medium text-primary animate-pulse">
                        <Loader2 className="size-3 animate-spin" />
                        AI Vision extracting candidate, client, rate, and terms...
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={saving}
                    onClick={openFilePicker}
                    className="h-8 text-xs gap-1.5 rounded-lg border-border/70"
                  >
                    <RefreshCw className="size-3" />
                    Change Document
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={saving}
                    onClick={() => {
                      // Remove the document and everything that was read out of it.
                      requestSeq.current += 1;
                      abortRef.current?.abort();
                      abortRef.current = null;
                      scanPromiseRef.current = null;
                      setFile(null);
                      setPreviewUrl(null);
                      setScanning(false);
                      setDetectedCompanies([]);
                      setExtractedSummary(null);
                      setCompanyName("");
                      setJobTitle("");
                      setVendorName("");
                      setVendorContactName("");
                      setVendorContactEmail("");
                      setVendorContactPhone("");
                      setHourlyRate("");
                      setRepresentationClause("");
                      setNotes("");
                    }}
                    className="h-8 size-8 p-0 text-muted-foreground hover:text-destructive rounded-lg"
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* OCR Extracted Highlights Card */}
          {extractedSummary && (
            <div className="p-3.5 rounded-xl border border-primary/25 bg-primary/5 space-y-2 text-xs shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-primary flex items-center gap-1.5">
                  <Sparkles className="size-3.5" />
                  AI OCR Extracted Details:
                </span>
                <Badge variant="outline" className="bg-background text-[10px] py-0 h-4.5 font-medium">
                  {extractedSummary.rtr_status === "signed" ? "✓ Signed Agreement" : "Pending / Received"}
                </Badge>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px]">
                <div className="p-2 rounded-lg bg-background/80 border border-border/60">
                  <span className="text-muted-foreground text-[10px] block">Candidate</span>
                  <span className="font-semibold text-foreground truncate block">
                    {extractedSummary.candidate_name || candidateName || "Not named"}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-background/80 border border-border/60">
                  <span className="text-muted-foreground text-[10px] block">Target Client</span>
                  <span className="font-semibold text-foreground truncate block">
                    {extractedSummary.company_name || companyName || "Client"}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-background/80 border border-border/60">
                  <span className="text-muted-foreground text-[10px] block">Role / Title</span>
                  <span className="font-semibold text-foreground truncate block">
                    {extractedSummary.job_title || jobTitle || "Consultant"}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-background/80 border border-border/60">
                  <span className="text-muted-foreground text-[10px] block">Bill Rate</span>
                  <span className="font-semibold text-primary truncate block">
                    {extractedSummary.hourly_rate ? `$${extractedSummary.hourly_rate}/hr` : "Not specified"}
                  </span>
                </div>
              </div>

              {representationClause && (
                <div className="pt-1 text-[11px] text-foreground/80 italic line-clamp-2 border-t border-border/40 mt-1">
                  &ldquo;{representationClause}&rdquo;
                </div>
              )}
            </div>
          )}

          {/* Form Fields: Grid Layout */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Candidate Selection & Name */}
            <div className="space-y-1.5 md:col-span-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="candidate" className="text-xs font-semibold flex items-center gap-1.5">
                  <User className="size-3.5 text-primary" />
                  Candidate <span className="text-destructive">*</span>
                </Label>
                {autoMatchedCandidate ? (
                  <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[10px] py-0 h-4.5 gap-1">
                    <CheckCircle2 className="size-2.5" />
                    Auto-matched: {autoMatchedCandidate.full_name}
                  </Badge>
                ) : candidateName ? (
                  <Badge variant="outline" className="text-[10px] py-0 h-4.5 text-muted-foreground">
                    Custom / Extracted Candidate
                  </Badge>
                ) : null}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Select
                  value={selectedCandidateId || undefined}
                  onValueChange={(val) => {
                    if (!val || val === "__none__") {
                      setSelectedCandidateId("");
                      setAutoMatchedCandidate(null);
                    } else {
                      setSelectedCandidateId(val);
                      const found = candidates.find((c) => c.id === val);
                      if (found) {
                        setCandidateName(found.full_name);
                        setAutoMatchedCandidate(found);
                      }
                    }
                  }}
                >
                  <SelectTrigger id="candidate" className="h-9 text-xs">
                    <SelectValue placeholder="Select candidate for this RTR..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    <SelectItem value="__none__" className="text-xs text-muted-foreground font-medium">
                      -- Independent RTR Candidate (type name below) --
                    </SelectItem>
                    {candidates.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-xs">
                        {c.full_name} {c.visa_status ? `(${c.visa_status})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Input
                  placeholder="Candidate Full Name (auto-extracted or custom)"
                  value={candidateName}
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    setCandidateName(nextVal);
                    if (candidates.length > 0) {
                      const match = findCandidateMatch(nextVal, candidates);
                      if (match) {
                        setSelectedCandidateId(match.id);
                        setAutoMatchedCandidate(match);
                      } else if (selectedCandidateId) {
                        setSelectedCandidateId("");
                        setAutoMatchedCandidate(null);
                      }
                    }
                  }}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            {/* Different Companies Detected in Document */}
            {detectedCompanies.length > 0 && (
              <div className="p-3 rounded-xl border border-primary/20 bg-primary/5 space-y-2 md:col-span-2 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-primary flex items-center gap-1.5">
                    <Building2 className="size-3.5" />
                    Companies Detected by OCR ({detectedCompanies.length}):
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    Click to quickly assign as Client or Vendor
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {detectedCompanies.map((cName) => {
                    const isClient = companyName.toLowerCase().trim() === cName.toLowerCase().trim();
                    const isVendor = vendorName.toLowerCase().trim() === cName.toLowerCase().trim();
                    return (
                      <div
                        key={cName}
                        className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-lg border text-xs transition-all ${
                          isClient
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
                            onClick={() => setCompanyName(cName)}
                            className={`px-1.5 py-0.5 rounded font-semibold transition-colors ${
                              isClient
                                ? "bg-primary text-primary-foreground shadow-2xs"
                                : "hover:bg-primary/10 text-muted-foreground hover:text-primary cursor-pointer"
                            }`}
                            title={`Assign "${cName}" as Client Company`}
                          >
                            {isClient ? "✓ Client" : "Set Client"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setVendorName(cName)}
                            className={`px-1.5 py-0.5 rounded font-semibold transition-colors ${
                              isVendor
                                ? "bg-amber-500 text-white shadow-2xs"
                                : "hover:bg-amber-500/10 text-muted-foreground hover:text-amber-600 dark:hover:text-amber-400 cursor-pointer"
                            }`}
                            title={`Assign "${cName}" as Vendor Agency`}
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

            {/* End Client / Target Company */}
            <div className="space-y-1.5">
              <Label htmlFor="companyName" className="text-xs font-semibold flex items-center gap-1.5">
                <Building2 className="size-3.5 text-primary" />
                Client / Company Name
              </Label>
              <Input
                id="companyName"
                placeholder="e.g. JPMorgan Chase, Apple"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            {/* Job Title / Role */}
            <div className="space-y-1.5">
              <Label htmlFor="jobTitle" className="text-xs font-semibold flex items-center gap-1.5">
                <Briefcase className="size-3.5 text-primary" />
                Target Job Title
              </Label>
              <Input
                id="jobTitle"
                placeholder="e.g. Senior Java Full Stack Developer"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            {/* Vendor Company */}
            <div className="space-y-1.5">
              <Label htmlFor="vendorName" className="text-xs font-semibold flex items-center gap-1.5">
                <Building2 className="size-3.5 text-primary" />
                Vendor / Staffing Agency
              </Label>
              <Input
                id="vendorName"
                placeholder="e.g. Apex Systems, Collabera"
                value={vendorName}
                onChange={(e) => setVendorName(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            {/* Submitted Hourly Rate */}
            <div className="space-y-1.5">
              <Label htmlFor="hourlyRate" className="text-xs font-semibold flex items-center gap-1.5">
                <DollarSign className="size-3.5 text-primary" />
                Agreed Hourly Rate ($/hr)
              </Label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs text-muted-foreground">$</span>
                <Input
                  id="hourlyRate"
                  type="text"
                  placeholder="e.g. 75"
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(e.target.value)}
                  className="h-9 text-xs pl-7"
                />
              </div>
            </div>

            {/* Vendor Recruiter Name */}
            <div className="space-y-1.5">
              <Label htmlFor="vendorContactName" className="text-xs font-semibold flex items-center gap-1.5">
                <User className="size-3.5 text-primary" />
                Vendor Contact / Recruiter Name
              </Label>
              <Input
                id="vendorContactName"
                placeholder="e.g. John Smith"
                value={vendorContactName}
                onChange={(e) => setVendorContactName(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            {/* Vendor Recruiter Email */}
            <div className="space-y-1.5">
              <Label htmlFor="vendorContactEmail" className="text-xs font-semibold flex items-center gap-1.5">
                <Mail className="size-3.5 text-primary" />
                Vendor Recruiter Email <span className="text-destructive">*</span>
              </Label>
              <Input
                id="vendorContactEmail"
                type="email"
                required
                placeholder="e.g. recruiter@agency.com"
                value={vendorContactEmail}
                onChange={(e) => setVendorContactEmail(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            {/* Vendor Recruiter Phone */}
            <div className="space-y-1.5">
              <Label htmlFor="vendorContactPhone" className="text-xs font-semibold flex items-center gap-1.5">
                <Phone className="size-3.5 text-primary" />
                Vendor Recruiter Phone
              </Label>
              <Input
                id="vendorContactPhone"
                type="tel"
                placeholder="e.g. (555) 123-4567"
                value={vendorContactPhone}
                onChange={(e) => setVendorContactPhone(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            {/* RTR Status */}
            <div className="space-y-1.5">
              <Label htmlFor="rtrStatus" className="text-xs font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="size-3.5 text-primary" />
                RTR Agreement Status
              </Label>
              <Select
                value={rtrStatus}
                onValueChange={(val) => setRtrStatus(val as "received" | "signed" | "expired" | "rejected")}
              >
                <SelectTrigger id="rtrStatus" className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="signed" className="text-xs">
                    Signed & Authorized (Candidate confirmed)
                  </SelectItem>
                  <SelectItem value="received" className="text-xs">
                    Received (Pending signature/review)
                  </SelectItem>
                  <SelectItem value="expired" className="text-xs">
                    Expired
                  </SelectItem>
                  <SelectItem value="rejected" className="text-xs">
                    Rejected
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* RTR Type */}
            <div className="space-y-1.5">
              <Label htmlFor="rtrType" className="text-xs font-semibold flex items-center gap-1.5">
                <FileSignature className="size-3.5 text-primary" />
                Representation Agreement Type
              </Label>
              <Select
                value={rtrType}
                onValueChange={(val) => setRtrType(val as "vendor_rtr" | "client_rtr" | "direct_rtr")}
              >
                <SelectTrigger id="rtrType" className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vendor_rtr" className="text-xs">
                    Vendor RTR (Agency representation)
                  </SelectItem>
                  <SelectItem value="client_rtr" className="text-xs">
                    Client RTR (Direct client agreement)
                  </SelectItem>
                  <SelectItem value="direct_rtr" className="text-xs">
                    Direct RTR (Direct employer authorization)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* RTR Agreement Date */}
            <div className="space-y-1.5">
              <Label htmlFor="rtrDate" className="text-xs font-semibold flex items-center gap-1.5">
                <Calendar className="size-3.5 text-primary" />
                Agreement Date
              </Label>
              <Input
                id="rtrDate"
                type="date"
                value={rtrDate}
                onChange={(e) => setRtrDate(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            {/* Expiration Date */}
            <div className="space-y-1.5">
              <Label htmlFor="expirationDate" className="text-xs font-semibold flex items-center gap-1.5">
                <Calendar className="size-3.5 text-primary" />
                Expiration Date (Optional)
              </Label>
              <Input
                id="expirationDate"
                type="date"
                value={expirationDate}
                onChange={(e) => setExpirationDate(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            {/* Notes / Internal Comments */}
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="notes" className="text-xs font-semibold">
                Notes & Representation Terms
              </Label>
              <Input
                id="notes"
                placeholder="Optional notes or details from recruiter / candidate..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-border/70">
            <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
              <BadgeCheck className="size-3.5 text-primary" />
              Saves RTR agreement and records representation across the portal.
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleOpenChange(false)}
                disabled={saving}
                className="h-9 text-xs px-3 rounded-lg"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={saving || (!file && !companyName.trim())}
                className="h-9 text-xs px-4 gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold shadow-xs rounded-lg cursor-pointer"
              >
                {saving ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Saving Submission...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="size-3.5" />
                    Save RTR Submission
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
