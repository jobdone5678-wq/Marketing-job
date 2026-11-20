'use client';

import React from 'react';
import Link from 'next/link';
import { Bookmark, MapPin } from 'lucide-react';
import type { Job } from '@/lib/jobs/freehire-types';
import { CompanyLogo } from '@/components/company-logo';
import { LinkedInIcon } from '@/components/tech-icons';
import {
  getCountryFlag,
  getCountryName,
  formatRelativeTime,
  cleanHtmlSnippet,
  SOURCE_KINDS,
  SOURCE_DISPLAY_NAMES,
} from '@/lib/jobs/freehire-formatters';

interface JobCardProps {
  job: Job;
  isSaved: boolean;
  jobBasePath: string;
  onToggleSave: (slug: string) => void;
  onSkillClick?: (skill: string) => void;
}

export const JobCard = React.memo(function JobCard({
  job,
  isSaved,
  jobBasePath,
  onToggleSave,
  onSkillClick,
}: JobCardProps) {
  const countryCode = job.countries?.[0];
  const flag = getCountryFlag(countryCode);
  const country = countryCode ? getCountryName(countryCode) : null;
  const relativeTime = formatRelativeTime(job.posted_at);
  const snippetText = job.enrichment?.summary || cleanHtmlSnippet(job.description);

  const skills =
    job.enrichment?.skills && job.enrichment.skills.length > 0
      ? job.enrichment.skills
      : job.skills && job.skills.length > 0
        ? job.skills
        : [];

  const displaySkills = skills.slice(0, 5);
  const extraCount = skills.length > 5 ? skills.length - 5 : 0;

  const workModeText =
    job.work_mode === 'remote'
      ? 'Remote'
      : job.work_mode === 'hybrid'
        ? 'Hybrid'
        : job.work_mode === 'onsite'
          ? 'Onsite'
          : null;

  const rawSource = (job.source || 'linkedin').toLowerCase();
  const sourceDisplayName =
    SOURCE_DISPLAY_NAMES[rawSource] ||
    (rawSource === 'linkedin' ? 'LinkedIn' : rawSource.charAt(0).toUpperCase() + rawSource.slice(1));
  const sourceKind = SOURCE_KINDS[rawSource] || 'aggregator';
  const sourceKindLabel = sourceKind === 'ats' ? 'ATS' : 'Aggregator';

  const isNew =
    job.reality?.class === 'fresh' ||
    (job.posted_at && Date.now() - new Date(job.posted_at).getTime() < 3 * 24 * 3600 * 1000);

  return (
    <article className="group relative flex flex-col gap-2 rounded-2xl border border-neutral-200/90 bg-white p-5 shadow-2xs transition-all hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700">
      {/* Top Header: Logo, Company Name, Time, Bookmark */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <CompanyLogo company={job.company} size="sm" />
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
            <span className="font-semibold text-neutral-800 dark:text-neutral-200">
              {job.company || 'Company'}
            </span>
            {relativeTime && (
              <>
                <span aria-hidden="true">·</span>
                <span>{relativeTime}</span>
              </>
            )}
          </div>
        </div>

        {/* Bookmark Button */}
        <button
          type="button"
          onClick={() => onToggleSave(job.public_slug)}
          aria-label={isSaved ? 'Remove bookmark' : 'Bookmark on this device'}
          aria-pressed={isSaved}
          className="p-1 text-neutral-400 transition hover:text-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 rounded dark:hover:text-neutral-100"
        >
          <Bookmark className="size-4.5" fill={isSaved ? 'currentColor' : 'none'} />
        </button>
      </div>

      {/* Job Title */}
      <div className="pt-0.5">
        <Link
          href={`${jobBasePath}/${encodeURIComponent(job.public_slug)}`}
          className="block text-base font-bold text-neutral-900 transition-colors hover:text-blue-600 focus-visible:outline-none focus-visible:underline dark:text-neutral-100 dark:hover:text-blue-400 sm:text-lg"
        >
          {job.title}
        </Link>
      </div>

      {/* Badge: New */}
      {isNew && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">New</span>
        </div>
      )}

      {/* Location Line: Remote [Flag] Country [Pin] City */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
        {workModeText && (
          <span className="font-normal text-neutral-700 dark:text-neutral-300">{workModeText}</span>
        )}
        {country && (
          <span className="inline-flex items-center gap-1 font-normal text-neutral-700 dark:text-neutral-300">
            <span>{flag}</span>
            <span>{country}</span>
          </span>
        )}
        {job.location && (
          <span className="inline-flex max-w-sm items-center gap-1 truncate text-neutral-600 dark:text-neutral-400">
            <MapPin className="size-3.5 shrink-0 text-neutral-400" />
            <span>{job.location}</span>
          </span>
        )}
      </div>

      {/* Description Snippet */}
      {snippetText && (
        <p className="line-clamp-2 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
          {snippetText}
        </p>
      )}

      {/* Skill Pills */}
      {displaySkills.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {displaySkills.map((skill) => (
            <button
              key={skill}
              type="button"
              onClick={() => onSkillClick?.(skill)}
              className="inline-flex items-center rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1 text-xs font-normal text-neutral-700 transition hover:border-neutral-300 hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 dark:border-neutral-800 dark:bg-neutral-800/80 dark:text-neutral-300 dark:hover:border-neutral-700 dark:hover:bg-neutral-800"
            >
              <span className="capitalize">{skill}</span>
            </button>
          ))}
          {extraCount > 0 && (
            <span className="inline-flex items-center rounded-full border border-neutral-200/80 bg-neutral-50/80 px-2.5 py-1 text-xs font-normal text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/50 dark:text-neutral-400">
              +{extraCount} skills
            </span>
          )}
        </div>
      )}

      {/* Bottom Source Row */}
      <div className="flex items-center gap-2 pt-1">
        <span className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200/90 bg-white px-2 py-0.5 text-xs font-medium text-neutral-700 shadow-2xs dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
          {rawSource === 'linkedin' ? (
            <LinkedInIcon className="size-3 shrink-0" />
          ) : (
            <span className="size-2 shrink-0 rounded-full bg-emerald-500" />
          )}
          <span className="truncate">{sourceDisplayName}</span>
          <span className="shrink-0 border-l border-neutral-200 pl-1.5 text-xs font-normal text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
            {sourceKindLabel}
          </span>
        </span>
      </div>
    </article>
  );
});

