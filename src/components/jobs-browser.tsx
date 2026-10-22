"use client";

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useUserProfile } from '@/hooks/use-user-profile';
import type { Candidate } from '@/types/database';
import { getCandidates } from '@/lib/candidates';
import type { StoredJob, NormalizedJob } from '@/lib/jobs/types';
import {JobRoster} from '@/components/job-roster';
import {WorkspaceSkeleton} from '@/components/workspace-ui';
import { JobDates } from '@/components/job-dates';
import { PublicJobCatalog } from '@/components/public-job-catalog';

import type { SupportedJobProvider } from '@/lib/public-directory';

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
  const router=useRouter();
  const [importingJob,setImportingJob]=useState('');
  const { isRecruiter,isTechnicalRecruiter, isClient, loading: profileLoading } = useUserProfile();
  const isRecruitingStaff=isRecruiter||isTechnicalRecruiter;
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [candidateId, setCandidateId] = useState('');
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [dbLoading, setDbLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const liveRequest = useRef(0);
  const candidateParam = candidateId ? '&candidateId=' + encodeURIComponent(candidateId) : '';


  // Mode: 'db' (fast, cached in database) vs 'live' (direct fetch from ATS)
  const [mode, setMode] = useState<'live' | 'db'>('db');

  // Live Mode states
  const [liveJobs, setLiveJobs] = useState<LiveJob[]>([]);
  const [liveBoard, setLiveBoard] = useState('');
  const [liveProvider, setLiveProvider] = useState<string>(provider || 'all');
  const [liveLoading, setLiveLoading] = useState(false);
  const [saveToDbOnFetch, setSaveToDbOnFetch] = useState(isRecruitingStaff);
  const [syncingSoftwareJobs, setSyncingSoftwareJobs] = useState(false);
  const [lastFetchedTime, setLastFetchedTime] = useState<string | null>(null);
  const [liveSources, setLiveSources] = useState<{company:string;count:number;error?:string}[]>([]);
  const [expandedJobHash, setExpandedJobHash] = useState<string | null>(null);

  // Database Mode states
  const [dbJobs, setDbJobs] = useState<StoredJob[]>([]);
  const [dbSources, setDbSources] = useState<Source[]>([]);
  const [dbTotal, setDbTotal] = useState(0);
  const [dbPage, setDbPage] = useState(0);
  const [dbMore, setDbMore] = useState(false);

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

  // Source management form
  const [newCompany, setNewCompany] = useState('');
  const [newBoard, setNewBoard] = useState('');
  const [newSourceProvider, setNewSourceProvider] = useState(provider || 'greenhouse');

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
        sources?: {error?:string}[];
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
        query.set('postedWithin',postedWithin);
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
        sources?: {company:string;count:number;error?:string}[];
        }>(`/api/jobs/live?${query.toString()}`);

        if (requestId !== liveRequest.current) return;
        setRecommendation(res.recommendation);
        setLiveJobs(res.jobs || []);
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
      if (!profileLoading && mode === 'live') void fetchLiveJobs();
    }, 0);
    return () => { clearTimeout(timer); request.current++; };
  }, [mode, fetchLiveJobs, profileLoading]);

  // Load database jobs if in DB mode
  useEffect(() => {
    if (mode !== 'db' || profileLoading) return;
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
          setError('');
        }
      })
      .catch((e) => active && setError(e.message))
      .finally(() => { if (active) setDbLoading(false); });

    return () => {
      active = false;
    };
  }, [mode, employmentType, search, dbPage, savedFilterParam, candidateParam, profileLoading, reload]);

  // Load configured sources for recruiter
  useEffect(() => {
    if (isRecruitingStaff) {
      void getCandidates().then(items => setCandidates(items.filter(c => c.provenance_status === 'confirmed'))).catch(e => setError(e.message));
      void api<{ sources: Source[] }>('/api/job-sources')
        .then((r) => setDbSources(r.sources || []))
        .catch((e) => setError(e.message));
    }
  }, [isRecruitingStaff]);

  return (
    <main className="p-6 max-w-[1440px] mx-auto space-y-6">
      {/* Top Header & Mode Toggle */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              {provider ? provider.toUpperCase() + ' Jobs' : 'Public Jobs'}
            </h1>
            <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-xs py-0.5">
               Software & Tech Roles Only
            </Badge>
            <Badge variant="outline" className="text-xs py-0.5 capitalize">
              {isClient ? 'Candidate view' : isRecruitingStaff ? 'Recruiter view · all roles' : 'All roles'}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Find jobs across public portals and companies. Filter by portal, company, location and employment type.
          </p>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center gap-1 bg-muted/40 p-1 border border-border">
          <Button
            size="sm"
            variant={mode === 'db' ? 'default' : 'ghost'}
            onClick={() => setMode('db')}
            className="text-xs h-7 font-medium px-2.5"
          >
            Saved jobs <span className="ml-1 font-mono tabular-nums">({dbTotal})</span>
          </Button>
          <Button
            size="sm"
            variant={mode === 'live' ? 'default' : 'ghost'}
            onClick={() => {setLiveProvider(provider || portalFilter || 'all');setLiveBoard('');setMode('live');}}
            className="text-xs h-7 font-medium px-2.5"
          >
            Live ATS Fetch
          </Button>
        </div>
      </div>

      <details className="border-y border-border/60 py-3"><summary className="text-xs font-medium text-muted-foreground">Company boards & source discovery</summary><div className="mt-3"><PublicJobCatalog provider={mode === 'live' && liveProvider !== 'all' ? liveProvider : provider || portalFilter || undefined} canSave={isRecruiter} onSelect={board => {
        setLiveBoard(board.board_slug); setLiveProvider(board.provider); setPortalFilter(board.provider); setDbPage(0); setCompanyFilter(''); setMode('live');
      }} onSaved={async () => {
        const result = await api<{sources:Source[]}>('/api/job-sources');
        setDbSources(result.sources || []);
      }}/></div></details>

      <section className="border border-border bg-card p-4 space-y-2">
        {isRecruitingStaff && <label className="block text-sm font-medium">Find roles for a candidate
          <select aria-label="Match jobs to candidate" className="mt-2 block w-full border border-border bg-background p-2 text-sm" value={candidateId}
            onChange={e => { setCandidateId(e.target.value); setDbPage(0); setDbJobs([]); setLiveJobs([]); setRecommendation(null); }}>
            <option value="">All saved roles</option>
            {candidates.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
          </select>
        </label>}
        {recommendation?.requiresProfile ? <p className="text-sm">Upload, review and save your resume details to see related roles. <Link className="underline font-medium hover:text-foreground" href="/dashboard/candidates/new">Review your resume</Link></p>
          : (isClient || candidateId) && <p className="text-sm text-muted-foreground">Roles related to <span className="font-medium text-foreground">{recommendation?.candidateName || 'your saved resume'}</span>, ranked by skills and job titles. Matching helps discovery; review each job’s requirements before applying.</p>}
      </section>

      {/* Mode Status Banner */}
      {mode === 'live' ? (
        <div className="bg-muted/30 border border-border text-foreground p-3 text-xs flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-medium">
            <span className="size-2 rounded-full bg-emerald-600 dark:bg-emerald-400"></span>
            Live job search — Strictly filtered for software & tech roles. Save fetched jobs: {saveToDbOnFetch ? 'Enabled' : 'Disabled'}.
          </div>
          {lastFetchedTime && (
            <span className="text-xs text-muted-foreground font-mono">
              Last updated: {lastFetchedTime}
            </span>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{dbTotal} saved job records. Review source dates and requirements before applying.</p>
      )}

      {/* Controls & Search Toolbar */}
      <section className="border-y border-border/60 py-4 space-y-4">
        {mode === 'live' && (
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                Company Board Slug (optional)
              </label>
              <Input
                aria-label="Board slug"
                value={liveBoard}
                onChange={(e) => setLiveBoard(e.target.value)}
                placeholder="Leave empty for all companies"
                className="h-9"
              />
              <p className="mt-1 text-xs text-muted-foreground">Empty searches every catalog and enabled saved board for this provider.</p>
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                ATS Provider
              </label>
              <select
                aria-label="Provider"
                className="w-full h-9 border rounded-md px-3 bg-background text-sm"
                value={liveProvider}
                onChange={(e) => {
                  const newProv = e.target.value;
                  setLiveProvider(newProv);
                  setPortalFilter(newProv === 'all' ? '' : newProv);
                  setDbPage(0);
                  setLiveBoard('');
                  setCompanyFilter('');
                  setLiveJobs([]);
                  setLiveSources([]);
                }}
                disabled={Boolean(provider)}
              >
                <option value="all">All ATS providers</option>
                <option value="greenhouse">Greenhouse (e.g. figma, stripe)</option>
                <option value="ashby">Ashby (e.g. ramp, openai)</option>
                <option value="lever">Lever (all available company boards)</option>
                <option value="smartrecruiters">SmartRecruiters (e.g. BoschGroup)</option>
                <option value="breezy">Breezy HR (e.g. breezy)</option>
                <option value="remoteok">RemoteOK (Global tech)</option>
              </select>
              <Button size="sm" variant="ghost" onClick={()=>{setLiveBoard('');setCompanyFilter('');}}>All companies</Button>
            </div>

            <div className="sm:col-span-2 flex flex-wrap items-end gap-2">
              <Button
                onClick={() => void fetchLiveJobs()}
                disabled={liveLoading}
                className="w-full sm:w-auto h-9 font-semibold"
              >
                {liveLoading ? 'Fetching Jobs...' : ' Fetch & Save Jobs'}
              </Button>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={saveToDbOnFetch}
                  onChange={(e) => setSaveToDbOnFetch(e.target.checked)}
                  className="rounded border-gray-300"
                />
                Save to Database
              </label>
              {dbSources.length > 0 && (
                <select
                  aria-label="Select configured source"
                  className="h-9 border rounded-md px-2 bg-background text-xs truncate max-w-[200px]"
                  onChange={(e) => {
                    const found = dbSources.find((s) => s.id === e.target.value);
                    if (found) {
                      setLiveBoard(found.board_slug);
                      setLiveProvider(found.provider);
                      setCompanyFilter('');
                    }
                  }}
                  defaultValue=""
                >
                  <option value="" disabled>
                    Saved Companies...
                  </option>
                  {dbSources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.company} ({s.provider})
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        )}

        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-3 pt-1 border-t">
          <label className="text-sm">Posting date
            <select aria-label="Posted within" className="block h-9 border rounded-md px-3 bg-background text-sm" value={postedWithin} onChange={e=>{setPostedWithin(e.target.value);setDbPage(0);}}>
              <option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="all">All dates (including unknown)</option>
            </select>
          </label>
          <Input
            aria-label="Search jobs"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setDbPage(0); }}
            placeholder="Search job titles..."
            className="h-9 flex-1"
          />

          <select
            aria-label="Employment type"
            className="h-9 border rounded-md px-3 bg-background text-sm min-w-[150px]"
            value={employmentType}
            onChange={(e) => { setEmploymentType(e.target.value); setDbPage(0); }}
          >
            <option value="all">All Types</option>
            <option value="contract">Contract (C2C/W2)</option>
            <option value="permanent">Permanent / Full-time</option>
            <option value="temporary">Temporary</option>
            <option value="part_time">Part-time</option>
            <option value="internship">Internship</option>
            <option value="unknown">Unknown</option>
          </select>

          {mode === 'db' && (
            <div className="flex gap-2">
              <Button variant="outline" className="h-9" onClick={() => { setDbPage(0); setReload(v => v + 1); }}>
                Refresh jobs
              </Button>
              <Button
                variant="default"
                className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                onClick={handleSyncSoftwareJobs}
                disabled={syncingSoftwareJobs}
              >
                {syncingSoftwareJobs ? 'Syncing...' : ' Pull & Save'}
              </Button>
            </div>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {mode === 'db' && <label className="text-sm">Portal
            <select aria-label="Filter by portal" className="mt-1 block h-9 w-full rounded-md border bg-background px-3" value={provider || portalFilter} disabled={Boolean(provider)} onChange={e => { setPortalFilter(e.target.value); setCompanyFilter(''); setDbPage(0); }}>
              <option value="">All portals</option>
              <option value="greenhouse">Greenhouse</option>
              <option value="ashby">Ashby</option>
              <option value="lever">Lever</option>
              <option value="smartrecruiters">SmartRecruiters</option>
              <option value="breezy">Breezy HR</option>
              <option value="remoteok">RemoteOK</option>
            </select>
          </label>}
          <label className="text-sm">Company (optional)<Input aria-label="Filter by company" className="mt-1 h-9" placeholder="All companies" value={companyFilter} onChange={e => { setCompanyFilter(e.target.value); setDbPage(0); }}/></label>
          <label className="text-sm">Location<Input aria-label="Filter by location" className="mt-1 h-9" placeholder="City, state or remote" value={locationFilter} onChange={e => { setLocationFilter(e.target.value); setDbPage(0); }}/></label>
        </div>
        <p className="text-xs text-muted-foreground">Newest source posting dates first. {postedWithin==='all'?'Older postings and unknown dates are included; unknown dates appear last.':'Older postings and jobs without a source posting date are hidden. Fetching a job today does not make its posting date recent.'}</p>
      </section>

      {/* Messages */}
      {error && (
        <div role="alert" className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-sm">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="p-3 bg-primary/10 border border-primary/20 text-primary rounded-lg text-sm">
          {notice}
        </div>
      )}

      {/* ======================= LIVE JOBS LIST ======================= */}
      {mode === 'live' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center text-sm text-muted-foreground px-1">
            <span>
              Found <strong>{liveJobs.length}</strong> live jobs on {liveBoard || 'all available company boards'}.
            </span>
            <span className="text-xs">Click a job to view details or apply directly</span>
          </div>
          {!!liveSources.length && !liveLoading && <details className="rounded-lg border p-3 text-sm"><summary>{liveSources.length} company boards checked · {liveSources.filter(source=>!!source.error).length} with errors</summary><p className="mt-2 text-xs text-muted-foreground">Coverage includes our catalog and enabled saved sources. Resume, location and other filters can reduce the displayed results.</p><ul className="mt-2 space-y-1">{liveSources.map((source,index)=><li key={index}>{source.company}: {source.count} software / tech roles{source.error?` · ${source.error}`:''}</li>)}</ul></details>}

          {liveLoading ? (
            <div className="p-12 text-center text-muted-foreground border rounded-xl bg-card">
              <div className="animate-spin inline-block w-6 h-6 border-2 border-current border-t-transparent rounded-full mb-2"></div>
              <p>Fetching jobs directly from {liveProvider} board...</p>
            </div>
          ) : !liveJobs.length ? (
            <div className="p-10 text-center border rounded-xl bg-card space-y-3">
              <p className="text-muted-foreground">
                {liveBoard?<>No live jobs found for board &quot;<strong>{liveBoard}</strong>&quot; with the selected filters.</>:'No live software jobs found across the available company boards with the selected filters.'}
              </p>
              <div className="flex justify-center gap-2">
                <Button size="sm" variant="outline" onClick={() => {setLiveBoard('ramp'); setLiveProvider('ashby'); setCompanyFilter('');}}>
                  Try Ramp (Ashby)
                </Button>
                <Button size="sm" variant="outline" onClick={() => {setLiveBoard('figma');setLiveProvider('greenhouse');setCompanyFilter('');}}>
                  Try Figma (Greenhouse)
                </Button>
                <Button size="sm" variant="outline" onClick={() => {setLiveBoard('openai');setLiveProvider('ashby');setCompanyFilter('');}}>
                  Try OpenAI (Ashby)
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {liveJobs.map((job) => {
                const isExpanded = expandedJobHash === job.content_hash;
                return (
                  <article
                    key={job.content_hash}
                    className="border rounded-xl p-5 bg-card hover:border-primary/40 transition-colors shadow-sm space-y-3"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-bold hover:text-primary transition-colors">
                          {job.title}
                        </h2>
                        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground mt-1">
                          <span className="font-semibold text-foreground">{job.company}</span>
                          <span>•</span>
                          <span>{job.location || 'Remote / Unknown'}</span>
                          {job.department && (
                            <>
                              <span>•</span>
                              <span>{job.department}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex flex-wrap items-center gap-2">
                        <Button size="sm" variant="outline" disabled={!!importingJob} onClick={async()=>{setImportingJob(job.content_hash);setError('');try{const result=await api<{jobId:string}>('/api/jobs/import',{method:'POST',body:JSON.stringify({provider:job.provider,board:job.board_slug,externalId:job.external_id})});router.push(`/dashboard/jobs/${result.jobId}${candidateId?'?candidateId='+encodeURIComponent(candidateId):''}`);}catch(error){setError((error as Error).message);}finally{setImportingJob('');}}}>{importingJob===job.content_hash?'Saving job…':isTechnicalRecruiter?'Review job':'Review & tailor resume'}</Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setExpandedJobHash(isExpanded ? null : job.content_hash)}
                        >
                          {isExpanded ? 'Hide Details' : 'View Details'}
                        </Button>
                        <a
                          href={job.application_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center rounded-md text-xs font-semibold bg-primary text-primary-foreground h-8 px-3 hover:bg-primary/90"
                        >
                          Apply Directly ↗
                        </a>
                      </div>
                    </div>

                    <JobDates posted_at={job.posted_at} closes_at={job.closes_at} provider={job.provider}/>
                    {job.match_reasons?.map(reason => <p key={reason} className="text-xs text-emerald-700 dark:text-emerald-300">{reason}</p>)}
                    {/* Metadata tags */}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Badge variant="outline" className="capitalize text-xs">
                        {job.employment_type.replace('_', ' ')}
                      </Badge>
                      {job.arrangements?.map((arr) => (
                        <Badge key={arr} variant="secondary" className="text-xs">
                          {arr}
                        </Badge>
                      ))}
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        {job.provider}
                      </Badge>
                      {job.employment_evidence && (
                        <span className="text-xs text-muted-foreground italic self-center truncate max-w-md">
                          &quot;{job.employment_evidence}&quot;
                        </span>
                      )}
                    </div>

                    {/* Expandable Description */}
                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t space-y-3 bg-muted/30 p-4 rounded-lg">
                        <h3 className="font-semibold text-sm">Job Description & Details</h3>
                        <div
                          className="prose prose-sm dark:prose-invert max-w-none text-sm text-muted-foreground max-h-96 overflow-y-auto leading-relaxed"
                          dangerouslySetInnerHTML={{
                            __html: job.description_html || job.description.replace(/\n/g, '<br/>'),
                          }}
                        />
                        <div className="pt-2 flex justify-between items-center text-xs text-muted-foreground border-t">
                          <span>External ID: {job.external_id}</span>
                          <a
                            href={job.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline hover:text-foreground"
                          >
                            Open original posting ↗
                          </a>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ======================= DATABASE MODE ======================= */}
      {mode === 'db' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center text-sm text-muted-foreground px-1">
            <span>
              Showing {dbJobs.length} of {dbTotal} saved database jobs
            </span>
          </div>

          {dbLoading ? <WorkspaceSkeleton rows={6}/> : !dbJobs.length ? (
            <p className="p-8 text-center border rounded-xl bg-card text-muted-foreground">
              {recommendation?.enabled ? 'No related roles found with these filters. Check your saved skills and target roles, or try different filters.' : 'No saved jobs found with these filters.'}
            </p>
          ) : (
            <JobRoster jobs={dbJobs} candidateId={candidateId}/>
          )}

          <div className="flex gap-2">
            <Button disabled={!dbPage} size="sm" variant="outline" onClick={() => setDbPage((p) => p - 1)}>
              Previous
            </Button>
            <Button disabled={!dbMore} size="sm" variant="outline" onClick={() => setDbPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Recruiter Section: Public Job Sources */}
      {isRecruiter && (
        <details className="border-t border-border/60 py-4"><summary className="text-sm font-medium">Manage saved job sources ({dbSources.length})</summary><section className="mt-4 space-y-4">
          <div>
            <h2 className="font-bold text-lg">Public Job Sources Directory</h2>
            <p className="text-sm text-muted-foreground">
              Configure company ATS boards here. You can preview their live jobs anytime using the &quot;Fetch
              Jobs&quot; button above.
            </p>
          </div>

          <form
            className="flex flex-wrap gap-3 items-center"
            onSubmit={async (e) => {
              e.preventDefault();
              setError('');
              try {
                await api('/api/job-sources', {
                  method: 'POST',
                  body: JSON.stringify({
                    provider: newSourceProvider,
                    company: newCompany,
                    board_slug: newBoard,
                  }),
                });
                setNewCompany('');
                setNewBoard('');
                const res = await api<{ sources: Source[] }>('/api/job-sources');
                setDbSources(res.sources || []);
                setNotice('Added new source. You can now fetch its jobs live anytime!');
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          >
            <Input
              aria-label="Source company"
              required
              value={newCompany}
              onChange={(e) => setNewCompany(e.target.value)}
              placeholder="Company Name (e.g. Stripe)"
              className="h-9 w-48"
            />
            <Input
              aria-label="Board slug"
              required
              value={newBoard}
              onChange={(e) => setNewBoard(e.target.value)}
              placeholder="Public board slug (e.g. stripe)"
              className="h-9 w-48"
            />
            <select
              value={newSourceProvider}
              onChange={(e) => setNewSourceProvider(e.target.value)}
              className="h-9 border rounded-md px-3 bg-background text-sm"
            >
              <option value="greenhouse">Greenhouse</option>
              <option value="ashby">Ashby</option>
              <option value="lever">Lever</option>
              <option value="smartrecruiters">SmartRecruiters</option>
              <option value="breezy">Breezy HR</option>
              <option value="remoteok">RemoteOK</option>
            </select>
            <Button type="submit" size="sm" className="h-9">
              Add source
            </Button>
          </form>

          {dbSources.length > 0 && (
            <div className="divide-y border rounded-lg overflow-hidden">
              {dbSources.map((s) => (
                <div key={s.id} className="p-3 bg-background flex justify-between items-center text-sm">
                  <div>
                    <span className="font-semibold">{s.company}</span>{' '}
                    <span className="text-muted-foreground text-xs">
                      ({s.provider}/{s.board_slug})
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setMode('live');
                        setLiveBoard(s.board_slug);
                        setLiveProvider(s.provider);
                        setCompanyFilter('');
                      }}
                    >
                      Fetch Live
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section></details>
      )}
    </main>
  );
}
