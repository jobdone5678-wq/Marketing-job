'use client';

import { JobMatchCard } from './JobMatchCard';
import { JobMetadataTable } from './JobMetadataTable';
import { JobSourceAvoidRow } from './JobSourceAvoidRow';
import type { Requirement } from '@/lib/jobs/nextkinhr-types';

interface JobFactsSidebarProps {
  matchPercentage: number;
  matchedSkills: string[];
  missingSkills: string[];
  totalSkillsCount: number;
  requirementsList: Requirement[];
  workFormat: string;
  locationDisplay: string | null;
  regionDisplay: string;
  categoryDisplay: string;
  countryName: string | null;
  flag: string;
  companyType: string;
  domainsDisplay: string;
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

export function JobFactsSidebar({
  matchPercentage,
  matchedSkills,
  missingSkills,
  totalSkillsCount,
  requirementsList,
  workFormat,
  locationDisplay,
  regionDisplay,
  categoryDisplay,
  countryName,
  flag,
  companyType,
  domainsDisplay,
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
}: JobFactsSidebarProps) {
  return (
    <aside
      aria-label="Job profile match and facts"
      className="w-full shrink-0 lg:w-72"
    >
      <div className="sticky top-20 flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-4 shadow-2xs dark:border-neutral-800 dark:bg-neutral-900">
        {/* Profile match section */}
        <JobMatchCard
          matchPercentage={matchPercentage}
          matchedSkills={matchedSkills}
          missingSkills={missingSkills}
          totalSkillsCount={totalSkillsCount}
          requirementsList={requirementsList}
          workFormat={workFormat}
          countryName={countryName}
        />

        {/* Metadata summary list */}
        <JobMetadataTable
          workFormat={workFormat}
          locationDisplay={locationDisplay}
          regionDisplay={regionDisplay}
          categoryDisplay={categoryDisplay}
          countryName={countryName}
          flag={flag}
          companyType={companyType}
          domainsDisplay={domainsDisplay}
        />

        {/* Source provenance and avoidance */}
        <JobSourceAvoidRow
          sourceName={sourceName}
          rawSource={rawSource}
          sourceKindLabel={sourceKindLabel}
          isSourceAvoided={isSourceAvoided}
          upvotes={upvotes}
          downvotes={downvotes}
          userVote={userVote}
          sourceNote={sourceNote}
          onToggleAvoidSource={onToggleAvoidSource}
          onCastVote={onCastVote}
        />
      </div>
    </aside>
  );
}
