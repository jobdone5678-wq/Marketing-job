"use client";

import * as React from "react";
import Link from "next/link";
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
import {SendToExtensionButton} from "@/components/send-to-extension-button";
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
  const { isRecruiter, isTechnicalRecruiter } = useUserProfile();
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
          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 gap-1 font-semibold">
            <SparklesIcon className="size-3 text-emerald-500" />
            Offer Received 
          </Badge>
        );
      case "Round_1":
      case "Round_2":
      case "Interview_Scheduled":
        return (
          <Badge className="bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30 gap-1 font-semibold">
            <CalendarIcon className="size-3 text-purple-500" />
            {status.replace(/_/g, " ")}
          </Badge>
        );
      case "Submitted_to_Client":
        return (
          <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30 gap-1 font-medium">
            <Building2Icon className="size-3 text-blue-500" />
            Client Review
          </Badge>
        );
      case "Vendor_Screening":
        return (
          <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 gap-1 font-medium">
            <ClockIcon className="size-3 text-amber-500" />
            Vendor Screening
          </Badge>
        );
      case "Applied":
        return (
          <Badge variant="outline" className="text-muted-foreground gap-1 font-medium">
            <SendIcon className="size-3" />
            Applied
          </Badge>
        );
      case "Rejected":
        return (
          <Badge variant="destructive" className="gap-1 opacity-80 text-[11px]">
            Rejected
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary" className="text-[11px]">
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
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                Job submissions
              </h1>
              <Badge
                variant="outline"
                className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 gap-1 text-xs"
              >
                <TrendingUpIcon className="size-3" />
                Application tracker
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Every application, its recorded resume, and the next step — in one place.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" render={<Link href="/dashboard/email-confirmations" />} className="text-xs gap-1.5">
              <MailIcon className="size-3.5" /> Email confirmations
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyStandupReport}
              className="text-xs gap-1.5 cursor-pointer hover:border-primary/50"
            >
              {copiedReport ? (
                <CheckIcon className="size-3.5 text-emerald-600" />
              ) : (
                <CopyIcon className="size-3.5" />
              )}
              {copiedReport ? "Report Copied" : "Daily Report"}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              className="text-xs gap-1.5 cursor-pointer hover:border-primary/50"
            >
              <DownloadIcon className="size-3.5" />
              Export to Excel (CSV)
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              disabled={loading}
              className="text-xs gap-1.5 cursor-pointer"
            >
              <RefreshCwIcon
                className={`size-3.5 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>

            <Link href="/dashboard/submissions/new">
              <Button
                size="sm"
                className="text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer shadow-xs"
              >
                <PlusIcon className="size-3.5" />
                New Submission
              </Button>
            </Link>
          </div>
        </div>

        <section aria-label="Application metrics" className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border/60 bg-border/60 md:grid-cols-5">
          {[
            {label:'Application records',value:stats.total,note:'Includes unsubmitted drafts',icon:SendIcon},
            {label:'Active Interviews',value:stats.interviews,note:'Scheduled · Round 1 · Round 2',icon:CalendarIcon},
            {label:'Client Review',value:stats.clientReview,note:'With end-client managers',icon:Building2Icon},
            {label:'Offers',value:stats.offers,note:'Received & in negotiation',icon:SparklesIcon},
            {label:'Duplicate Alerts',value:stats.duplicates,note:'30-day application safeguard',icon:AlertTriangleIcon},
          ].map((metric,index)=><div key={metric.label} className={`bg-card p-4 ${index===4?'col-span-2 md:col-span-1':''}`}><p className="flex items-center justify-between gap-2 text-[11px] font-medium text-muted-foreground">{metric.label}<metric.icon className={`size-3.5 ${index===4&&metric.value?'text-amber-600':'text-muted-foreground'}`}/></p><p className="mt-2 text-[28px] font-semibold leading-none tracking-tight tabular-nums">{loading?'—':metric.value}</p><p className="mt-2 text-[10px] text-muted-foreground">{metric.note}</p></div>)}
        </section>
      </div>
      {loadError&&<WorkspaceError message={loadError}><Button variant="outline" className="mt-2" onClick={()=>void loadData()}>Try again</Button></WorkspaceError>}

      {/* FILTER & PIPELINE TABS TOOLBAR */}
      <div className="flex flex-col gap-3">
        {/* Status Pipeline Pills */}
        <div className="flex flex-wrap items-center gap-1.5 border-b pb-3">
          <span className="text-xs font-medium text-muted-foreground mr-1 flex items-center gap-1">
            <FilterIcon className="size-3" />
            Stage:
          </span>
          {[
            { id: "all", label: "All stages" },
            { id: "interviews", label: "Interviews" },
            { id: "Submitted_to_Client", label: "Client Review" },
            { id: "Vendor_Screening", label: `Vendor Screening` },
            { id: "Applied", label: `Applied` },
            { id: "offers", label: "Offers" },
            { id: "active", label: `All Active` },
            { id: "Rejected", label: `Rejected` },
          ].map((tab) => {
            const isSelected = selectedStatusTab === tab.id;
            return (
              <button
                key={tab.id}
                aria-pressed={isSelected}
                type="button"
                onClick={() => setSelectedStatusTab(tab.id)}
                className={`px-3 py-1.5 text-xs rounded-lg border transition-colors cursor-pointer font-medium ${
                  isSelected
                    ? "bg-foreground text-background border-foreground shadow-xs"
                    : "bg-muted/40 hover:bg-muted text-foreground border-border/60"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Search & Select dropdowns */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 w-full">
            <SearchIcon className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              aria-label="Search submissions"
              placeholder="Search company, role, vendor or notes…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs bg-background"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <CandidateCombobox candidates={candidates} value={selectedCandidateFilter} onChange={setSelectedCandidateFilter}/>

            {/* Portal Source Filter */}
            <Select
              value={selectedPortalFilter}
              onValueChange={(val) => setSelectedPortalFilter(val ?? "all")}
            >
              <SelectTrigger aria-label="Filter by portal" className="h-8 text-xs w-[140px] bg-background">
                <SelectValue>{selectedPortalFilter==='all'?'All portals':portalOptions.find(([value])=>value===selectedPortalFilter)?.[1]||selectedPortalFilter}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">
                  All Portals
                </SelectItem>
                {portalOptions.map(([value,label]) => <SelectItem key={value} value={value} className="text-xs">{label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <section aria-label="Application date filters" className="rounded-xl border border-border/60 bg-card p-3 space-y-3">
        <p className="text-xs font-medium text-muted-foreground">Application date · Counts and exports follow your filters</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">From date<Input aria-label="From application date" type="date" value={dateFrom} max={dateTo || undefined} onChange={e => setDateFrom(e.target.value)}/></label>
          <label className="text-sm">To date<Input aria-label="To application date" type="date" value={dateTo} min={dateFrom || undefined} onChange={e => setDateTo(e.target.value)}/></label>
          {([{id:'today',label:'Today'},{id:'week',label:'Last 7 days'},{id:'month',label:'This month'}] as const).map(preset => <Button key={preset.id} variant="outline" onClick={() => { const range = submissionDatePreset(preset.id); setDateFrom(range.from); setDateTo(range.to); }}>{preset.label}</Button>)}
          <Button variant="ghost" onClick={() => {setDateFrom('');setDateTo('');setSearchQuery('');setSelectedCandidateFilter('all');setSelectedPortalFilter('all');setSelectedStatusTab('all');}}>Clear filters</Button>
        </div>
        {dateFrom && dateTo && dateFrom > dateTo && <p role="alert" className="text-sm text-destructive">From date must be on or before To date.</p>}
        <p role="status" className="text-sm"><strong>{filteredSubmissions.length}</strong> matching applications across <strong>{dailyCounts.length}</strong> application dates.</p>
        <details><summary className="text-xs font-medium text-muted-foreground cursor-pointer">Applications by date · {dailyCounts.length} dates</summary><div className="mt-3 max-h-60 overflow-auto">
          {dailyCounts.length ? <table className="w-full text-sm"><caption className="sr-only">Daily application counts for the selected filters</caption><thead><tr className="border-b"><th className="p-2 text-left">Application date</th><th className="p-2 text-right">Application records</th></tr></thead><tbody>{dailyCounts.map(day => <tr key={day.date} className="border-b"><td className="p-2"><button type="button" className="underline" aria-label={`Show applications on ${day.date}`} onClick={() => {setDateFrom(day.date);setDateTo(day.date);}}>{day.date}</button></td><td className="p-2 text-right">{day.count}</td></tr>)}</tbody></table> : <p className="text-sm text-muted-foreground">No dated applications match these filters.</p>}
        </div>
        </details>
        {filteredSubmissions.some(row => !row.submission_date) && <p className="text-xs text-muted-foreground">Applications without a recorded date are included in the total only when no date filter is selected.</p>}
      </section>

      {/* THE CENTRAL EXCEL-REPLACEMENT SUBMISSIONS TABLE */}
      <div className="rounded-xl border bg-card shadow-xs overflow-hidden">
        <div className="p-3.5 border-b bg-muted/20 flex items-center justify-between text-xs text-muted-foreground">
          <div>
            Showing <strong className="text-foreground">{filteredSubmissions.length}</strong> of{" "}
            <strong>{submissions.length}</strong> submissions
          </div>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={showDetails} onChange={event=>setShowDetails(event.target.checked)}/>Show vendor, rate and notes</label>
        </div>

        <div className="overflow-x-auto">
          <Table className={`submissions-table min-w-[1250px] ${showDetails?'show-details':''}`}>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="w-[180px]">Candidate</TableHead>
                <TableHead className="w-[200px]">End Client & Role</TableHead>
                <TableHead className="min-w-[220px]">Applied resume & answers</TableHead>
                <TableHead className="w-[180px]">Vendor & Recruiter</TableHead>
                <TableHead className="w-[110px]">Rate</TableHead>
                <TableHead className="w-[110px]">Date</TableHead>
                <TableHead className="min-w-[220px]">Recruiting stage & capture</TableHead>
                <TableHead className="w-[220px]">Interview / Schedule / Notes</TableHead>
                <TableHead className="w-[90px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="h-32 text-center text-muted-foreground"
                  >
                    <WorkspaceSkeleton rows={4}/>
                  </TableCell>
                </TableRow>
              ) : filteredSubmissions.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
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
                        className="text-xs mt-1"
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
                    <TableRow key={sub.id} className="hover:bg-muted/30">
                      {/* Candidate Column */}
                      <TableCell className="align-top py-3">
                        <div className="font-semibold text-foreground text-xs">
                          {candidateName}
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                          >
                            {visaStatus}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground truncate max-w-[90px]">
                            {sub.candidate?.target_job_titles || "Not recorded"}
                          </span>
                        </div>
                      </TableCell>

                      {/* Company & Role */}
                      <TableCell className="align-top py-3">
                        <div className="flex items-center gap-1.5 font-medium text-foreground text-xs">
                          <Building2Icon className="size-3 text-primary shrink-0" />
                          <span>{sub.company_name}</span>
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
                        {sub.capture_status === 'confirmed' && <Badge variant="outline" className="text-[9px] mt-1">Email confirmed</Badge>}
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                          <Badge
                            variant="secondary"
                            className="text-[9px] px-1.5 py-0 h-4"
                          >
                            {sub.portal_source || "Not recorded"}
                          </Badge>
                          <span>{sub.job_location || "Not recorded"}</span>
                          {sub.job_url && (
                            <a
                              href={sub.job_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline flex items-center gap-0.5"
                            >
                              Link <ExternalLinkIcon className="size-2.5" />
                            </a>
                          )}
                        </div>
                      </TableCell>

                      <TableCell className="align-top py-3">                        <AppliedResumeBadge
                          submissionId={sub.id}
                          candidateName={candidateName}
                          companyName={sub.company_name}
                          jobTitle={sub.job_title}
                          appliedResume={sub.applied_resume}
                        />
                        <ApplicationAnswerSnapshot submissionId={sub.id} />
                      </TableCell>

                      {/* Vendor & Recruiter */}
                      <TableCell className="align-top py-3 text-xs">
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
                      <TableCell className="align-top py-3 text-xs">
                        <div className="font-semibold text-foreground">
                          {sub.submitted_rate || "Not recorded"}
                        </div>
                        {sub.client_pay_rate && (
                          <div className="text-[10px] text-muted-foreground">
                            Client: {sub.client_pay_rate}
                          </div>
                        )}
                      </TableCell>

                      {/* Date */}
                      <TableCell className="align-top py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {sub.submission_date}
                      </TableCell>

                      {/* Status */}
                      <TableCell className="align-top py-3">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveSubmissionForStatus(sub);
                            setStatusDialogOpen(true);
                          }}
                          className="cursor-pointer hover:opacity-80 transition-opacity text-left"
                          title="Click to update status stage"
                        >
                          {getStatusBadge(sub.status)}
                        </button>
                        <div className="mt-3"><CaptureState state={sub.capture_status} confirmedAt={sub.email_confirmed_at}/></div>
                      </TableCell>

                      {/* Interview & Notes */}
                      <TableCell className="align-top py-3 text-xs">
                        {sub.interview_time ? (
                          <div className="p-2 rounded-md border border-purple-500/20 bg-purple-500/5 mb-1 text-[11px]">
                            <div className="flex items-center gap-1 text-purple-700 dark:text-purple-300 font-semibold">
                              <CalendarIcon className="size-3" />
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
                            <div className="flex items-center justify-between gap-1 text-purple-600/90 dark:text-purple-300/80 text-[10px] mt-0.5">
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

                        {sub.notes ? (
                          <p className="text-[11px] text-muted-foreground line-clamp-2 italic">
                            &quot;{sub.notes}&quot;
                          </p>
                        ) : (
                          <span className="text-[10px] text-muted-foreground/60">
                            No notes
                          </span>
                        )}
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="align-top py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {canPushProfile && <SendToExtensionButton submission={sub} />}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setActiveSubmissionForStatus(sub);
                              setStatusDialogOpen(true);
                            }}
                            className="h-7 text-[11px] px-2 cursor-pointer"
                            title="Update Status"
                          >
                            Stage
                          </Button>
                          <Link href={`/dashboard/submissions/${sub.id}/edit`}>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 cursor-pointer"
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
                            className="h-7 w-7 p-0 text-destructive/80 hover:text-destructive cursor-pointer"
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
