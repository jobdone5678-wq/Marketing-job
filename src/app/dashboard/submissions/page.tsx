"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  getSubmissions,
  deleteSubmission,
} from "@/lib/submissions";
import { getCandidates } from "@/lib/candidates";
import type { Candidate, JobSubmission, SubmissionStatus } from "@/types/database";
import { SubmissionStatusDialog } from "@/components/submission-status-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  VideoIcon,
  ExternalLinkIcon,
  EditIcon,
  Trash2Icon,
  TrendingUpIcon,
  SparklesIcon,
  Building2Icon,
  BriefcaseIcon,
  ClockIcon,
  CheckCircle2Icon,
  PhoneIcon,
  MailIcon,
  FilterIcon,
} from "lucide-react";

export default function SubmissionsPage() {
  const router = useRouter();
  const [submissions, setSubmissions] = React.useState<JobSubmission[]>([]);
  const [candidates, setCandidates] = React.useState<Candidate[]>([]);
  const [loading, setLoading] = React.useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedStatusTab, setSelectedStatusTab] = React.useState("all");
  const [selectedCandidateFilter, setSelectedCandidateFilter] = React.useState("all");
  const [selectedPortalFilter, setSelectedPortalFilter] = React.useState("all");

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
    } catch {
      toast.error("Failed to load submissions data");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void Promise.resolve().then(loadData);
  }, [loadData]);

  // Status Badge Helper
  const getStatusBadge = (status: SubmissionStatus) => {
    switch (status) {
      case "Offer_Received":
        return (
          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 gap-1 font-semibold">
            <SparklesIcon className="size-3 text-emerald-500" />
            Offer Received 🎉
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
  ]);

  // Statistics
  const stats = React.useMemo(() => {
    const total = submissions.length;
    const interviews = submissions.filter(
      (s) =>
        s.status === "Interview_Scheduled" ||
        s.status === "Round_1" ||
        s.status === "Round_2"
    ).length;
    const clientReview = submissions.filter(
      (s) => s.status === "Submitted_to_Client"
    ).length;
    const offers = submissions.filter((s) => s.status === "Offer_Received").length;
    const duplicates = submissions.filter((s) => s.duplicate_flag).length;

    return { total, interviews, clientReview, offers, duplicates };
  }, [submissions]);

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
    report += `• Total Active Submissions: ${stats.total}\n`;
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
    <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6 max-w-[1600px] w-full mx-auto">
      {/* Page Header */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                Job Submissions Tracker
              </h1>
              <Badge
                variant="outline"
                className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 gap-1 text-xs"
              >
                <TrendingUpIcon className="size-3" />
                Live Submissions
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Centralized USA bench submission log with vendor tracking, interview
              pipelines, rate calculations, and 30-day client duplicate safeguards.
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

        {/* STATS METRIC CARDS */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-2">
          {/* 1. Total Submissions */}
          <Card className="cursor-pointer hover:border-primary/40 transition-all p-3.5">
            <div className="text-xs text-muted-foreground font-medium flex items-center justify-between">
              <span>Total Submissions</span>
              <SendIcon className="size-3.5 text-primary" />
            </div>
            <div className="text-2xl font-bold mt-1 text-foreground">
              {stats.total}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Across all bench roles
            </div>
          </Card>

          {/* 2. Active Interviews */}
          <Card className="cursor-pointer hover:border-purple-500/40 transition-all p-3.5 border-purple-500/20 bg-purple-500/5">
            <div className="text-xs text-purple-700 dark:text-purple-300 font-medium flex items-center justify-between">
              <span>Active Interviews</span>
              <CalendarIcon className="size-3.5 text-purple-600" />
            </div>
            <div className="text-2xl font-bold mt-1 text-purple-700 dark:text-purple-300">
              {stats.interviews}
            </div>
            <div className="text-[11px] text-purple-600/80 mt-0.5">
              Round 1 / Round 2 / Scheduled
            </div>
          </Card>

          {/* 3. Client Review */}
          <Card className="cursor-pointer hover:border-blue-500/40 transition-all p-3.5 border-blue-500/20 bg-blue-500/5">
            <div className="text-xs text-blue-700 dark:text-blue-300 font-medium flex items-center justify-between">
              <span>Client Review</span>
              <Building2Icon className="size-3.5 text-blue-600" />
            </div>
            <div className="text-2xl font-bold mt-1 text-blue-700 dark:text-blue-300">
              {stats.clientReview}
            </div>
            <div className="text-[11px] text-blue-600/80 mt-0.5">
              Profiles with end managers
            </div>
          </Card>

          {/* 4. Offers Received */}
          <Card className="cursor-pointer hover:border-emerald-500/40 transition-all p-3.5 border-emerald-500/20 bg-emerald-500/5">
            <div className="text-xs text-emerald-700 dark:text-emerald-300 font-medium flex items-center justify-between">
              <span>Offers Received</span>
              <SparklesIcon className="size-3.5 text-emerald-600" />
            </div>
            <div className="text-2xl font-bold mt-1 text-emerald-700 dark:text-emerald-300">
              {stats.offers}
            </div>
            <div className="text-[11px] text-emerald-600/80 mt-0.5">
              Placements & negotiations
            </div>
          </Card>

          {/* 5. Duplicate Safeguards */}
          <Card className="cursor-pointer hover:border-amber-500/40 transition-all p-3.5 border-amber-500/20 bg-amber-500/5 col-span-2 md:col-span-1">
            <div className="text-xs text-amber-700 dark:text-amber-300 font-medium flex items-center justify-between">
              <span>Duplicate Alerts</span>
              <AlertTriangleIcon className="size-3.5 text-amber-600" />
            </div>
            <div className="text-2xl font-bold mt-1 text-amber-700 dark:text-amber-300">
              {stats.duplicates}
            </div>
            <div className="text-[11px] text-amber-600/80 mt-0.5">
              30-day double submit flag
            </div>
          </Card>
        </div>
      </div>

      {/* FILTER & PIPELINE TABS TOOLBAR */}
      <div className="flex flex-col gap-3">
        {/* Status Pipeline Pills */}
        <div className="flex flex-wrap items-center gap-1.5 border-b pb-3">
          <span className="text-xs font-medium text-muted-foreground mr-1 flex items-center gap-1">
            <FilterIcon className="size-3" />
            Stage:
          </span>
          {[
            { id: "all", label: `All (${submissions.length})` },
            { id: "interviews", label: `Interviews (${stats.interviews})` },
            { id: "Submitted_to_Client", label: `Client Review (${stats.clientReview})` },
            { id: "Vendor_Screening", label: `Vendor Screening` },
            { id: "Applied", label: `Applied` },
            { id: "offers", label: `Offers (${stats.offers})` },
            { id: "active", label: `All Active` },
            { id: "Rejected", label: `Rejected` },
          ].map((tab) => {
            const isSelected = selectedStatusTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedStatusTab(tab.id)}
                className={`px-3 py-1 text-xs rounded-full border transition-all cursor-pointer font-medium ${
                  isSelected
                    ? "bg-primary text-primary-foreground border-primary shadow-xs"
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
              placeholder="Search candidate, company, role, prime vendor, or notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs bg-background"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            {/* Candidate Filter */}
            <Select
              value={selectedCandidateFilter}
              onValueChange={(val) => setSelectedCandidateFilter(val ?? "all")}
            >
              <SelectTrigger className="h-8 text-xs w-[180px] bg-background">
                <SelectValue placeholder="All Candidates" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">
                  All Bench Candidates
                </SelectItem>
                {candidates.map((c) => (
                  <SelectItem key={c.id} value={c.id} className="text-xs">
                    {c.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Portal Source Filter */}
            <Select
              value={selectedPortalFilter}
              onValueChange={(val) => setSelectedPortalFilter(val ?? "all")}
            >
              <SelectTrigger className="h-8 text-xs w-[140px] bg-background">
                <SelectValue placeholder="Portal Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">
                  All Portals
                </SelectItem>
                <SelectItem value="Greenhouse" className="text-xs">
                  Greenhouse
                </SelectItem>
                <SelectItem value="Ashby" className="text-xs">
                  Ashby
                </SelectItem>
                <SelectItem value="LinkedIn" className="text-xs">
                  LinkedIn
                </SelectItem>
                <SelectItem value="Direct" className="text-xs">
                  Direct / Workday
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* THE CENTRAL EXCEL-REPLACEMENT SUBMISSIONS TABLE */}
      <div className="rounded-xl border bg-card shadow-xs overflow-hidden">
        <div className="p-3.5 border-b bg-muted/20 flex items-center justify-between text-xs text-muted-foreground">
          <div>
            Showing <strong className="text-foreground">{filteredSubmissions.length}</strong> of{" "}
            <strong>{submissions.length}</strong> submissions
          </div>
          <div className="hidden sm:flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-emerald-500" />
              Offer Received
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-purple-500" />
              Interview Scheduled
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-blue-500" />
              Submitted to Client
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="w-[180px]">Candidate</TableHead>
                <TableHead className="w-[200px]">End Client & Role</TableHead>
                <TableHead className="w-[180px]">Vendor & Recruiter</TableHead>
                <TableHead className="w-[110px]">Rate</TableHead>
                <TableHead className="w-[110px]">Date</TableHead>
                <TableHead className="w-[170px]">Pipeline Status</TableHead>
                <TableHead className="w-[220px]">Interview / Schedule / Notes</TableHead>
                <TableHead className="w-[90px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="h-32 text-center text-muted-foreground"
                  >
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCwIcon className="size-5 animate-spin text-primary" />
                      <span className="text-xs">Loading submissions tracker...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredSubmissions.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
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
