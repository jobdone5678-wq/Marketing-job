"use client";

import React, { useState } from 'react';

// Curated high-fidelity SVG brand marks for prominent ATS companies
const BRAND_LOGOS: Record<string, (className: string) => React.ReactNode> = {
  figma: (cn) => (
    <svg className={cn} viewBox="0 0 38 57" fill="none">
      <path d="M19 28.5C19 23.2533 23.2533 19 28.5 19C33.7467 19 38 23.2533 38 28.5C38 33.7467 33.7467 38 28.5 38C23.2533 38 19 33.7467 19 28.5Z" fill="#1ABCFE"/>
      <path d="M0 47.5C0 42.2533 4.25329 38 9.5 38H19V47.5C19 52.7467 14.7467 57 9.5 57C4.25329 57 0 52.7467 0 47.5Z" fill="#0ACF83"/>
      <path d="M19 0V19H28.5C33.7467 19 38 14.7467 38 9.5C38 4.25329 33.7467 0 28.5 0H19Z" fill="#FF7262"/>
      <path d="M0 9.5C0 14.7467 4.25329 19 9.5 19H19V0H9.5C4.25329 0 0 4.25329 0 9.5Z" fill="#F24E1E"/>
      <path d="M0 28.5C0 33.7467 4.25329 38 9.5 38H19V19H9.5C4.25329 19 0 23.2533 0 28.5Z" fill="#A259FF"/>
    </svg>
  ),
  stripe: (cn) => (
    <svg className={cn} viewBox="0 0 40 40" fill="none">
      <rect width="40" height="40" rx="8" fill="#635BFF" />
      <path d="M19.8 16.5C19.8 15.3 20.8 14.7 22.3 14.7C24.3 14.7 26.6 15.3 28.2 16.2V11.8C26.4 11 24.3 10.7 22.2 10.7C17.3 10.7 14 13.3 14 17.5C14 23.9 22.8 22.8 22.8 26C22.8 27.5 21.5 28.1 19.8 28.1C17.4 28.1 14.7 27.1 12.8 25.9V30.5C15 31.5 17.5 32 19.8 32C25 32 28.5 29.4 28.5 24.9C28.4 18.2 19.8 19.4 19.8 16.5Z" fill="white" />
    </svg>
  ),
  openai: (cn) => (
    <svg className={cn} viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.28 9.87a6.22 6.22 0 0 0-.52-5.11 6.33 6.33 0 0 0-6.17-3.13 6.22 6.22 0 0 0-4.64 2.1 6.33 6.33 0 0 0-5.83 2.1 6.22 6.22 0 0 0-1.57 5.03 6.33 6.33 0 0 0-2.43 4.88 6.22 6.22 0 0 0 2.1 4.64 6.33 6.33 0 0 0 2.1 5.83 6.22 6.22 0 0 0 5.03 1.57 6.33 6.33 0 0 0 4.88 2.43 6.22 6.22 0 0 0 4.64-2.1 6.33 6.33 0 0 0 5.83-2.1 6.22 6.22 0 0 0 1.57-5.03 6.33 6.33 0 0 0 2.43-4.88 6.22 6.22 0 0 0-2.1-4.64l-.49-.39zM12 13.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z" />
    </svg>
  ),
  ramp: (cn) => (
    <svg className={cn} viewBox="0 0 40 40" fill="none">
      <rect width="40" height="40" rx="8" fill="#1C1C1C" />
      <path d="M12 28L20 12L28 28H12Z" fill="#C2F13C" />
    </svg>
  ),
  github: (cn) => (
    <svg className={cn} viewBox="0 0 24 24" fill="currentColor">
      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  ),
  google: (cn) => (
    <svg className={cn} viewBox="0 0 24 24" fill="none">
      <path d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z" fill="#4285F4"/>
      <path d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z" fill="#34A853"/>
      <path d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z" fill="#FBBC05"/>
      <path d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z" fill="#EA4335"/>
    </svg>
  ),
  meta: (cn) => (
    <svg className={cn} viewBox="0 0 24 24" fill="#0668E1">
      <path d="M12 5.5c-4.4 0-7.8 3.5-7.8 7.8 0 2.2 1 4.2 2.5 5.6l1.4-1.4c-1.1-1.1-1.8-2.6-1.8-4.2 0-3.3 2.5-6 5.7-6s5.7 2.7 5.7 6c0 1.6-.7 3.1-1.8 4.2l1.4 1.4c1.5-1.4 2.5-3.4 2.5-5.6 0-4.3-3.4-7.8-7.8-7.8z" />
    </svg>
  ),
  vercel: (cn) => (
    <svg className={cn} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 1L24 22H0L12 1Z" />
    </svg>
  ),
  supabase: (cn) => (
    <svg className={cn} viewBox="0 0 24 24" fill="none">
      <path d="M13.35 2.14a1 1 0 0 0-1.45.16L3.25 13.06a1 1 0 0 0 .78 1.63h7.62v7.17a1 1 0 0 0 1.7.71l8.65-10.76a1 1 0 0 0-.78-1.63h-7.87V2.14z" fill="#3ECF8E"/>
    </svg>
  ),
  datadog: (cn) => (
    <svg className={cn} viewBox="0 0 24 24" fill="#632CA6">
      <rect width="24" height="24" rx="4" fill="#632CA6" />
      <path d="M7 16V8l5 4-5 4zm6-8h4v8h-4z" fill="white" />
    </svg>
  ),
  snowflake: (cn) => (
    <svg className={cn} viewBox="0 0 24 24" fill="#29B5E8">
      <circle cx="12" cy="12" r="10" fill="#29B5E8" />
      <path d="M12 6v12M6 12h12M7.5 7.5l9 9M7.5 16.5l9-9" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
};

// Subtle, professional neutral avatars for fallbacks (Jobright inspired)
const MONOGRAM_PALETTES = [
  'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-neutral-700',
  'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700',
  'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200 border-zinc-200 dark:border-zinc-700',
  'bg-blue-50 text-blue-900 dark:bg-blue-950/60 dark:text-blue-200 border-blue-200 dark:border-blue-800',
  'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800',
  'bg-violet-50 text-violet-900 dark:bg-violet-950/60 dark:text-violet-200 border-violet-200 dark:border-violet-800',
];

function getCompanyHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getInitials(name: string): string {
  if (!name) return 'CO';
  const clean = name.replace(/[^a-zA-Z0-9 ]/g, ' ').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}

function normalizeSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

interface CompanyLogoProps {
  company: string;
  domain?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZE_MAP = {
  xs: { box: 'size-6 rounded-md text-[10px]', icon: 'size-3.5' },
  sm: { box: 'size-8 rounded-lg text-xs', icon: 'size-4.5' },
  md: { box: 'size-10 rounded-xl text-xs font-bold', icon: 'size-5.5' },
  lg: { box: 'size-12 rounded-xl text-sm font-bold', icon: 'size-6.5' },
  xl: { box: 'size-16 rounded-2xl text-base font-bold', icon: 'size-9' },
};

export function CompanyLogo({
  company = 'Company',
  domain,
  size = 'md',
  className = '',
}: CompanyLogoProps) {
  const [imgError, setImgError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const cleanName = company.trim();
  const slug = normalizeSlug(cleanName);
  const sizeConfig = SIZE_MAP[size] || SIZE_MAP.md;

  // 1. Direct verified brand SVGs
  const brandSvg = BRAND_LOGOS[slug];
  if (brandSvg) {
    return (
      <div
        className={`relative shrink-0 flex items-center justify-center bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 shadow-2xs overflow-hidden ${sizeConfig.box} ${className}`}
        title={company}
      >
        {brandSvg(sizeConfig.icon)}
      </div>
    );
  }

  // 2. High-res favicon resolver
  const targetDomain =
    domain ||
    (cleanName.includes('.')
      ? cleanName
      : `${slug}.com`);

  const remoteLogoUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(targetDomain)}&sz=128`;

  // 3. Restrained, minimalist fallback
  const hash = getCompanyHash(cleanName);
  const palette = MONOGRAM_PALETTES[hash % MONOGRAM_PALETTES.length];
  const initials = getInitials(cleanName);

  if (imgError) {
    return (
      <div
        className={`relative shrink-0 flex items-center justify-center font-bold tracking-tight select-none border ${palette} ${sizeConfig.box} ${className}`}
        title={company}
      >
        <span>{initials}</span>
      </div>
    );
  }

  return (
    <div
      className={`relative shrink-0 flex items-center justify-center bg-white dark:bg-neutral-900 border border-neutral-200/80 dark:border-neutral-800 shadow-2xs overflow-hidden ${sizeConfig.box} ${className}`}
      title={company}
    >
      {!loaded && (
        <div
          className={`absolute inset-0 flex items-center justify-center font-bold border ${palette} select-none`}
        >
          <span>{initials}</span>
        </div>
      )}

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={remoteLogoUrl}
        alt={`${company} logo`}
        className={`object-contain transition-opacity duration-200 ${sizeConfig.icon} ${
          loaded ? 'opacity-100' : 'opacity-0'
        }`}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setImgError(true)}
      />
    </div>
  );
}
