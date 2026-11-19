'use client';

import * as React from 'react';
import Link from 'next/link';
import { useApplicationRealtime } from '@/hooks/use-application-realtime';
import { getSubmissions, deleteSubmission } from '@/lib/submissions';
import { getCandidates } from '@/lib/candidates';
import {
  dailySubmissionCounts,
  inSubmissionDateRange,
  submissionDatePreset,
} from '@/lib/submission-dates';
import type { Candidate, JobSubmission, SubmissionStatus } from '@/types/database';
import { SubmissionStatusDialog } from '@/components/submission-status-dialog';
import { ApplicationAnswerSnapshot } from '@/components/application-answer-snapshot';
import { CaptureState } from '@/components/application-evidence';
import { AppliedResumeBadge } from '@/components/applied-resume-badge';
import { RTRBadge } from '@/components/rtr-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { CandidateCombobox } from '@/components/candidate-combobox';
import { WorkspaceError, WorkspaceSkeleton } from '@/components/workspace-ui';
import { useUserProfile } from '@/hooks/use-user-profile';
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
  Wand2Icon,
  Building2Icon,
  BriefcaseIcon,
  ClockIcon,
  PhoneIcon,
  MailIcon,
  FilterIcon,
  GlobeIcon,
} from 'lucide-react';

