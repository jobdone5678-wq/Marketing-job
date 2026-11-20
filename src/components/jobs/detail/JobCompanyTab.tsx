'use client';

import { ExternalLink } from 'lucide-react';
import { CompanyLogo } from '@/components/company-logo';

interface JobCompanyTabProps {
  companyName: string;
  locationDisplay: string | null;
  companyType: string;
  domainsDisplay: string;
  openingsCount: number;
}

export function JobCompanyTab({
  companyName,
  locationDisplay,
  companyType,
  domainsDisplay,
  openingsCount,
}: JobCompanyTabProps) {
  return (
    <div className="space-y-6 pt-2 text-sm text-neutral-700 dark:text-neutral-300">
      <div className="flex items-center gap-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-800/40">
        <CompanyLogo company={companyName} size="lg" />
        <div>
          <h3 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
            {companyName}
          </h3>
          <p className="text-xs text-neutral-500">{locationDisplay || 'Global Operations'}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
          <span className="text-xs text-neutral-500">Organization</span>
          <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {companyType}
          </p>
        </div>
        <div className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
          <span className="text-xs text-neutral-500">Industry</span>
          <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {domainsDisplay}
          </p>
        </div>
        <div className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
          <span className="text-xs text-neutral-500">Openings</span>
          <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {openingsCount} roles tracked
          </p>
        </div>
      </div>

      <div className="pt-2">
        <a
          href={`https://www.google.com/search?q=${encodeURIComponent(companyName)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-neutral-800 underline underline-offset-2 hover:text-black dark:text-neutral-200 dark:hover:text-white"
        >
          <span>Learn more about {companyName}</span>
          <ExternalLink className="size-3" />
        </a>
      </div>
    </div>
  );
}

