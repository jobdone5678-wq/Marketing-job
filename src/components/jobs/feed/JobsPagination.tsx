'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

interface JobsPaginationProps {
  currentPage: number;
  pageSize: number;
  displayCount: number;
  totalCount?: number;
  totalPages: number | null;
  hasMore: boolean;
  isPending: boolean;
  onPageChange: (page: number) => void;
}

export function JobsPagination({
  currentPage,
  pageSize,
  displayCount,
  totalCount,
  totalPages,
  hasMore,
  isPending,
  onPageChange,
}: JobsPaginationProps) {
  if (currentPage <= 1 && !hasMore) return null;

  return (
    <nav
      aria-label="Jobs pagination navigation"
      className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 pt-6 text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400"
    >
      {displayCount > 0 && (
        <span>
          Showing {((currentPage - 1) * pageSize + 1).toLocaleString()}–
          {((currentPage - 1) * pageSize + displayCount).toLocaleString()}
          {totalCount !== undefined && ` of ${totalCount.toLocaleString()} jobs`}
        </span>
      )}

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={currentPage <= 1 || isPending}
          onClick={() => onPageChange(currentPage - 1)}
          className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 font-medium text-neutral-800 shadow-2xs transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
          aria-label="Go to previous page"
        >
          <ChevronLeft className="size-3.5" />
          <span>Previous</span>
        </button>

        <span className="px-2.5 py-1 font-semibold text-neutral-900 dark:text-neutral-100">
          Page {currentPage}
          {totalPages !== null && ` of ${totalPages.toLocaleString()}`}
        </span>

        <button
          type="button"
          disabled={!hasMore || isPending}
          onClick={() => onPageChange(currentPage + 1)}
          className="inline-flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 font-medium text-neutral-800 shadow-2xs transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
          aria-label="Go to next page"
        >
          <span>Next</span>
          <ChevronRight className="size-3.5" />
        </button>
      </div>
    </nav>
  );
}

