'use client';

import { ArrowRight, Bookmark } from 'lucide-react';
import { CompanyLogo } from '@/components/company-logo';

interface JobPinnedHeaderProps {
  isSticky: boolean;
  companyName: string;
  title: string;
  isSaved: boolean;
  applicationHref: string;
  onToggleSave: () => void;
}

export function JobPinnedHeader({
  isSticky,
  companyName,
  title,
  isSaved,
  applicationHref,
  onToggleSave,
}: JobPinnedHeaderProps) {
  if (!isSticky) return null;

  return (
    <div
      role="region"
      aria-label="Pinned job header"
      className="fixed top-14 right-0 left-0 z-40 border-b border-neutral-200 bg-white/95 backdrop-blur-xs transition-all duration-200 dark:border-neutral-800 dark:bg-neutral-900/95"
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <CompanyLogo company={companyName} size="xs" />
          <span className="truncate text-xs font-semibold text-neutral-800 dark:text-neutral-200 sm:text-sm">
            {companyName} <span className="text-neutral-400">·</span> {title}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onToggleSave}
            aria-label={isSaved ? 'Remove bookmark' : 'Bookmark on this device'}
            aria-pressed={isSaved}
            className="rounded-lg border border-neutral-200 p-1.5 text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            <Bookmark className="size-4" fill={isSaved ? 'currentColor' : 'none'} />
          </button>
          <a
            href={applicationHref}
            target="_blank"
            rel="nofollow noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-black px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
          >
            <span>Apply</span>
            <ArrowRight className="size-3" />
          </a>
        </div>
      </div>
    </div>
  );
}

