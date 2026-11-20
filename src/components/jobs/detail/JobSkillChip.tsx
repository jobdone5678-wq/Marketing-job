'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { getSkillDescription } from '@/lib/jobs/skill-descriptions';

interface JobSkillChipProps {
  skill: string;
  jobBasePath: string;
  onClaimSkill?: (skill: string) => void;
  onAvoidSkill?: (skill: string) => void;
}

export function JobSkillChip({
  skill,
  jobBasePath,
  onClaimSkill,
  onAvoidSkill,
}: JobSkillChipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const description = getSkillDescription(skill);

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <span className="group/chip inline-flex items-center rounded-lg border border-neutral-200/90 bg-white px-2.5 py-1 text-xs font-normal text-neutral-800 shadow-2xs transition hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
        {/* Skill label with filter link */}
        <Link
          href={`${jobBasePath}?skills=${encodeURIComponent(skill)}`}
          className="inline-flex items-center gap-1 transition hover:opacity-80 focus-visible:outline-none focus-visible:underline"
        >
          <span className="capitalize">{skill}</span>
        </Link>

        {/* 24px WCAG 2.5.8 touch target button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(!isOpen);
          }}
          className="-my-1 -mr-1.5 ml-1.5 inline-flex size-6 items-center justify-center opacity-40 transition hover:opacity-100 group-hover/chip:opacity-75 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 rounded-full"
          aria-label={`Show what ${skill} is`}
          aria-expanded={isOpen}
        >
          <span className="inline-flex size-4 items-center justify-center rounded-full border border-current/30 text-[10px] leading-none">
            ?
          </span>
        </button>
      </span>

      {/* Popover Definition & Actions */}
      {isOpen && (
        <div
          role="tooltip"
          className="absolute bottom-full left-0 z-50 mb-2 w-72 rounded-xl border border-neutral-200 bg-white p-3 text-xs shadow-xl duration-150 dark:border-neutral-700 dark:bg-neutral-900"
        >
          <div className="flex items-center justify-between">
            <p className="font-semibold text-neutral-900 capitalize dark:text-neutral-100">
              {skill}
            </p>
            {onClaimSkill && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClaimSkill(skill);
                }}
                className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300"
              >
                <Check className="size-2.5" />
                <span>I have it</span>
              </button>
            )}
          </div>
          <p className="mt-1.5 leading-relaxed text-neutral-600 dark:text-neutral-300">
            {description}
          </p>
          <div className="mt-2.5 flex items-center justify-between border-t border-neutral-100 pt-2 text-[11px] dark:border-neutral-800">
            <Link
              href={`${jobBasePath}?skills=${encodeURIComponent(skill)}`}
              className="font-medium text-neutral-900 underline dark:text-neutral-100"
            >
              Filter by {skill} →
            </Link>
            {onAvoidSkill && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAvoidSkill(skill);
                }}
                className="text-neutral-400 transition hover:text-rose-600 dark:hover:text-rose-400"
              >
                Avoid skill
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

