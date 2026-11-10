"use client";

import * as React from "react";
import Link from "next/link";
import { createClient } from "@/lib/client";
import {
  getSubmissions,
  deleteSubmission,
} from "@/lib/submissions";
import { getCandidates } from "@/lib/candidates";
import { dailySubmissionCounts, inSubmissionDateRange, submissionDatePreset } from "@/lib/submission-dates";
import type { Candidate, JobSubmission, SubmissionStatus } from "@/types/database";
import { SubmissionStatusDialog } from "@/components/submission-status-dialog";
import { ApplicationAnswerSnapshot } from "@/components/application-answer-snapshot";
import {CaptureState} from "@/components/application-evidence";
import { AppliedResumeBadge } from "@/components/applied-resume-badge";
import { RTRBadge } from "@/components/rtr-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {CandidateCombobox} from "@/components/candidate-combobox";
import {WorkspaceError,WorkspaceSkeleton} from "@/components/workspace-ui";
import {useUserProfile} from "@/hooks/use-user-profile";
import {
  SendIcon,
  PlusIcon,
  SearchIcon,
  RefreshCwIcon,
  DownloadIcon,
  CopyIcon,
  CheckIcon,
  AlertTriangleIcon,
  CalendarIcon,
  ExternalLinkIcon,
  EditIcon,
  Trash2Icon,
  TrendingUpIcon,
  SparklesIcon,
  Building2Icon,
  BriefcaseIcon,
  ClockIcon,
  PhoneIcon,
  MailIcon,
  FilterIcon,
} from "lucide-react";

