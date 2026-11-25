'use client';

import * as React from 'react';
import Link from 'next/link';
import { useApplicationRealtime } from '@/hooks/use-application-realtime';
import { getSubmissions, deleteSubmission } from '@/lib/submissions';
import { getCandidates } from '@/lib/candidates';
import {
  inSubmissionDateRange,
} from '@/lib/submission-dates';
import type { Candidate, JobSubmission, SubmissionStatus } from '@/types/database';
import { SubmissionStatusDialog } from '@/components/submission-status-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { WorkspaceError, WorkspaceSkeleton } from '@/components/workspace-ui';
import { useUserProfile } from '@/hooks/use-user-profile';
import {
  SendIcon,
  SearchIcon,
  RefreshCwIcon,
  DownloadIcon,
  CalendarIcon,
  ExternalLinkIcon,
  EditIcon,
  Trash2Icon,
  Wand2Icon,
  Building2Icon,
  BriefcaseIcon,
  ClockIcon,
  MailIcon,
} from 'lucide-react';

export default function SubmissionsPage() {
  const { isCandidate } = useUserProfile();
  const [submissions, setSubmissions] = React.useState<JobSubmission[]>([]);
  const submissionRequest = React.useRef(0);
  const [candidates, setCandidates] = React.useState<Candidate[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState('');

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

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr + 'T00:00:00');
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[960px] flex-1 flex-col gap-0 p-4 lg:p-6">
      {/* Page Header — Jobright style */}
      <div className="flex items-center justify-between pb-5">
        <h1 className="text-foreground text-[22px] font-semibold tracking-tight">
          JOBS
        </h1>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="text-muted-foreground hover:text-foreground h-8 cursor-pointer gap-1.5 rounded-lg px-2.5 text-[13px]"
          >
            <RefreshCwIcon className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            className="border-border/70 hover:bg-muted/50 h-8 cursor-pointer gap-1.5 rounded-lg text-[13px]"
          >
            <DownloadIcon className="size-3.5" />
            Export
          </Button>
          <Button
            variant="outline"
            size="sm"
            render={<Link href="/dashboard/email-confirmations" />}
            className="border-border/70 hover:bg-muted/50 h-8 cursor-pointer gap-1.5 rounded-lg text-[13px]"
          >
            <MailIcon className="size-3.5" />
            Manage list
          </Button>
        </div>
      </div>

      {/* Tab Navigation — Jobright style */}
      <div className="border-border/70 flex items-center gap-6 border-b">
        {[
          { id: 'all', label: 'All', count: submissions.length },
          { id: 'Applied', label: 'Applied', count: submissions.filter((s) => s.status === 'Applied').length },
          { id: 'interviews', label: 'Interviews', count: stats.interviews },
          { id: 'offers', label: 'Offers', count: stats.offers },
          { id: 'Rejected', label: 'Rejected', count: submissions.filter((s) => s.status === 'Rejected').length },
        ].map((tab) => {
          const isSelected = selectedStatusTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSelectedStatusTab(tab.id)}
              className={`relative cursor-pointer pb-3 text-[14px] font-medium transition-colors ${
                isSelected
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={`ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold ${
                  isSelected
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {tab.count}
                </span>
              )}
              {isSelected && (
                <span className="bg-primary absolute right-0 bottom-0 left-0 h-[2px] rounded-t" />
              )}
            </button>
          );
        })}
      </div>

      {/* Search bar */}
      <div className="flex items-center gap-3 py-4">
        <div className="relative flex-1">
          <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            aria-label="Search applications"
            placeholder="Search in your applied history"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-muted/40 border-border/60 focus-visible:ring-primary/20 focus-visible:border-primary h-10 rounded-xl pl-10 text-[14px] focus-visible:ring-2"
          />
        </div>
        <Select
          value={selectedPortalFilter}
          onValueChange={(val) => setSelectedPortalFilter(val ?? 'all')}
        >
          <SelectTrigger
            aria-label="Filter by portal"
            className="bg-muted/40 border-border/60 h-10 w-[140px] rounded-xl text-[13px]"
          >
            <SelectValue>
              {selectedPortalFilter === 'all'
                ? 'All portals'
                : portalOptions.find(([value]) => value === selectedPortalFilter)?.[1] ||
                  selectedPortalFilter}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-[13px]">All Portals</SelectItem>
            {portalOptions.map(([value, label]) => (
              <SelectItem key={value} value={value} className="text-[13px]">{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loadError && (
        <WorkspaceError message={loadError}>
          <Button variant="outline" className="mt-2 text-[13px]" onClick={() => void loadData()}>
            Try again
          </Button>
        </WorkspaceError>
      )}

      {/* Column headers — Jobright style */}
      <div className="border-border/60 flex items-center border-b px-4 py-2.5">
        <div className="flex-1 text-[13px] font-medium text-muted-foreground">
          Jobs ({filteredSubmissions.length})
        </div>
        <div className="w-[140px] text-[13px] font-medium text-muted-foreground">
          Applied on
        </div>
        <div className="w-[150px] text-[13px] font-medium text-muted-foreground">
          Status
        </div>
      </div>

      {/* Application list — clean rows */}
      <div className="divide-border/50 divide-y">
        {loading ? (
          <div className="py-16">
            <WorkspaceSkeleton rows={5} />
          </div>
        ) : filteredSubmissions.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <BriefcaseIcon className="text-muted-foreground/40 size-10" />
            <p className="text-muted-foreground text-[14px]">No applications match your filters.</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setSelectedStatusTab('all');
                setSearchQuery('');
                setSelectedCandidateFilter('all');
                setSelectedPortalFilter('all');
                setSelectedSourceFilter('all');
              }}
              className="cursor-pointer rounded-lg text-[13px]"
            >
              Reset Filters
            </Button>
          </div>
        ) : (
          filteredSubmissions.map((sub) => (
            <div
              key={sub.id}
              className="hover:bg-muted/30 group flex items-center px-4 py-4 transition-colors"
            >
              {/* Company logo / initial */}
              <div className="mr-4 flex shrink-0 items-center">
                <div className="bg-muted border-border/70 flex size-10 items-center justify-center rounded-lg border text-[15px] font-semibold text-muted-foreground">
                  {sub.company_name.charAt(0).toUpperCase()}
                </div>
              </div>

              {/* Job details */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-[13px]">{sub.company_name}</span>
                  {sub.duplicate_flag && (
                    <Badge variant="destructive" className="h-4 px-1 py-0 text-[10px]">
                      Duplicate
                    </Badge>
                  )}
                </div>
                <div className="text-foreground mt-0.5 text-[14px] font-medium leading-snug">
                  {sub.job_title}
                </div>
                <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-1.5 text-[12px]">
                  {sub.job_location && (
                    <span>{sub.job_location}</span>
                  )}
                  {sub.job_location && sub.submitted_rate && (
                    <span className="text-border">·</span>
                  )}
                  {sub.submitted_rate && (
                    <span>{sub.submitted_rate}</span>
                  )}
                  {sub.job_url && (
                    <>
                      <span className="text-border">·</span>
                      <a
                        href={sub.job_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary flex items-center gap-0.5 hover:underline"
                      >
                        View <ExternalLinkIcon className="size-2.5" />
                      </a>
                    </>
                  )}
                </div>
              </div>

              {/* Applied date */}
              <div className="w-[140px] shrink-0 text-[13px] text-muted-foreground">
                {sub.submission_date ? formatDate(sub.submission_date) : '—'}
              </div>

              {/* Status + actions */}
              <div className="flex w-[150px] shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveSubmissionForStatus(sub);
                    setStatusDialogOpen(true);
                  }}
                  className="cursor-pointer transition-opacity hover:opacity-80"
                  title="Click to update status"
                >
                  {getStatusBadge(sub.status)}
                </button>
                <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <Link href={`/dashboard/submissions/${sub.id}/edit`}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-foreground size-7 cursor-pointer rounded-lg p-0"
                      aria-label={`Edit ${sub.company_name}`}
                    >
                      <EditIcon className="size-3.5" />
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(sub.id, sub.company_name)}
                    className="text-muted-foreground hover:text-destructive size-7 cursor-pointer rounded-lg p-0"
                    aria-label={`Delete ${sub.company_name}`}
                  >
                    <Trash2Icon className="size-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
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
