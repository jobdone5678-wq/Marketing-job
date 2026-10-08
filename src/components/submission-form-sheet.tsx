"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  createSubmission,
  updateSubmission,
  checkDuplicate,
} from "@/lib/submissions";
import { getCandidates } from "@/lib/candidates";
import type {
  Candidate,
  JobSubmission,
  JobSubmissionFormData,
  SubmissionStatus,
} from "@/types/database";
import {
  ArrowLeftIcon,
  XIcon,
  Building2Icon,
  BriefcaseIcon,
  AlertTriangleIcon,
  SendIcon,
  UserIcon,
  GlobeIcon,
  DollarSignIcon,
  CalendarIcon,
  ClockIcon,
  VideoIcon,
  CheckCircle2Icon,
  ShieldCheckIcon,
} from "lucide-react";

const SUBMISSION_STATUSES: { label: string; value: SubmissionStatus }[] = [
  { label: "1. Applied (Portal / Vendor)", value: "Applied" },
  { label: "2. Vendor Screening (RTR Signed)", value: "Vendor_Screening" },
  { label: "3. Submitted to Client / Prime", value: "Submitted_to_Client" },
  { label: "4. Interview Scheduled", value: "Interview_Scheduled" },
  { label: "5. Round 1 Interview", value: "Round_1" },
  { label: "6. Round 2 Interview / Client Loop", value: "Round_2" },
  { label: "7. Offer Received 🎉", value: "Offer_Received" },
  { label: "8. Rejected", value: "Rejected" },
  { label: "9. No Response / Stale", value: "No_Response" },
];

const PORTAL_SOURCES = [
  "Greenhouse",
  "Ashby",
  "LinkedIn",
  "Dice",
  "CareerBuilder",
  "Indeed",
  "Direct Client",
  "Prime Vendor Network",
  "Other",
];

const INTERVIEW_MODES = [
  "Zoom",
  "Microsoft Teams",
  "Google Meet",
  "Phone Call",
  "WebEx",
  "In-Person",
];

interface SubmissionFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submissionToEdit?: JobSubmission | null;
  initialCandidateId?: string;
  initialJob?: {
    company_name?: string;
    job_title?: string;
    job_url?: string;
    portal_source?: string;
    job_location?: string;
  };
  onSuccess?: (submission: JobSubmission) => void;
}

