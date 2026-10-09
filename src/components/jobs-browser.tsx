"use client";

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useUserProfile } from '@/hooks/use-user-profile';
import type { StoredJob, NormalizedJob } from '@/lib/jobs/types';

interface LiveJob extends NormalizedJob {
  provider: 'greenhouse' | 'ashby';
  board_slug: string;
}

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
  const { isRecruiter } = useUserProfile();

  // Mode: 'db' (fast, cached in database) vs 'live' (direct fetch from ATS)
  const [mode, setMode] = useState<'live' | 'db'>('db');

  // Live Mode states
  const [liveJobs, setLiveJobs] = useState<LiveJob[]>([]);
  const [liveBoard, setLiveBoard] = useState(provider === 'ashby' ? 'openai' : 'ramp');
  const [liveProvider, setLiveProvider] = useState<string>(provider || 'greenhouse');
  const [liveLoading, setLiveLoading] = useState(false);
  const [saveToDbOnFetch, setSaveToDbOnFetch] = useState(true);
  const [syncingSoftwareJobs, setSyncingSoftwareJobs] = useState(false);
  const [lastFetchedTime, setLastFetchedTime] = useState<string | null>(null);
  const [expandedJobHash, setExpandedJobHash] = useState<string | null>(null);

  // Database Mode states
  const [dbJobs, setDbJobs] = useState<StoredJob[]>([]);
  const [dbSources, setDbSources] = useState<Source[]>([]);
  const [dbTotal, setDbTotal] = useState(0);
  const [dbPage, setDbPage] = useState(0);
  const [dbMore, setDbMore] = useState(false);

  // Shared filters
  const [search, setSearch] = useState('');
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
      }>('/api/jobs/live?saveToDb=true');
      setNotice(`✅ Successfully pulled ${res.total} software jobs from ATS and stored in database!`);
      // Refresh DB jobs
      setDbPage(0);
      const dbRes = await api<{ jobs: StoredJob[]; total: number; hasMore: boolean }>(
        `/api/jobs?type=${employmentType}&search=${encodeURIComponent(search)}&page=0${
          provider ? '&provider=' + provider : ''
        }`
      );
      setDbJobs(dbRes.jobs);
      setDbTotal(dbRes.total);
      setDbMore(dbRes.hasMore);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSyncingSoftwareJobs(false);
    }
  };

  // Fetch Live Jobs directly from ATS, saving to DB when requested
  const fetchLiveJobs = useCallback(
    async (customBoard?: string, customProvider?: string) => {
      setLiveLoading(true);
      setError('');
      try {
        const boardToUse = customBoard !== undefined ? customBoard : liveBoard;
        const provToUse = customProvider || liveProvider;

        const query = new URLSearchParams();
        if (provToUse) query.set('provider', provToUse);
        if (boardToUse.trim()) query.set('board', boardToUse.trim());
        if (employmentType) query.set('type', employmentType);
        if (search.trim()) query.set('search', search.trim());
        if (saveToDbOnFetch) query.set('saveToDb', 'true');

        const res = await api<{
          jobs: LiveJob[];
          total: number;
          fetchedAt: string;
          persistedInDb: boolean;
        }>(`/api/jobs/live?${query.toString()}`);

        setLiveJobs(res.jobs || []);
        setLastFetchedTime(new Date(res.fetchedAt).toLocaleTimeString());
        if (saveToDbOnFetch && res.jobs?.length) {
          setNotice(`✅ Pulled ${res.jobs.length} software jobs and stored them in the database!`);
          void api<{ jobs: StoredJob[]; total: number; hasMore: boolean }>(
            `/api/jobs?type=${employmentType}&search=${encodeURIComponent(search)}&page=0${
              provider ? '&provider=' + provider : ''
            }`
          )
            .then((dbRes) => {
              setDbJobs(dbRes.jobs);
              setDbTotal(dbRes.total);
              setDbMore(dbRes.hasMore);
            })
            .catch(() => {});
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLiveLoading(false);
      }
    },
    [liveBoard, liveProvider, employmentType, search, saveToDbOnFetch, provider]
  );

  // Initial load for live jobs
  useEffect(() => {
    if (mode === 'live') {
      void fetchLiveJobs();
    }
  }, [mode, fetchLiveJobs]);

  // Load database jobs if in DB mode
  useEffect(() => {
    if (mode !== 'db') return;
    let active = true;
    api<{ jobs: StoredJob[]; total: number; hasMore: boolean }>(
      `/api/jobs?type=${employmentType}&search=${encodeURIComponent(search)}&page=${dbPage}${
        provider ? '&provider=' + provider : ''
      }`
    )
      .then((r) => {
        if (active) {
          setDbJobs(r.jobs);
          setDbTotal(r.total);
          setDbMore(r.hasMore);
          setError('');
        }
      })
      .catch((e) => active && setError(e.message));

    return () => {
      active = false;
    };
  }, [mode, employmentType, search, dbPage, provider]);

  // Load configured sources for recruiter
  useEffect(() => {
    if (isRecruiter) {
      void api<{ sources: Source[] }>('/api/job-sources')
        .then((r) => setDbSources(r.sources || []))
        .catch((e) => setError(e.message));
    }
  }, [isRecruiter]);

  return (
    <main className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Header & Mode Toggle */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-extrabold tracking-tight">
              {provider ? provider.toUpperCase() : 'Public'} Jobs Portal
            </h1>
            <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-xs py-0.5">
              💻 Software & Tech Roles Only
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Browse verified technical & engineering jobs from public ATS boards, stored directly in the database.
          </p>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center gap-2 bg-muted p-1 rounded-lg border">
          <Button
            size="sm"
            variant={mode === 'db' ? 'default' : 'ghost'}
            onClick={() => setMode('db')}
            className="text-xs h-8"
          >
            💾 Saved Database Jobs ({dbTotal})
          </Button>
          <Button
            size="sm"
            variant={mode === 'live' ? 'default' : 'ghost'}
            onClick={() => setMode('live')}
            className="text-xs h-8"
          >
            ⚡ Live ATS Fetch
          </Button>
        </div>
      </div>

      {/* Mode Status Banner */}
      {mode === 'live' ? (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-200 rounded-lg p-3 text-sm flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-medium">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            Live ATS Feed Active — Strictly filtered for software & tech roles. Persisting to DB: {saveToDbOnFetch ? 'Enabled' : 'Disabled'}.
          </div>
          {lastFetchedTime && (
            <span className="text-xs text-muted-foreground">
              Last updated: <span className="font-semibold">{lastFetchedTime}</span>
            </span>
          )}
        </div>
      ) : (
        <div className="bg-primary/5 border border-primary/20 text-foreground rounded-lg p-3 text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span>📁 Viewing verified software jobs stored in the Supabase database (<strong>{dbTotal}</strong> total).</span>
            <span className="text-xs text-muted-foreground hidden sm:inline">• High-speed indexed responses</span>
          </div>
          <Button
            size="sm"
            onClick={handleSyncSoftwareJobs}
            disabled={syncingSoftwareJobs}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs h-8 px-3"
          >
            {syncingSoftwareJobs ? '⏳ Syncing Software Jobs...' : '📥 Pull & Save Jobs to Database'}
          </Button>
        </div>
      )}

      {/* Controls & Search Toolbar */}
      <section className="bg-card border rounded-xl p-4 shadow-sm space-y-4">
        {mode === 'live' && (
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                Company Board Slug
              </label>
              <Input
                aria-label="Board slug"
                value={liveBoard}
                onChange={(e) => setLiveBoard(e.target.value)}
                placeholder="e.g. ramp, figma, openai, stripe"
                className="h-9"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1">
                ATS Provider
              </label>
              <select
                aria-label="Provider"
                className="w-full h-9 border rounded-md px-3 bg-background text-sm"
                value={liveProvider}
                onChange={(e) => setLiveProvider(e.target.value)}
                disabled={Boolean(provider)}
              >
                <option value="greenhouse">Greenhouse</option>
                <option value="ashby">Ashby</option>
              </select>
            </div>

            <div className="sm:col-span-2 flex flex-wrap items-end gap-2">
              <Button
                onClick={() => void fetchLiveJobs()}
                disabled={liveLoading}
                className="w-full sm:w-auto h-9 font-semibold"
              >
                {liveLoading ? 'Fetching Jobs...' : '🔄 Fetch & Save Jobs'}
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
                      void fetchLiveJobs(found.board_slug, found.provider);
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
          <Input
            aria-label="Search jobs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search software jobs by title, department, or location..."
            className="h-9 flex-1"
          />

          <select
            aria-label="Employment type"
            className="h-9 border rounded-md px-3 bg-background text-sm min-w-[150px]"
            value={employmentType}
            onChange={(e) => setEmploymentType(e.target.value)}
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
              <Button variant="outline" className="h-9" onClick={() => setDbPage(0)}>
                Reload DB
              </Button>
              <Button
                variant="default"
                className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                onClick={handleSyncSoftwareJobs}
                disabled={syncingSoftwareJobs}
              >
                {syncingSoftwareJobs ? 'Syncing...' : '📥 Pull & Save'}
              </Button>
            </div>
          )}
        </div>
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
              Found <strong>{liveJobs.length}</strong> live jobs on {liveBoard || 'configured boards'}.
            </span>
            <span className="text-xs">Click a job to view details or apply directly</span>
          </div>

          {liveLoading ? (
            <div className="p-12 text-center text-muted-foreground border rounded-xl bg-card">
              <div className="animate-spin inline-block w-6 h-6 border-2 border-current border-t-transparent rounded-full mb-2"></div>
              <p>Fetching jobs directly from {liveProvider} board...</p>
            </div>
          ) : !liveJobs.length ? (
            <div className="p-10 text-center border rounded-xl bg-card space-y-3">
              <p className="text-muted-foreground">
                No live jobs found for board &quot;<strong>{liveBoard}</strong>&quot; with the selected filters.
              </p>
              <div className="flex justify-center gap-2">
                <Button size="sm" variant="outline" onClick={() => void fetchLiveJobs('ramp', 'greenhouse')}>
                  Try Ramp (Greenhouse)
                </Button>
                <Button size="sm" variant="outline" onClick={() => void fetchLiveJobs('figma', 'greenhouse')}>
                  Try Figma (Greenhouse)
                </Button>
                <Button size="sm" variant="outline" onClick={() => void fetchLiveJobs('openai', 'ashby')}>
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
                      <div className="flex items-center gap-2">
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

          {!dbJobs.length ? (
            <p className="p-8 text-center border rounded-xl bg-card text-muted-foreground">
              No saved jobs found in the database. You can switch to &quot;⚡ Live Jobs&quot; above to view jobs
              directly without saving.
            </p>
          ) : (
            dbJobs.map((j) => (
              <article key={j.id} className="border rounded-xl p-4 bg-card flex justify-between items-center gap-4">
                <div>
                  <Link className="font-semibold underline hover:text-primary" href={`/dashboard/jobs/${j.id}`}>
                    {j.title}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {j.company} - {j.location || 'Location unknown'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {j.employment_type} - {j.state}
                    {j.arrangements?.length ? ' - ' + j.arrangements.join(', ') : ''}
                  </p>
                </div>
                <Link
                  className="text-xs font-semibold bg-secondary text-secondary-foreground px-3 py-1.5 rounded-md hover:bg-secondary/80"
                  href={`/dashboard/jobs/${j.id}`}
                >
                  Review and apply
                </Link>
              </article>
            ))
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
        <section className="rounded-xl border p-5 bg-card space-y-4">
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
                        void fetchLiveJobs(s.board_slug, s.provider);
                      }}
                    >
                      Fetch Live
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}