'use client';

import {
  FileText,
  Check,
  Ban,
  RotateCcw,
  TriangleAlert,
} from 'lucide-react';
import { TechBadgeIcon } from '@/components/tech-icons';
import type { Requirement } from '@/lib/jobs/freehire-types';

interface AdjacentSkill {
  name: string;
  via: string;
}

interface JobMatchCardProps {
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
  countryName: string | null;
  onUploadClick: () => void;
  onToggleClaimRow: (skill: string) => void;
  onClaimSkill: (skill: string) => void;
  onAvoidSkill: (skill: string) => void;
  onStopAvoidingSkill: (skill: string) => void;
  onUndo: () => void;
}

export function JobMatchCard({
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
  countryName,
  onUploadClick,
  onToggleClaimRow,
  onClaimSkill,
  onAvoidSkill,
  onStopAvoidingSkill,
  onUndo,
}: JobMatchCardProps) {
  const showMatchDetails = matchPercentage > 0 || cvUploaded;

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
          Profile match
        </p>
      </div>

      {/* Upload CV Box */}
      <div className="flex items-center justify-between rounded-xl border border-neutral-100 bg-neutral-50/70 p-2.5 dark:border-neutral-800 dark:bg-neutral-800/40">
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-neutral-400" />
          <span className="text-[11px] text-neutral-600 dark:text-neutral-400">
            {cvUploaded ? 'CV Attached (Parsed)' : 'Add your skills or upload a CV'}
          </span>
        </div>
        <button
          type="button"
          onClick={onUploadClick}
          className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-neutral-800 shadow-2xs hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
        >
          {cvUploaded ? 'Update CV' : 'Upload CV'}
        </button>
      </div>

      {/* Match Breakdown & Two-tone Bar */}
      {showMatchDetails && (
        <div className="flex flex-col gap-3 border-t border-neutral-100 pt-3 dark:border-neutral-800">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-2xl font-bold tabular-nums leading-none text-neutral-900 dark:text-neutral-100">
              {matchPercentage}%
            </span>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              {matchedSkills.length} of {totalSkillsCount} skills
              {adjacentSkills.length > 0 && ` · ${adjacentSkills.length} close`}
            </span>
          </div>

          {/* Two-colour progress bar */}
          <div className="flex h-2 overflow-hidden rounded bg-neutral-100 dark:bg-neutral-800">
            <div
              className="h-full bg-emerald-600 transition-all duration-300"
              style={{
                width: `${Math.round((matchedSkills.length / (totalSkillsCount || 1)) * 100)}%`,
              }}
            />
            <div
              className="h-full bg-amber-500 transition-all duration-300"
              style={{
                width: `${Math.round((adjacentSkills.length / (totalSkillsCount || 1)) * 100)}%`,
              }}
            />
          </div>

          {/* Group 1: You have */}
          {matchedSkills.length > 0 && (
            <div className="flex flex-col gap-1.5 pt-1">
              <span className="flex items-center gap-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                <span className="size-1.5 rounded-full bg-emerald-600"></span>
                <span>You have</span>
              </span>
              <div className="flex flex-wrap gap-1.5">
                {matchedSkills.map((skill) => (
                  <span
                    key={skill}
                    className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300"
                  >
                    <TechBadgeIcon skill={skill} />
                    <span className="capitalize">{skill}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Group 2: Close — you have a related skill */}
          {adjacentSkills.length > 0 && (
            <div className="flex flex-col gap-1.5 pt-1">
              <span className="flex items-center gap-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                <span className="size-1.5 rounded-full bg-amber-500"></span>
                <span>Close — you have a related skill</span>
              </span>
              <div className="flex flex-wrap gap-1.5">
                {adjacentSkills.map((a) => {
                  const isOpen = openClaimSkill === a.name;
                  const isAvoided = avoidedSkills.has(a.name);
                  return (
                    <button
                      key={a.name}
                      type="button"
                      onClick={() => onToggleClaimRow(a.name)}
                      aria-expanded={isOpen}
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition ${
                        isAvoided
                          ? 'border-neutral-200 bg-neutral-100 text-neutral-400 line-through opacity-60'
                          : isOpen
                            ? 'border-amber-500 bg-amber-50 text-amber-800 ring-2 ring-neutral-400/30'
                            : 'border-amber-500/30 bg-amber-500/10 text-amber-700 hover:border-amber-500/60 dark:text-amber-300'
                      }`}
                    >
                      <TechBadgeIcon skill={a.name} />
                      <span className="capitalize">{a.name}</span>
                      <span className="text-[10px] opacity-75">· you have {a.via}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Group 3: Missing */}
          {missingSkills.length > 0 && (
            <div className="flex flex-col gap-1.5 pt-1">
              <span className="flex items-center gap-1.5 text-xs font-medium text-neutral-500 dark:text-neutral-400">
                <span className="size-1.5 rounded-full bg-rose-500"></span>
                <span>Missing</span>
              </span>
              <div className="flex flex-wrap gap-1.5">
                {missingSkills.map((skill) => {
                  const isOpen = openClaimSkill === skill;
                  const isAvoided = avoidedSkills.has(skill);
                  return (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => onToggleClaimRow(skill)}
                      aria-expanded={isOpen}
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition ${
                        isAvoided
                          ? 'border-neutral-200 bg-neutral-100 text-neutral-400 line-through opacity-60'
                          : isOpen
                            ? 'border-rose-500 bg-rose-50 text-rose-800 ring-2 ring-neutral-400/30'
                            : 'border-rose-500/20 bg-rose-500/10 text-rose-700 hover:border-rose-500/40 dark:text-rose-300'
                      }`}
                    >
                      <TechBadgeIcon skill={skill} />
                      <span className="capitalize">{skill}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Inline Claim Action Row */}
          {openClaimSkill && (
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50 p-2 text-xs dark:border-neutral-800 dark:bg-neutral-800">
              <span className="font-semibold text-neutral-900 capitalize dark:text-neutral-100">
                {openClaimSkill}:
              </span>
              <button
                type="button"
                onClick={() => onClaimSkill(openClaimSkill)}
                className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-medium text-white shadow-2xs hover:bg-emerald-700"
              >
                <Check className="size-3" />
                <span>I have it</span>
              </button>
              {avoidedSkills.has(openClaimSkill) ? (
                <button
                  type="button"
                  onClick={() => onStopAvoidingSkill(openClaimSkill)}
                  className="inline-flex items-center gap-1 rounded-full border border-neutral-300 bg-white px-2.5 py-0.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
                >
                  <RotateCcw className="size-3" />
                  <span>Stop avoiding</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onAvoidSkill(openClaimSkill)}
                  className="inline-flex items-center gap-1 rounded-full border border-neutral-300 bg-white px-2.5 py-0.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
                >
                  <Ban className="size-3" />
                  <span>Avoid</span>
                </button>
              )}
            </div>
          )}

          {/* Undo note */}
          {lastAction && (
            <div className="flex items-center justify-between text-xs text-neutral-500">
              <span>
                <strong className="text-neutral-800 dark:text-neutral-200">{lastAction.skill}</strong>{' '}
                {lastAction.type === 'claim' ? 'added to your profile' : 'added to avoided skills'}.
              </span>
              <button
                type="button"
                onClick={onUndo}
                className="font-semibold text-neutral-900 underline dark:text-neutral-100"
              >
                Undo
              </button>
            </div>
          )}
        </div>
      )}

      {/* Requirements List */}
      {requirementsList.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-neutral-100 pt-3 dark:border-neutral-800">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-neutral-500 dark:text-neutral-400">
            <span className="size-1.5 rounded-full bg-neutral-400"></span>
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