export function SubmissionFormSheet({
  open,
  onOpenChange,
  submissionToEdit,
  initialCandidateId,
  initialJob,
  onSuccess,
}: SubmissionFormSheetProps) {
  const [candidates, setCandidates] = React.useState<Candidate[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = React.useState<string>("");
  const [loading, setLoading] = React.useState(false);
  const [isDuplicateWarning, setIsDuplicateWarning] = React.useState(false);

  // Form Fields
  const [companyName, setCompanyName] = React.useState("");
  const [jobTitle, setJobTitle] = React.useState("");
  const [jobUrl, setJobUrl] = React.useState("");
  const [portalSource, setPortalSource] = React.useState("Greenhouse");
  const [jobLocation, setJobLocation] = React.useState("Remote");

  // Vendor Fields
  const [vendorCompany, setVendorCompany] = React.useState("");
  const [vendorContactName, setVendorContactName] = React.useState("");
  const [vendorContactEmail, setVendorContactEmail] = React.useState("");
  const [vendorContactPhone, setVendorContactPhone] = React.useState("");

  // Rates
  const [submittedRate, setSubmittedRate] = React.useState("$65/hr C2C");
  const [clientPayRate, setClientPayRate] = React.useState("");

  // Status & Schedule
  const [status, setStatus] = React.useState<SubmissionStatus>("Applied");
  const [submissionDate, setSubmissionDate] = React.useState(
    new Date().toISOString().split("T")[0]
  );
  const [interviewTime, setInterviewTime] = React.useState("");
  const [interviewMode, setInterviewMode] = React.useState("Zoom");
  const [interviewMeetingLink, setInterviewMeetingLink] = React.useState("");
  const [notes, setNotes] = React.useState("");

  // Load available bench candidates
  React.useEffect(() => {
    if (open) {
      getCandidates().then((data) => {
        setCandidates(data);
        if (data.length > 0 && !selectedCandidateId) {
          const defaultCand =
            (initialCandidateId && data.find((c) => c.id === initialCandidateId)) ||
            (submissionToEdit?.candidate_id &&
              data.find((c) => c.id === submissionToEdit.candidate_id)) ||
            data[0];
          if (defaultCand) {
            setSelectedCandidateId(defaultCand.id);
          }
        }
      });
    }
  }, [open, initialCandidateId, submissionToEdit, selectedCandidateId]);

  // Populate form on edit or when initial params provided
  React.useEffect(() => {
    if (!open) return;

    if (submissionToEdit) {
      setSelectedCandidateId(submissionToEdit.candidate_id);
      setCompanyName(submissionToEdit.company_name || "");
      setJobTitle(submissionToEdit.job_title || "");
      setJobUrl(submissionToEdit.job_url || "");
      setPortalSource(submissionToEdit.portal_source || "Greenhouse");
      setJobLocation(submissionToEdit.job_location || "Remote");
      setVendorCompany(submissionToEdit.vendor_company || "");
      setVendorContactName(submissionToEdit.vendor_contact_name || "");
      setVendorContactEmail(submissionToEdit.vendor_contact_email || "");
      setVendorContactPhone(submissionToEdit.vendor_contact_phone || "");
      setSubmittedRate(submissionToEdit.submitted_rate || "$65/hr C2C");
      setClientPayRate(submissionToEdit.client_pay_rate || "");
      setStatus(submissionToEdit.status || "Applied");
      setSubmissionDate(
        submissionToEdit.submission_date || new Date().toISOString().split("T")[0]
      );
      setInterviewTime(
        submissionToEdit.interview_time
          ? new Date(submissionToEdit.interview_time).toISOString().slice(0, 16)
          : ""
      );
      setInterviewMode(submissionToEdit.interview_mode || "Zoom");
      setInterviewMeetingLink(submissionToEdit.interview_meeting_link || "");
      setNotes(submissionToEdit.notes || "");
      setIsDuplicateWarning(submissionToEdit.duplicate_flag || false);
    } else {
      // New submission defaults
      if (initialCandidateId) {
        setSelectedCandidateId(initialCandidateId);
      }
      setCompanyName(initialJob?.company_name || "");
      setJobTitle(initialJob?.job_title || "");
      setJobUrl(initialJob?.job_url || "");
      setPortalSource(initialJob?.portal_source || "Greenhouse");
      setJobLocation(initialJob?.job_location || "Remote");
      setVendorCompany("");
      setVendorContactName("");
      setVendorContactEmail("");
      setVendorContactPhone("");
      setSubmittedRate("$65/hr C2C");
      setClientPayRate("");
      setStatus("Applied");
      setSubmissionDate(new Date().toISOString().split("T")[0]);
      setInterviewTime("");
      setInterviewMode("Zoom");
      setInterviewMeetingLink("");
      setNotes("");
      setIsDuplicateWarning(false);
    }
  }, [open, submissionToEdit, initialJob, initialCandidateId]);

  // Real-time duplicate check when company or candidate changes
  React.useEffect(() => {
    if (!open || !companyName.trim() || !selectedCandidateId) {
      setIsDuplicateWarning(false);
      return;
    }

    const timer = setTimeout(async () => {
      const isDup = await checkDuplicate(selectedCandidateId, companyName.trim());
      setIsDuplicateWarning(isDup);
    }, 300);

    return () => clearTimeout(timer);
  }, [open, companyName, selectedCandidateId]);

  if (!open) return null;

  const selectedCandidate = candidates.find((c) => c.id === selectedCandidateId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCandidateId) {
      toast.error("Please select a candidate from bench.");
      return;
    }
    if (!companyName.trim()) {
      toast.error("Company name is required.");
      return;
    }
    if (!jobTitle.trim()) {
      toast.error("Job title is required.");
      return;
    }

    setLoading(true);

    const submissionPayload: JobSubmissionFormData = {
      candidate_id: selectedCandidateId,
      submission_date: submissionDate,
      company_name: companyName.trim(),
      job_title: jobTitle.trim(),
      job_url: jobUrl.trim() || null,
      portal_source: portalSource,
      job_location: jobLocation.trim() || "Remote",
      vendor_company: vendorCompany.trim() || null,
      vendor_contact_name: vendorContactName.trim() || null,
      vendor_contact_email: vendorContactEmail.trim() || null,
      vendor_contact_phone: vendorContactPhone.trim() || null,
      submitted_rate: submittedRate.trim() || null,
      client_pay_rate: clientPayRate.trim() || null,
      status: status,
      interview_time: interviewTime ? new Date(interviewTime).toISOString() : null,
      interview_mode: interviewMode || null,
      interview_meeting_link: interviewMeetingLink.trim() || null,
      notes: notes.trim() || null,
      duplicate_flag: isDuplicateWarning,
    };

    try {
      if (submissionToEdit) {
        const { data, error } = await updateSubmission(
          submissionToEdit.id,
          submissionPayload
        );
        if (error) {
          toast.error("Failed to update submission", { description: error });
        } else if (data) {
          toast.success("Job Submission Updated!", {
            description: `${data.company_name} - ${data.job_title}`,
          });
          onSuccess?.(data);
          onOpenChange(false);
        }
      } else {
        const { data, error, isDuplicate } = await createSubmission(
          submissionPayload,
          selectedCandidate
        );
        if (error) {
          toast.error("Failed to create submission", { description: error });
        } else if (data) {
          if (isDuplicate) {
            toast.warning("Duplicate Submission Flagged!", {
              description: `Candidate was already submitted to ${data.company_name} within the last 30 days. Recorded with duplicate flag.`,
            });
          } else {
            toast.success("Job Submission Created!", {
              description: `Successfully logged submission for ${data.company_name}.`,
            });
          }
          onSuccess?.(data);
          onOpenChange(false);
        }
      }
    } catch {
      toast.error("An error occurred while saving the submission.");
    } finally {
      setLoading(false);
    }
  };

  const isInterviewStage =
    status === "Interview_Scheduled" || status === "Round_1" || status === "Round_2";

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-y-auto flex flex-col w-screen h-screen">
      {/* Top Navigation & Action Bar */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b px-6 py-4 shadow-xs">
        <div className="max-w-6xl mx-auto w-full flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="gap-1.5 text-xs cursor-pointer hover:border-primary/50"
            >
              <ArrowLeftIcon className="size-3.5" />
              <span>Back / Close</span>
            </Button>

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight text-foreground">
                  {submissionToEdit ? "Edit Job Submission" : "Log New Job Submission"}
                </h2>
                <Badge
                  variant="outline"
                  className="bg-primary/10 text-primary border-primary/20 gap-1 text-xs"
                >
                  <SendIcon className="size-3" />
                  Full Page Mode
                </Badge>
                {isDuplicateWarning && (
                  <Badge variant="destructive" className="gap-1 text-xs">
                    <AlertTriangleIcon className="size-3" />
                    30-Day Duplicate Warning
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground hidden sm:block">
                Directly replaces recruiter Excel tracking with automated duplicate safeguards, vendor contacts, and interview pipeline.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={loading}
              onClick={handleSubmit}
              className="text-xs bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 cursor-pointer shadow-xs"
            >
              <SendIcon className="size-3.5" />
              {loading
                ? "Saving..."
                : submissionToEdit
                ? "Update Submission"
                : "Record Submission"}
            </Button>
          </div>
        </div>
      </div>

      {/* Main Full-Page Content Form */}
      <div className="flex-1 max-w-6xl mx-auto w-full p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Duplicate Warning Banner */}
        {isDuplicateWarning && (
          <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-3 shadow-xs">
            <AlertTriangleIcon className="size-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div className="space-y-1">
              <div className="font-semibold text-sm">
                Duplicate Submission Safeguard Triggered!
              </div>
              <p className="leading-relaxed">
                This candidate has already been submitted to <strong>{companyName}</strong> in the last 30 days. You can still record this entry, but it will be flagged in the tracker to protect the consultant from conflicting representations.
              </p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            {/* Left 2 Columns: Client, Vendor & Pipeline Cards */}
            <div className="lg:col-span-2 space-y-6">
              {/* CARD 1: TARGET CLIENT & ROLE */}
              <Card className="shadow-xs">
                <CardHeader className="pb-3 border-b">
                  <div className="flex items-center gap-2">
                    <Building2Icon className="size-4 text-primary" />
                    <CardTitle className="text-base font-semibold">
                      1. Target Client & Position Details
                    </CardTitle>
                  </div>
                  <CardDescription className="text-xs">
                    Enter the company name, target role, portal source, and ATS URL.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="companyName" className="text-xs font-medium">
                        End Client / Company Name <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="companyName"
                        placeholder="e.g. Cloudflare, Capital One, Stripe"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        className="h-9 text-xs bg-background"
                        required
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="jobTitle" className="text-xs font-medium">
                        Job Title / Target Role <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="jobTitle"
                        placeholder="e.g. Senior Data Engineer"
                        value={jobTitle}
                        onChange={(e) => setJobTitle(e.target.value)}
                        className="h-9 text-xs bg-background"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="portalSource" className="text-xs font-medium">
                        Portal Source
                      </Label>
                      <Select
                        value={portalSource}
                        onValueChange={(val) => setPortalSource(val ?? "Greenhouse")}
                      >
                        <SelectTrigger id="portalSource" className="h-9 text-xs bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PORTAL_SOURCES.map((source) => (
                            <SelectItem key={source} value={source} className="text-xs">
                              {source}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="jobLocation" className="text-xs font-medium">
                        Job Location
                      </Label>
                      <Input
                        id="jobLocation"
                        placeholder="Remote / Austin, TX"
                        value={jobLocation}
                        onChange={(e) => setJobLocation(e.target.value)}
                        className="h-9 text-xs bg-background"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="submissionDate" className="text-xs font-medium">
                        Submission Date
                      </Label>
                      <Input
                        id="submissionDate"
                        type="date"
                        value={submissionDate}
                        onChange={(e) => setSubmissionDate(e.target.value)}
                        className="h-9 text-xs bg-background"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="jobUrl" className="text-xs font-medium">
                      Job Posting URL / ATS Link
                    </Label>
                    <Input
                      id="jobUrl"
                      placeholder="https://boards.greenhouse.io/... or https://jobs.ashbyhq.com/..."
                      value={jobUrl}
                      onChange={(e) => setJobUrl(e.target.value)}
                      className="h-9 text-xs bg-background"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* CARD 2: PRIME VENDOR & RATES */}
              <Card className="shadow-xs">
                <CardHeader className="pb-3 border-b">
                  <div className="flex items-center gap-2">
                    <BriefcaseIcon className="size-4 text-primary" />
                    <CardTitle className="text-base font-semibold">
                      2. Prime Vendor & Rate Economics
                    </CardTitle>
                  </div>
                  <CardDescription className="text-xs">
                    Implementation partner recruiter details and contract rates.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="vendorCompany" className="text-xs font-medium">
                        Vendor Company Name
                      </Label>
                      <Input
                        id="vendorCompany"
                        placeholder="e.g. TEKsystems, Apex Systems, Randstad"
                        value={vendorCompany}
                        onChange={(e) => setVendorCompany(e.target.value)}
                        className="h-9 text-xs bg-background"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="vendorContactName" className="text-xs font-medium">
                        Vendor Recruiter Contact Name
                      </Label>
                      <Input
                        id="vendorContactName"
                        placeholder="e.g. Sarah Jenkins"
                        value={vendorContactName}
                        onChange={(e) => setVendorContactName(e.target.value)}
                        className="h-9 text-xs bg-background"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="vendorContactEmail" className="text-xs font-medium">
                        Vendor Contact Email
                      </Label>
                      <Input
                        id="vendorContactEmail"
                        type="email"
                        placeholder="recruiter@vendor.com"
                        value={vendorContactEmail}
                        onChange={(e) => setVendorContactEmail(e.target.value)}
                        className="h-9 text-xs bg-background"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="vendorContactPhone" className="text-xs font-medium">
                        Vendor Contact Phone
                      </Label>
                      <Input
                        id="vendorContactPhone"
                        placeholder="e.g. 415-555-0192"
                        value={vendorContactPhone}
                        onChange={(e) => setVendorContactPhone(e.target.value)}
                        className="h-9 text-xs bg-background"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                    <div className="space-y-1.5">
                      <Label htmlFor="submittedRate" className="text-xs font-medium">
                        Submitted Rate (C2C / W2)
                      </Label>
                      <Input
                        id="submittedRate"
                        placeholder="e.g. $65/hr C2C or $55/hr W2"
                        value={submittedRate}
                        onChange={(e) => setSubmittedRate(e.target.value)}
                        className="h-9 text-xs bg-background"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="clientPayRate" className="text-xs font-medium">
                        Client / Margin Rate (Optional)
                      </Label>
                      <Input
                        id="clientPayRate"
                        placeholder="e.g. $80/hr"
                        value={clientPayRate}
                        onChange={(e) => setClientPayRate(e.target.value)}
                        className="h-9 text-xs bg-background"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* CARD 3: PIPELINE STAGE & INTERVIEW TRACKING */}
              <Card className="shadow-xs">
                <CardHeader className="pb-3 border-b">
                  <div className="flex items-center gap-2">
                    <CheckCircle2Icon className="size-4 text-primary" />
                    <CardTitle className="text-base font-semibold">
                      3. Submission Lifecycle & Interview Tracking
                    </CardTitle>
                  </div>
                  <CardDescription className="text-xs">
                    Current stage and conditional video/meeting schedule.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="status" className="text-xs font-medium">
                      Current Pipeline Status
                    </Label>
                    <Select
                      value={status}
                      onValueChange={(val) => setStatus(val as SubmissionStatus)}
                    >
                      <SelectTrigger id="status" className="h-9 text-xs bg-background font-semibold">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SUBMISSION_STATUSES.map((item) => (
                          <SelectItem
                            key={item.value}
                            value={item.value}
                            className="text-xs"
                          >
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {isInterviewStage && (
                    <div className="p-4 rounded-xl border border-purple-500/20 bg-purple-500/5 space-y-3">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-purple-700 dark:text-purple-300">
                        <CalendarIcon className="size-4" />
                        Interview Schedule Details
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <Label htmlFor="interviewTime" className="text-xs">
                            Interview Date & Time
                          </Label>
                          <Input
                            id="interviewTime"
                            type="datetime-local"
                            value={interviewTime}
                            onChange={(e) => setInterviewTime(e.target.value)}
                            className="h-9 text-xs bg-background"
                          />
                        </div>

                        <div className="space-y-1">
                          <Label htmlFor="interviewMode" className="text-xs">
                            Interview Platform / Mode
                          </Label>
                          <Select
                            value={interviewMode}
                            onValueChange={(val) => setInterviewMode(val ?? "Zoom")}
                          >
                            <SelectTrigger id="interviewMode" className="h-9 text-xs bg-background">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {INTERVIEW_MODES.map((mode) => (
                                <SelectItem key={mode} value={mode} className="text-xs">
                                  {mode}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor="interviewMeetingLink" className="text-xs">
                          Meeting URL / Dial-in Details
                        </Label>
                        <Input
                          id="interviewMeetingLink"
                          placeholder="https://zoom.us/j/... or Teams meeting link"
                          value={interviewMeetingLink}
                          onChange={(e) => setInterviewMeetingLink(e.target.value)}
                          className="h-9 text-xs bg-background"
                        />
                      </div>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label htmlFor="notes" className="text-xs font-medium">
                      Recruiter Notes & Client Feedback
                    </Label>
                    <Textarea
                      id="notes"
                      placeholder="Log manager feedback, candidate availability confirmation, interview prep instructions, or vendor updates..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={4}
                      className="text-xs bg-background"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right 1 Column: Candidate Card & Safeguards */}
            <div className="space-y-6">
              {/* CARD 4: CANDIDATE SELECTION */}
              <Card className="shadow-xs">
                <CardHeader className="pb-3 border-b">
                  <div className="flex items-center gap-2">
                    <UserIcon className="size-4 text-primary" />
                    <CardTitle className="text-base font-semibold">
                      Bench Candidate Selection
                    </CardTitle>
                  </div>
                  <CardDescription className="text-xs">
                    Choose candidate from your active bench pool.
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-4 space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="candidateSelect" className="text-xs font-medium">
                      Select Candidate
                    </Label>
                    <Select
                      value={selectedCandidateId}
                      onValueChange={(val) => setSelectedCandidateId(val ?? "")}
                    >
                      <SelectTrigger id="candidateSelect" className="h-9 text-xs bg-background">
                        <SelectValue placeholder="Select candidate from bench..." />
                      </SelectTrigger>
                      <SelectContent>
                        {candidates.map((cand) => (
                          <SelectItem key={cand.id} value={cand.id} className="text-xs">
                            {cand.full_name} ({cand.visa_status})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedCandidate && (
                    <div className="rounded-lg border bg-muted/20 p-4 space-y-3 text-xs">
                      <div className="flex items-center justify-between pb-2 border-b">
                        <span className="font-semibold text-sm text-foreground">
                          {selectedCandidate.full_name}
                        </span>
                        <Badge variant="outline" className="text-[11px] bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20">
                          {selectedCandidate.visa_status}
                        </Badge>
                      </div>

                      <div className="space-y-2 text-muted-foreground">
                        <div className="flex justify-between">
                          <span>Target Role:</span>
                          <span className="font-medium text-foreground">
                            {selectedCandidate.target_job_titles || "Data Engineer"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Experience:</span>
                          <span className="font-medium text-foreground">
                            {selectedCandidate.total_experience_years || "4+ years"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Current Location:</span>
                          <span className="font-medium text-foreground">
                            {selectedCandidate.current_city ? `${selectedCandidate.current_city}, ${selectedCandidate.current_state}` : "USA"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Rate Expectation:</span>
                          <span className="font-medium text-foreground">
                            {selectedCandidate.expected_salary || "$65/hr C2C"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Relocation:</span>
                          <span className="font-medium text-foreground">
                            {selectedCandidate.open_to_relocation ? "Yes (Open)" : "No"}
                          </span>
                        </div>
                      </div>

                      {selectedCandidate.primary_skills && (
                        <div className="pt-2 border-t space-y-1">
                          <span className="text-[11px] font-semibold text-foreground">Primary Skills:</span>
                          <p className="text-[11px] text-muted-foreground leading-relaxed">
                            {selectedCandidate.primary_skills}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* CARD 5: SAFEGUARDS INFO */}
              <Card className="shadow-xs border-primary/20 bg-primary/5">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheckIcon className="size-4 text-primary" />
                    <CardTitle className="text-sm font-semibold">
                      USA Marketing Rules
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-xs text-muted-foreground leading-relaxed">
                  <p>
                    • <strong>Duplicate Prevention:</strong> Warns if candidate has prior submission to same client within 30 days.
                  </p>
                  <p>
                    • <strong>Full Representation:</strong> Stores prime vendor contact to prevent RTR disputes.
                  </p>
                </CardContent>
              </Card>

              {/* BOTTOM ACTIONS */}
              <div className="p-4 rounded-xl border bg-card shadow-xs space-y-3">
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full gap-2 cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
                >
                  <SendIcon className="size-4" />
                  {loading
                    ? "Saving..."
                    : submissionToEdit
                    ? "Update Submission"
                    : "Record Submission"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  className="w-full text-xs cursor-pointer"
                >
                  Cancel & Return
                </Button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
