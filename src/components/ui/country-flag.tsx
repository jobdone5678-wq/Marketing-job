'use client';

import React, { useState } from 'react';
import { getCountryFlagUrl } from '@/lib/profile/country-flag';

export { getCountryFlagUrl };

export interface CountryFlagProps {
  code: string;
  name?: string;
  className?: string;
}

export function CountryFlag({
  code,
  name,
  className = 'size-4 shrink-0 rounded-full',
}: CountryFlagProps) {
  const [hasError, setHasError] = useState(false);
  const cleanCode = (code || '').trim().toLowerCase();
  const flagUrl = getCountryFlagUrl(cleanCode);

  if (!cleanCode) return null;

  if (hasError || !flagUrl) {
    return (
      <span
        aria-hidden="true"
        className={`inline-flex items-center justify-center rounded-full bg-neutral-200 text-[9px] font-bold uppercase text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200 ${className}`}
        title={name || cleanCode.toUpperCase()}
      >
        {cleanCode.slice(0, 2).toUpperCase()}
      </span>
    );
  }

  return (
    <img
      src={flagUrl}
      alt={name ? `${name} flag` : `${cleanCode} flag`}
      className={`object-cover ${className}`}
      loading="lazy"
      onError={() => setHasError(true)}
    />
  );
}
