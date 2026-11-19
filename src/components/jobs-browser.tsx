'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import { useApplicationRealtime } from '@/hooks/use-application-realtime';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useUserProfile } from '@/hooks/use-user-profile';
import type { Candidate } from '@/types/database';
import { getCandidates } from '@/lib/candidates';
import type { StoredJob, NormalizedJob } from '@/lib/jobs/types';
import { JobRoster } from '@/components/job-roster';
import { WorkspaceSkeleton } from '@/components/workspace-ui';
import { JobDates } from '@/components/job-dates';
import { PublicJobCatalog } from '@/components/public-job-catalog';
import { AppliedJobsList } from '@/components/applied-jobs-list';
import {
  applicationLaunchUrl,
  withoutAppliedJobs,
  type AppliedJobsResponse,
} from '@/lib/jobs/application-state';
import { extractCompleteJobDetails, extractJobSkills } from '@/lib/jobs/skills-extractor';
import { sanitizeJobHtml } from '@/lib/html-sanitizer';
import { CompanyLogo } from '@/components/company-logo';
import { SkillBadge } from '@/components/skill-badge';
import { SkillMatcherDialog } from '@/components/skill-matcher-dialog';
import type { SupportedJobProvider } from '@/lib/public-directory';
import {
  Search,
  MapPin,
  Building2,
  ExternalLink,
  Wand2,
  Layers,
  Filter,
  CheckCircle2,
  AlertCircle,
  Briefcase,
  Globe,
  Clock,
  ArrowUpRight,
  Send,
  FileCheck,
  ChevronRight,
  X,
  RefreshCw,
  Download,
  Bell,
} from 'lucide-react';

interface LiveJob extends NormalizedJob {
  provider: SupportedJobProvider;
  board_slug: string;
  match_reasons?: string[];
}

type Recommendation = {
  enabled: boolean;
  requiresProfile: boolean;
  candidateId: string | null;
  candidateName: string | null;
};

type Source = {
  id: string;
  provider: string;
  company: string;
  board_slug: string;
  health: string;
  error: string | null;
  enabled: boolean;
  last_success_at: string | null;
};