export default function SubmissionsPage() {
  const { isCandidate } = useUserProfile();
  const canPushProfile = false;
  const [submissions, setSubmissions] = React.useState<JobSubmission[]>([]);
  const submissionRequest = React.useRef(0);
  const [candidates, setCandidates] = React.useState<Candidate[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');
  const [showDetails, setShowDetails] = React.useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = React.useState('');
  const [selectedStatusTab, setSelectedStatusTab] = React.useState('all');
  const [selectedCandidateFilter, setSelectedCandidateFilter] = React.useState('all');
  const [selectedPortalFilter, setSelectedPortalFilter] = React.useState('all');
  const [selectedSourceFilter, setSelectedSourceFilter] = React.useState('all');
  const [dateFrom, setDateFrom] = React.useState('');
  const [dateTo, setDateTo] = React.useState('');

  // Modals
  const [statusDialogOpen, setStatusDialogOpen] = React.useState(false);
  const [activeSubmissionForStatus, setActiveSubmissionForStatus] =
    React.useState<JobSubmission | null>(null);

  const [copiedReport, setCopiedReport] = React.useState(false);

  // Load data
  const loadData = React.useCallback(async () => {
    const request = ++submissionRequest.current;
    setLoading(true);
    try {
      const [subsData, candsData] = await Promise.all([getSubmissions(), getCandidates()]);
      if (request === submissionRequest.current) setSubmissions(subsData);
      setCandidates(candsData);
      setLoadError('');
    } catch {
      setLoadError(
        'Could not load the latest submissions. Try refreshing. Previously loaded records may be out of date.'
      );
      toast.error('Failed to load submissions data');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const candidateId = new URLSearchParams(window.location.search).get('candidateId');
    if (candidateId) queueMicrotask(() => setSelectedCandidateFilter(candidateId));
    void Promise.resolve().then(loadData);
  }, [loadData]);

  const refreshSubmissions = React.useCallback(async () => {
    const request = ++submissionRequest.current;
    try {
      const latest = await getSubmissions();
      if (request === submissionRequest.current) setSubmissions(latest);
    } catch {
      // Keep the current records; the existing Refresh action can retry.
    }
  }, []);

  useApplicationRealtime(() => {
    void refreshSubmissions();
  }, isCandidate);

  React.useEffect(() => {
    const refreshOnReturn = () => {
      if (document.visibilityState === 'visible') void refreshSubmissions();
    };
    window.addEventListener('focus', refreshOnReturn);
    document.addEventListener('visibilitychange', refreshOnReturn);
    return () => {
      submissionRequest.current++;
      window.removeEventListener('focus', refreshOnReturn);
      document.removeEventListener('visibilitychange', refreshOnReturn);
    };
  }, [refreshSubmissions]);

  // Status Badge Helper
  const getStatusBadge = (status: SubmissionStatus) => {
    switch (status) {
      case 'Offer_Received':
        return (
          <Badge className="gap-1.5 rounded-[6px] border-primary/20 bg-primary/15 px-2.5 py-1 font-medium text-primary">
            <Wand2Icon className="size-3 text-primary" />
            Offer Received
          </Badge>
        );
      case 'Round_1':
      case 'Round_2':
      case 'Interview_Scheduled':
        return (
          <Badge className="bg-primary/10 text-primary border-primary/25 gap-1.5 rounded-[6px] px-2.5 py-1 font-medium">
            <CalendarIcon className="text-primary size-3" />
            {status.replace(/_/g, ' ')}
          </Badge>
        );
      case 'Submitted_to_Client':
        return (
          <Badge className="gap-1.5 rounded-[6px] border-border bg-muted px-2.5 py-1 font-medium text-muted-foreground">
            <Building2Icon className="size-3 text-muted-foreground" />
            Client Review
          </Badge>
        );
      case 'Vendor_Screening':
        return (
          <Badge className="gap-1.5 rounded-[6px] border-amber-500/30 bg-amber-500/15 px-2.5 py-1 font-medium text-amber-700 dark:text-amber-400">
            <ClockIcon className="size-3 text-amber-500" />
            Vendor Screening
          </Badge>
        );
      case 'Applied':
        return (
          <Badge
            variant="outline"
            className="border-border/80 text-foreground/80 bg-background gap-1.5 rounded-[6px] px-2.5 py-1 font-medium"
          >
            <SendIcon className="text-primary size-3" />
            Applied
          </Badge>
        );
      case 'Rejected':
        return (
          <Badge
            variant="destructive"
            className="gap-1 rounded-[6px] px-2.5 py-1 font-medium opacity-85"
          >
            Rejected
          </Badge>
        );
      default:
        return (
          <Badge
            variant="secondary"
            className="gap-1 rounded-[6px] px-2.5 py-1 font-medium"
          >
            {status.replace(/_/g, ' ')}
          </Badge>
        );
    }
  };
  // Filter Submissions
  const filteredSubmissions = React.useMemo(() => {
    return submissions.filter((sub) => {
      if (!inSubmissionDateRange(sub.submission_date, dateFrom, dateTo)) return false;
      // Candidate filter
      if (selectedCandidateFilter !== 'all' && sub.candidate_id !== selectedCandidateFilter) {
        return false;
      }

      // Portal filter
      if (
        selectedPortalFilter !== 'all' &&
        sub.portal_source?.toLowerCase() !== selectedPortalFilter.toLowerCase()
      ) {
        return false;
      }

      // Source Type filter
      if (selectedSourceFilter !== 'all' && sub.source_type !== selectedSourceFilter) {
        return false;
      }

      // Status Tab filter
      if (selectedStatusTab === 'interviews') {
        if (
          sub.status !== 'Interview_Scheduled' &&
          sub.status !== 'Round_1' &&
          sub.status !== 'Round_2'
        ) {
          return false;
        }
      } else if (selectedStatusTab === 'offers') {
        if (sub.status !== 'Offer_Received') return false;
      } else if (selectedStatusTab === 'active') {
        if (sub.status === 'Rejected' || sub.status === 'No_Response') return false;
      } else if (selectedStatusTab !== 'all') {
        if (sub.status !== selectedStatusTab) return false;
      }

      // Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const candName = sub.candidate?.full_name?.toLowerCase() || '';
        const comp = sub.company_name?.toLowerCase() || '';
        const title = sub.job_title?.toLowerCase() || '';
        const vendor = sub.vendor_company?.toLowerCase() || '';
        const contact = sub.vendor_contact_name?.toLowerCase() || '';
        const notes = sub.notes?.toLowerCase() || '';
        const loc = sub.job_location?.toLowerCase() || '';

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
    selectedSourceFilter,
    selectedStatusTab,
    searchQuery,
    dateFrom,
    dateTo,
  ]);

  const dailyCounts = React.useMemo(
    () => dailySubmissionCounts(filteredSubmissions),
    [filteredSubmissions]
  );
  const portalOptions = React.useMemo(
    () =>
      Array.from(
        new Map(
          submissions
            .filter((row) => row.portal_source?.trim())
            .map((row) => [row.portal_source!.trim().toLowerCase(), row.portal_source!.trim()])
        ).entries()
      ).sort((a, b) => a[1].localeCompare(b[1])),
    [submissions]
  );

  // Statistics
  const stats = React.useMemo(() => {
    const total = filteredSubmissions.length;
    const interviews = filteredSubmissions.filter(
      (s) => s.status === 'Interview_Scheduled' || s.status === 'Round_1' || s.status === 'Round_2'
    ).length;
    const clientReview = filteredSubmissions.filter(
      (s) => s.status === 'Submitted_to_Client'
    ).length;
    const offers = filteredSubmissions.filter((s) => s.status === 'Offer_Received').length;
    const duplicates = filteredSubmissions.filter((s) => s.duplicate_flag).length;

    return { total, interviews, clientReview, offers, duplicates };
  }, [filteredSubmissions]);

  // Export to CSV / Excel
  const handleExportCSV = () => {
    if (filteredSubmissions.length === 0) {
      toast.error('No submissions to export.');
      return;
    }

    const headers = [
      'Submission Date',
      'Candidate Name',
      'Visa Status',
      'Target Role',
      'End Client / Company',
      'Portal Source',
      'Location',
      'Vendor Company',
      'Vendor Contact Name',
      'Vendor Contact Email',
      'Vendor Contact Phone',
      'Submitted Rate',
      'RTR Status',
      'RTR Type',
      'RTR Vendor',
      'RTR Date',
      'RTR Expiration',
      'Status',
      'Duplicate Flag',
      'Interview Date/Time',
      'Interview Mode',
      'Interview Link',
      'Recruiter Notes',
      'Job URL',
    ];

    const rows = filteredSubmissions.map((s) => [
      `"${s.submission_date}"`,
      `"${s.candidate?.full_name || 'Not recorded'}"`,
      `"${s.candidate?.visa_status || 'Not recorded'}"`,
      `"${s.job_title}"`,
      `"${s.company_name}"`,
      `"${s.portal_source || 'Not recorded'}"`,
      `"${s.job_location || 'Not recorded'}"`,
      `"${s.vendor_company || ''}"`,
      `"${s.vendor_contact_name || ''}"`,
      `"${s.vendor_contact_email || ''}"`,
      `"${s.vendor_contact_phone || ''}"`,
      `"${s.submitted_rate || ''}"`,
      `"${s.rtr_document?.rtr_status || ''}"`,
      `"${s.rtr_document?.rtr_type || ''}"`,
      `"${s.rtr_document?.vendor_name || ''}"`,
      `"${s.rtr_document?.rtr_date || ''}"`,
      `"${s.rtr_document?.expiration_date || ''}"`,
      `"${s.status}"`,
      `"${s.duplicate_flag ? 'YES' : 'NO'}"`,
      `"${s.interview_time || ''}"`,
      `"${s.interview_mode || ''}"`,
      `"${s.interview_meeting_link || ''}"`,
      `"${(s.notes || '').replace(/"/g, '""')}"`,
      `"${s.job_url || ''}"`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    const dateStr = new Date().toISOString().split('T')[0];
    link.setAttribute('download', `bench_job_submissions_tracker_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success('Excel Tracker Exported!', {
      description: `Downloaded ${filteredSubmissions.length} submission records as CSV.`,
    });
  };

  // Copy Daily Standup Report
  const handleCopyStandupReport = () => {
    const today = new Date().toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    let report = `DAILY RECRUITING & BENCH MARKETING REPORT (${today})\n`;
    report += `========================================================\n\n`;
    report += `📊 SUMMARY METRICS:\n`;
    report += `• Matching Submissions: ${stats.total}\n`;
    report += `• Application dates: ${dateFrom || 'Any date'} through ${dateTo || 'Any date'}\n`;
    report += dailyCounts.map((day) => `  ${day.date}: ${day.count} applications\n`).join('');
    report += `• Active Interviews / Rounds: ${stats.interviews}\n`;
    report += `• Submitted to Client: ${stats.clientReview}\n`;
    report += `• Offers Received: ${stats.offers}\n\n`;

    report += `📋 ACTIVE PIPELINE DETAILS:\n`;
    filteredSubmissions.forEach((s, idx) => {
      report += `${idx + 1}. [${s.status.replace(/_/g, ' ')}] ${s.candidate?.full_name || 'Not recorded'} → ${s.company_name} (${s.job_title})\n`;
      report += `   Vendor: ${s.vendor_company || 'Direct'} | Rate: ${s.submitted_rate || 'Not recorded'}\n`;
      if (s.rtr_document) {
        report += `   RTR: ${s.rtr_document.rtr_type} - ${s.rtr_document.rtr_status} (${s.rtr_document.vendor_name || 'Direct'}) | Date: ${s.rtr_document.rtr_date}\n`;
      }
      if (s.interview_time) {
        report += `   Interview: ${new Date(s.interview_time).toLocaleString()} (${s.interview_mode || 'Not recorded'})\n`;
      }
      if (s.notes) {
        report += `   Notes: ${s.notes}\n`;
      }
      report += `\n`;
    });

    navigator.clipboard.writeText(report);
    setCopiedReport(true);
    toast.success('Standup Report Copied!', {
      description: 'Ready to paste into Slack, Teams, or daily manager email.',
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
        toast.error('Failed to delete', { description: error });
      }
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-6 p-4 lg:p-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-foreground text-[24px] font-medium tracking-tight sm:text-[28px]">
                {isCandidate ? 'My Applications' : 'Job submissions'}
              </h1>
              <Badge
                variant="outline"
                className="gap-1.5 rounded-[6px] border-primary/20 bg-primary/10 px-2 py-0.5 text-[13px] font-medium text-primary"
              >
                <TrendingUpIcon className="size-3" />
                Application tracker
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1 text-[13px]">
              {isCandidate
                ? 'Track all your submitted applications, interview stages, and statuses.'
                : 'Every application, its recorded resume, and the next step — in one place.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              render={<Link href="/dashboard/email-confirmations" />}
              className="border-border/70 hover:bg-muted/50 h-9 cursor-pointer gap-1.5 rounded-[10px] text-[13px]"
            >
              <MailIcon className="size-3.5" /> Email confirmations
            </Button>
            {false && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopyStandupReport}
                className="border-border/70 hover:bg-muted/50 h-9 cursor-pointer gap-1.5 rounded-[10px] text-[13px]"
              >
                {copiedReport ? (
                  <CheckIcon className="size-3.5 text-primary" />
                ) : (
                  <CopyIcon className="size-3.5" />
                )}
                {copiedReport ? 'Report Copied' : 'Daily Report'}
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              className="border-border/70 hover:bg-muted/50 h-9 cursor-pointer gap-1.5 rounded-[10px] text-[13px]"
            >
              <DownloadIcon className="size-3.5" />
              Export to Excel (CSV)
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              disabled={loading}
              className="border-border/70 hover:bg-muted/50 h-9 cursor-pointer gap-1.5 rounded-[10px] text-[13px]"
            >
              <RefreshCwIcon className={`size-3.5 ${loading ?'animate-spin' : ''}`} />
              Refresh
            </Button>

            {false && (
              <Link href="/dashboard/submissions/new">
                <Button
                  size="sm"
                  className="bg-primary text-primary-foreground hover:bg-primary/90 h-9 cursor-pointer gap-1.5 rounded-[10px] px-3.5 text-[13px] font-medium transition-colors hover:shadow"
                >
                  <PlusIcon className="size-3.5" />
                  New Submission
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* 5 Elevated Metric Cards */}
        <section
          aria-label="Application metrics"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
        >
          {[
            {
              label: 'Application records',
              value: stats.total,
              note: 'Includes unsubmitted drafts',
              icon: SendIcon,
              color: 'text-primary bg-primary/10 border-primary/20',
            },
            {
              label: 'Active Interviews',
              value: stats.interviews,
              note: 'Scheduled · Round 1 · Round 2',
              icon: CalendarIcon,
              color: 'text-muted-foreground bg-muted border-border',
            },
            {
              label: 'Client Review',
              value: stats.clientReview,
              note: 'With end-client managers',
              icon: Building2Icon,
              color: 'text-muted-foreground bg-muted border-border',
            },
            {
              label: 'Offers',
              value: stats.offers,
              note: 'Received & in negotiation',
              icon: Wand2Icon,
              color:
                'text-primary bg-primary/10 border-primary/20',
            },
            {
              label: 'Duplicate Alerts',
              value: stats.duplicates,
              note: '30-day application safeguard',
              icon: AlertTriangleIcon,
              color: stats.duplicates
                ? 'text-amber-700 dark:text-amber-400 bg-amber-500/10 border-amber-500/20'
                : 'text-muted-foreground bg-muted border-border/60',
            },
          ].map((metric) => (
            <div
              key={metric.label}
              className="border-border/70 bg-card hover:border-border flex flex-col justify-between rounded-[16px] border p-4 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-[11px] font-medium">
                  {metric.label}
                </span>
                <div
                  className={`flex size-7 items-center justify-center rounded-[10px] border ${metric.color}`}
                >
                  <metric.icon className="size-3.5" />
                </div>
              </div>
              <div className="mt-2.5">
                <p className="text-foreground font-mono text-[24px] leading-none font-medium tracking-tight tabular-nums sm:text-[28px]">
                  {loading ? '—' : metric.value}
                </p>
                <p className="text-muted-foreground mt-1.5 line-clamp-1 text-[11px]">
                  {metric.note}
                </p>
              </div>
            </div>
          ))}
        </section>
      </div>
      {loadError && (
        <WorkspaceError message={loadError}>
          <Button variant="outline" className="mt-2 text-[13px]" onClick={() => void loadData()}>
            Try again
          </Button>
        </WorkspaceError>
      )}

      {/* FILTER & PIPELINE TABS TOOLBAR */}
      <div className="flex flex-col gap-3">
        {/* Status Pipeline Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pb-1">
          <span className="text-muted-foreground mr-1 flex items-center gap-1.5 text-[13px] font-medium">
            <FilterIcon className="text-primary size-3.5" />
            Stage:
          </span>
          <div className="bg-muted/40 border-border/60 inline-flex flex-wrap items-center gap-1 rounded-[12px] border p-1">
            {[
              { id: 'all', label: 'All stages' },
              { id: 'interviews', label: 'Interviews' },
              { id: 'Submitted_to_Client', label: 'Client Review' },
              { id: 'Vendor_Screening', label: 'Vendor Screening' },
              { id: 'Applied', label: 'Applied' },
              { id: 'offers', label: 'Offers' },
              { id: 'active', label: 'All Active' },
              { id: 'Rejected', label: 'Rejected' },
            ].map((tab) => {
              const isSelected = selectedStatusTab === tab.id;
              return (
                <button
                  key={tab.id}
                  aria-pressed={isSelected}
                  type="button"
                  onClick={() => setSelectedStatusTab(tab.id)}
                  className={`cursor-pointer rounded-[10px] px-3 py-1.5 text-[13px] font-medium transition-colors duration-150 ${
 isSelected
 ?'bg-background text-foreground ring-border/60 font-medium ring-1'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Search & Select dropdowns */}
        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <div className="relative w-full flex-1">
            <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
            <Input
              aria-label="Search submissions"
              placeholder="Search company, role, vendor or notes…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-background border-border/70 focus-visible:ring-primary/20 focus-visible:border-primary h-9.5 rounded-[12px] pl-9 text-[13px] focus-visible:ring-2"
            />
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            {false && (
              <CandidateCombobox
                candidates={candidates}
                value={selectedCandidateFilter}
                onChange={setSelectedCandidateFilter}
              />
            )}

            {/* Portal Source Filter */}
            <Select
              value={selectedPortalFilter}
              onValueChange={(val) => setSelectedPortalFilter(val ?? 'all')}
            >
              <SelectTrigger
                aria-label="Filter by portal"
                className="bg-background border-border/70 h-9.5 w-[140px] rounded-[12px] text-[13px]"
              >
                <SelectValue>
                  {selectedPortalFilter === 'all'
                    ? 'All portals'
                    : portalOptions.find(([value]) => value === selectedPortalFilter)?.[1] ||
                      selectedPortalFilter}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-[13px]">
                  All Portals
                </SelectItem>
                {portalOptions.map(([value, label]) => (
                  <SelectItem key={value} value={value} className="text-[13px]">
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Source Type Filter */}
            <Select
              value={selectedSourceFilter}
              onValueChange={(val) => setSelectedSourceFilter(val ?? 'all')}
            >
              <SelectTrigger
                aria-label="Filter by source type"
                className="bg-background border-border/70 h-9.5 w-[150px] rounded-[12px] text-[13px]"
              >
                <SelectValue>
                  {selectedSourceFilter === 'all'
                    ? 'All Sources'
                    : selectedSourceFilter === 'portal'
                      ? '🏢 Portal'
                      : '🌐 Extension'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-[13px]">
                  All Sources
                </SelectItem>
                <SelectItem value="portal" className="flex items-center gap-2 text-[13px]">
                  <Building2Icon className="text-primary size-3.5" />
                  Portal (Inside Jobs)
                </SelectItem>
                <SelectItem value="extension" className="flex items-center gap-2 text-[13px]">
                  <GlobeIcon className="size-3.5 text-muted-foreground" />
                  Extension (Outside Jobs)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Application date filters card */}
      <section
        aria-label="Application date filters"
        className="border-border/70 bg-card space-y-3 rounded-[16px] border p-4"
      >
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground flex items-center gap-1.5 text-[13px] font-medium">
            <CalendarIcon className="text-primary size-3.5" />
            Application date · Counts and exports follow your filters
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2.5">
          <label className="text-foreground space-y-1 text-[13px] font-medium">
            <span className="block">From date</span>
            <Input
              aria-label="From application date"
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-background border-border/70 h-9 rounded-[10px] text-[13px]"
            />
          </label>
          <label className="text-foreground space-y-1 text-[13px] font-medium">
            <span className="block">To date</span>
            <Input
              aria-label="To application date"
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-background border-border/70 h-9 rounded-[10px] text-[13px]"
            />
          </label>
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'today', label: 'Today' },
                { id: 'week', label: 'Last 7 days' },
                { id: 'month', label: 'This month' },
              ] as const
            ).map((preset) => (
              <Button
                key={preset.id}
                variant="outline"
                size="sm"
                className="border-border/70 hover:bg-muted/50 h-9 cursor-pointer rounded-[10px] text-[13px] font-medium"
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
              className="text-muted-foreground hover:text-foreground hover:bg-muted/50 h-9 cursor-pointer rounded-[10px] text-[13px] font-medium"
              onClick={() => {
                setDateFrom('');
                setDateTo('');
                setSearchQuery('');
                setSelectedCandidateFilter('all');
                setSelectedPortalFilter('all');
                setSelectedSourceFilter('all');
                setSelectedStatusTab('all');
              }}
            >
              Clear filters
            </Button>
          </div>
        </div>

        {dateFrom && dateTo && dateFrom > dateTo && (
          <p
            role="alert"
            className="text-destructive border-destructive/20 bg-destructive/10 rounded-[10px] border p-2.5 text-[13px]"
          >
            From date must be on or before To date.
          </p>
        )}

        <div className="border-border/40 space-y-2 border-t pt-2">
          <p role="status" className="text-muted-foreground text-[13px]">
            <strong className="text-foreground font-medium">{filteredSubmissions.length}</strong>{' '}
            matching applications across{' '}
            <strong className="text-foreground font-medium">{dailyCounts.length}</strong>{' '}
            application dates.
          </p>
          <details className="w-full">
            <summary className="text-primary cursor-pointer text-[13px] font-medium select-none hover:underline">
              Applications by date · {dailyCounts.length} dates
            </summary>
            <div className="border-border/60 bg-muted/20 mt-3 max-h-60 overflow-auto rounded-[12px] border p-2">
              {dailyCounts.length ? (
                <table className="w-full text-[13px]">
                  <caption className="sr-only">
                    Daily application counts for the selected filters
                  </caption>
                  <thead>
                    <tr className="border-border/60 text-muted-foreground border-b">
                      <th className="p-2 text-left font-medium">Application date</th>
                      <th className="p-2 text-right font-medium">Application records</th>
                    </tr>
                  </thead>
                  <tbody className="divide-border/40 divide-y">
                    {dailyCounts.map((day) => (
                      <tr key={day.date} className="hover:bg-muted/30">
                        <td className="p-2 font-mono text-[13px]">
                          <button
                            type="button"
                            className="text-primary cursor-pointer font-medium hover:underline"
                            aria-label={`Show applications on ${day.date}`}
                            onClick={() => {
                              setDateFrom(day.date);
                              setDateTo(day.date);
                            }}
                          >
                            {day.date}
                          </button>
                        </td>
                        <td className="p-2 text-right font-mono font-medium">{day.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-muted-foreground p-2 text-[13px]">
                  No dated applications match these filters.
                </p>
              )}
            </div>
          </details>
        </div>
        {filteredSubmissions.some((row) => !row.submission_date) && (
          <p className="text-muted-foreground text-[11px]">
            Applications without a recorded date are included in the total only when no date filter
            is selected.
          </p>
        )}
      </section>

      {/* THE CENTRAL EXCEL-REPLACEMENT SUBMISSIONS TABLE */}
      <div className="border-border/70 bg-card overflow-hidden rounded-[16px] border">
        <div className="border-border/60 bg-muted/20 text-muted-foreground flex items-center justify-between border-b p-3.5 text-[13px]">
          <div>
            Showing{' '}
            <strong className="text-foreground font-medium">{filteredSubmissions.length}</strong>{' '}
            of <strong>{submissions.length}</strong> submissions
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-[13px] select-none">
            <input
              type="checkbox"
              checked={showDetails}
              onChange={(event) => setShowDetails(event.target.checked)}
              className="border-border text-primary focus:ring-primary/20 rounded"
            />
            Show vendor, rate and notes
          </label>
        </div>

        <div className="overflow-x-auto">
          <Table
            className={`submissions-table min-w-[1250px] ${showDetails ?'show-details' : ''}`}
          >
            <TableHeader className="bg-muted/40 border-border/60 border-b">
              <TableRow>
                {false && (
                  <TableHead
                    data-col="candidate"
                    className="text-muted-foreground w-[180px] text-[11px] leading-tight font-medium whitespace-normal"
                  >
                    Candidate
                  </TableHead>
                )}
                <TableHead
                  data-col="client"
                  className="text-muted-foreground w-[200px] text-[11px] leading-tight font-medium whitespace-normal"
                >
                  End Client &amp; Role
                </TableHead>
                <TableHead
                  data-col="resume"
                  className="text-muted-foreground w-[220px] text-[11px] leading-tight font-medium whitespace-normal"
                >
                  Applied resume &amp; answers
                </TableHead>
                <TableHead
                  data-col="rtr"
                  className="text-muted-foreground w-[160px] text-[11px] leading-tight font-medium whitespace-normal"
                >
                  RTR Document
                </TableHead>
                <TableHead
                  data-col="vendor"
                  className="text-muted-foreground w-[180px] text-[11px] leading-tight font-medium whitespace-normal"
                >
                  Vendor &amp; Recruiter
                </TableHead>
                <TableHead
                  data-col="rate"
                  className="text-muted-foreground w-[110px] text-[11px] leading-tight font-medium whitespace-normal"
                >
                  Rate
                </TableHead>
                <TableHead
                  data-col="date"
                  className="text-muted-foreground w-[110px] text-[11px] leading-tight font-medium whitespace-normal"
                >
                  Date
                </TableHead>
                <TableHead
                  data-col="stage"
                  className="text-muted-foreground w-[220px] text-[11px] leading-tight font-medium whitespace-normal"
                >
                  Recruiting stage &amp; capture
                </TableHead>
                <TableHead
                  data-col="interview"
                  className="text-muted-foreground w-[220px] text-[11px] leading-tight font-medium whitespace-normal"
                >
                  Interview / Schedule / Notes
                </TableHead>
                <TableHead
                  data-col="actions"
                  className="text-muted-foreground w-[90px] text-right text-[11px] leading-tight font-medium whitespace-normal"
                >
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-border/50 divide-y">
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-muted-foreground h-32 text-center">
                    <WorkspaceSkeleton rows={4} />
                  </TableCell>
                </TableRow>
              ) : filteredSubmissions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-muted-foreground h-32 text-center text-[13px]">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <BriefcaseIcon className="text-muted-foreground/60 size-6" />
                      <span>No job submissions match your filter criteria.</span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedStatusTab('all');
                          setSearchQuery('');
                          setSelectedCandidateFilter('all');
                        }}
                        className="mt-1 cursor-pointer text-[13px]"
                      >
                        Reset Filters
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredSubmissions.map((sub) => {
                  const candidateName = sub.candidate?.full_name || 'Not recorded';
                  const visaStatus = sub.candidate?.visa_status || 'Not recorded';

                  return (
                    <TableRow key={sub.id} className="hover:bg-muted/30 transition-colors">
                      {/* Candidate Column */}
                      {false && (
                        <TableCell data-col="candidate" className="py-3.5 align-top">
                          <div className="flex items-start gap-2.5">
                            <div className="bg-surface-sunken text-muted-foreground border-border mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[8px] border text-[11px] font-medium">
                              {candidateName.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="text-foreground text-[13px] leading-snug font-medium">
                                {candidateName}
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                <Badge
                                  variant="outline"
                                  className="border-border bg-muted px-1.5 py-0 text-[11px] font-medium text-muted-foreground"
                                >
                                  {visaStatus}
                                </Badge>
                                <span className="text-muted-foreground max-w-[110px] truncate text-[11px]">
                                  {sub.candidate?.target_job_titles || 'Not recorded'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </TableCell>
                      )}

                      {/* Company & Role */}
                      <TableCell data-col="client" className="py-3.5 align-top">
                        <div className="text-foreground flex items-center gap-1.5 text-[13px] font-medium">
                          <div className="bg-surface-sunken text-muted-foreground flex size-5 shrink-0 items-center justify-center rounded">
                            <Building2Icon className="size-3" />
                          </div>
                          <span className="font-medium">{sub.company_name}</span>
                          {sub.duplicate_flag && (
                            <Badge
                              variant="destructive"
                              className="h-4 px-1 py-0 text-[11px]"
                              title="Flagged: Candidate submitted to this company within last 30 days"
                            >
                              Duplicate
                            </Badge>
                          )}
                        </div>
                        <div className="text-muted-foreground mt-0.5 line-clamp-1 text-[11px] font-medium">
                          {sub.job_title}
                        </div>
                        {sub.capture_status === 'confirmed' && (
                          <Badge
                            variant="outline"
                            className="mt-1 border-primary/20 bg-primary/10 text-[11px] text-primary"
                          >
                            Email confirmed
                          </Badge>
                        )}
                        <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
                          <Badge
                            variant="secondary"
                            className="h-4 px-1.5 py-0 text-[11px] font-medium"
                          >
                            {sub.portal_source || 'Not recorded'}
                          </Badge>
                          {sub.source_type && (
                            <Badge
                              variant="outline"
                              className="flex h-4 items-center gap-1 px-1.5 py-0 text-[11px] font-medium"
                              style={
                                sub.source_type === 'extension'
                                  ? {
                                      backgroundColor: 'rgba(59, 130, 246, 0.1)',
                                      borderColor: 'rgba(59, 130, 246, 0.3)',
                                      color: '#3b82f6',
                                    }
                                  : {
                                      backgroundColor: 'rgba(139, 92, 246, 0.1)',
                                      borderColor: 'rgba(139, 92, 246, 0.3)',
                                      color: '#8b5cf6',
                                    }
                              }
                            >
                              {sub.source_type === 'extension' ? (
                                <>
                                  <GlobeIcon className="size-3" />
                                  Extension
                                </>
                              ) : (
                                <>
                                  <Building2Icon className="size-3" />
                                  Portal
                                </>
                              )}
                            </Badge>
                          )}
                          {Boolean(sub.portal_source?.toLowerCase().includes('outside')) && (
                            <Badge
                              variant="outline"
                              className="h-4 border-border bg-muted px-1.5 py-0 text-[11px] font-medium text-muted-foreground"
                            >
                              Outside Portal
                            </Badge>
                          )}
                          <span>{sub.job_location || 'Not recorded'}</span>
                          {sub.job_url && (
                            <a
                              href={sub.job_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary flex items-center gap-0.5 font-medium hover:underline"
                            >
                              Link <ExternalLinkIcon className="size-2.5" />
                            </a>
                          )}
                        </div>
                      </TableCell>

                      <TableCell data-col="resume" className="py-3.5 align-top">
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
                      <TableCell data-col="rtr" className="py-3.5 align-top">
                        <RTRBadge
                          rtrDocument={sub.rtr_document}
                          candidateName={candidateName}
                          companyName={sub.company_name}
                          jobTitle={sub.job_title}
                        />
                      </TableCell>

                      {/* Vendor & Recruiter */}
                      <TableCell data-col="vendor" className="py-3.5 align-top text-[13px]">
                        <div className="text-foreground font-medium">
                          {sub.vendor_company || 'Not recorded'}
                        </div>
                        {sub.vendor_contact_name && (
                          <div className="text-muted-foreground mt-0.5 text-[11px]">
                            {sub.vendor_contact_name}
                          </div>
                        )}
                        <div className="text-muted-foreground mt-1 flex flex-col gap-0.5 text-[11px]">
                          {sub.vendor_contact_email && (
                            <span className="flex max-w-[150px] items-center gap-1 truncate">
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
                      <TableCell data-col="rate" className="py-3.5 align-top text-[13px]">
                        <div className="text-foreground font-mono font-medium">
                          {sub.submitted_rate || 'Not recorded'}
                        </div>
                        {sub.client_pay_rate && (
                          <div className="text-muted-foreground font-mono text-[11px]">
                            Client: {sub.client_pay_rate}
                          </div>
                        )}
                      </TableCell>

                      {/* Date */}
                      <TableCell
                        data-col="date"
                        className="text-muted-foreground py-3.5 align-top font-mono text-[13px] whitespace-nowrap"
                      >
                        {sub.submission_date}
                      </TableCell>

                      {/* Status */}
                      <TableCell data-col="stage" className="py-3.5 align-top">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveSubmissionForStatus(sub);
                            setStatusDialogOpen(true);
                          }}
                          className="inline-block cursor-pointer text-left transition-opacity hover:opacity-80"
                          title="Click to update status stage"
                        >
                          {getStatusBadge(sub.status)}
                        </button>
                        <div className="mt-2.5">
                          <CaptureState
                            state={sub.capture_status}
                            confirmedAt={sub.email_confirmed_at}
                          />
                        </div>
                      </TableCell>

                      {/* Interview & Notes */}
                      <TableCell data-col="interview" className="py-3.5 align-top text-[13px]">
                        {sub.interview_time ? (
                          <div className="border-border/80 bg-muted/40 mb-1.5 rounded-[12px] border p-2.5 text-[13px]">
                            <div className="text-foreground flex items-center gap-1.5 font-medium">
                              <CalendarIcon className="text-primary size-3.5" />
                              {new Date(sub.interview_time).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                              })}{' '}
                              at{' '}
                              {new Date(sub.interview_time).toLocaleTimeString(undefined, {
                                hour: 'numeric',
                                minute: '2-digit',
                              })}
                            </div>
                            <div className="text-muted-foreground mt-1 flex items-center justify-between gap-1 text-[11px]">
                              <span>Mode: {sub.interview_mode || 'Not recorded'}</span>
                              {sub.interview_meeting_link && (
                                <a
                                  href={sub.interview_meeting_link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary flex items-center gap-0.5 font-medium hover:underline"
                                >
                                  Join <ExternalLinkIcon className="size-2.5" />
                                </a>
                              )}
                            </div>
                          </div>
                        ) : null}

                        {(() => {
                          const cleanNotes = sub.notes
                            ? sub.notes
                                .replace(/\[ATS Match:[^\]]*\]/gi, '')
                                .replace(/Matched:[^•|\n]*/gi, '')
                                .replace(/Missing:[^•|\n]*/gi, '')
                                .replace(/[•|]/g, '')
                                .trim()
                            : '';
                          return cleanNotes ? (
                            <p className="text-muted-foreground line-clamp-2 text-[11px]">
                              &quot;{cleanNotes}&quot;
                            </p>
                          ) : (
                            <span className="text-muted-foreground/60 text-[11px]">No notes</span>
                          );
                        })()}
                      </TableCell>

                      {/* Actions */}
                      <TableCell data-col="actions" className="py-3.5 text-right align-top">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setActiveSubmissionForStatus(sub);
                              setStatusDialogOpen(true);
                            }}
                            className="border-border/70 hover:border-primary/40 hover:bg-primary/5 hover:text-primary h-7 cursor-pointer rounded-[10px] px-2.5 text-[11px] font-medium transition-colors"
                            title="Update Status"
                          >
                            Stage
                          </Button>
                          <Link href={`/dashboard/submissions/${sub.id}/edit`}>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-muted-foreground hover:text-foreground size-7 cursor-pointer rounded-[10px] p-0"
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
                            className="text-destructive/70 hover:text-destructive hover:bg-destructive/10 size-7 cursor-pointer rounded-[10px] p-0"
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
