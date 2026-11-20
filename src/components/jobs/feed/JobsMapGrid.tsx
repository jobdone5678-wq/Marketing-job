'use client';

import { getCountryFlag, getCountryName, formatCount } from '@/lib/jobs/freehire-formatters';

interface JobsMapGridProps {
  countryCounts: Record<string, number>;
  activeCountry: string;
  onSelectCountry: (code: string) => void;
  onExitMap: () => void;
}

export function JobsMapGrid({
  countryCounts,
  activeCountry,
  onSelectCountry,
  onExitMap,
}: JobsMapGridProps) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
            Global Job Distribution
          </h3>
          <p className="text-xs text-neutral-500">
            Select a region or country to filter active openings
          </p>
        </div>
        <button
          type="button"
          onClick={onExitMap}
          className="text-xs font-semibold text-neutral-600 hover:underline dark:text-neutral-400"
        >
          Back to List
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {Object.entries(countryCounts)
          .slice(0, 16)
          .map(([code, count]) => {
            const isSelected = activeCountry.toLowerCase() === code.toLowerCase();
            return (
              <button
                key={code}
                type="button"
                onClick={() => onSelectCountry(code)}
                className={`flex items-center justify-between rounded-xl border p-3 text-left transition ${
                  isSelected
                    ? 'border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900'
                    : 'border-neutral-200 bg-neutral-50 hover:border-neutral-300 hover:bg-white dark:border-neutral-800 dark:bg-neutral-800/60 dark:hover:border-neutral-700 dark:hover:bg-neutral-800'
                }`}
                aria-pressed={isSelected}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{getCountryFlag(code)}</span>
                  <span className="text-xs font-semibold">{getCountryName(code)}</span>
                </div>
                <span className="text-[11px] opacity-75">{formatCount(count)}</span>
              </button>
            );
          })}
      </div>
    </div>
  );
}

