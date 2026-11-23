'use client';

import { useState, useTransition, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Briefcase, RotateCcw } from 'lucide-react';
import type { Job, Slice, FacetsData } from '@/lib/jobs/freehire-types';
import { useJobBookmarks } from '@/hooks/use-job-bookmarks';
import { CATEGORY_LABELS, getCountryFlag, getCountryName } from '@/lib/jobs/freehire-formatters';
import { JobCard } from '@/components/jobs/feed/JobCard';
import { JobsToolbar } from '@/components/jobs/feed/JobsToolbar';
import { JobsFilterBar } from '@/components/jobs/feed/JobsFilterBar';
import { JobsActiveFilters } from '@/components/jobs/feed/JobsActiveFilters';
import { JobsSwipeDeck } from '@/components/jobs/feed/JobsSwipeDeck';
import { JobsMapGrid } from '@/components/jobs/feed/JobsMapGrid';
import { JobsPagination } from '@/components/jobs/feed/JobsPagination';
import { computeUnifiedJobMatch } from '@/lib/resumes/job-match';
import { applicationUrlKey } from '@/lib/jobs/application-state';
import { useApplicationRealtime } from '@/hooks/use-application-realtime';

interface JobsFeedClientProps {
  initial: Slice<Job> | null;
  currentPage: number;
  pageSize: number;
  facets?: FacetsData;
  appliedKeys?: string[];
  candidateResume?: { text: string; skills: string[] } | null;
}

