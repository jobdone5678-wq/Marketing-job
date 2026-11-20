'use client';

import { JobMatchCard } from './JobMatchCard';
import { JobMetadataTable } from './JobMetadataTable';
import { JobSourceAvoidRow } from './JobSourceAvoidRow';
import type { Requirement } from '@/lib/jobs/freehire-types';

interface AdjacentSkill {
  name: string;
  via: string;
}

interface JobFactsSidebarProps {
  cvUploaded: boolean;
  matchPercentage: number;
  matchedSkills: string[];
  adjacentSkills: AdjacentSkill[];
  missingSkills: string[];
  totalSkillsCount: number;
  openClaimSkill: string | null;
  avoidedSkills: Set<string>;
  lastAction: { type: 'claim' | 'avoid'; skill: string } | null;
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
  onUploadClick: () => void;
  onToggleClaimRow: (skill: string) => void;
  onClaimSkill: (skill: string) => void;
  onAvoidSkill: (skill: string) => void;
  onStopAvoidingSkill: (skill: string) => void;
  onUndo: () => void;
  onToggleAvoidSource: () => void;
  onCastVote: (dir: 'up' | 'down') => void;
}

export function JobFactsSidebar({
  cvUploaded,
  matchPercentage,
  matchedSkills,
  adjacentSkills,
  missingSkills,
  totalSkillsCount,
  openClaimSkill,
  avoidedSkills,
  lastAction,
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
  onUploadClick,
  onToggleClaimRow,
  onClaimSkill,
  onAvoidSkill,
  onStopAvoidingSkill,
  onUndo,
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
          cvUploaded={cvUploaded}
          matchPercentage={matchPercentage}
          matchedSkills={matchedSkills}
          adjacentSkills={adjacentSkills}
          missingSkills={missingSkills}
          totalSkillsCount={totalSkillsCount}
          openClaimSkill={openClaimSkill}
          avoidedSkills={avoidedSkills}
          lastAction={lastAction}
          requirementsList={requirementsList}
          workFormat={workFormat}
          countryName={countryName}
          onUploadClick={onUploadClick}
          onToggleClaimRow={onToggleClaimRow}
          onClaimSkill={onClaimSkill}
          onAvoidSkill={onAvoidSkill}
          onStopAvoidingSkill={onStopAvoidingSkill}
          onUndo={onUndo}
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

        {/* ATS Source avoid row & Thumbs voting */}
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

