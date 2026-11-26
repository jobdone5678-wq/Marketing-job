'use client';

import { Search, X, ChevronDown, Sparkles } from 'lucide-react';
import { TechBadgeIcon } from '@/components/tech-icons';
import {
  CATEGORY_LABELS,
  getCountryFlag,
  getCountryName,
  formatCount,
} from '@/lib/jobs/nextkinhr-formatters';
import type { FacetsData } from '@/lib/jobs/nextkinhr-types';

interface JobsFilterBarProps {
  facets?: FacetsData;
  activeQuery: string;
  activeCategory: string;
  activeWorkMode: string;
  activeCountry: string;
  activeReality: string;
  activeSkill: string;
  onUpdateFilter: (key: string, value: string) => void;
  onRemoveFilter: (key: string) => void;
}

function facetOptions(counts: Record<string, number>, selected: string) {
  const options = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (selected && !(selected in counts)) options.unshift([selected, 0]);
  return options;
}

export function JobsFilterBar({
  facets,
  activeQuery,
  activeCategory,
  activeWorkMode,
  activeCountry,
  activeReality,
  activeSkill,
  onUpdateFilter,
  onRemoveFilter,
}: JobsFilterBarProps) {
  const catCounts = facets?.facets?.category || {};
  const modeCounts = facets?.facets?.work_mode || {};
  const skillCounts = facets?.facets?.skills || {};
  const countryCounts = facets?.facets?.countries || {};

  const quickSkills = Object.entries(skillCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-neutral-200/90 bg-white p-3 shadow-2xs dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-wrap items-center justify-between gap-2.5 text-xs">
        {/* Search Input */}
        <form
          className="flex min-w-[220px] flex-1 items-center gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            const query = new FormData(event.currentTarget).get('q');
            onUpdateFilter('q', typeof query === 'string' ? query.trim() : '');
          }}
        >
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-neutral-400" />
            <input
              key={activeQuery}
              name="q"
              aria-label="Search jobs"
              defaultValue={activeQuery}
              placeholder="Search by title, company, or keywords…"
              className="w-full rounded-lg border border-neutral-200 bg-neutral-50/70 py-1.5 pr-8 pl-8 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-400 focus:bg-white focus:outline-none dark:border-neutral-700/80 dark:bg-neutral-800/60 dark:text-neutral-100 dark:focus:border-neutral-600 dark:focus:bg-neutral-900"
            />
            {activeQuery && (
              <button
                type="button"
                onClick={() => onRemoveFilter('q')}
                className="absolute top-1/2 right-2.5 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                aria-label="Clear search query"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
          <button
            type="submit"
            className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-800 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
          >
            Search
          </button>
        </form>

        {/* Quick Selects */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Specialization Filter */}
          <div className="relative inline-flex items-center">
            <select
              value={activeCategory}
              aria-label="Specialization"
              onChange={(e) => onUpdateFilter('category', e.target.value)}
              className="cursor-pointer appearance-none rounded-lg border border-neutral-200 bg-white py-1.5 pr-7 pl-2.5 text-xs font-medium text-neutral-800 shadow-2xs focus:border-neutral-400 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
            >
              <option value="">
                All Specializations {facets?.total ? `(${formatCount(facets.total)})` : ''}
              </option>
              {facetOptions(catCounts, activeCategory).map(([value, count]) => (
                <option key={value} value={value}>
                  {CATEGORY_LABELS[value] ?? value.replace(/_/g, ' ')}
                  {count ? ` (${formatCount(count)})` : ''}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 size-3 text-neutral-400" />
          </div>

          {/* Work Mode Filter */}
          <div className="relative inline-flex items-center">
            <select
              value={activeWorkMode}
              aria-label="Work mode"
              onChange={(e) => onUpdateFilter('work_mode', e.target.value)}
              className="cursor-pointer appearance-none rounded-lg border border-neutral-200 bg-white py-1.5 pr-7 pl-2.5 text-xs font-medium text-neutral-800 shadow-2xs focus:border-neutral-400 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
            >
              <option value="">Any Work Mode</option>
              {facetOptions(modeCounts, activeWorkMode).map(([value, count]) => (
                <option key={value} value={value}>
                  {value === 'remote' ? 'Remote' : value === 'hybrid' ? 'Hybrid' : 'Onsite'}
                  {count ? ` (${formatCount(count)})` : ''}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 size-3 text-neutral-400" />
          </div>

          {/* Country Filter */}
          <div className="relative inline-flex items-center">
            <select
              value={activeCountry}
              aria-label="Country"
              onChange={(e) => onUpdateFilter('countries', e.target.value)}
              className="cursor-pointer appearance-none rounded-lg border border-neutral-200 bg-white py-1.5 pr-7 pl-2.5 text-xs font-medium text-neutral-800 shadow-2xs focus:border-neutral-400 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
            >
              <option value="">🌍 Worldwide</option>
              {facetOptions(countryCounts, activeCountry).map(([value, count]) => (
                <option key={value} value={value}>
                  {getCountryFlag(value)} {getCountryName(value)}
                  {count ? ` (${formatCount(count)})` : ''}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 size-3 text-neutral-400" />
          </div>

          {/* Verified Fresh Toggle */}
          <button
            type="button"
            onClick={() => onUpdateFilter('reality', activeReality === 'fresh' ? '' : 'fresh')}
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium shadow-2xs transition ${
              activeReality === 'fresh'
                ? 'border-emerald-500 bg-emerald-500/10 font-semibold text-emerald-600 dark:text-emerald-400'
                : 'border-neutral-200 bg-white text-neutral-600 hover:text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:text-white'
            }`}
            title="Filter for openings FreeHire classifies as fresh"
            aria-pressed={activeReality === 'fresh'}
          >
            <Sparkles className="size-3" />
            <span>Fresh only</span>
          </button>
        </div>
      </div>

      {/* Popular Tech Skills Pill Strip */}
      {quickSkills.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-neutral-100 pt-2 dark:border-neutral-800">
          <span className="mr-1 text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
            Popular Skills:
          </span>
          {quickSkills.map(([skill, count]) => {
            const isSelected = activeSkill.toLowerCase() === skill.toLowerCase();
            return (
              <button
                key={skill}
                type="button"
                onClick={() => onUpdateFilter('skills', isSelected ? '' : skill)}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs transition ${
                  isSelected
                    ? 'border border-neutral-900 bg-neutral-900 font-semibold text-white shadow-2xs dark:border-white dark:bg-white dark:text-neutral-900'
                    : 'border border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400 hover:text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:border-neutral-500 dark:hover:text-white'
                }`}
                aria-pressed={isSelected}
              >
                <TechBadgeIcon skill={skill} />
                <span>{skill}</span>
                {count > 0 && (
                  <span className="text-[10px] opacity-70">({formatCount(count)})</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