export function JobsFeedClient({
  initial,
  currentPage,
  pageSize,
  facets,
  appliedKeys = [],
  candidateResume = null,
}: JobsFeedClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [viewMode, setViewMode] = useState<'list' | 'map' | 'swipe'>('list');
  const [swipeIndex, setSwipeIndex] = useState(0);

  const { savedJobs, toggleSavedJob } = useJobBookmarks();
  const jobBasePath = pathname.startsWith('/dashboard') ? '/dashboard/jobs' : '/jobs';

  const refreshFeed = useCallback(() => {
    startTransition(() => {
      router.refresh();
    });
  }, [router]);

  useApplicationRealtime(refreshFeed, true);

  const appliedKeySet = useMemo(() => new Set(appliedKeys || []), [appliedKeys]);
  const hasResumeProfile = Boolean(candidateResume?.text || candidateResume?.skills?.length);

  const getAtsMatch = useCallback(
    (job: Job) => {
      if (!hasResumeProfile) return null;
      const result = computeUnifiedJobMatch(job, candidateResume);
      return {
        score: result.matchPercentage,
        matched: result.matchedSkills,
        missing: result.missingSkills,
      };
    },
    [candidateResume, hasResumeProfile]
  );

  const getIsApplied = useCallback(
    (job: Job) => {
      const key1 = job.url ? applicationUrlKey(job.url) : null;
      const key2 = job.source_url ? applicationUrlKey(job.source_url) : null;
      return Boolean((key1 && appliedKeySet.has(key1)) || (key2 && appliedKeySet.has(key2)));
    },
    [appliedKeySet]
  );

  // Read active filter params from URL
  const activeCategory = searchParams.get('category') || '';
  const activeWorkMode = searchParams.get('work_mode') || '';
  const activeCountry = searchParams.get('countries') || '';
  const activeSkill = searchParams.get('skills') || '';
  const activeSeniority = searchParams.get('seniority') || '';
  const activeReality = searchParams.get('reality') || '';
  const activeSort = searchParams.get('sort') || 'newest';
  const activePosted = searchParams.get('posted') || '';
  const activeQuery = searchParams.get('q') || '';

  const totalJobsCount = initial?.total;
  const totalPages =
    totalJobsCount === undefined ? null : Math.max(1, Math.ceil(totalJobsCount / pageSize));

  // URL synchronization using transition for zero client jank
  const updateFilter = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(searchParams.toString());
      if (value) {
        next.set(key, value);
      } else {
        next.delete(key);
      }
      next.delete('page');
      startTransition(() => {
        const qs = next.toString();
        router.push(qs ? `${pathname}?${qs}` : pathname);
      });
    },
    [searchParams, pathname, router]
  );

  const removeFilter = useCallback(
    (key: string) => {
      const next = new URLSearchParams(searchParams.toString());
      next.delete(key);
      next.delete('page');
      startTransition(() => {
        const qs = next.toString();
        router.push(qs ? `${pathname}?${qs}` : pathname);
      });
    },
    [searchParams, pathname, router]
  );

  const clearAllFilters = useCallback(() => {
    startTransition(() => {
      router.push(pathname);
    });
  }, [pathname, router]);

  const goToPage = useCallback(
    (page: number) => {
      const next = new URLSearchParams(searchParams.toString());
      if (page > 1) {
        next.set('page', String(page));
      } else {
        next.delete('page');
      }
      startTransition(() => {
        const qs = next.toString();
        router.push(qs ? `${pathname}?${qs}` : pathname);
      });
    },
    [searchParams, pathname, router]
  );

  // Client-side filtering for Posted date window if applied
  const displayJobs = useMemo(() => {
    let items = initial?.items ?? [];
    if (activePosted) {
      const now = Date.now();
      items = items.filter((job) => {
        if (!job.posted_at) return true;
        const diffMs = now - new Date(job.posted_at).getTime();
        if (activePosted === '24h') return diffMs <= 24 * 3600 * 1000;
        if (activePosted === '3d') return diffMs <= 3 * 24 * 3600 * 1000;
        if (activePosted === '7d') return diffMs <= 7 * 24 * 3600 * 1000;
        if (activePosted === '14d') return diffMs <= 14 * 24 * 3600 * 1000;
        if (activePosted === '30d') return diffMs <= 30 * 24 * 3600 * 1000;
        return true;
      });
    }
    return items;
  }, [initial?.items, activePosted]);

  // Active filters list for chip display
  const activeFilters = useMemo(
    () =>
      [
        activeQuery && { key: 'q', label: `Search: "${activeQuery}"` },
        activeCategory && {
          key: 'category',
          label: CATEGORY_LABELS[activeCategory] || activeCategory,
        },
        activeWorkMode && {
          key: 'work_mode',
          label:
            activeWorkMode === 'remote' ? 'Remote' : activeWorkMode === 'hybrid' ? 'Hybrid' : 'Onsite',
        },
        activeCountry && {
          key: 'countries',
          label: `${getCountryFlag(activeCountry)} ${getCountryName(activeCountry)}`,
        },
        activeSkill && { key: 'skills', label: `Skill: ${activeSkill}` },
        activeSeniority && { key: 'seniority', label: `Seniority: ${activeSeniority}` },
        activeReality && { key: 'reality', label: 'Fresh only' },
        activePosted && {
          key: 'posted',
          label:
            activePosted === '24h'
              ? 'Past 24 hours'
              : activePosted === '3d'
                ? 'Past 3 days'
                : activePosted === '7d'
                  ? 'Past week'
                  : activePosted === '14d'
                    ? 'Past 2 weeks'
                    : 'Past month',
        },
      ].filter(Boolean) as { key: string; label: string }[],
    [
      activeQuery,
      activeCategory,
      activeWorkMode,
      activeCountry,
      activeSkill,
      activeSeniority,
      activeReality,
      activePosted,
    ]
  );

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 font-sans">
      <section className="flex w-full flex-col gap-3">
        {/* TOP TOOLBAR: Mode toggle, job count, Posted & Sort dropdowns */}
        <JobsToolbar
          viewMode={viewMode}
          totalJobsCount={totalJobsCount}
          activePosted={activePosted}
          activeSort={activeSort}
          onViewModeChange={setViewMode}
          onPostedChange={(val) => updateFilter('posted', val)}
          onSortChange={(val) => updateFilter('sort', val)}
        />

        {/* LIVE FILTER BAR: Search, Specializations, Work Mode, Country, Skills */}
        <JobsFilterBar
          facets={facets}
          activeQuery={activeQuery}
          activeCategory={activeCategory}
          activeWorkMode={activeWorkMode}
          activeCountry={activeCountry}
          activeReality={activeReality}
          activeSkill={activeSkill}
          onUpdateFilter={updateFilter}
          onRemoveFilter={removeFilter}
        />

        {/* ACTIVE REMOVABLE FILTER CHIPS */}
        <JobsActiveFilters
          filters={activeFilters}
          onRemoveFilter={removeFilter}
          onClearAll={clearAllFilters}
        />

        {isPending && (
          <div
            role="status"
            aria-live="polite"
            className="py-1 text-center text-xs text-neutral-500 animate-pulse"
          >
            Loading live jobs from FreeHire.me…
          </div>
        )}

        {/* SWIPE MODE VIEW */}
        {viewMode === 'swipe' && displayJobs.length > 0 && (
          <JobsSwipeDeck
            jobs={displayJobs}
            swipeIndex={swipeIndex}
            savedJobs={savedJobs}
            jobBasePath={jobBasePath}
            onSwipeNext={() => setSwipeIndex((prev) => Math.min(prev + 1, displayJobs.length - 1))}
            onToggleSave={toggleSavedJob}
            onExitSwipe={() => setViewMode('list')}
          />
        )}

        {/* MAP MODE VIEW */}
        {viewMode === 'map' && (
          <JobsMapGrid
            countryCounts={facets?.facets?.countries || {}}
            activeCountry={activeCountry}
            onSelectCountry={(code) => {
              updateFilter('countries', activeCountry.toLowerCase() === code.toLowerCase() ? '' : code);
              setViewMode('list');
            }}
            onExitMap={() => setViewMode('list')}
          />
        )}

        {/* LIST VIEW (Screenshot 1) */}
        {viewMode === 'list' && (
          <>
            {initial === null ? (
              <div
                role="alert"
                className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-12 text-center dark:border-neutral-800 dark:bg-neutral-900"
              >
                <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  Live jobs could not be loaded from FreeHire.me.
                </p>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => startTransition(() => router.refresh())}
                  className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-800 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                >
                  Try again
                </button>
              </div>
            ) : displayJobs.length === 0 ? (
              <div className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-12 text-center dark:border-neutral-800 dark:bg-neutral-900">
                <Briefcase className="mx-auto size-8 text-neutral-400" />
                <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  No jobs found matching your criteria
                </p>
                <p className="text-xs text-neutral-500">
                  Try adjusting your search terms or clearing specific filters to see more opportunities.
                </p>
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-800 shadow-2xs transition hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                >
                  <RotateCcw className="size-3" />
                  <span>Reset all filters</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3.5">
                {displayJobs.map((job) => {
                  const atsMatch = getAtsMatch(job);
                  const isApplied = getIsApplied(job);
                  return (
                    <JobCard
                      key={job.public_slug}
                      job={job}
                      isSaved={savedJobs.has(job.public_slug)}
                      jobBasePath={jobBasePath}
                      onToggleSave={toggleSavedJob}
                      onSkillClick={(skill) => updateFilter('skills', skill)}
                      atsMatch={atsMatch}
                      isApplied={isApplied}
                      hasResumeProfile={hasResumeProfile}
                    />
                  );
                })}
              </div>
            )}

            {/* PAGINATION */}
            {initial && (
              <JobsPagination
                currentPage={currentPage}
                pageSize={pageSize}
                displayCount={displayJobs.length}
                totalCount={totalJobsCount}
                totalPages={totalPages}
                hasMore={Boolean(initial.hasMore)}
                isPending={isPending}
                onPageChange={goToPage}
              />
            )}
          </>
        )}
      </section>
    </div>
  );
}
