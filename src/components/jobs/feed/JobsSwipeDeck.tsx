'use client';

import Link from 'next/link';
import { Bookmark, MapPin, X, Heart, ExternalLink } from 'lucide-react';
import type { Job } from '@/lib/jobs/freehire-types';
import { CompanyLogo } from '@/components/company-logo';
import {
  getCountryFlag,
  getCountryName,
  formatRelativeTime,
  cleanHtmlSnippet,
} from '@/lib/jobs/freehire-formatters';

interface JobsSwipeDeckProps {
  jobs: Job[];
  swipeIndex: number;
  savedJobs: Set<string>;
  jobBasePath: string;
  onSwipeNext: () => void;
  onToggleSave: (slug: string) => void;
  onExitSwipe: () => void;
}

export function JobsSwipeDeck({
  jobs,
  swipeIndex,
  savedJobs,
  jobBasePath,
  onSwipeNext,
  onToggleSave,
  onExitSwipe,
}: JobsSwipeDeckProps) {
  const currentJob = jobs[swipeIndex];
  if (!currentJob) return null;

  const isSaved = savedJobs.has(currentJob.public_slug);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 py-4">
      <div className="flex w-full items-center justify-between text-xs text-neutral-500">
        <span>
          Card {swipeIndex + 1} of {jobs.length}
        </span>
        <button
          type="button"
          onClick={onExitSwipe}
          className="font-medium hover:underline text-neutral-700 dark:text-neutral-300"
        >
          Exit swipe mode
        </button>
      </div>

      <div className="w-full rounded-2xl border border-neutral-200 bg-white p-6 shadow-md dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <CompanyLogo company={currentJob.company} size="md" />
            <div>
              <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                {currentJob.company}
              </h3>
              <span className="text-xs text-neutral-500">
                {formatRelativeTime(currentJob.posted_at)}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onToggleSave(currentJob.public_slug)}
            className="p-1.5 text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
            aria-label={isSaved ? 'Remove from board' : 'Save to board'}
          >
            <Bookmark className="size-5" fill={isSaved ? 'currentColor' : 'none'} />
          </button>
        </div>

        <div className="mt-4">
          <Link
            href={`${jobBasePath}/${encodeURIComponent(currentJob.public_slug)}`}
            className="text-xl font-bold text-neutral-900 hover:text-blue-600 dark:text-neutral-100 dark:hover:text-blue-400"
          >
            {currentJob.title}
          </Link>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
          {currentJob.work_mode && (
            <span className="capitalize font-medium">{currentJob.work_mode}</span>
          )}
          {currentJob.countries?.[0] && (
            <span>
              {getCountryFlag(currentJob.countries[0])} {getCountryName(currentJob.countries[0])}
            </span>
          )}
          {currentJob.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3" />
              {currentJob.location}
            </span>
          )}
        </div>

        <p className="mt-4 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
          {currentJob.enrichment?.summary || cleanHtmlSnippet(currentJob.description)}
        </p>

        <div className="mt-6 flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={onSwipeNext}
            className="flex size-12 items-center justify-center rounded-full border border-neutral-300 bg-white text-neutral-600 shadow-sm hover:border-neutral-400 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
            title="Skip job"
            aria-label="Skip job"
          >
            <X className="size-5" />
          </button>

          <button
            type="button"
            onClick={() => {
              onToggleSave(currentJob.public_slug);
              onSwipeNext();
            }}
            className="flex size-14 items-center justify-center rounded-full bg-rose-500 text-white shadow-md hover:bg-rose-600"
            title="Save job"
            aria-label="Save job and continue"
          >
            <Heart className="size-6" fill="currentColor" />
          </button>

          <Link
            href={`${jobBasePath}/${encodeURIComponent(currentJob.public_slug)}`}
            className="flex size-12 items-center justify-center rounded-full border border-neutral-300 bg-white text-neutral-600 shadow-sm hover:border-neutral-400 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
            title="View details"
            aria-label="View job details"
          >
            <ExternalLink className="size-5" />
          </Link>
        </div>
      </div>
    </div>
  );
}