export default function SubmissionsPage() {
  const { isRecruiter, isTechnicalRecruiter, isClient } = useUserProfile();
  const canPushProfile = isRecruiter || isTechnicalRecruiter;
  const [submissions, setSubmissions] = React.useState<JobSubmission[]>([]);
  const [candidates, setCandidates] = React.useState<Candidate[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError,setLoadError]=React.useState("");
  const [showDetails,setShowDetails]=React.useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedStatusTab, setSelectedStatusTab] = React.useState("all");
  const [selectedCandidateFilter, setSelectedCandidateFilter] = React.useState("all");
  const [selectedPortalFilter, setSelectedPortalFilter] = React.useState("all");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");

  // Modals
  const [statusDialogOpen, setStatusDialogOpen] = React.useState(false);
  const [activeSubmissionForStatus, setActiveSubmissionForStatus] = React.useState<JobSubmission | null>(null);

  const [copiedReport, setCopiedReport] = React.useState(false);

  // Load data
  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [subsData, candsData] = await Promise.all([
        getSubmissions(),
        getCandidates(),
      ]);
      setSubmissions(subsData);
      setCandidates(candsData);
      setLoadError("");
    } catch {
      setLoadError("Could not load the latest submissions. Try refreshing. Previously loaded records may be out of date.");
      toast.error("Failed to load submissions data");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const candidateId=new URLSearchParams(window.location.search).get("candidateId");
    if(candidateId)queueMicrotask(()=>setSelectedCandidateFilter(candidateId));
    void Promise.resolve().then(loadData);
  }, [loadData]);

  // Real-time updates via WebSockets (Supabase Realtime)
  React.useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("job_submissions_realtime_feed")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "job_submissions",
        },
        async (payload) => {
          try {
            const latest = await getSubmissions();
            setSubmissions(latest);
            if (payload.eventType === "INSERT") {
              const row = payload.new as Record<string, unknown>;
              const comp = (row?.company_name as string) || "Application";
              const title = (row?.job_title as string) || "Role";
              toast.success(`🎉 New application saved: ${comp} (${title})`);
            } else if (payload.eventType === "UPDATE") {
              const row = payload.new as Record<string, unknown>;
              if (row?.status === "Applied" || row?.capture_status === "submitted") {
                toast.success(`⚡ Application updated: ${(row?.company_name as string) || "Job"}`);
              }
            }
          } catch (e) {
            console.error("[Realtime Submissions Error]", e);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Applications finish in another tab; refresh their status when returning.
  React.useEffect(() => {
    let active = true;
    let refreshing = false;
    const refreshSubmissions = async () => {
      if (document.visibilityState !== "visible" || refreshing) return;
      refreshing = true;
      try {
        const latest = await getSubmissions();
        if (active) setSubmissions(latest);
      } catch {
        // Keep the current records; the existing Refresh action can retry.
      } finally {
        refreshing = false;
      }
    };
    window.addEventListener("focus", refreshSubmissions);
    document.addEventListener("visibilitychange", refreshSubmissions);
    return () => {
      active = false;
      window.removeEventListener("focus", refreshSubmissions);
      document.removeEventListener("visibilitychange", refreshSubmissions);
    };
  }, []);

  // Status Badge Helper
  const getStatusBadge = (status: SubmissionStatus) => {
    switch (status) {
      case "Offer_Received":
        return (
          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 gap-1.5 font-semibold shadow-2xs py-1 px-2.5 rounded-full">
            <SparklesIcon className="size-3 text-emerald-500" />
            Offer Received
          </Badge>
        );
      case "Round_1":
      case "Round_2":
      case "Interview_Scheduled":
        return (
          <Badge className="bg-primary/10 text-primary border-primary/25 gap-1.5 font-medium shadow-2xs py-1 px-2.5 rounded-full">
            <CalendarIcon className="size-3 text-primary" />
            {status.replace(/_/g, " ")}
          </Badge>
        );
      case "Submitted_to_Client":
        return (
          <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30 gap-1.5 font-medium shadow-2xs py-1 px-2.5 rounded-full">
            <Building2Icon className="size-3 text-blue-500" />
            Client Review
          </Badge>
        );
      case "Vendor_Screening":
        return (
          <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 gap-1.5 font-medium shadow-2xs py-1 px-2.5 rounded-full">
            <ClockIcon className="size-3 text-amber-500" />
            Vendor Screening
          </Badge>
        );
      case "Applied":
        return (
          <Badge variant="outline" className="border-border/80 text-foreground/80 gap-1.5 font-medium shadow-2xs py-1 px-2.5 rounded-full bg-background">
            <SendIcon className="size-3 text-primary" />
            Applied
          </Badge>
        );
      case "Rejected":
        return (
          <Badge variant="destructive" className="gap-1 font-medium shadow-2xs py-1 px-2.5 rounded-full opacity-85">
            Rejected
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary" className="gap-1 shadow-2xs py-1 px-2.5 rounded-full font-medium">
            {status.replace(/_/g, " ")}
          </Badge>
        );
    }
  };
  // Filter Submissions
  const filteredSubmissions = React.useMemo(() => {
    return submissions.filter((sub) => {
      if (!inSubmissionDateRange(sub.submission_date, dateFrom, dateTo)) return false;
      // Candidate filter
      if (
        selectedCandidateFilter !== "all" &&
        sub.candidate_id !== selectedCandidateFilter
      ) {
        return false;
      }

      // Portal filter
      if (
        selectedPortalFilter !== "all" &&
        sub.portal_source?.toLowerCase() !== selectedPortalFilter.toLowerCase()
      ) {
        return false;
      }

      // Status Tab filter
      if (selectedStatusTab === "interviews") {
        if (
          sub.status !== "Interview_Scheduled" &&
          sub.status !== "Round_1" &&
          sub.status !== "Round_2"
        ) {
          return false;
        }
      } else if (selectedStatusTab === "offers") {
        if (sub.status !== "Offer_Received") return false;
      } else if (selectedStatusTab === "active") {
        if (sub.status === "Rejected" || sub.status === "No_Response") return false;
      } else if (selectedStatusTab !== "all") {
        if (sub.status !== selectedStatusTab) return false;
      }

      // Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const candName = sub.candidate?.full_name?.toLowerCase() || "";
        const comp = sub.company_name?.toLowerCase() || "";
        const title = sub.job_title?.toLowerCase() || "";
        const vendor = sub.vendor_company?.toLowerCase() || "";
        const contact = sub.vendor_contact_name?.toLowerCase() || "";
        const notes = sub.notes?.toLowerCase() || "";
        const loc = sub.job_location?.toLowerCase() || "";

        return (
          candName.includes(q) ||
          comp.includes(q) ||
          title.includes(q) ||
          vendor.includes(q) ||
          contact.includes(q) ||
          notes.includes(q) ||
          loc.includes(q)
        );
      }

      return true;
    });
  }, [
    submissions,
    selectedCandidateFilter,
    selectedPortalFilter,
    selectedStatusTab,
    searchQuery,
    dateFrom,
    dateTo,
  ]);

  const dailyCounts = React.useMemo(() => dailySubmissionCounts(filteredSubmissions), [filteredSubmissions]);
  const portalOptions = React.useMemo(() => Array.from(new Map(submissions.filter(row => row.portal_source?.trim()).map(row => [row.portal_source!.trim().toLowerCase(), row.portal_source!.trim()])).entries()).sort((a,b) => a[1].localeCompare(b[1])), [submissions]);

  // Statistics
  const stats = React.useMemo(() => {
    const total = filteredSubmissions.length;
    const interviews = filteredSubmissions.filter(
      (s) =>
        s.status === "Interview_Scheduled" ||
        s.status === "Round_1" ||
        s.status === "Round_2"
    ).length;
    const clientReview = filteredSubmissions.filter(
      (s) => s.status === "Submitted_to_Client"
    ).length;
    const offers = filteredSubmissions.filter((s) => s.status === "Offer_Received").length;
    const duplicates = filteredSubmissions.filter((s) => s.duplicate_flag).length;

    return { total, interviews, clientReview, offers, duplicates };
  }, [filteredSubmissions]);

  // Export to CSV / Excel
  const handleExportCSV = () => {
    if (filteredSubmissions.length === 0) {
      toast.error("No submissions to export.");
      return;
    }

    const headers = [
      "Submission Date",
      "Candidate Name",
      "Visa Status",
      "Target Role",
      "End Client / Company",
      "Portal Source",
      "Location",
      "Vendor Company",
      "Vendor Contact Name",
      "Vendor Contact Email",
      "Vendor Contact Phone",
      "Submitted Rate",
      "RTR Status",
      "RTR Type",
      "RTR Vendor",
      "RTR Date",
      "RTR Expiration",
      "Status",
      "Duplicate Flag",
      "Interview Date/Time",
      "Interview Mode",
      "Interview Link",
      "Recruiter Notes",
      "Job URL",
    ];

    const rows = filteredSubmissions.map((s) => [
      `"${s.submission_date}"`,
      `"${s.candidate?.full_name || "Not recorded"}"`,
      `"${s.candidate?.visa_status || "Not recorded"}"`,
      `"${s.job_title}"`,
      `"${s.company_name}"`,
      `"${s.portal_source || "Not recorded"}"`,
      `"${s.job_location || "Not recorded"}"`,
      `"${s.vendor_company || ""}"`,
      `"${s.vendor_contact_name || ""}"`,
      `"${s.vendor_contact_email || ""}"`,
      `"${s.vendor_contact_phone || ""}"`,
      `"${s.submitted_rate || ""}"`,
      `"${s.rtr_document?.rtr_status || ""}"`,
      `"${s.rtr_document?.rtr_type || ""}"`,
      `"${s.rtr_document?.vendor_name || ""}"`,
      `"${s.rtr_document?.rtr_date || ""}"`,
      `"${s.rtr_document?.expiration_date || ""}"`,
      `"${s.status}"`,
      `"${s.duplicate_flag ? "YES" : "NO"}"`,
      `"${s.interview_time || ""}"`,
      `"${s.interview_mode || ""}"`,
      `"${s.interview_meeting_link || ""}"`,
      `"${(s.notes || "").replace(/"/g, '""')}"`,
      `"${s.job_url || ""}"`,
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const dateStr = new Date().toISOString().split("T")[0];
    link.setAttribute(
      "download",
      `bench_job_submissions_tracker_${dateStr}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success("Excel Tracker Exported!", {
      description: `Downloaded ${filteredSubmissions.length} submission records as CSV.`,
    });
  };

  // Copy Daily Standup Report
  const handleCopyStandupReport = () => {
    const today = new Date().toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    let report = `DAILY RECRUITING & BENCH MARKETING REPORT (${today})\n`;
    report += `========================================================\n\n`;
    report += `📊 SUMMARY METRICS:\n`;
    report += `• Matching Submissions: ${stats.total}\n`;
    report += `• Application dates: ${dateFrom || 'Any date'} through ${dateTo || 'Any date'}\n`;
    report += dailyCounts.map(day => `  ${day.date}: ${day.count} applications\n`).join('');
    report += `• Active Interviews / Rounds: ${stats.interviews}\n`;
    report += `• Submitted to Client: ${stats.clientReview}\n`;
    report += `• Offers Received: ${stats.offers}\n\n`;

    report += `📋 ACTIVE PIPELINE DETAILS:\n`;
    filteredSubmissions.forEach((s, idx) => {
      report += `${idx + 1}. [${s.status.replace(/_/g, " ")}] ${s.candidate?.full_name || "Not recorded"} → ${s.company_name} (${s.job_title})\n`;
      report += `   Vendor: ${s.vendor_company || "Direct"} | Rate: ${s.submitted_rate || "Not recorded"}\n`;
      if (s.rtr_document) {
        report += `   RTR: ${s.rtr_document.rtr_type} - ${s.rtr_document.rtr_status} (${s.rtr_document.vendor_name || 'Direct'}) | Date: ${s.rtr_document.rtr_date}\n`;
      }
      if (s.interview_time) {
        report += `   Interview: ${new Date(s.interview_time).toLocaleString()} (${s.interview_mode || "Not recorded"})\n`;
      }
      if (s.notes) {
        report += `   Notes: ${s.notes}\n`;
      }
      report += `\n`;
    });

    navigator.clipboard.writeText(report);
    setCopiedReport(true);
    toast.success("Standup Report Copied!", {
      description: "Ready to paste into Slack, Teams, or daily manager email.",
    });
    setTimeout(() => setCopiedReport(false), 2500);
  };

  // Delete handler
  const handleDelete = async (id: string, company: string) => {
    if (confirm(`Are you sure you want to delete submission for ${company}?`)) {
      const { success, error } = await deleteSubmission(id);
      if (success) {
        toast.success(`Removed submission for ${company}`);
        setSubmissions((prev) => prev.filter((s) => s.id !== id));
      } else {
        toast.error("Failed to delete", { description: error });
      }
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6 max-w-[1440px] w-full mx-auto">
      {/* Page Header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                {isClient ? "My Applications" : "Job submissions"}
              </h1>
              <Badge
                variant="outline"
                className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 gap-1.5 text-xs py-0.5 px-2 rounded-full font-medium"
              >
                <TrendingUpIcon className="size-3" />
                Application tracker
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {isClient
                ? "Track all your submitted applications, interview stages, and statuses."
                : "Every application, its recorded resume, and the next step — in one place."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              render={<Link href="/dashboard/email-confirmations" />}
              className="h-9 text-xs gap-1.5 rounded-lg border-border/70 hover:bg-muted/50 cursor-pointer"
            >
              <MailIcon className="size-3.5" /> Email confirmations
            </Button>
            {!isClient && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyStandupReport}
                className="h-9 text-xs gap-1.5 cursor-pointer rounded-lg border-border/70 hover:bg-muted/50"
              >
                {copiedReport ? (
                  <CheckIcon className="size-3.5 text-emerald-600" />
                ) : (
                  <CopyIcon className="size-3.5" />
                )}
                {copiedReport ? "Report Copied" : "Daily Report"}
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              className="h-9 text-xs gap-1.5 cursor-pointer rounded-lg border-border/70 hover:bg-muted/50"
            >
              <DownloadIcon className="size-3.5" />
              Export to Excel (CSV)
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              disabled={loading}
              className="h-9 text-xs gap-1.5 cursor-pointer rounded-lg border-border/70 hover:bg-muted/50"
            >
              <RefreshCwIcon
                className={`size-3.5 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>

            {!isClient && (
              <Link href="/dashboard/submissions/new">
                <Button
                  size="sm"
                  className="h-9 px-3.5 text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer rounded-lg shadow-xs hover:shadow transition-all font-semibold"
                >
                  <PlusIcon className="size-3.5" />
                  New Submission
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* 5 Elevated Metric Cards */}
        <section aria-label="Application metrics" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {[
            {
              label: "Application records",
              value: stats.total,
              note: "Includes unsubmitted drafts",
              icon: SendIcon,
              color: "text-primary bg-primary/10 border-primary/20",
            },
            {
              label: "Active Interviews",
              value: stats.interviews,
              note: "Scheduled · Round 1 · Round 2",
              icon: CalendarIcon,
              color: "text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/20",
            },
            {
              label: "Client Review",
              value: stats.clientReview,
              note: "With end-client managers",
              icon: Building2Icon,
              color: "text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
            },
            {
              label: "Offers",
              value: stats.offers,
              note: "Received & in negotiation",
              icon: SparklesIcon,
              color: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
            },
            {
              label: "Duplicate Alerts",
              value: stats.duplicates,
              note: "30-day application safeguard",
              icon: AlertTriangleIcon,
              color: stats.duplicates
                ? "text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20"
                : "text-muted-foreground bg-muted border-border/60",
            },
          ].map((metric) => (
            <div
              key={metric.label}
              className="p-4 rounded-2xl border border-border/70 bg-card shadow-xs hover:border-border transition-all flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {metric.label}
                </span>
                <div className={`size-7 rounded-lg flex items-center justify-center border shadow-2xs ${metric.color}`}>
                  <metric.icon className="size-3.5" />
                </div>
              </div>
              <div className="mt-2.5">
                <p className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-mono tabular-nums leading-none">
                  {loading ? "—" : metric.value}
                </p>
                <p className="mt-1.5 text-[10px] text-muted-foreground line-clamp-1">{metric.note}</p>
              </div>
            </div>
          ))}
        </section>
      </div>
      {loadError && (
        <WorkspaceError message={loadError}>
          <Button variant="outline" className="mt-2 text-xs" onClick={() => void loadData()}>
            Try again
          </Button>
        </WorkspaceError>
      )}

      {/* FILTER & PIPELINE TABS TOOLBAR */}
      <div className="flex flex-col gap-3">
        {/* Status Pipeline Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pb-1">
          <span className="text-xs font-semibold text-muted-foreground mr-1 flex items-center gap-1.5">
            <FilterIcon className="size-3.5 text-primary" />
            Stage:
          </span>
          <div className="inline-flex flex-wrap items-center p-1 rounded-xl bg-muted/40 border border-border/60 gap-1">
            {[
              { id: "all", label: "All stages" },
              { id: "interviews", label: "Interviews" },
              { id: "Submitted_to_Client", label: "Client Review" },
              { id: "Vendor_Screening", label: "Vendor Screening" },
              { id: "Applied", label: "Applied" },
              { id: "offers", label: "Offers" },
              { id: "active", label: "All Active" },
              { id: "Rejected", label: "Rejected" },
            ].map((tab) => {
              const isSelected = selectedStatusTab === tab.id;
              return (
                <button
                  key={tab.id}
                  aria-pressed={isSelected}
                  type="button"
                  onClick={() => setSelectedStatusTab(tab.id)}
                  className={`px-3 py-1.5 text-xs rounded-lg transition-all duration-150 cursor-pointer font-medium ${
                    isSelected
                      ? "bg-background text-foreground shadow-xs font-semibold ring-1 ring-border/60"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Search & Select dropdowns */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              aria-label="Search submissions"
              placeholder="Search company, role, vendor or notes…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9.5 text-xs bg-background rounded-xl border-border/70 shadow-2xs focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {!isClient && (
              <CandidateCombobox candidates={candidates} value={selectedCandidateFilter} onChange={setSelectedCandidateFilter}/>
            )}

            {/* Portal Source Filter */}
            <Select
              value={selectedPortalFilter}
              onValueChange={(val) => setSelectedPortalFilter(val ?? "all")}
            >
              <SelectTrigger aria-label="Filter by portal" className="h-9.5 text-xs w-[140px] bg-background rounded-xl border-border/70 shadow-2xs">
                <SelectValue>{selectedPortalFilter === 'all' ? 'All portals' : portalOptions.find(([value]) => value === selectedPortalFilter)?.[1] || selectedPortalFilter}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">
                  All Portals
                </SelectItem>
                {portalOptions.map(([value, label]) => (
                  <SelectItem key={value} value={value} className="text-xs">
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Application date filters card */}
      <section aria-label="Application date filters" className="rounded-2xl border border-border/70 bg-card p-4 space-y-3 shadow-xs">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <CalendarIcon className="size-3.5 text-primary" />
            Application date · Counts and exports follow your filters
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2.5">
          <label className="text-xs font-medium text-foreground space-y-1">
            <span className="block">From date</span>
            <Input
              aria-label="From application date"
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-9 text-xs rounded-lg bg-background border-border/70 shadow-2xs"
            />
          </label>
          <label className="text-xs font-medium text-foreground space-y-1">
            <span className="block">To date</span>
            <Input
              aria-label="To application date"
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-9 text-xs rounded-lg bg-background border-border/70 shadow-2xs"
            />
          </label>
          <div className="flex flex-wrap items-center gap-1.5">
            {([
              { id: "today", label: "Today" },
              { id: "week", label: "Last 7 days" },
              { id: "month", label: "This month" },
            ] as const).map((preset) => (
              <Button
                key={preset.id}
                variant="outline"
                size="sm"
                className="h-9 rounded-lg text-xs font-medium border-border/70 hover:bg-muted/50 cursor-pointer"
                onClick={() => {
                  const range = submissionDatePreset(preset.id);
                  setDateFrom(range.from);
                  setDateTo(range.to);
                }}
              >
                {preset.label}
              </Button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="h-9 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 cursor-pointer"
              onClick={() => {
                setDateFrom("");
                setDateTo("");
                setSearchQuery("");
                setSelectedCandidateFilter("all");
                setSelectedPortalFilter("all");
                setSelectedStatusTab("all");
              }}
            >
              Clear filters
            </Button>
          </div>
        </div>

        {dateFrom && dateTo && dateFrom > dateTo && (
          <p role="alert" className="text-xs text-destructive rounded-lg border border-destructive/20 bg-destructive/10 p-2.5">
            From date must be on or before To date.
          </p>
        )}

        <div className="pt-2 border-t border-border/40 space-y-2">
          <p role="status" className="text-xs text-muted-foreground">
            <strong className="text-foreground font-semibold">{filteredSubmissions.length}</strong> matching applications across{" "}
            <strong className="text-foreground font-semibold">{dailyCounts.length}</strong> application dates.
          </p>
          <details className="w-full">
            <summary className="text-xs font-medium text-primary hover:underline cursor-pointer select-none">
              Applications by date · {dailyCounts.length} dates
            </summary>
            <div className="mt-3 max-h-60 overflow-auto rounded-xl border border-border/60 bg-muted/20 p-2">
              {dailyCounts.length ? (
                <table className="w-full text-xs">
                  <caption className="sr-only">Daily application counts for the selected filters</caption>
                  <thead>
                    <tr className="border-b border-border/60 text-muted-foreground">
                      <th className="p-2 text-left font-semibold">Application date</th>
                      <th className="p-2 text-right font-semibold">Application records</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {dailyCounts.map((day) => (
                      <tr key={day.date} className="hover:bg-muted/30">
                        <td className="p-2 font-mono text-xs">
                          <button
                            type="button"
                            className="text-primary hover:underline font-medium cursor-pointer"
                            aria-label={`Show applications on ${day.date}`}
                            onClick={() => {
                              setDateFrom(day.date);
                              setDateTo(day.date);
                            }}
                          >
                            {day.date}
                          </button>
                        </td>
                        <td className="p-2 text-right font-mono font-semibold">{day.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-xs text-muted-foreground p-2">No dated applications match these filters.</p>
              )}
            </div>
          </details>
        </div>
        {filteredSubmissions.some((row) => !row.submission_date) && (
          <p className="text-[11px] text-muted-foreground">
            Applications without a recorded date are included in the total only when no date filter is selected.
          </p>
        )}
      </section>

      {/* THE CENTRAL EXCEL-REPLACEMENT SUBMISSIONS TABLE */}
      <div className="rounded-2xl border border-border/70 bg-card shadow-xs overflow-hidden">
        <div className="p-3.5 border-b border-border/60 bg-muted/20 flex items-center justify-between text-xs text-muted-foreground">
          <div>
            Showing <strong className="text-foreground font-semibold">{filteredSubmissions.length}</strong> of{" "}
            <strong>{submissions.length}</strong> submissions
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showDetails}
              onChange={(event) => setShowDetails(event.target.checked)}
              className="rounded border-border text-primary focus:ring-primary/20"
            />
            Show vendor, rate and notes
          </label>
        </div>

        <div className="overflow-x-auto">
          <Table className={`submissions-table min-w-[1250px] ${showDetails ? "show-details" : ""}`}>
            <TableHeader className="bg-muted/40 border-b border-border/60">
              <TableRow>
                {!isClient && (
                  <TableHead data-col="candidate" className="w-[180px] whitespace-normal leading-tight text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Candidate</TableHead>
                )}
                <TableHead data-col="client" className="w-[200px] whitespace-normal leading-tight text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">End Client &amp; Role</TableHead>
                <TableHead data-col="resume" className="w-[220px] whitespace-normal leading-tight text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Applied resume &amp; answers</TableHead>
                <TableHead data-col="rtr" className="w-[160px] whitespace-normal leading-tight text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">RTR Document</TableHead>
                <TableHead data-col="vendor" className="w-[180px] whitespace-normal leading-tight text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Vendor &amp; Recruiter</TableHead>
                <TableHead data-col="rate" className="w-[110px] whitespace-normal leading-tight text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Rate</TableHead>
                <TableHead data-col="date" className="w-[110px] whitespace-normal leading-tight text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Date</TableHead>
                <TableHead data-col="stage" className="w-[220px] whitespace-normal leading-tight text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Recruiting stage &amp; capture</TableHead>
                <TableHead data-col="interview" className="w-[220px] whitespace-normal leading-tight text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Interview / Schedule / Notes</TableHead>
                <TableHead data-col="actions" className="w-[90px] text-right whitespace-normal leading-tight text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-border/50">
              {loading ? (
                <TableRow>
                  <TableCell
                    colSpan={isClient ? 9 : 10}
                    className="h-32 text-center text-muted-foreground"
                  >
                    <WorkspaceSkeleton rows={4}/>
                  </TableCell>
                </TableRow>
              ) : filteredSubmissions.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={isClient ? 9 : 10}
                    className="h-32 text-center text-muted-foreground text-xs"
                  >
                    <div className="flex flex-col items-center justify-center gap-2">
                      <BriefcaseIcon className="size-6 text-muted-foreground/60" />
                      <span>No job submissions match your filter criteria.</span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedStatusTab("all");
                          setSearchQuery("");
                          setSelectedCandidateFilter("all");
                        }}
                        className="text-xs mt-1 cursor-pointer"
                      >
                        Reset Filters
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredSubmissions.map((sub) => {
                  const candidateName =
                    sub.candidate?.full_name || "Not recorded";
                  const visaStatus =
                    sub.candidate?.visa_status || "Not recorded";

                  return (
                    <TableRow key={sub.id} className="hover:bg-muted/30 transition-colors">
                      {/* Candidate Column */}
                      {!isClient && (
                        <TableCell data-col="candidate" className="align-top py-3.5">
                          <div className="flex items-start gap-2.5">
                            <div className="size-8 rounded-lg bg-gradient-to-br from-primary/15 via-primary/5 to-transparent text-primary font-bold text-xs flex items-center justify-center border border-primary/20 shadow-2xs shrink-0 mt-0.5">
                              {candidateName.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-foreground text-xs leading-snug">
                                {candidateName}
                              </div>
                              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                <Badge
                                  variant="outline"
                                  className="text-[10px] px-1.5 py-0 bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 font-medium"
                                >
                                  {visaStatus}
                                </Badge>
                                <span className="text-[10px] text-muted-foreground truncate max-w-[110px]">
                                  {sub.candidate?.target_job_titles || "Not recorded"}
                                </span>
                              </div>
                            </div>
                          </div>
                        </TableCell>
                      )}

                      {/* Company & Role */}
                      <TableCell data-col="client" className="align-top py-3.5">
                        <div className="flex items-center gap-1.5 font-medium text-foreground text-xs">
                          <div className="size-5 rounded flex items-center justify-center bg-primary/10 text-primary shrink-0">
                            <Building2Icon className="size-3" />
                          </div>
                          <span className="font-semibold">{sub.company_name}</span>
                          {sub.duplicate_flag && (
                            <Badge
                              variant="destructive"
                              className="text-[9px] px-1 py-0 h-4"
                              title="Flagged: Candidate submitted to this company within last 30 days"
                            >
                              Duplicate
                            </Badge>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground font-medium mt-0.5 line-clamp-1">
                          {sub.job_title}
                        </div>
                        {sub.capture_status === "confirmed" && (
                          <Badge variant="outline" className="text-[9px] mt-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                            Email confirmed
                          </Badge>
                        )}
                        <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground flex-wrap">
                          <Badge
                            variant="secondary"
                            className="text-[9px] px-1.5 py-0 h-4 font-medium"
                          >
                            {sub.portal_source || "Not recorded"}
                          </Badge>
                          {Boolean(sub.portal_source?.toLowerCase().includes("outside")) && (
                            <Badge
                              variant="outline"
                              className="text-[9px] px-1.5 py-0 h-4 font-semibold bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30"
                            >
                              Outside Portal
                            </Badge>
                          )}
                          <span>{sub.job_location || "Not recorded"}</span>
                          {sub.job_url && (
                            <a
                              href={sub.job_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline flex items-center gap-0.5 font-medium"
                            >
                              Link <ExternalLinkIcon className="size-2.5" />
                            </a>
                          )}
                        </div>
                      </TableCell>

                      <TableCell data-col="resume" className="align-top py-3.5">
                        <AppliedResumeBadge
                          submissionId={sub.id}
                          candidateName={candidateName}
                          companyName={sub.company_name}
                          jobTitle={sub.job_title}
                          appliedResume={sub.applied_resume}
                        />
                        <ApplicationAnswerSnapshot submissionId={sub.id} />
                      </TableCell>

                      {/* RTR Document */}
                      <TableCell data-col="rtr" className="align-top py-3.5">
                        <RTRBadge
                          rtrDocument={sub.rtr_document}
                          candidateName={candidateName}
                          companyName={sub.company_name}
                          jobTitle={sub.job_title}
                        />
                      </TableCell>

                      {/* Vendor & Recruiter */}
                      <TableCell data-col="vendor" className="align-top py-3.5 text-xs">
                        <div className="font-medium text-foreground">
                          {sub.vendor_company || "Not recorded"}
                        </div>
                        {sub.vendor_contact_name && (
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            {sub.vendor_contact_name}
                          </div>
                        )}
                        <div className="flex flex-col gap-0.5 mt-1 text-[10px] text-muted-foreground">
                          {sub.vendor_contact_email && (
                            <span className="flex items-center gap-1 truncate max-w-[150px]">
                              <MailIcon className="size-2.5 shrink-0" />
                              {sub.vendor_contact_email}
                            </span>
                          )}
                          {sub.vendor_contact_phone && (
                            <span className="flex items-center gap-1">
                              <PhoneIcon className="size-2.5 shrink-0" />
                              {sub.vendor_contact_phone}
                            </span>
                          )}
                        </div>
                      </TableCell>

                      {/* Rate */}
                      <TableCell data-col="rate" className="align-top py-3.5 text-xs">
                        <div className="font-semibold text-foreground font-mono">
                          {sub.submitted_rate || "Not recorded"}
                        </div>
                        {sub.client_pay_rate && (
                          <div className="text-[10px] text-muted-foreground font-mono">
                            Client: {sub.client_pay_rate}
                          </div>
                        )}
                      </TableCell>

                      {/* Date */}
                      <TableCell data-col="date" className="align-top py-3.5 text-xs text-muted-foreground whitespace-nowrap font-mono">
                        {sub.submission_date}
                      </TableCell>

                      {/* Status */}
                      <TableCell data-col="stage" className="align-top py-3.5">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveSubmissionForStatus(sub);
                            setStatusDialogOpen(true);
                          }}
                          className="cursor-pointer hover:opacity-80 transition-opacity text-left inline-block"
                          title="Click to update status stage"
                        >
                          {getStatusBadge(sub.status)}
                        </button>
                        <div className="mt-2.5">
                          <CaptureState state={sub.capture_status} confirmedAt={sub.email_confirmed_at}/>
                        </div>
                      </TableCell>

                      {/* Interview & Notes */}
                      <TableCell data-col="interview" className="align-top py-3.5 text-xs">
                        {sub.interview_time ? (
                          <div className="p-2.5 rounded-xl border border-border/80 bg-muted/40 mb-1.5 text-xs shadow-2xs">
                            <div className="flex items-center gap-1.5 text-foreground font-semibold">
                              <CalendarIcon className="size-3.5 text-primary" />
                              {new Date(sub.interview_time).toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                              })}{" "}
                              at{" "}
                              {new Date(sub.interview_time).toLocaleTimeString(undefined, {
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                            </div>
                            <div className="flex items-center justify-between gap-1 text-muted-foreground text-[10px] mt-1">
                              <span>Mode: {sub.interview_mode || "Not recorded"}</span>
                              {sub.interview_meeting_link && (
                                <a
                                  href={sub.interview_meeting_link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:underline font-medium flex items-center gap-0.5"
                                >
                                  Join <ExternalLinkIcon className="size-2.5" />
                                </a>
                              )}
                            </div>
                          </div>
                        ) : null}

                        {(() => {
                          const cleanNotes = sub.notes
                            ? sub.notes.replace(/\[ATS Match:[^\]]*\]/gi, '').replace(/Matched:[^•|\n]*/gi, '').replace(/Missing:[^•|\n]*/gi, '').replace(/[•|]/g, '').trim()
                            : '';
                          return cleanNotes ? (
                            <p className="text-[11px] text-muted-foreground line-clamp-2 italic">
                              &quot;{cleanNotes}&quot;
                            </p>
                          ) : (
                            <span className="text-[10px] text-muted-foreground/60">
                              No notes
                            </span>
                          );
                        })()}
                      </TableCell>

                      {/* Actions */}
                      <TableCell data-col="actions" className="align-top py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setActiveSubmissionForStatus(sub);
                              setStatusDialogOpen(true);
                            }}
                            className="h-7 text-[11px] px-2.5 rounded-lg border-border/70 hover:border-primary/40 hover:bg-primary/5 hover:text-primary transition-all cursor-pointer font-medium"
                            title="Update Status"
                          >
                            Stage
                          </Button>
                          <Link href={`/dashboard/submissions/${sub.id}/edit`}>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="size-7 p-0 rounded-lg cursor-pointer text-muted-foreground hover:text-foreground"
                              aria-label={`Edit ${sub.company_name} submission`}
                              title="Edit Submission"
                            >
                              <EditIcon className="size-3.5" />
                            </Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(sub.id, sub.company_name)}
                            className="size-7 p-0 rounded-lg text-destructive/70 hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                            aria-label={`Delete ${sub.company_name} submission`}
                            title="Delete"
                          >
                            <Trash2Icon className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Quick Status Dialog */}
      <SubmissionStatusDialog
        submission={activeSubmissionForStatus}
        open={statusDialogOpen}
        onOpenChange={setStatusDialogOpen}
        onSuccess={() => loadData()}
      />
    </div>
  );
}
