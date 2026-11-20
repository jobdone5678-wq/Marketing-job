'use client';

import { LinkedInIcon } from '@/components/tech-icons';

interface JobTabNavigationProps {
  activeTab: 'description' | 'company' | 'discussion';
  companyName: string;
  onTabChange: (tab: 'description' | 'company' | 'discussion') => void;
  onOpenReferralModal: () => void;
}

export function JobTabNavigation({
  activeTab,
  companyName,
  onTabChange,
  onOpenReferralModal,
}: JobTabNavigationProps) {
  return (
    <div
      role="navigation"
      aria-label="Job detail tabs"
      className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 dark:border-neutral-800"
    >
      <div className="flex items-center gap-6 text-sm font-semibold">
        <button
          type="button"
          onClick={() => onTabChange('description')}
          aria-selected={activeTab === 'description'}
          className={`pb-2.5 transition ${
            activeTab === 'description'
              ? 'border-b-2 border-neutral-900 text-neutral-900 dark:border-white dark:text-white'
              : 'text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200'
          }`}
        >
          Description
        </button>

        <button
          type="button"
          onClick={() => onTabChange('company')}
          aria-selected={activeTab === 'company'}
          className={`pb-2.5 transition ${
            activeTab === 'company'
              ? 'border-b-2 border-neutral-900 text-neutral-900 dark:border-white dark:text-white'
              : 'text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200'
          }`}
        >
          Company
        </button>

        <button
          type="button"
          onClick={() => onTabChange('discussion')}
          aria-selected={activeTab === 'discussion'}
          className={`pb-2.5 transition ${
            activeTab === 'discussion'
              ? 'border-b-2 border-neutral-900 text-neutral-900 dark:border-white dark:text-white'
              : 'text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200'
          }`}
        >
          Discussion
        </button>
      </div>

      {/* Quick links: Draft referral & Find people [in] */}
      <div className="flex items-center gap-4 pb-2 text-xs">
        <button
          type="button"
          onClick={onOpenReferralModal}
          className="inline-flex items-center gap-1 font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200 focus-visible:outline-none focus-visible:underline"
        >
          <span>Draft referral</span>
        </button>

        <a
          href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(companyName)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200 focus-visible:outline-none focus-visible:underline"
        >
          <span>Find people</span>
          <LinkedInIcon className="size-3" />
        </a>
      </div>
    </div>
  );
}

