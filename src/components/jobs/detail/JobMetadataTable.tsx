'use client';


interface JobMetadataTableProps {
  workFormat: string;
  locationDisplay: string | null;
  regionDisplay: string;
  categoryDisplay: string;
  countryName: string | null;
  flag: string;
  companyType: string;
  domainsDisplay: string;
}

export function JobMetadataTable({
  workFormat,
  locationDisplay,
  regionDisplay,
  categoryDisplay,
  countryName,
  flag,
  companyType,
  domainsDisplay,
}: JobMetadataTableProps) {
  return (
    <dl className="space-y-2 border-t border-neutral-100 pt-3 text-xs dark:border-neutral-800">
      <div className="flex items-start justify-between gap-2">
        <dt className="text-neutral-500 dark:text-neutral-400">Work format</dt>
        <dd className="font-semibold text-neutral-900 dark:text-neutral-100">{workFormat}</dd>
      </div>

      <div className="flex items-start justify-between gap-2">
        <dt className="text-neutral-500 dark:text-neutral-400">Location</dt>
        <dd className="max-w-[170px] text-right font-semibold text-neutral-900 dark:text-neutral-100">
          {locationDisplay || 'Munich, Bavaria, Germany'}
        </dd>
      </div>

      <div className="flex items-start justify-between gap-2">
        <dt className="text-neutral-500 dark:text-neutral-400">Region</dt>
        <dd className="font-semibold text-neutral-900 dark:text-neutral-100">{regionDisplay}</dd>
      </div>

      <div className="flex items-start justify-between gap-2">
        <dt className="text-neutral-500 dark:text-neutral-400">Category</dt>
        <dd className="font-semibold text-neutral-900 dark:text-neutral-100">{categoryDisplay}</dd>
      </div>

      <div className="flex items-start justify-between gap-2">
        <dt className="text-neutral-500 dark:text-neutral-400">Country</dt>
        <dd className="inline-flex items-center gap-1 font-semibold text-neutral-900 dark:text-neutral-100">
          <span>{flag}</span>
          <span>{countryName || 'Germany'}</span>
        </dd>
      </div>

      <div className="flex items-start justify-between gap-2">
        <dt className="text-neutral-500 dark:text-neutral-400">Company</dt>
        <dd className="font-semibold text-neutral-900 dark:text-neutral-100">{companyType}</dd>
      </div>

      <div className="flex items-start justify-between gap-2">
        <dt className="text-neutral-500 dark:text-neutral-400">Domains</dt>
        <dd className="max-w-[170px] text-right font-semibold text-neutral-900 dark:text-neutral-100">
          {domainsDisplay}
        </dd>
      </div>
    </dl>
  );
}

