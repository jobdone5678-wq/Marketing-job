'use client';

import { Check, TriangleAlert } from 'lucide-react';
import { TechBadgeIcon } from '@/components/tech-icons';
import type { Requirement } from '@/lib/jobs/freehire-types';

interface JobMatchCardProps {
  matchPercentage: number;
  matchedSkills: string[];
  missingSkills: string[];
  totalSkillsCount: number;
  requirementsList?: Requirement[];
  workFormat?: string;
  countryName?: string | null;
}

export function JobMatchCard({
  matchPercentage,
  matchedSkills,
  missingSkills,
  totalSkillsCount,
  requirementsList = [],
  workFormat,
  countryName,
}: JobMatchCardProps) {
  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
          Profile match
        </p>
      </div>

      {/* Score & Counter Row */}
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-2xl font-bold tabular-nums leading-none text-neutral-900 dark:text-neutral-100">
          {matchPercentage}%
        </span>
        <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
          {matchedSkills.length} of {totalSkillsCount} skills
        </span>
      </div>

      {/* Progress Bar */}
      <div className="h-2 w-full overflow-hidden rounded bg-neutral-100 dark:bg-neutral-800">
        <div
          className="h-full bg-[#5B891A] transition-all duration-300"
          style={{ width: `${Math.min(100, Math.max(0, matchPercentage))}%` }}
        />
      </div>

      {/* Matched Skills Group (You have) */}
      {matchedSkills.length > 0 && (
        <div className="flex flex-col gap-1.5 pt-1">
          <span className="flex items-center gap-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300">
            <span className="size-2 rounded-full bg-[#5B891A]" />
            <span>You have</span>
          </span>
          <div className="flex flex-wrap gap-1.5">
            {matchedSkills.map((skill) => (
              <span
                key={skill}
                className="inline-flex items-center gap-1 rounded-full border border-emerald-200/60 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300"
              >
                <TechBadgeIcon skill={skill} />
                <span>{skill}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Missing Skills Group (Missing) */}
      {missingSkills.length > 0 && (
        <div className="flex flex-col gap-1.5 pt-1">
          <span className="flex items-center gap-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300">
            <span className="size-2 rounded-full bg-rose-500" />
            <span>Missing</span>
          </span>
          <div className="flex flex-wrap gap-1.5">
            {missingSkills.map((skill) => (
              <span
                key={skill}
                className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-2.5 py-0.5 text-xs font-medium text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
              >
                <TechBadgeIcon skill={skill} />
                <span>{skill}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Requirements List */}
      {requirementsList.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-neutral-100 pt-3 dark:border-neutral-800">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-neutral-500 dark:text-neutral-400">
            <span className="size-1.5 rounded-full bg-neutral-400" />
            <span>Requirements</span>
          </span>
          <ul className="flex flex-col gap-1.5 pt-1 text-xs text-neutral-600 dark:text-neutral-300">
            {requirementsList.slice(0, 3).map((req, i) => (
              <li key={i} className="flex items-start gap-1.5 leading-snug">
                <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                <span>{req.text}</span>
              </li>
            ))}
            {workFormat === 'Remote' && countryName && (
              <li className="flex items-start gap-1.5 leading-snug text-amber-700 dark:text-amber-400">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                <span>Remote in {countryName} or EU timezone alignment required</span>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
