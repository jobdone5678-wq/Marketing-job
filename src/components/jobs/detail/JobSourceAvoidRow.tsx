'use client';

import { Ban, RotateCcw, ThumbsUp, ThumbsDown } from 'lucide-react';
import { LinkedInIcon } from '@/components/tech-icons';

interface JobSourceAvoidRowProps {
  sourceName: string;
  rawSource: string;
  sourceKindLabel: string;
  isSourceAvoided: boolean;
  upvotes: number;
  downvotes: number;
  userVote: 'up' | 'down' | null;
  sourceNote: string | null;
  onToggleAvoidSource: () => void;
  onCastVote: (dir: 'up' | 'down') => void;
}

export function JobSourceAvoidRow({
  sourceName,
  rawSource,
  sourceKindLabel,
  isSourceAvoided,
  upvotes,
  downvotes,
  userVote,
  sourceNote,
  onToggleAvoidSource,
  onCastVote,
}: JobSourceAvoidRowProps) {
  return (
    <div className="flex flex-col gap-2.5 border-t border-neutral-100 pt-3 dark:border-neutral-800">
      {/* Source Tag with Avoid ⊘ button */}
      <div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-md border border-neutral-200/90 bg-white px-2 py-1 text-xs font-medium text-neutral-700 shadow-2xs dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 ${
            isSourceAvoided ? 'line-through opacity-60' : ''
          }`}
        >
          {rawSource === 'linkedin' ? (
            <LinkedInIcon className="size-3 shrink-0" />
          ) : (
            <span className="size-2 shrink-0 rounded-full bg-emerald-500" />
          )}
          <span className="truncate">{sourceName}</span>
          <span className="shrink-0 border-l border-neutral-200 pl-1.5 text-xs font-normal text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
            {sourceKindLabel}
          </span>

          {/* Avoid ⊘ Icon Button */}
          <button
            type="button"
            onClick={onToggleAvoidSource}
            title={
              isSourceAvoided ? `Stop avoiding ${sourceName}` : `Avoid ${sourceName} sources`
            }
            aria-label={isSourceAvoided ? `Stop avoiding ${sourceName}` : `Avoid ${sourceName} sources`}
            aria-pressed={isSourceAvoided}
            className="ml-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 rounded"
          >
            {isSourceAvoided ? (
              <RotateCcw className="size-3 text-emerald-600" />
            ) : (
              <Ban className="size-3 text-neutral-500" />
            )}
          </button>
        </span>
      </div>

      {/* Vote Control (Thumbs row from Screenshot 2) */}
      <div className="flex items-center gap-2 pt-0.5">
        <button
          type="button"
          onClick={() => onCastVote('up')}
          aria-label="Upvote this job match"
          aria-pressed={userVote === 'up'}
          className={`inline-flex items-center justify-center rounded-lg border px-3 py-1.5 text-xs transition ${
            userVote === 'up'
              ? 'border-emerald-500/40 bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'
              : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
          }`}
          title="Helpful job match"
        >
          <ThumbsUp className="size-3.5" />
          {upvotes > 0 && <span className="ml-1 text-[11px]">{upvotes}</span>}
        </button>

        <button
          type="button"
          onClick={() => onCastVote('down')}
          aria-label="Downvote this job match"
          aria-pressed={userVote === 'down'}
          className={`inline-flex items-center justify-center rounded-lg border px-3 py-1.5 text-xs transition ${
            userVote === 'down'
              ? 'border-rose-500/40 bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400'
              : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
          }`}
          title="Not a good fit"
        >
          <ThumbsDown className="size-3.5" />
          {downvotes > 0 && <span className="ml-1 text-[11px]">{downvotes}</span>}
        </button>
      </div>

      {sourceNote && (
        <span role="status" className="text-[10px] text-neutral-500 animate-fade-in">
          {sourceNote}
        </span>
      )}
    </div>
  );
}

