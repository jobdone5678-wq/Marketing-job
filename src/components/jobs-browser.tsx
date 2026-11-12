"use client";

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import { createClient } from '@/lib/client';
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
import { withoutAppliedJobs, type AppliedJobsResponse } from '@/lib/jobs/application-state';
import { extractCompleteJobDetails, extractJobSkills } from '@/lib/jobs/skills-extractor';
import { sanitizeJobHtml } from '@/lib/html-sanitizer';
import { CompanyLogo } from '@/components/company-logo';
import { SkillBadge } from '@/components/skill-badge';
import { SkillMatcherDialog } from '@/components/skill-matcher-dialog';
import type { SupportedJobProvider } from '@/lib/public-directory';
import { toast } from 'sonner';
import {
  Search,
  MapPin,
  Building2,
  ExternalLink,
  Sparkles,
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

type Recommendation = { enabled: boolean; requiresProfile: boolean; candidateId: string | null; candidateName: string | null };

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
  const [lastFetchedTime, setLastFetchedTime] = useState<string | null>(null);
  const [liveSources, setLiveSources] = useState<{ company: string; count: number; error?: string }[]>([]);

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
  const savedFilters = new URLSearchParams({ company: companyFilter, location: locationFilter, postedWithin });
  if (provider || portalFilter) savedFilters.set('provider', provider || portalFilter);
  const savedFilterParam = '&' + savedFilters.toString();
  const [employmentType, setEmploymentType] = useState('all');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const selected = new URLSearchParams(window.location.search).get('candidateId');
    if (selected) queueMicrotask(() => setCandidateId(selected));
  }, []);

  // Sync all configured software jobs to database
  const handleSyncSoftwareJobs = async () => {
    setSyncingSoftwareJobs(true);
    setError('');
    setNotice('');
    try {
      const res = await api<{
        jobs: LiveJob[];
        total: number;
        fetchedAt: string;
        persistedInDb: boolean;
        recommendation: Recommendation;
        sources?: { error?: string }[];
      }>(`/api/jobs/live?saveToDb=true&postedWithin=${postedWithin}${provider || portalFilter ? '&provider=' + encodeURIComponent(provider || portalFilter) : ''}`);
      setNotice(res.persistedInDb ? 'Public jobs refreshed and saved. Updating your related roles...' : res.recommendation.requiresProfile ? 'Review and save your resume profile before finding related roles.' : 'No complete refresh was saved. Review source errors or try another public board.');
      const failures = res.sources?.flatMap(source => source.error ? [source.error] : []);
      if (failures?.length) setError(failures.join(' '));
      // Refresh DB jobs
      setDbPage(0);
      setReload(v => v + 1);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSyncingSoftwareJobs(false);
    }
  };

  const handleApplyDirectly = async (job: LiveJob | StoredJob) => {
    const tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;
    const isStored = 'id' in job;
    const contentHash = isStored ? (job as StoredJob).id : (job as LiveJob).content_hash;
    setApplyingJobHash(contentHash);
    try {
      let targetJobId = '';
      if (!isStored) {
        const live = job as LiveJob;
        try {
          const result = await api<{ jobId: string }>('/api/jobs/import', {
            method: 'POST',
            body: JSON.stringify({
              provider: live.provider,
              board: live.board_slug,
              externalId: live.external_id,
            }),
          });
          targetJobId = result.jobId;
        } catch {}
      } else {
        targetJobId = (job as StoredJob).id;
      }

      const activeCandId = candidateId || recommendation?.candidateId || candidates[0]?.id;
      let appUrl = job.application_url;

      if (activeCandId && targetJobId) {
        try {
          const r = await api<{ intent: { id: string; job: { application_url: string } } }>('/api/application-intents', {
            method: 'POST',
            body: JSON.stringify({ candidateId: activeCandId, jobId: targetJobId }),
          });
          if (r?.intent?.id) {
            const u = new URL(r.intent.job?.application_url || appUrl);
            u.hash = 'marketing-intent=' + r.intent.id;
            appUrl = u.toString();
          }
        } catch {}
      }

      if (tab) tab.location.href = appUrl;
    } catch {
      if (tab) tab.location.href = job.application_url;
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
        const failures = res.sources?.flatMap(source => source.error ? [source.error] : []);
        if (failures?.length) setError(failures.join(' '));
        if (saveToDbOnFetch && res.persistedInDb) {
          setNotice(` Pulled ${res.jobs.length} software jobs and stored them in the database!`);
          void api<{ jobs: StoredJob[]; total: number; hasMore: boolean; recommendation: Recommendation }>(
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
    [liveBoard, liveProvider, employmentType, search, saveToDbOnFetch, candidateId, candidateParam, companyFilter, locationFilter, savedFilterParam, postedWithin]
  );

  // Initial load for live jobs
  useEffect(() => {
    const request = liveRequest;
    const timer = setTimeout(() => {
      if (!profileLoading && mode === 'live' && applicationView === 'available') void fetchLiveJobs();
    }, 0);
    return () => { clearTimeout(timer); request.current++; };
  }, [mode, fetchLiveJobs, profileLoading, applicationView]);

  // Load database jobs if in DB mode
  useEffect(() => {
    if (mode !== 'db' || profileLoading || applicationView !== 'available') return;
    let active = true;
    queueMicrotask(() => { if (active) setDbLoading(true); });
    api<{ jobs: StoredJob[]; total: number; hasMore: boolean; recommendation: Recommendation }>(
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
            setSelectedDbJob(prev => prev && r.jobs.some(j => j.id === prev.id) ? prev : r.jobs[0]);
          } else {
            setSelectedDbJob(null);
          }
          setError('');
        }
      })
      .catch((e) => active && setError(e.message))
      .finally(() => { if (active) setDbLoading(false); });

    return () => {
      active = false;
    };
  }, [mode, employmentType, search, dbPage, savedFilterParam, candidateParam, profileLoading, reload, applicationView]);

  // Live mode: fetch applied keys and filter live jobs on initial load and reload
  useEffect(() => {
    if (mode !== 'live' || applicationView !== 'available') return;
    const active = true;
    const loadAndFilter = async () => {
      try {
        const data = await api<AppliedJobsResponse>(`/api/jobs/applications?page=0${candidateParam}`);
        if (active) {
          setLiveJobs(jobs => withoutAppliedJobs(jobs, data.appliedKeys));
        }
      } catch (error) {
        if (active) setError((error as Error).message);
      }
    };
    loadAndFilter();
  }, [mode, applicationView, candidateParam, reload]);

  useEffect(() => {
    if (profileLoading || applicationView !== 'applied') return;
    let active = true;
    queueMicrotask(() => { if (active) { setAppliedLoading(true); setAppliedData(null); } });
    void api<AppliedJobsResponse>(`/api/jobs/applications?type=${employmentType}&search=${encodeURIComponent(search)}&page=${dbPage}${savedFilterParam + candidateParam}`)
      .then(data => { if (active) { setAppliedData(data); setError(''); } })
      .catch(error => { if (active) setError(error.message); })
      .finally(() => { if (active) setAppliedLoading(false); });
    return () => { active = false; };
  }, [profileLoading, applicationView, employmentType, search, dbPage, savedFilterParam, candidateParam, reload]);

  useEffect(() => {
    let active = true, refreshing = false;
    const refresh = async () => {
      if (document.visibilityState !== 'visible' || refreshing) return;
      refreshing = true; setReload(value => value + 1);
      try {
        if (mode === 'live' && applicationView === 'available') {
          const data = await api<AppliedJobsResponse>(`/api/jobs/applications?page=0${candidateParam}`);
          if (active) setLiveJobs(jobs => withoutAppliedJobs(jobs, data.appliedKeys));
        }
      } catch (error) { if (active) setError((error as Error).message); }
      finally { refreshing = false; }
    };
    window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', refresh);
    return () => { active = false; window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [mode, applicationView, candidateParam]);

  // Real-time updates via Supabase Realtime for immediate UI updates when applications are submitted
  // NOTE: Keep subscription active regardless of applicationView so Applied tab also gets immediate updates
  useEffect(() => {
    if (!candidateId) return;
    const supabase = createClient();

    let active = true;

    // Channel for job_submissions (portal/inside applications)
    const portalChannel = supabase
      .channel("job_submissions_realtime_filter")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "job_submissions",
          filter: `candidate_id=eq.${candidateId}`,
        },
        async (payload) => {
          if (!active) return;
          try {
            const data = await api<AppliedJobsResponse>(`/api/jobs/applications?page=0&candidateId=${encodeURIComponent(candidateId)}`);
            if (active && (mode === 'db' || mode === 'live')) {
              if (mode === 'live') {
                setLiveJobs(jobs => withoutAppliedJobs(jobs, data.appliedKeys));
              } else {
                setDbJobs(jobs => withoutAppliedJobs(jobs, data.appliedKeys));
              }
            }
            // Also refresh applied data if we're on the Applied tab
            if (active && applicationView === 'applied') {
              void api<AppliedJobsResponse>(`/api/jobs/applications?page=${dbPage}${savedFilterParam + candidateParam}`)
                .then(data => { if (active) { setAppliedData(data); } });
            }
            const row = payload.new as Record<string, unknown>;
            if (payload.eventType === "UPDATE") {
              const prevRow = (payload as any).old as Record<string, unknown> | null;
              if (prevRow && prevRow.status !== row.status) {
                const comp = (row?.company_name as string) || "Application";
                const title = (row?.job_title as string) || "Role";
                toast.success(`✅ Application updated: ${comp} — ${title} (${(row?.status as string) || 'Applied'})`);
              }
            } else {
              const comp = (row?.company_name as string) || "Application";
              const title = (row?.job_title as string) || "Role";
              toast.success(`🎉 Application submitted: ${comp} — ${title}`);
            }
          } catch (e) {
            console.error('[Realtime Job Browser Error]', e);
          }
        }
      )
      .subscribe();

    // Channel for outside_jobs (extension-captured outside applications)
    const outsideChannel = supabase
      .channel("outside_jobs_realtime_filter")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "outside_jobs",
          filter: `candidate_id=eq.${candidateId}`,
        },
        async (payload) => {
          if (!active) return;
          try {
            const data = await api<AppliedJobsResponse>(`/api/jobs/applications?page=0&candidateId=${encodeURIComponent(candidateId)}`);
            if (active && (mode === 'db' || mode === 'live')) {
              if (mode === 'live') {
                setLiveJobs(jobs => withoutAppliedJobs(jobs, data.appliedKeys));
              } else {
                setDbJobs(jobs => withoutAppliedJobs(jobs, data.appliedKeys));
              }
            }
            // Also refresh applied data if we're on the Applied tab
            if (active && applicationView === 'applied') {
              void api<AppliedJobsResponse>(`/api/jobs/applications?page=${dbPage}${savedFilterParam + candidateParam}`)
                .then(data => { if (active) { setAppliedData(data); } });
            }
            const row = payload.new as Record<string, unknown>;
            if (payload.eventType === "UPDATE") {
              const prevRow = (payload as any).old as Record<string, unknown> | null;
              if (prevRow && prevRow.status !== row.status) {
                const comp = (row?.company as string) || "Application";
                const title = (row?.title as string) || "Role";
                toast.success(`✅ Extension application updated: ${comp} — ${title} (${(row?.status as string) || 'Applied'})`);
              }
            } else {
              const comp = (row?.company as string) || "Application";
              const title = (row?.title as string) || "Role";
              toast.success(`🌐 Application submitted: ${comp} — ${title}`);
            }
          } catch (e) {
            console.error('[Realtime Outside Jobs Browser Error]', e);
          }
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(portalChannel);
      supabase.removeChannel(outsideChannel);
    };
  }, [candidateId, mode, applicationView, dbPage, savedFilterParam, candidateParam]);

  // Load the candidate's own confirmed profile.
  useEffect(() => {
    if (canSelectCandidate) {
      void getCandidates().then(items => setCandidates(items.filter(c => c.provenance_status === 'confirmed'))).catch(e => setError(e.message));
    }
  }, [canSelectCandidate]);

  // Active selected detail data
  const activeJob = mode === 'db' ? selectedDbJob : selectedLiveJob;
  const activeExtracted = activeJob?.description ? extractCompleteJobDetails(activeJob.description, activeJob.title) : null;

  return (
    <main className="p-4 sm:p-6 max-w-[1600px] mx-auto space-y-4">
      {/* Top Header & Mode Toggle */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border/70 pb-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              {provider ? provider.toUpperCase() + ' Roles' : 'Discover Opportunities'}
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Verified Tech Roles
            </span>
            <Badge variant="outline" className="text-xs px-2 py-0.5 rounded-full border-border/70 capitalize font-medium">
              {isCandidate ? 'Candidate Mode' : 'All Openings'}
            </Badge>
          </div>
          <p className="text-muted-foreground text-xs sm:text-sm">
            Curated software & tech roles directly from verified company ATS boards.
          </p>
        </div>

        {/* View Mode Switcher */}
        <div className="inline-flex items-center p-1 rounded-xl bg-muted/60 border border-border/70 shadow-2xs">
          <Button
            size="sm"
            variant={mode === 'db' ? 'default' : 'ghost'}
            onClick={() => { setMode('db'); setApplicationView('available'); setDbPage(0); }}
            className={`text-xs h-8 px-3.5 rounded-lg font-medium transition-all ${
              mode === 'db'
                ? 'bg-background text-foreground shadow-xs font-semibold'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/40'
            }`}
          >
            Saved Catalog <span className="ml-1.5 font-mono text-[11px] tabular-nums opacity-80">({dbTotal})</span>
          </Button>
          <Button
            size="sm"
            variant={mode === 'live' ? 'default' : 'ghost'}
            onClick={() => { setLiveProvider(provider || portalFilter || 'all'); setLiveBoard(''); setMode('live'); setApplicationView('available'); setDbPage(0); }}
            className={`text-xs h-8 px-3.5 rounded-lg font-medium transition-all ${
              mode === 'live'
                ? 'bg-background text-foreground shadow-xs font-semibold'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/40'
            }`}
          >
            Live ATS Fetch
          </Button>
        </div>
      </div>

      {/* Available / Applied Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center p-1 rounded-xl bg-card border border-border/70 shadow-2xs">
          <button
            type="button"
            onClick={() => { setApplicationView('available'); setDbPage(0); setAppliedData(null); }}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              applicationView === 'available'
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Briefcase className="size-3.5" />
            <span>Available Roles</span>
          </button>
          <button
            type="button"
            onClick={() => { setApplicationView('applied'); setDbPage(0); }}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              applicationView === 'applied'
                ? 'bg-primary text-primary-foreground shadow-2xs'
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
              onClick={() => { setDbPage(0); setReload(v => v + 1); }}
              className="h-8 text-xs font-medium rounded-lg border-border/80 shadow-2xs gap-1.5"
            >
              <RefreshCw className="size-3" />
              <span>Refresh</span>
            </Button>
            <Button
              size="sm"
              onClick={handleSyncSoftwareJobs}
              disabled={syncingSoftwareJobs}
              className="h-8 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs gap-1.5"
            >
              <Download className="size-3" />
              <span>{syncingSoftwareJobs ? 'Pulling...' : 'Sync Software Jobs'}</span>
            </Button>
          </div>
        )}
      </div>

      {/* SEARCH & FILTERS BAR (Jobright Style Clean Filter Strip) */}
      <section className="rounded-2xl border border-border/70 bg-card p-4 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
          {/* Main Keyword Search */}
          <div className="sm:col-span-4 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              aria-label="Search jobs"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setDbPage(0); }}
              placeholder="Search by job title, role or keywords..."
              className="h-10 pl-10 rounded-xl bg-background border-border/80 text-xs sm:text-sm font-medium"
            />
          </div>

          {/* Location Filter */}
          <div className="sm:col-span-3 relative">
            <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              aria-label="Filter by location"
              value={locationFilter}
              onChange={(e) => { setLocationFilter(e.target.value); setDbPage(0); }}
              placeholder="City, state or remote..."
              className="h-10 pl-10 rounded-xl bg-background border-border/80 text-xs sm:text-sm font-medium"
            />
          </div>

          {/* Company Filter */}
          <div className="sm:col-span-2 relative">
            <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              aria-label="Filter by company"
              value={companyFilter}
              onChange={(e) => { setCompanyFilter(e.target.value); setDbPage(0); }}
              placeholder="Company name..."
              className="h-10 pl-10 rounded-xl bg-background border-border/80 text-xs sm:text-sm font-medium"
            />
          </div>

          {/* Employment Type Dropdown */}
          <div className="sm:col-span-3 flex items-center gap-2">
            <select
              aria-label="Employment type"
              className="h-10 w-full rounded-xl border border-border/80 bg-background px-3 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              value={employmentType}
              onChange={(e) => { setEmploymentType(e.target.value); setDbPage(0); }}
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
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/50 text-xs">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Filters:</span>

          {/* Date Posted Filter */}
          <select
            aria-label="Posted within"
            disabled={applicationView === 'applied'}
            className="h-8 rounded-lg border border-border/80 bg-background px-2.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-primary"
            value={postedWithin}
            onChange={(e) => { setPostedWithin(e.target.value); setDbPage(0); }}
          >
            <option value="7">Posted: Last 7 days</option>
            <option value="30">Posted: Last 30 days</option>
            <option value="90">Posted: Last 90 days</option>
            <option value="all">Posted: Any time</option>
          </select>

          {/* Portal Filter */}
          <select
            aria-label="Filter by portal"
            className="h-8 rounded-lg border border-border/80 bg-background px-2.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-primary"
            value={provider || portalFilter}
            disabled={Boolean(provider)}
            onChange={(e) => { setPortalFilter(e.target.value); setCompanyFilter(''); setDbPage(0); }}
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
            <div className="flex items-center gap-2 ml-auto">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={saveToDbOnFetch}
                  onChange={(e) => setSaveToDbOnFetch(e.target.checked)}
                  className="rounded border-border accent-primary"
                />
                <span>Auto-save to database</span>
              </label>
              <Button
                size="sm"
                onClick={() => void fetchLiveJobs()}
                disabled={liveLoading}
                className="h-8 px-3 rounded-lg text-xs font-semibold shadow-2xs"
              >
                {liveLoading ? 'Fetching...' : 'Fetch Live'}
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* Messages */}
      {error && (
        <div role="alert" className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-xl text-xs flex items-center gap-2">
          <AlertCircle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div role="status" className="p-3 bg-primary/10 border border-primary/20 text-primary rounded-xl text-xs flex items-center gap-2">
          <Sparkles className="size-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {/* ======================= APPLIED JOBS VIEW ======================= */}
      {applicationView === 'applied' && (
        <section aria-label="Applied jobs" className="space-y-4">
          <AppliedJobsList data={appliedData} loading={appliedLoading} />
          {!!appliedData && !appliedData.requiresCandidate && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={appliedLoading || !dbPage} onClick={() => setDbPage(page => page - 1)}>
                Previous
              </Button>
              <Button size="sm" variant="outline" disabled={appliedLoading || !appliedData.hasMore} onClick={() => setDbPage(page => page + 1)}>
                Next
              </Button>
            </div>
          )}
        </section>
      )}

      {/* ======================= JOBRIGHT MASTER-DETAIL SPLIT SCREEN ======================= */}
      {applicationView === 'available' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* LEFT COLUMN: SCROLLABLE FEED OF COMPACT CARDS (5 Cols on Large) */}
          <div className="lg:col-span-5 space-y-4">
            {mode === 'db' ? (
              dbLoading ? (
                <WorkspaceSkeleton rows={6} />
              ) : !dbJobs.length ? (
                <div className="rounded-2xl border border-dashed border-border/80 bg-card p-10 text-center space-y-2">
                  <Briefcase className="size-8 text-muted-foreground/60 mx-auto" />
                  <p className="text-sm font-semibold text-foreground">No saved jobs found</p>
                  <p className="text-xs text-muted-foreground">Try clearing filters or click &quot;Sync Software Jobs&quot; to fetch new roles.</p>
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
                  <div className="flex items-center justify-between pt-2 px-1">
                    <span className="text-xs text-muted-foreground">
                      Page {dbPage + 1}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        disabled={!dbPage}
                        size="sm"
                        variant="outline"
                        onClick={() => setDbPage((p) => p - 1)}
                        className="h-8 rounded-lg px-3 text-xs font-semibold shadow-2xs hover:bg-muted"
                      >
                        Previous
                      </Button>
                      <Button
                        disabled={!dbMore}
                        size="sm"
                        variant="outline"
                        onClick={() => setDbPage((p) => p + 1)}
                        className="h-8 rounded-lg px-3 text-xs font-semibold shadow-2xs hover:bg-muted"
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                </>
              )
            ) : (
              /* LIVE JOBS LIST */
              liveLoading ? (
                <div className="p-12 text-center text-muted-foreground border rounded-2xl bg-card">
                  <div className="animate-spin inline-block w-6 h-6 border-2 border-primary border-t-transparent rounded-full mb-2"></div>
                  <p className="text-xs">Fetching live postings directly from ATS...</p>
                </div>
              ) : !liveJobs.length ? (
                <div className="p-10 text-center border rounded-2xl bg-card space-y-3">
                  <p className="text-xs text-muted-foreground">
                    {liveBoard ? <>No live jobs found for board &quot;<strong>{liveBoard}</strong>&quot;.</> : 'No live software jobs found across the available company boards.'}
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setLiveBoard('ramp'); setLiveProvider('ashby'); setCompanyFilter(''); }}>
                      Ramp (Ashby)
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setLiveBoard('figma'); setLiveProvider('greenhouse'); setCompanyFilter(''); }}>
                      Figma (Greenhouse)
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setLiveBoard('openai'); setLiveProvider('ashby'); setCompanyFilter(''); }}>
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
                        className={`group relative text-left w-full rounded-2xl p-4 transition-all duration-200 cursor-pointer ${
                          isSelected
                            ? 'bg-card border-2 border-primary shadow-sm ring-1 ring-primary/20'
                            : 'bg-card border border-border/70 hover:border-border hover:shadow-xs'
                        }`}
                      >
                        <div className="flex items-start gap-3.5">
                          <CompanyLogo company={job.company} size="md" className="shrink-0 mt-0.5" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                                  {job.title}
                                </h3>
                                <p className="text-xs font-semibold text-muted-foreground mt-0.5">
                                  {job.company}
                                </p>
                              </div>
                              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80 px-2 py-0.5 rounded bg-muted/60 border border-border/50 shrink-0">
                                {job.provider}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5 mt-2 text-xs text-muted-foreground">
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground/85">
                                <MapPin className="size-3 text-muted-foreground shrink-0" />
                                <span className="truncate max-w-[170px]">{job.location || 'Remote / Unknown'}</span>
                              </span>
                              <span>·</span>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize border-border/60">
                                {job.employment_type.replace('_', ' ')}
                              </Badge>
                            </div>

                            {liveSkills.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-2.5">
                                {liveSkills.map((s) => (
                                  <SkillBadge key={s.name} name={s.name} category={s.category} size="xs" />
                                ))}
                              </div>
                            )}

                            <div className="mt-3 pt-2 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground">
                              <JobDates posted_at={job.posted_at} closes_at={job.closes_at} provider={job.provider} />
                              <span className="text-primary font-semibold text-xs inline-flex items-center gap-0.5">
                                View details <ChevronRight className="size-3" />
                              </span>
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )
            )}
          </div>

          {/* RIGHT COLUMN: DETAIL PREVIEW PANEL (7 Cols on Large, Sticky) */}
          <div className="lg:col-span-7 lg:sticky lg:top-4">
            {activeJob ? (
              <div className="rounded-3xl border border-border/80 bg-card p-6 shadow-sm space-y-6 max-h-[calc(100vh-6rem)] overflow-y-auto scrollbar-thin">
                {/* Header: Company, Title, Actions */}
                <div className="space-y-4 pb-5 border-b border-border/70">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <CompanyLogo company={activeJob.company} size="lg" className="shadow-xs shrink-0" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-md border border-primary/20">
                            {activeJob.company}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {activeJob.location || 'Remote'}
                          </span>
                        </div>
                        <h2 className="text-xl sm:text-2xl font-extrabold text-foreground tracking-tight mt-1">
                          {activeJob.title}
                        </h2>
                      </div>
                    </div>

                    {/* AI Match Trigger Button */}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setMatcherOpen(true)}
                      className="shrink-0 h-9 rounded-xl border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 font-semibold text-xs gap-1.5 shadow-2xs hover:bg-emerald-500/20"
                    >
                      <Sparkles className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Match Fit</span>
                    </Button>
                  </div>

                  {/* Metadata Chips */}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="outline" className="capitalize text-xs font-medium border-border/70 bg-muted/20">
                      {activeJob.employment_type.replace('_', ' ')}
                    </Badge>
                    {'arrangements' in activeJob && activeJob.arrangements?.[0] && (
                      <Badge variant="secondary" className="text-xs font-medium">
                        {activeJob.arrangements[0]}
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-xs font-mono text-muted-foreground uppercase">
                      {'source' in activeJob && activeJob.source?.provider ? activeJob.source.provider : ('provider' in activeJob ? (activeJob as LiveJob).provider : 'ATS')}
                    </Badge>
                    <div className="text-xs text-muted-foreground ml-auto">
                      <JobDates
                        posted_at={activeJob.posted_at}
                        closes_at={activeJob.closes_at}
                        provider={'source' in activeJob ? activeJob.source?.provider : ('provider' in activeJob ? (activeJob as LiveJob).provider : undefined)}
                      />
                    </div>
                  </div>

                  {/* Primary Action Buttons */}
                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <Button
                      size="default"
                      disabled={applyingJobHash === ('id' in activeJob ? (activeJob as StoredJob).id : (activeJob as LiveJob).content_hash)}
                      onClick={() => void handleApplyDirectly(activeJob)}
                      className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground font-bold text-xs sm:text-sm shadow-xs hover:bg-primary/90 transition-all gap-1.5"
                    >
                      <span>Apply Directly on Official Portal</span>
                      <ExternalLink className="size-3.5" />
                    </Button>

                    {'id' in activeJob && (
                      <Link
                        href={`/dashboard/jobs/${activeJob.id}${candidateId ? '?candidateId=' + encodeURIComponent(candidateId) : ''}`}
                        className="inline-flex items-center justify-center h-10 px-4 rounded-xl border border-border/80 bg-background text-foreground text-xs font-semibold shadow-2xs hover:bg-muted transition-colors gap-1.5"
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
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Layers className="size-3.5 text-primary" />
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
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <CheckCircle2 className="size-3.5 text-emerald-600" />
                      <span>Key Responsibilities</span>
                    </h3>
                    <ul className="space-y-2">
                      {activeExtracted.responsibilities.slice(0, 5).map((resp, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-xs text-foreground/90 leading-relaxed">
                          <span className="size-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                          <span>{resp}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Qualifications & Must-Haves */}
                {activeExtracted && activeExtracted.mustHaves.length > 0 && (
                  <div className="space-y-2.5">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Sparkles className="size-3.5 text-primary" />
                      <span>Essential Qualifications</span>
                    </h3>
                    <div className="space-y-2">
                      {activeExtracted.mustHaves.slice(0, 4).map((req, i) => (
                        <div key={i} className="rounded-xl border border-border/60 bg-muted/15 p-3 text-xs flex items-start gap-2.5">
                          <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                          <span className="font-medium text-foreground leading-snug">{req}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Full Description Section */}
                <div className="space-y-3 pt-4 border-t border-border/60">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                    <span>Complete Description</span>
                    <a
                      href={activeJob.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline lowercase font-normal inline-flex items-center gap-1"
                    >
                      <span>open original</span>
                      <ExternalLink className="size-3" />
                    </a>
                  </h3>
                  <div
                    className="jd-prose max-w-none text-xs text-foreground/80 leading-relaxed max-h-96 overflow-y-auto pr-2 scrollbar-thin"
                    dangerouslySetInnerHTML={{
                      __html: sanitizeJobHtml(
                        ('description_html' in activeJob && activeJob.description_html)
                          ? activeJob.description_html
                          : (activeJob.description || '').replace(/\n/g, '<br/>')
                      ),
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-border/80 bg-card p-12 text-center space-y-2">
                <Briefcase className="size-8 text-muted-foreground/60 mx-auto" />
                <p className="text-sm font-semibold text-foreground">Select a job to view details</p>
                <p className="text-xs text-muted-foreground">Click any card from the list to preview responsibilities, requirements, and apply directly.</p>
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
