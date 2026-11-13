"use client";

import * as React from "react";
import {
  FileSignature,
  Upload,
  RefreshCw,
  Search,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  FileText,
  DollarSign,
  Calendar,
  Building,
  User,
  Mail,
  Phone,
  Sparkles,
  ExternalLink,
  ChevronRight,
  Plus,
  Eye,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { getCandidates } from "@/lib/candidates";
import { toIsoDate } from "@/lib/rtr-dates";
import type { Candidate } from "@/types/database";

const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;

interface RTRItem {
  id: string;
  submission_id?: string | null;
  candidate_id?: string | null;
  candidate_name?: string | null;
  candidate?: {
    id: string;
    full_name: string;
    email?: string;
    phone?: string;
  } | null;
  filename: string;
  mime_type: string;
  document_url?: string | null;
  base64?: string | null;
  rtr_type: "vendor_rtr" | "client_rtr" | "direct_rtr";
  rtr_status: "received" | "signed" | "expired" | "rejected";
  rtr_date: string;
  expiration_date?: string | null;
  company_name?: string | null;
  job_title?: string | null;
  vendor_name?: string | null;
  vendor_contact_name?: string | null;
  vendor_contact_email?: string | null;
  vendor_contact_phone?: string | null;
  hourly_rate?: string | null;
  daily_rate?: string | null;
  monthly_rate?: string | null;
  currency?: string | null;
  representation_clause?: string | null;
  notes?: string | null;
  created_at: string;
}

export default function RTRManagementPage() {
  const [documents, setDocuments] = React.useState<RTRItem[]>([]);
  const [candidates, setCandidates] = React.useState<Candidate[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");

  // Modal states
  const [ocrModalOpen, setOcrModalOpen] = React.useState(false);
  const [detailModalOpen, setDetailModalOpen] = React.useState(false);
  const [selectedDoc, setSelectedDoc] = React.useState<RTRItem | null>(null);

  // OCR state
  const [uploadingOcr, setUploadingOcr] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [ocrFile, setOcrFile] = React.useState<File | null>(null);
  const [extractedData, setExtractedData] = React.useState<Partial<RTRItem>>({});
  const [selectedCandidateId, setSelectedCandidateId] = React.useState<string>("");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const fetchRtrDocuments = React.useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/rtr?status=${statusFilter}&search=${encodeURIComponent(search)}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load RTR documents.");
      setDocuments(data.documents || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error fetching records");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  React.useEffect(() => {
    void fetchRtrDocuments();
    void getCandidates()
      .then(setCandidates)
      .catch((e) => console.warn("Candidates load error:", e));
  }, [fetchRtrDocuments]);

  // Handle OCR File Upload & Extraction
  async function handleOcrUpload(file: File) {
    if (file.size > MAX_DOCUMENT_BYTES) {
      toast.error("That document is larger than 4 MB.", {
        description: "Upload a compressed PDF or a lower resolution scan and try again.",
      });
      return;
    }
    setOcrFile(file);
    setUploadingOcr(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      if (selectedCandidateId) formData.set("candidateId", selectedCandidateId);

      const res = await fetch("/api/rtr/ocr", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "OCR extraction failed.");

      const ext = json.extracted || {};
      setExtractedData({
        filename: json.filename,
        mime_type: json.mime_type,
        candidate_name: ext.candidate_name || "",
        company_name: ext.company_name || "",
        job_title: ext.job_title || "",
        vendor_name: ext.vendor_name || "",
        vendor_contact_name: ext.vendor_contact_name || "",
        vendor_contact_email: ext.vendor_contact_email || "",
        vendor_contact_phone: ext.vendor_contact_phone || "",
        rtr_type: ext.rtr_type || "vendor_rtr",
        rtr_status: ext.rtr_status || "received",
        rtr_date: toIsoDate(ext.rtr_date) || new Date().toISOString().slice(0, 10),
        expiration_date: toIsoDate(ext.expiration_date) || "",
        hourly_rate: ext.hourly_rate || "",
        daily_rate: ext.daily_rate || "",
        currency: ext.currency || "USD",
        representation_clause: ext.representation_clause || "",
        notes: ext.notes || "",
      });

      // Try matching candidate by extracted name
      if (ext.candidate_name) {
        const found = candidates.find((c) =>
          c.full_name.toLowerCase().includes(ext.candidate_name.toLowerCase())
        );
        if (found) setSelectedCandidateId(found.id);
      }

      toast.success("Document scanned! Review the extracted fields below.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "OCR processing failed.");
    } finally {
      setUploadingOcr(false);
    }
  }

  // Save Extracted / Form Data
  async function handleSaveRtr(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    if (!extractedData.filename) {
      toast.error("Please provide or scan an RTR document.");
      return;
    }

    // The vendor recruiter email is mandatory: the agreement is worthless if the agency
    // contact cannot be reached.
    const recruiterEmail = (extractedData.vendor_contact_email || "").trim();
    if (!recruiterEmail) {
      toast.error("Vendor recruiter email is required.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(recruiterEmail)) {
      toast.error("Enter a valid vendor recruiter email address.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...extractedData,
        candidate_id: selectedCandidateId || null,
        candidate_name: extractedData.candidate_name || undefined,
        rtr_date: toIsoDate(extractedData.rtr_date) || new Date().toISOString().slice(0, 10),
        expiration_date: toIsoDate(extractedData.expiration_date) || null,
        create_submission: true,
      };

      // The document itself is sent as multipart form data so the file is never lost in a
      // base64 encoded JSON body.
      const formData = new FormData();
      formData.append("payload", JSON.stringify(payload));
      if (ocrFile) formData.append("file", ocrFile);

      const res = await fetch("/api/rtr", {
        method: "POST",
        body: formData,
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to save RTR document.");

      toast.success("RTR record saved successfully!");
      setOcrModalOpen(false);
      setExtractedData({});
      setOcrFile(null);
      void fetchRtrDocuments();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Save error");
    } finally {
      setSaving(false);
    }
  }

  // Open the stored agreement file
  async function openDocument(id: string) {
    try {
      const res = await fetch(`/api/rtr/${encodeURIComponent(id)}/document`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "The agreement file is not available.");
      const url =
        data.url ||
        (data.base64 ? `data:${data.mime_type || "application/pdf"};base64,${data.base64}` : null);
      if (!url) throw new Error("The agreement file is not available.");
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "The agreement file is not available.");
    }
  }

  // Quick Status Update
  async function updateStatus(id: string, newStatus: RTRItem["rtr_status"]) {
    try {
      const res = await fetch(`/api/rtr/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rtr_status: newStatus }),
      });
      if (!res.ok) throw new Error("Status update failed");
      toast.success(`RTR marked as ${newStatus}.`);
      void fetchRtrDocuments();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    }
  }

  // Delete Record
  async function deleteRtr(id: string) {
    if (!confirm("Are you sure you want to remove this RTR document record?")) return;
    try {
      const res = await fetch(`/api/rtr/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      toast.success("RTR record removed.");
      void fetchRtrDocuments();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to remove");
    }
  }

  // Stat metrics
  const totalCount = documents.length;
  const signedCount = documents.filter((d) => d.rtr_status === "signed").length;
  const receivedCount = documents.filter((d) => d.rtr_status === "received").length;
  const expiredCount = documents.filter((d) => d.rtr_status === "expired").length;

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6 max-w-7xl w-full mx-auto font-sans">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary mb-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            Compliance & Representation
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-2xs">
              <FileSignature className="h-5 w-5 stroke-[1.8]" />
            </span>
            Right to Represent (RTR)
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Upload and extract representation agreements, track candidate exclusivity, and manage prime vendor bill rates with automated OCR.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            className="h-9 rounded-xl border-border/80 px-3 text-xs font-medium shadow-xs hover:border-primary/50 transition-all cursor-pointer"
            onClick={() => void fetchRtrDocuments()}
            disabled={loading}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          {/* OCR Trigger Button */}
          <Button
            onClick={() => {
              setExtractedData({
                rtr_status: "received",
                rtr_type: "vendor_rtr",
                rtr_date: new Date().toISOString().slice(0, 10),
                currency: "USD",
              });
              setOcrFile(null);
              setOcrModalOpen(true);
            }}
            className="h-9 rounded-xl px-3.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm cursor-pointer transition-all flex items-center gap-1.5"
          >
            <Sparkles className="size-3.5" />
            <span>Upload & OCR Extract</span>
          </Button>
        </div>
      </div>

      {/* Metric Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border/70 bg-card p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
            <span>Total Agreements</span>
            <FileText className="size-4 text-muted-foreground/70" />
          </div>
          <div className="text-2xl font-bold tracking-tight text-foreground">{totalCount}</div>
          <p className="text-[11px] text-muted-foreground">Active & archived</p>
        </div>

        <div className="rounded-xl border border-border/70 bg-card p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
            <span>Signed / Active</span>
            <CheckCircle2 className="size-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold tracking-tight text-emerald-600">{signedCount}</div>
          <p className="text-[11px] text-muted-foreground">Exclusivity confirmed</p>
        </div>

        <div className="rounded-xl border border-border/70 bg-card p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
            <span>Pending Review</span>
            <Clock className="size-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold tracking-tight text-amber-600">{receivedCount}</div>
          <p className="text-[11px] text-muted-foreground">Awaiting signature</p>
        </div>

        <div className="rounded-xl border border-border/70 bg-card p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground font-medium">
            <span>Expired / Rejected</span>
            <AlertCircle className="size-4 text-destructive" />
          </div>
          <div className="text-2xl font-bold tracking-tight text-destructive">{expiredCount}</div>
          <p className="text-[11px] text-muted-foreground">Requires renewal</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
        {/* Status Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto p-1 bg-muted/50 rounded-xl border border-border/60 text-xs">
          {[
            { id: "all", label: "All Agreements" },
            { id: "signed", label: "Signed" },
            { id: "received", label: "Pending" },
            { id: "expired", label: "Expired" },
            { id: "rejected", label: "Rejected" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all cursor-pointer whitespace-nowrap ${
                statusFilter === tab.id
                  ? "bg-background text-foreground shadow-2xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search candidate, company, vendor..."
            className="h-9 pl-9 rounded-xl border-border/80 bg-background text-xs"
          />
        </div>
      </div>

      {/* Table of RTR Documents */}
      <div className="rounded-xl border border-border/70 bg-card shadow-2xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-muted-foreground space-y-2">
            <RefreshCw className="size-5 animate-spin mx-auto text-primary" />
            <p>Loading representation agreements...</p>
          </div>
        ) : documents.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="size-10 rounded-full bg-muted flex items-center justify-center mx-auto text-muted-foreground">
              <FileSignature className="size-5" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-foreground">No RTR agreements found</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Upload an RTR agreement image or PDF using OCR extraction to populate this table automatically.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOcrModalOpen(true)}
              className="rounded-xl text-xs"
            >
              <Upload className="size-3.5 mr-1.5" />
              Upload first RTR
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 border-b border-border/60 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="py-3 px-4">Candidate & Role</th>
                  <th className="py-3 px-4">Client / Company</th>
                  <th className="py-3 px-4">Vendor & Recruiter</th>
                  <th className="py-3 px-4">Rate</th>
                  <th className="py-3 px-4">Status & Type</th>
                  <th className="py-3 px-4">Dates</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {documents.map((doc) => {
                  const candidateName =
                    doc.candidate_name || doc.candidate?.full_name || doc.notes?.match(/candidate:\s*([^,;.]+)/i)?.[1] || "Independent Candidate";

                  return (
                    <tr key={doc.id} className="hover:bg-muted/20 transition-colors">
                      {/* Candidate & Role */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-foreground">{candidateName}</div>
                        <div className="text-muted-foreground text-[11px] truncate max-w-[200px]">
                          {doc.job_title || "General Representation"}
                        </div>
                      </td>

                      {/* Client */}
                      <td className="py-3 px-4">
                        <div className="font-medium text-foreground">{doc.company_name || "Direct Client"}</div>
                        <div className="text-muted-foreground text-[10px] font-mono truncate max-w-[150px]">
                          {doc.filename}
                        </div>
                      </td>

                      {/* Vendor */}
                      <td className="py-3 px-4">
                        <div className="font-medium text-foreground">{doc.vendor_name || "Direct RTR"}</div>
                        <div className="text-muted-foreground text-[11px] break-all">
                          {doc.vendor_contact_email || (
                            <span className="text-destructive">No recruiter email</span>
                          )}
                        </div>
                      </td>

                      {/* Rate */}
                      <td className="py-3 px-4">
                        {doc.hourly_rate ? (
                          <Badge variant="outline" className="font-mono text-[11px] font-semibold text-primary">
                            ${doc.hourly_rate}/hr
                          </Badge>
                        ) : doc.daily_rate ? (
                          <Badge variant="outline" className="font-mono text-[11px]">
                            ${doc.daily_rate}/day
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-[11px]">—</span>
                        )}
                      </td>

                      {/* Status & Type */}
                      <td className="py-3 px-4 space-y-1">
                        <div>
                          {doc.rtr_status === "signed" ? (
                            <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 gap-1 text-[10px]">
                              <CheckCircle2 className="size-2.5" /> Signed
                            </Badge>
                          ) : doc.rtr_status === "expired" ? (
                            <Badge variant="destructive" className="gap-1 text-[10px]">
                              <AlertCircle className="size-2.5" /> Expired
                            </Badge>
                          ) : doc.rtr_status === "rejected" ? (
                            <Badge variant="secondary" className="gap-1 text-[10px] text-destructive">
                              <XCircle className="size-2.5" /> Rejected
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 gap-1 text-[10px]">
                              <Clock className="size-2.5" /> Received
                            </Badge>
                          )}
                        </div>
                        <div className="text-[10px] uppercase font-mono text-muted-foreground">
                          {doc.rtr_type.replace("_", " ")}
                        </div>
                      </td>

                      {/* Dates */}
                      <td className="py-3 px-4 text-[11px]">
                        <div>Signed: {doc.rtr_date}</div>
                        {doc.expiration_date && (
                          <div className="text-muted-foreground text-[10px]">
                            Expires: {doc.expiration_date}
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => void openDocument(doc.id)}
                            title="Open the agreement file"
                          >
                            <ExternalLink className="size-3.5 text-muted-foreground hover:text-foreground" />
                          </Button>

                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => {
                              setSelectedDoc(doc);
                              setDetailModalOpen(true);
                            }}
                            title="Inspect RTR Details"
                          >
                            <Eye className="size-3.5 text-muted-foreground hover:text-foreground" />
                          </Button>

                          {doc.rtr_status !== "signed" && (
                            <Button
                              variant="ghost"
                              size="xs"
                              className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 text-[11px] h-6 px-1.5"
                              onClick={() => void updateStatus(doc.id, "signed")}
                            >
                              Sign
                            </Button>
                          )}

                          <Button
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => void deleteRtr(doc.id)}
                            title="Remove RTR"
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* OCR Extraction / Upload Modal */}
      <Dialog open={ocrModalOpen} onOpenChange={setOcrModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2 text-primary text-xs font-semibold uppercase tracking-wider">
              <Sparkles className="size-3.5" />
              AI OCR Ingestion
            </div>
            <DialogTitle className="text-xl">Upload & Extract RTR Document</DialogTitle>
            <DialogDescription className="text-xs">
              Upload an image (PNG, JPG, WEBP) or PDF of a Right to Represent agreement. The OCR engine automatically extracts key terms, rates, and candidate info.
            </DialogDescription>
          </DialogHeader>

          {/* Upload Dropzone */}
          <div
            onClick={() => {
              if (fileInputRef.current) {
                fileInputRef.current.value = "";
                fileInputRef.current.click();
              }
            }}
            className="border-2 border-dashed border-border/80 hover:border-primary/60 rounded-xl p-6 text-center cursor-pointer transition-all bg-muted/20 hover:bg-muted/30 space-y-2"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".png,.jpg,.jpeg,.webp,.pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleOcrUpload(file);
              }}
            />
            {uploadingOcr ? (
              <div className="space-y-2 py-4">
                <RefreshCw className="size-6 animate-spin mx-auto text-primary" />
                <p className="text-xs font-semibold text-foreground">
                  Scanning image & running OCR field extraction...
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Analyzing candidate name, client, rates, and exclusivity terms
                </p>
              </div>
            ) : ocrFile ? (
              <div className="space-y-1 py-2">
                <FileCheckIcon className="size-6 mx-auto text-emerald-600" />
                <p className="text-xs font-semibold text-foreground">{ocrFile.name}</p>
                <p className="text-[11px] text-muted-foreground">Click to upload a different file</p>
              </div>
            ) : (
              <div className="space-y-1.5 py-4">
                <Upload className="size-6 mx-auto text-muted-foreground" />
                <p className="text-xs font-semibold text-foreground">
                  Click or drag RTR image or PDF here
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Supports screenshots, scanned agreements, and digital letters (PNG, JPG, PDF up to 4MB)
                </p>
              </div>
            )}
          </div>

          {/* Extracted Fields Form */}
          <form onSubmit={handleSaveRtr} className="space-y-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            

              {/* Company / Client */}
              <div className="space-y-1">
                <Label className="text-xs font-medium">End Client / Company Name</Label>
                <Input
                  value={extractedData.company_name || ""}
                  onChange={(e) =>
                    setExtractedData({ ...extractedData, company_name: e.target.value })
                  }
                  placeholder="e.g. Stripe, Salesforce"
                  className="h-9 text-xs"
                />
              </div>

              {/* Job Title */}
              <div className="space-y-1">
                <Label className="text-xs font-medium">Job Title / Role</Label>
                <Input
                  value={extractedData.job_title || ""}
                  onChange={(e) =>
                    setExtractedData({ ...extractedData, job_title: e.target.value })
                  }
                  placeholder="e.g. Senior Software Engineer"
                  className="h-9 text-xs"
                />
              </div>

              {/* Vendor Name */}
              <div className="space-y-1">
                <Label className="text-xs font-medium">Staffing Agency / Prime Vendor</Label>
                <Input
                  value={extractedData.vendor_name || ""}
                  onChange={(e) =>
                    setExtractedData({ ...extractedData, vendor_name: e.target.value })
                  }
                  placeholder="e.g. TEKsystems, Apex Systems"
                  className="h-9 text-xs"
                />
              </div>

              {/* Agreed Rate */}
              <div className="space-y-1">
                <Label className="text-xs font-medium">Hourly Bill Rate ($)</Label>
                <Input
                  value={extractedData.hourly_rate || ""}
                  onChange={(e) =>
                    setExtractedData({ ...extractedData, hourly_rate: e.target.value })
                  }
                  placeholder="e.g. 85.00"
                  className="h-9 text-xs"
                />
              </div>

              {/* Recruiter Email */}
              <div className="space-y-1">
                <Label className="text-xs font-medium">
                  Vendor Recruiter Email <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="email"
                  required
                  value={extractedData.vendor_contact_email || ""}
                  onChange={(e) =>
                    setExtractedData({
                      ...extractedData,
                      vendor_contact_email: e.target.value,
                    })
                  }
                  placeholder="recruiter@agency.com"
                  className="h-9 text-xs"
                />
                <p className="text-[10px] text-muted-foreground">
                  Required. The agency contact has to be reachable for this agreement.
                </p>
              </div>

              {/* Recruiter Phone */}
              <div className="space-y-1">
                <Label className="text-xs font-medium">Vendor Contact Phone</Label>
                <Input
                  value={extractedData.vendor_contact_phone || ""}
                  onChange={(e) =>
                    setExtractedData({
                      ...extractedData,
                      vendor_contact_phone: e.target.value,
                    })
                  }
                  placeholder="(555) 000-0000"
                  className="h-9 text-xs"
                />
              </div>

              {/* Agreement Status */}
              <div className="space-y-1">
                <Label className="text-xs font-medium">Agreement Status</Label>
                <select
                  value={extractedData.rtr_status || "received"}
                  onChange={(e) =>
                    setExtractedData({
                      ...extractedData,
                      rtr_status: e.target.value as RTRItem["rtr_status"],
                    })
                  }
                  className="w-full h-9 rounded-lg border border-border bg-background px-3 text-xs"
                >
                  <option value="received">Received (Awaiting Signature)</option>
                  <option value="signed">Signed / Executed</option>
                  <option value="expired">Expired</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>

              {/* Agreement Type */}
              <div className="space-y-1">
                <Label className="text-xs font-medium">RTR Type</Label>
                <select
                  value={extractedData.rtr_type || "vendor_rtr"}
                  onChange={(e) =>
                    setExtractedData({
                      ...extractedData,
                      rtr_type: e.target.value as RTRItem["rtr_type"],
                    })
                  }
                  className="w-full h-9 rounded-lg border border-border bg-background px-3 text-xs"
                >
                  <option value="vendor_rtr">Vendor RTR (Agency)</option>
                  <option value="client_rtr">Client Direct RTR</option>
                  <option value="direct_rtr">Direct Candidate Representation</option>
                </select>
              </div>

              {/* Agreement Date */}
              <div className="space-y-1">
                <Label className="text-xs font-medium">Agreement Date</Label>
                <Input
                  type="date"
                  value={extractedData.rtr_date || ""}
                  onChange={(e) =>
                    setExtractedData({ ...extractedData, rtr_date: e.target.value })
                  }
                  className="h-9 text-xs"
                />
              </div>

              {/* Expiration Date */}
              <div className="space-y-1">
                <Label className="text-xs font-medium">Exclusivity Expiration</Label>
                <Input
                  type="date"
                  value={extractedData.expiration_date || ""}
                  onChange={(e) =>
                    setExtractedData({ ...extractedData, expiration_date: e.target.value })
                  }
                  className="h-9 text-xs"
                />
              </div>

              {/* Representation Clause Summary */}
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs font-medium">Representation Clause / Exclusivity Text</Label>
                <textarea
                  rows={2}
                  value={extractedData.representation_clause || ""}
                  onChange={(e) =>
                    setExtractedData({
                      ...extractedData,
                      representation_clause: e.target.value,
                    })
                  }
                  placeholder="Verbatim text granting exclusive rights to represent candidate..."
                  className="w-full rounded-lg border border-border bg-background p-2 text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border/60">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOcrModalOpen(false)}
                disabled={saving}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={saving || uploadingOcr} className="text-xs">
                {saving ? "Saving..." : uploadingOcr ? "Reading Document..." : "Save RTR Record"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Detail / Inspection Modal */}
      <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Agreement Inspection
            </div>
            <DialogTitle className="text-lg">
              {selectedDoc?.candidate?.full_name || "Candidate"} &mdash; {selectedDoc?.company_name || "Client"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Review representation terms, agreed bill rates, and agency contacts.
            </DialogDescription>
          </DialogHeader>

          {selectedDoc && (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-muted/40 border border-border/60">
                <div>
                  <div className="text-muted-foreground text-[10px] uppercase font-mono">Status</div>
                  <div className="font-semibold capitalize text-foreground mt-0.5">
                    {selectedDoc.rtr_status}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-[10px] uppercase font-mono">RTR Type</div>
                  <div className="font-semibold capitalize text-foreground mt-0.5">
                    {selectedDoc.rtr_type.replace("_", " ")}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-[10px] uppercase font-mono">Agreed Rate</div>
                  <div className="font-mono font-semibold text-primary mt-0.5">
                    {selectedDoc.hourly_rate ? `$${selectedDoc.hourly_rate}/hr` : "Not specified"}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-[10px] uppercase font-mono">Agreement Date</div>
                  <div className="font-medium text-foreground mt-0.5">{selectedDoc.rtr_date}</div>
                </div>
              </div>

              <div className="space-y-2 border border-border/60 rounded-lg p-3">
                <div className="font-semibold text-foreground flex items-center gap-1.5">
                  <Building className="size-3.5 text-muted-foreground" />
                  Vendor & Recruiter Contact
                </div>
                <div className="space-y-1 text-muted-foreground">
                  <div>Vendor: <span className="text-foreground font-medium">{selectedDoc.vendor_name || "Direct"}</span></div>
                  <div>
                    Email:{" "}
                    <span className={selectedDoc.vendor_contact_email ? "text-foreground" : "text-destructive"}>
                      {selectedDoc.vendor_contact_email || "Not recorded"}
                    </span>
                  </div>
                  <div>
                    Phone:{" "}
                    <span className={selectedDoc.vendor_contact_phone ? "text-foreground" : "text-muted-foreground"}>
                      {selectedDoc.vendor_contact_phone || "Not recorded"}
                    </span>
                  </div>
                </div>
              </div>

              {selectedDoc.representation_clause && (
                <div className="space-y-1 border border-border/60 rounded-lg p-3 bg-muted/20">
                  <div className="font-semibold text-foreground">Exclusivity Clause</div>
                  <p className="text-muted-foreground leading-relaxed italic">
                    "{selectedDoc.representation_clause}"
                  </p>
                </div>
              )}

              <div className="flex justify-end pt-2">
                <Button variant="outline" size="sm" onClick={() => setDetailModalOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FileCheckIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="m9 15 2 2 4-4" />
    </svg>
  );
}
