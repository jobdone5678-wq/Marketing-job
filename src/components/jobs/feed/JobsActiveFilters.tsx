'use client';

import { Filter, X, RotateCcw } from 'lucide-react';

interface ActiveFilterItem {
  key: string;
  label: string;
}

interface JobsActiveFiltersProps {
  filters: ActiveFilterItem[];
  onRemoveFilter: (key: string) => void;
  onClearAll: () => void;
}

export function JobsActiveFilters({
  filters,
  onRemoveFilter,
  onClearAll,
}: JobsActiveFiltersProps) {
  if (filters.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="Active search filters"
      className="flex flex-wrap items-center gap-2 px-1 py-0.5 text-xs"
    >
      <span className="flex items-center gap-1 font-medium text-neutral-500 dark:text-neutral-400">
        <Filter className="size-3" />
        <span>Active filters:</span>
      </span>
      {filters.map((f) => (
        <span
          key={f.key}
          className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-neutral-100/80 px-2 py-0.5 text-xs font-medium text-neutral-800 shadow-2xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
        >
          <span>{f.label}</span>
          <button
            type="button"
            onClick={() => onRemoveFilter(f.key)}
            className="text-neutral-400 transition hover:text-neutral-700 dark:hover:text-neutral-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 rounded"
            aria-label={`Remove filter ${f.label}`}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={onClearAll}
        className="ml-1 inline-flex items-center gap-1 text-xs text-neutral-500 underline underline-offset-2 transition hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100"
      >
        <RotateCcw className="size-3" />
        <span>Clear all</span>
      </button>
    </div>
  );
}