export function JobsBrowser({ provider }: { provider?: string }) {
  const router = useRouter();
  const [importingJob, setImportingJob] = useState('');
  const [applyingJobHash, setApplyingJobHash] = useState('');
  const { isCandidate, loading: profileLoading } = useUserProfile();
  const canSelectCandidate = false;
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [candidateId, setCandidateId] = useState('');
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const applicationCandidateId = recommendation?.candidateId || candidateId || candidates[0]?.id;
  const [dbLoading, setDbLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const liveRequest = useRef(0);
  const candidateParam = candidateId ? '&candidateId=' + encodeURIComponent(candidateId) : '';

  // Mode: 'db' (fast, cached in database) vs 'live' (direct fetch from ATS)
  const [mode, setMode] = useState<'live' | 'db'>('db');
  const [applicationView, setApplicationView] = useState<'available' | 'applied'>('available');
  const [appliedData, setAppliedData] = useState<AppliedJobsResponse | null>(null);
  const [appliedLoading, setAppliedLoading] = useState(false);

  // Live Mode states
  const [liveJobs, setLiveJobs] = useState<LiveJob[]>([]);
  const [liveBoard, setLiveBoard] = useState('');
  const [liveProvider, setLiveProvider] = useState<string>(provider || 'all');
  const [liveLoading, setLiveLoading] = useState(false);
  const [saveToDbOnFetch, setSaveToDbOnFetch] = useState(false);
  const [syncingSoftwareJobs, setSyncingSoftwareJobs] = useState(false);
  const attemptedCatalogBootstrap = useRef(false);
  const catalogSyncInFlight = useRef(false);
  const [lastFetchedTime, setLastFetchedTime] = useState<string | null>(null);
  const [liveSources, setLiveSources] = useState<
    { company: string; count: number; error?: string }[]
  >([]);

  // Database Mode states
  const [dbJobs, setDbJobs] = useState<StoredJob[]>([]);
  const [dbSources, setDbSources] = useState<Source[]>([]);
  const [dbTotal, setDbTotal] = useState(0);
  const [dbPage, setDbPage] = useState(0);
  const [dbMore, setDbMore] = useState(false);

  // Master-Detail Selected Job State (Jobright style)
  const [selectedDbJob, setSelectedDbJob] = useState<StoredJob | null>(null);
  const [selectedLiveJob, setSelectedLiveJob] = useState<LiveJob | null>(null);
  const [matcherOpen, setMatcherOpen] = useState(false);

  // Shared filters
  const [search, setSearch] = useState('');
  const [portalFilter, setPortalFilter] = useState(provider || '');
  const [companyFilter, setCompanyFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [postedWithin, setPostedWithin] = useState('30');
  const savedFilters = new URLSearchParams({
    company: companyFilter,
    location: locationFilter,
    postedWithin,
  });
  if (provider || portalFilter) savedFilters.set('provider', provider || portalFilter);
  const savedFilterParam = '&' + savedFilters.toString();
  const [employmentType, setEmploymentType] = useState('all');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const selected = params.get('candidateId');
    if (selected) queueMicrotask(() => setCandidateId(selected));
    // Seed the existing filters from the URL so the workspace search bar lands here.
    const term = params.get('q');
    if (term) queueMicrotask(() => setSearch(term));
    const company = params.get('company');
    if (company) queueMicrotask(() => setCompanyFilter(company));
  }, []);

  // Sync all configured software jobs to database
  const syncSoftwareJobs = useCallback(
    async (bootstrap = false) => {
      if (catalogSyncInFlight.current) return;
      catalogSyncInFlight.current = true;
      setSyncingSoftwareJobs(true);
      setError('');
      setNotice('');
      try {
        const filters = bootstrap
          ? ''
          : `&postedWithin=${postedWithin}${provider || portalFilter ? '&provider=' + encodeURIComponent(provider || portalFilter) : ''}`;
        const res = await api<{ persistedCount: number; sources?: { error?: string }[] }>(
          `/api/jobs/live?saveToDb=true&summary=true${filters}`
        );
        setNotice(
          res.persistedCount > 0
            ? 'Public jobs refreshed and saved.'
            : 'No jobs were saved. Review source errors or try another public board.'
        );
        const failures = res.sources?.flatMap((source) => (source.error ? [source.error] : []));
        if (failures?.length) setError(failures.join(' '));
        // Refresh DB jobs
        setDbPage(0);
        setReload((v) => v + 1);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        catalogSyncInFlight.current = false;
        setSyncingSoftwareJobs(false);
      }
    },
    [portalFilter, postedWithin, provider]
  );

  const handleApplyDirectly = async (job: LiveJob | StoredJob) => {
    if (!applicationCandidateId) {
      setError('Set up your candidate profile before starting a tracked application.');
      return;
    }
    const tab = window.open('about:blank', '_blank');
    if (!tab) {
      setError('Allow pop-ups for this workspace to open the application.');
      return;
    }
    tab.opener = null;
    const isStored = 'id' in job;
    const contentHash = isStored ? (job as StoredJob).id : (job as LiveJob).content_hash;
    setApplyingJobHash(contentHash);
    try {
      let targetJobId = '';
      if (!isStored) {
        const live = job as LiveJob;
        const result = await api<{ jobId: string }>('/api/jobs/import', {
          method: 'POST',
          body: JSON.stringify({
            provider: live.provider,
            board: live.board_slug,
            externalId: live.external_id,
          }),
        });
        targetJobId = result.jobId;
      } else {
        targetJobId = (job as StoredJob).id;
      }

      const { intent } = await api<{ intent: { id: string; job: { application_url: string } } }>(
        '/api/application-intents',
        {
          method: 'POST',
          body: JSON.stringify({ candidateId: applicationCandidateId, jobId: targetJobId }),
        }
      );
      tab.location.href = applicationLaunchUrl(intent.job.application_url, intent.id);
      setError('');
    } catch (error) {
      tab.close();
      setError((error as Error).message);
    } finally {
      setApplyingJobHash('');
    }
  };

  // Fetch Live Jobs directly from ATS, saving to DB when requested
  const fetchLiveJobs = useCallback(
    async (customBoard?: string, customProvider?: string) => {
      const requestId = ++liveRequest.current;
      setLiveLoading(true);
      setError('');
      try {
        const boardToUse = customBoard !== undefined ? customBoard : liveBoard;
        const provToUse = customProvider || liveProvider;

        const query = new URLSearchParams();
        if (candidateId) query.set('candidateId', candidateId);
        if (provToUse) query.set('provider', provToUse);
        if (boardToUse.trim()) query.set('board', boardToUse.trim());
        if (employmentType) query.set('type', employmentType);
        query.set('postedWithin', postedWithin);
        if (search.trim()) query.set('search', search.trim());
        if (companyFilter.trim()) query.set('company', companyFilter.trim());
        if (locationFilter.trim()) query.set('location', locationFilter.trim());
        if (saveToDbOnFetch) query.set('saveToDb', 'true');

        const res = await api<{
          jobs: LiveJob[];
          total: number;
          fetchedAt: string;
          persistedInDb: boolean;
          recommendation: Recommendation;
          sources?: { company: string; count: number; error?: string }[];
        }>(`/api/jobs/live?${query.toString()}`);

        if (requestId !== liveRequest.current) return;
        setRecommendation(res.recommendation);
        setLiveJobs(res.jobs || []);
        if (res.jobs?.length > 0) {
          setSelectedLiveJob(res.jobs[0]);
        } else {
          setSelectedLiveJob(null);
        }
        setLiveSources(res.sources || []);
        setLastFetchedTime(new Date(res.fetchedAt).toLocaleTimeString());
        const failures = res.sources?.flatMap((source) => (source.error ? [source.error] : []));
        if (failures?.length) setError(failures.join(' '));
        if (saveToDbOnFetch && res.persistedInDb) {
          setNotice(` Pulled ${res.jobs.length} software jobs and stored them in the database!`);
          void api<{
            jobs: StoredJob[];
            total: number;
            hasMore: boolean;
            recommendation: Recommendation;
          }>(
            `/api/jobs?type=${employmentType}&search=${encodeURIComponent(search)}&page=0${
              savedFilterParam + candidateParam
            }`
          )
            .then((dbRes) => {
              if (requestId !== liveRequest.current) return;
              setDbJobs(dbRes.jobs);
              setDbTotal(dbRes.total);
              setDbMore(dbRes.hasMore);
              if (dbRes.jobs.length > 0) setSelectedDbJob(dbRes.jobs[0]);
            })
            .catch(() => {});
        }
      } catch (err) {
        if (requestId !== liveRequest.current) return;
        setError((err as Error).message);
      } finally {
        if (requestId === liveRequest.current) setLiveLoading(false);
      }
    },
    [
      liveBoard,
      liveProvider,
      employmentType,
      search,
      saveToDbOnFetch,
      candidateId,
      candidateParam,
      companyFilter,
      locationFilter,
      savedFilterParam,
      postedWithin,
    ]
  );

  // Initial load for live jobs
  useEffect(() => {
    const request = liveRequest;
    const timer = setTimeout(() => {
      if (!profileLoading && mode === 'live' && applicationView === 'available')
        void fetchLiveJobs();
    }, 0);
    return () => {
      clearTimeout(timer);
      request.current++;
    };
  }, [mode, fetchLiveJobs, profileLoading, applicationView]);

  // Load database jobs if in DB mode
  useEffect(() => {
    if (mode !== 'db' || profileLoading || applicationView !== 'available') return;
    let active = true;
    queueMicrotask(() => {
      if (active) setDbLoading(true);
    });
    api<{
      jobs: StoredJob[];
      total: number;
      hasMore: boolean;
      recommendation: Recommendation;
      catalogEmpty: boolean;
    }>(
      `/api/jobs?type=${employmentType}&search=${encodeURIComponent(search)}&page=${dbPage}${
        savedFilterParam + candidateParam
      }`
    )
      .then((r) => {
        if (active) {
          setRecommendation(r.recommendation);
          setDbJobs(r.jobs);
          setDbTotal(r.total);
          setDbMore(r.hasMore);
          if (r.jobs.length > 0) {
            setSelectedDbJob((prev) =>
              prev && r.jobs.some((j) => j.id === prev.id) ? prev : r.jobs[0]
            );
          } else {
            setSelectedDbJob(null);
          }
          setError('');
          if (r.catalogEmpty && !attemptedCatalogBootstrap.current) {
            attemptedCatalogBootstrap.current = true;
            void syncSoftwareJobs(true);
          }
        }
      })
      .catch((e) => active && setError(e.message))
      .finally(() => {
        if (active) setDbLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    mode,
    employmentType,
    search,
    dbPage,
    savedFilterParam,
    candidateParam,
    profileLoading,
    reload,
    applicationView,
    syncSoftwareJobs,
  ]);

  // Live mode: fetch applied keys and filter live jobs on initial load and reload
  useEffect(() => {
    if (mode !== 'live' || applicationView !== 'available') return;
    let active = true;
    void api<AppliedJobsResponse>(`/api/jobs/applications?page=0${candidateParam}`)
      .then((data) => {
        if (active) setLiveJobs((jobs) => withoutAppliedJobs(jobs, data.appliedKeys));
      })
      .catch((error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, [mode, applicationView, candidateParam, reload]);

  useEffect(() => {
    if (profileLoading || applicationView !== 'applied') return;
    let active = true;
    queueMicrotask(() => {
      if (active) {
        setAppliedLoading(true);
        setAppliedData(null);
      }
    });
    void api<AppliedJobsResponse>(
      `/api/jobs/applications?type=${employmentType}&search=${encodeURIComponent(search)}&page=${dbPage}${savedFilterParam + candidateParam}`
    )
      .then((data) => {
        if (active) {
          setAppliedData(data);
          setError('');
        }
      })
      .catch((error) => {
        if (active) setError(error.message);
      })
      .finally(() => {
        if (active) setAppliedLoading(false);
      });
    return () => {
      active = false;
    };
  }, [
    profileLoading,
    applicationView,
    employmentType,
    search,
    dbPage,
    savedFilterParam,
    candidateParam,
    reload,
  ]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') setReload((value) => value + 1);
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  useApplicationRealtime(
    () => setReload((value) => value + 1),
    isCandidate && !profileLoading,
    applicationCandidateId
  );

  // Load the candidate's own confirmed profile.
  useEffect(() => {
    if (canSelectCandidate) {
      void getCandidates()
        .then((items) => setCandidates(items.filter((c) => c.provenance_status === 'confirmed')))
        .catch((e) => setError(e.message));
    }
  }, [canSelectCandidate]);

  // Active selected detail data
  const activeJob =
    mode === 'db'
      ? (dbJobs.find((job) => job.id === selectedDbJob?.id) ?? dbJobs[0])
      : (liveJobs.find((job) => job.content_hash === selectedLiveJob?.content_hash) ?? liveJobs[0]);
  const activeExtracted = activeJob?.description
    ? extractCompleteJobDetails(activeJob.description, activeJob.title)
    : null;

  return (
    <main className="mx-auto max-w-[1600px] space-y-4 p-4 sm:p-6">
      {/* Top Header & Mode Toggle */}
      <div className="border-border/70 flex flex-col items-start justify-between gap-4 border-b pb-4 sm:flex-row sm:items-center">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-foreground text-[20px] font-medium tracking-tight sm:text-[24px]">
              {provider ? provider.toUpperCase() + ' Roles' : 'Discover Opportunities'}
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-[6px] border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[13px] font-medium text-primary">
              <span className="size-1.5 rounded-full bg-primary" />
              Verified Tech Roles
            </span>
            <Badge
              variant="outline"
              className="border-border/70 rounded-[6px] px-2 py-0.5 text-[13px] font-medium capitalize"
            >
              {isCandidate ? 'Candidate Mode' : 'All Openings'}
            </Badge>
          </div>
          <p className="text-muted-foreground text-[13px] sm:text-[13px]">
            Curated software & tech roles directly from verified company ATS boards.
          </p>
        </div>

        {/* View Mode Switcher */}
        <div className="bg-muted/60 border-border/70 inline-flex items-center rounded-[12px] border p-1">
          <Button
            size="sm"
            variant={mode === 'db' ? 'default' : 'ghost'}
            onClick={() => {
              setMode('db');
              setApplicationView('available');
              setDbPage(0);
            }}
            className={`h-8 rounded-[10px] px-3.5 text-[13px] font-medium transition-colors ${
 mode ==='db'
                ? 'bg-background text-foreground font-medium '
                : 'text-muted-foreground hover:text-foreground hover:bg-background/40'
            }`}
          >
            Saved Catalog{' '}
            <span className="ml-1.5 font-mono text-[11px] tabular-nums opacity-80">
              ({dbTotal})
            </span>
          </Button>
          <Button
            size="sm"
            variant={mode === 'live' ? 'default' : 'ghost'}
            onClick={() => {
              setLiveProvider(provider || portalFilter || 'all');
              setLiveBoard('');
              setMode('live');
              setApplicationView('available');
              setDbPage(0);
            }}
            className={`h-8 rounded-[10px] px-3.5 text-[13px] font-medium transition-colors ${
 mode ==='live'
                ? 'bg-background text-foreground font-medium '
                : 'text-muted-foreground hover:text-foreground hover:bg-background/40'
            }`}
          >
            Live ATS Fetch
          </Button>
        </div>
      </div>

      {/* Available / Applied Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="bg-card border-border/70 inline-flex items-center rounded-[12px] border p-1">
          <button
            type="button"
            onClick={() => {
              setApplicationView('available');
              setDbPage(0);
              setAppliedData(null);
            }}
            className={`flex cursor-pointer items-center gap-2 rounded-[10px] px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
 applicationView ==='available'
                ? 'bg-primary text-primary-foreground '
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Briefcase className="size-3.5" />
            <span>Available Roles</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setApplicationView('applied');
              setDbPage(0);
            }}
            className={`flex cursor-pointer items-center gap-2 rounded-[10px] px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
 applicationView ==='applied'
                ? 'bg-primary text-primary-foreground '
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <CheckCircle2 className="size-3.5" />
            <span>Applied Jobs</span>
          </button>
        </div>

        {/* Sync Software Jobs / Refresh Button */}
        {(mode === 'db' || applicationView === 'applied') && applicationView === 'available' && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDbPage(0);
                setReload((v) => v + 1);
              }}
              className="border-border/80 h-8 gap-1.5 rounded-[10px] text-[13px] font-medium"
            >
              <RefreshCw className="size-3" />
              <span>Refresh</span>
            </Button>
            <Button
              size="sm"
              onClick={() => void syncSoftwareJobs()}
              disabled={syncingSoftwareJobs}
              className="h-8 gap-1.5 rounded-[10px] bg-primary text-[13px] font-medium text-white hover:bg-emerald-700"
            >
              <Download className="size-3" />
              <span>{syncingSoftwareJobs ? 'Pulling...' : 'Sync Software Jobs'}</span>
            </Button>
          </div>
        )}
      </div>

      {/* SEARCH & FILTERS BAR (Jobright Style Clean Filter Strip) */}
      <section className="border-border/70 bg-card space-y-3 rounded-[16px] border p-4">
        <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-12">
          {/* Main Keyword Search */}
          <div className="relative sm:col-span-4">
            <Search className="text-muted-foreground absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
            <Input
              aria-label="Search jobs"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setDbPage(0);
              }}
              placeholder="Search by job title, role or keywords..."
              className="bg-background border-border/80 h-10 rounded-[12px] pl-10 text-[13px] font-medium sm:text-[13px]"
            />
          </div>

          {/* Location Filter */}
          <div className="relative sm:col-span-3">
            <MapPin className="text-muted-foreground absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
            <Input
              aria-label="Filter by location"
              value={locationFilter}
              onChange={(e) => {
                setLocationFilter(e.target.value);
                setDbPage(0);
              }}
              placeholder="City, state or remote..."
              className="bg-background border-border/80 h-10 rounded-[12px] pl-10 text-[13px] font-medium sm:text-[13px]"
            />
          </div>

          {/* Company Filter */}
          <div className="relative sm:col-span-2">
            <Building2 className="text-muted-foreground absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
            <Input
              aria-label="Filter by company"
              value={companyFilter}
              onChange={(e) => {
                setCompanyFilter(e.target.value);
                setDbPage(0);
              }}
              placeholder="Company name..."
              className="bg-background border-border/80 h-10 rounded-[12px] pl-10 text-[13px] font-medium sm:text-[13px]"
            />
          </div>

          {/* Employment Type Dropdown */}
          <div className="flex items-center gap-2 sm:col-span-3">
            <select
              aria-label="Employment type"
              className="border-border/80 bg-background focus:ring-primary/20 focus:border-primary h-10 w-full rounded-[12px] border px-3 text-[13px] font-medium focus:ring-2 focus:outline-none sm:text-[13px]"
              value={employmentType}
              onChange={(e) => {
                setEmploymentType(e.target.value);
                setDbPage(0);
              }}
            >
              <option value="all">All Employment Types</option>
              <option value="contract">Contract (C2C/W2)</option>
              <option value="permanent">Permanent / Full-time</option>
              <option value="temporary">Temporary</option>
              <option value="part_time">Part-time</option>
              <option value="internship">Internship</option>
            </select>
          </div>
        </div>

        {/* Secondary Filter Pills */}
        <div className="border-border/50 flex flex-wrap items-center gap-2 border-t pt-2 text-[13px]">
          <span className="text-muted-foreground text-[11px] font-medium">
            Filters:
          </span>

          {/* Date Posted Filter */}
          <select
            aria-label="Posted within"
            disabled={applicationView === 'applied'}
            className="border-border/80 bg-background focus:ring-primary h-8 rounded-[10px] border px-2.5 text-[13px] font-medium focus:ring-1 focus:outline-none"
            value={postedWithin}
            onChange={(e) => {
              setPostedWithin(e.target.value);
              setDbPage(0);
            }}
          >
            <option value="7">Posted: Last 7 days</option>
            <option value="30">Posted: Last 30 days</option>
            <option value="90">Posted: Last 90 days</option>
            <option value="all">Posted: Any time</option>
          </select>

          {/* Portal Filter */}
          <select
            aria-label="Filter by portal"
            className="border-border/80 bg-background focus:ring-primary h-8 rounded-[10px] border px-2.5 text-[13px] font-medium focus:ring-1 focus:outline-none"
            value={provider || portalFilter}
            disabled={Boolean(provider)}
            onChange={(e) => {
              setPortalFilter(e.target.value);
              setCompanyFilter('');
              setDbPage(0);
            }}
          >
            <option value="">Portal: All ATS</option>
            <option value="greenhouse">Greenhouse</option>
            <option value="ashby">Ashby</option>
            <option value="lever">Lever</option>
            <option value="smartrecruiters">SmartRecruiters</option>
            <option value="breezy">Breezy HR</option>
            <option value="remoteok">RemoteOK</option>
          </select>

          {mode === 'live' && applicationView === 'available' && (
            <div className="ml-auto flex items-center gap-2">
              <label className="text-muted-foreground flex cursor-pointer items-center gap-1.5 text-[13px] select-none">
                <input
                  type="checkbox"
                  checked={saveToDbOnFetch}
                  onChange={(e) => setSaveToDbOnFetch(e.target.checked)}
                  className="border-border accent-primary rounded"
                />
                <span>Auto-save to database</span>
              </label>
              <Button
                size="sm"
                onClick={() => void fetchLiveJobs()}
                disabled={liveLoading}
                className="h-8 rounded-[10px] px-3 text-[13px] font-medium"
              >
                {liveLoading ? 'Fetching...' : 'Fetch Live'}
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* Messages */}
      {error && (
        <div
          role="alert"
          className="bg-destructive/10 border-destructive/20 text-destructive flex items-center gap-2 rounded-[12px] border p-3 text-[13px]"
        >
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="bg-primary/10 border-primary/20 text-primary flex items-center gap-2 rounded-[12px] border p-3 text-[13px]"
        >
          <Wand2 className="size-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* ======================= APPLIED JOBS VIEW ======================= */}
      {applicationView === 'applied' && (
        <section aria-label="Applied jobs" className="space-y-4">
          <AppliedJobsList data={appliedData} loading={appliedLoading} />
          {!!appliedData && !appliedData.requiresCandidate && (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={appliedLoading || !dbPage}
                onClick={() => setDbPage((page) => page - 1)}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={appliedLoading || !appliedData.hasMore}
                onClick={() => setDbPage((page) => page + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </section>
      )}

      {/* ======================= JOBRIGHT MASTER-DETAIL SPLIT SCREEN ======================= */}
      {applicationView === 'available' && (
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
          {/* LEFT COLUMN: SCROLLABLE FEED OF COMPACT CARDS (5 Cols on Large) */}
          <div className="space-y-4 lg:col-span-5">
            {mode === 'db' ? (
              dbLoading ? (
                <WorkspaceSkeleton rows={6} />
              ) : !dbJobs.length ? (
                <div className="border-border/80 bg-card space-y-2 rounded-[16px] border border-dashed p-10 text-center">
                  <Briefcase className="text-muted-foreground/60 mx-auto size-8" />
                  <p className="text-foreground text-[13px] font-medium">
                    {syncingSoftwareJobs ? 'Loading public jobs…' : 'No saved jobs found'}
                  </p>
                  {!syncingSoftwareJobs && (
                    <p className="text-muted-foreground text-[13px]">
                      Try clearing filters or click &quot;Sync Software Jobs&quot; to fetch new
                      roles.
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <JobRoster
                    jobs={dbJobs}
                    candidateId={candidateId}
                    selectedJobId={selectedDbJob?.id}
                    onSelectJob={(job) => setSelectedDbJob(job)}
                  />

                  {/* Pagination */}
                  <div className="flex items-center justify-between px-1 pt-2">
                    <span className="text-muted-foreground text-[13px]">Page {dbPage + 1}</span>
                    <div className="flex items-center gap-2">
                      <Button
                        disabled={!dbPage}
                        size="sm"
                        variant="outline"
                        onClick={() => setDbPage((p) => p - 1)}
                        className="hover:bg-muted h-8 rounded-[10px] px-3 text-[13px] font-medium"
                      >
                        Previous
                      </Button>
                      <Button
                        disabled={!dbMore}
                        size="sm"
                        variant="outline"
                        onClick={() => setDbPage((p) => p + 1)}
                        className="hover:bg-muted h-8 rounded-[10px] px-3 text-[13px] font-medium"
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </>
              )
            ) : /* LIVE JOBS LIST */
            liveLoading ? (
              <div className="text-muted-foreground bg-card rounded-[16px] border p-12 text-center">
                <div className="border-primary mb-2 inline-block h-6 w-6 animate-spin rounded-full border-2 border-t-transparent"></div>
                <p className="text-[13px]">Fetching live postings directly from ATS...</p>
              </div>
            ) : !liveJobs.length ? (
              <div className="bg-card space-y-3 rounded-[16px] border p-10 text-center">
                <p className="text-muted-foreground text-[13px]">
                  {liveBoard ? (
                    <>
                      No live jobs found for board &quot;<strong>{liveBoard}</strong>&quot;.
                    </>
                  ) : (
                    'No live software jobs found across the available company boards.'
                  )}
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[13px]"
                    onClick={() => {
                      setLiveBoard('ramp');
                      setLiveProvider('ashby');
                      setCompanyFilter('');
                    }}
                  >
                    Ramp (Ashby)
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[13px]"
                    onClick={() => {
                      setLiveBoard('figma');
                      setLiveProvider('greenhouse');
                      setCompanyFilter('');
                    }}
                  >
                    Figma (Greenhouse)
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[13px]"
                    onClick={() => {
                      setLiveBoard('openai');
                      setLiveProvider('ashby');
                      setCompanyFilter('');
                    }}
                  >
                    OpenAI (Ashby)
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                {liveJobs.map((job) => {
                  const isSelected = selectedLiveJob?.content_hash === job.content_hash;
                  const liveSkills = extractJobSkills(job.description || '', job.title).slice(0, 4);

                  return (
                    <article
                      key={job.content_hash}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedLiveJob(job)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedLiveJob(job);
                        }
                      }}
                      className={`group relative w-full cursor-pointer rounded-[16px] p-4 text-left transition-colors duration-150 ${
 isSelected
 ?'bg-card border-primary ring-primary/20 border-2 shadow-sm ring-1'
                          : 'bg-card border-border hover:border-input hover:bg-accent/30 border'
                      }`}
                    >
                      <div className="flex items-start gap-3.5">
                        <CompanyLogo company={job.company} size="md" className="mt-0.5 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h3 className="text-foreground group-hover:text-primary line-clamp-1 text-[13px] font-medium transition-colors">
                                {job.title}
                              </h3>
                              <p className="text-muted-foreground mt-0.5 text-[13px] font-medium">
                                {job.company}
                              </p>
                            </div>
                            <span className="text-muted-foreground/80 bg-muted/60 border-border/50 shrink-0 rounded border px-2 py-0.5 text-[11px] font-medium">
                              {job.provider}
                            </span>
                          </div>

                          <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-1.5 text-[13px]">
                            <span className="text-foreground/85 inline-flex items-center gap-1 text-[11px] font-medium">
                              <MapPin className="text-muted-foreground size-3 shrink-0" />
                              <span className="max-w-[170px] truncate">
                                {job.location || 'Remote / Unknown'}
                              </span>
                            </span>
                            <span>·</span>
                            <Badge
                              variant="outline"
                              className="border-border/60 px-1.5 py-0 text-[11px] capitalize"
                            >
                              {job.employment_type.replace('_', ' ')}
                            </Badge>
                          </div>

                          {liveSkills.length > 0 && (
                            <div className="mt-2.5 flex flex-wrap gap-1.5">
                              {liveSkills.map((s) => (
                                <SkillBadge
                                  key={s.name}
                                  name={s.name}
                                  category={s.category}
                                  size="xs"
                                />
                              ))}
                            </div>
                          )}

                          <div className="border-border/40 text-muted-foreground mt-3 flex items-center justify-between border-t pt-2 text-[11px]">
                            <JobDates
                              posted_at={job.posted_at}
                              closes_at={job.closes_at}
                              provider={job.provider}
                            />
                            <span className="text-primary inline-flex items-center gap-0.5 text-[13px] font-medium">
                              View details <ChevronRight className="size-3" />
                            </span>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: DETAIL PREVIEW PANEL (7 Cols on Large, Sticky) */}
          <div className="lg:sticky lg:top-4 lg:col-span-7">
            {activeJob ? (
              <div className="border-border/80 bg-card max-h-[calc(100vh-6rem)] scrollbar-thin space-y-6 overflow-y-auto rounded-[20px] border p-6 shadow-sm">
                {/* Header: Company, Title, Actions */}
                <div className="border-border/70 space-y-4 border-b pb-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <CompanyLogo
                        company={activeJob.company}
                        size="lg"
                        className="shrink-0"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-primary bg-primary/10 border-primary/20 rounded-[8px] border px-2 py-0.5 text-[13px] font-medium">
                            {activeJob.company}
                          </span>
                          <span className="text-muted-foreground text-[13px]">
                            {activeJob.location || 'Remote'}
                          </span>
                        </div>
                        <h2 className="text-foreground mt-1 text-[20px] font-medium tracking-tight sm:text-[24px]">
                          {activeJob.title}
                        </h2>
                      </div>
                    </div>

                    {/* AI Match Trigger Button */}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setMatcherOpen(true)}
                      className="h-9 shrink-0 gap-1.5 rounded-[12px] border-primary/20 bg-primary/10 text-[13px] font-medium text-primary hover:bg-emerald-500/20"
                    >
                      <Wand2 className="size-3.5 text-primary" />
                      <span>Match Fit</span>
                    </Button>
                  </div>

                  {/* Metadata Chips */}
                  <div className="flex flex-wrap items-center gap-2 text-[13px]">
                    <Badge
                      variant="outline"
                      className="border-border/70 bg-muted/20 text-[13px] font-medium capitalize"
                    >
                      {activeJob.employment_type.replace('_', ' ')}
                    </Badge>
                    {'arrangements' in activeJob && activeJob.arrangements?.[0] && (
                      <Badge variant="secondary" className="text-[13px] font-medium">
                        {activeJob.arrangements[0]}
                      </Badge>
                    )}
                    <Badge
                      variant="outline"
                      className="text-muted-foreground font-mono text-[13px]"
                    >
                      {'source' in activeJob && activeJob.source?.provider
                        ? activeJob.source.provider
                        : 'provider' in activeJob
                          ? (activeJob as LiveJob).provider
                          : 'ATS'}
                    </Badge>
                    <div className="text-muted-foreground ml-auto text-[13px]">
                      <JobDates
                        posted_at={activeJob.posted_at}
                        closes_at={activeJob.closes_at}
                        provider={
                          'source' in activeJob
                            ? activeJob.source?.provider
                            : 'provider' in activeJob
                              ? (activeJob as LiveJob).provider
                              : undefined
                        }
                      />
                    </div>
                  </div>

                  {/* Primary Action Buttons */}
                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <Button
                      size="default"
                      disabled={
                        applyingJobHash ===
                        ('id' in activeJob
                          ? (activeJob as StoredJob).id
                          : (activeJob as LiveJob).content_hash)
                      }
                      onClick={() => void handleApplyDirectly(activeJob)}
                      className="bg-primary text-primary-foreground hover:bg-primary/90 h-10 flex-1 gap-1.5 rounded-[12px] text-[13px] font-medium transition-colors sm:text-[13px]"
                    >
                      <span>Apply Directly on Official Portal</span>
                      <ExternalLink className="size-3.5" />
                    </Button>

                    {'id' in activeJob && (
                      <Link
                        href={`/dashboard/jobs/${activeJob.id}${candidateId ? '?candidateId=' + encodeURIComponent(candidateId) : ''}`}
                        className="border-border/80 bg-background text-foreground hover:bg-muted inline-flex h-10 items-center justify-center gap-1.5 rounded-[12px] border px-4 text-[13px] font-medium transition-colors"
                      >
                        <span>Full Page View</span>
                        <ArrowUpRight className="size-3.5" />
                      </Link>
                    )}
                  </div>
                </div>

                {/* Key Skills Ribbon */}
                {activeExtracted && activeExtracted.topTechStack.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-muted-foreground flex items-center gap-1.5 text-[13px] font-medium">
                      <Layers className="text-primary size-3.5" />
                      <span>Required Tech Stack</span>
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {activeExtracted.topTechStack.map((tech) => (
                        <SkillBadge key={tech} name={tech} size="xs" />
                      ))}
                    </div>
                  </div>
                )}

                {/* Core Responsibilities */}
                {activeExtracted && activeExtracted.responsibilities.length > 0 && (
                  <div className="space-y-2.5">
                    <h3 className="text-muted-foreground flex items-center gap-1.5 text-[13px] font-medium">
                      <CheckCircle2 className="size-3.5 text-primary" />
                      <span>Key Responsibilities</span>
                    </h3>
                    <ul className="space-y-2">
                      {activeExtracted.responsibilities.slice(0, 5).map((resp, i) => (
                        <li
                          key={i}
                          className="text-foreground/90 flex items-start gap-2.5 text-[13px] leading-relaxed"
                        >
                          <span className="bg-primary mt-1.5 size-1.5 shrink-0 rounded-full" />
                          <span>{resp}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Qualifications & Must-Haves */}
                {activeExtracted && activeExtracted.mustHaves.length > 0 && (
                  <div className="space-y-2.5">
                    <h3 className="text-muted-foreground flex items-center gap-1.5 text-[13px] font-medium">
                      <Wand2 className="text-primary size-3.5" />
                      <span>Essential Qualifications</span>
                    </h3>
                    <div className="space-y-2">
                      {activeExtracted.mustHaves.slice(0, 4).map((req, i) => (
                        <div
                          key={i}
                          className="border-border/60 bg-muted/15 flex items-start gap-2.5 rounded-[12px] border p-3 text-[13px]"
                        >
                          <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-primary" />
                          <span className="text-foreground leading-snug font-medium">{req}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Full Description Section */}
                <div className="border-border/60 space-y-3 border-t pt-4">
                  <h3 className="text-muted-foreground flex items-center justify-between text-[13px] font-medium">
                    <span>Complete Description</span>
                    <a
                      href={activeJob.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary inline-flex items-center gap-1 font-normal lowercase hover:underline"
                    >
                      <span>open original</span>
                      <ExternalLink className="size-3" />
                    </a>
                  </h3>
                  <div
                    className="jd-prose text-foreground/80 max-h-96 max-w-none scrollbar-thin overflow-y-auto pr-2 text-[13px] leading-relaxed"
                    dangerouslySetInnerHTML={{
                      __html: sanitizeJobHtml(
                        'description_html' in activeJob && activeJob.description_html
                          ? activeJob.description_html
                          : (activeJob.description || '').replace(/\n/g, '<br/>')
                      ),
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="border-border/80 bg-card space-y-2 rounded-[20px] border border-dashed p-12 text-center">
                <Briefcase className="text-muted-foreground/60 mx-auto size-8" />
                <p className="text-foreground text-[13px] font-medium">
                  Select a job to view details
                </p>
                <p className="text-muted-foreground text-[13px]">
                  Click any card from the list to preview responsibilities, requirements, and apply
                  directly.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* AI Skill Matcher Dialog for Preview Panel */}
      {activeJob && (
        <SkillMatcherDialog
          open={matcherOpen}
          onOpenChange={setMatcherOpen}
          job={{
            id: 'id' in activeJob ? activeJob.id : activeJob.external_id,
            title: activeJob.title,
            company: activeJob.company,
            description: activeJob.description,
            location: activeJob.location || undefined,
            url: activeJob.application_url,
          }}
        />
      )}
    </main>
  );
}
