'use client';

import { Map as MapIcon, Layers, ChevronDown } from 'lucide-react';

interface JobsToolbarProps {
  viewMode: 'list' | 'map' | 'swipe';
  totalJobsCount?: number;
  activePosted: string;
  activeSort: string;
  onViewModeChange: (mode: 'list' | 'map' | 'swipe') => void;
  onPostedChange: (val: string) => void;
  onSortChange: (val: string) => void;
}

export function JobsToolbar({
  viewMode,
  totalJobsCount,
  activePosted,
  activeSort,
  onViewModeChange,
  onPostedChange,
  onSortChange,
}: JobsToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-1">
      {/* Left view mode toggle buttons */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onViewModeChange(viewMode === 'map' ? 'list' : 'map')}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold shadow-2xs transition ${
            viewMode === 'map'
              ? 'border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900'
              : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300'
          }`}
          aria-pressed={viewMode === 'map'}
        >
          <MapIcon className="size-3.5" />
          <span>Map</span>
        </button>

        <button
          type="button"
          onClick={() => onViewModeChange(viewMode === 'swipe' ? 'list' : 'swipe')}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold shadow-2xs transition ${
            viewMode === 'swipe'
              ? 'border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900'
              : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300'
          }`}
          aria-pressed={viewMode === 'swipe'}
        >
          <Layers className="size-3.5" />
          <span>Swipe</span>
        </button>
      </div>

      {/* Right job count & Posted / Sort dropdowns */}
      <div className="flex flex-wrap items-center gap-4 text-xs">
        {totalJobsCount !== undefined && (
          <span className="text-neutral-600 dark:text-neutral-400">
            <span className="font-bold text-neutral-900 dark:text-neutral-100">
              {totalJobsCount.toLocaleString()}
            </span>{' '}
            jobs
          </span>
        )}

        {/* Posted filter dropdown */}
        <div className="flex items-center gap-1.5">
          <span className="text-neutral-600 dark:text-neutral-400">Posted</span>
          <div className="relative inline-flex items-center">
            <select
              value={activePosted}
              aria-label="Posted date filter"
              onChange={(e) => onPostedChange(e.target.value)}
              className="cursor-pointer appearance-none rounded-lg border border-neutral-200 bg-white py-1 pr-6 pl-2.5 text-xs font-medium text-neutral-800 shadow-2xs focus:border-neutral-400 focus:outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200"
            >
              <option value="">Any</option>
              <option value="24h">Past 24 hours</option>
              <option value="3d">Past 3 days</option>
              <option value="7d">Past week</option>
              <option value="14d">Past 2 weeks</option>
              <option value="30d">Past month</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 size-3 text-neutral-400" />
          </div>
        </div>

        {/* Sort filter dropdown */}
        <div className="flex items-center gap-1.5">
          <span className="text-neutral-600 dark:text-neutral-400">Sort</span>
          <div className="relative inline-flex items-center">
            <select
              value={activeSort}
              aria-label="Sort jobs"
              onChange={(e) => onSortChange(e.target.value)}
              className="cursor-pointer appearance-none rounded-lg border border-neutral-200 bg-white py-1 pr-6 pl-2.5 text-xs font-medium text-neutral-800 shadow-2xs focus:border-neutral-400 focus:outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200"
            >
              <option value="newest">Newest</option>
              <option value="salary">Salary</option>
              <option value="relevance">Relevance</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 size-3 text-neutral-400" />
          </div>
        </div>
      </div>
    </div>
  );
}

