export const COUNTRY_NAMES: Record<string, string> = {
  us: 'United States',
  gb: 'United Kingdom',
  it: 'Italy',
  de: 'Germany',
  fr: 'France',
  es: 'Spain',
  ca: 'Canada',
  nl: 'Netherlands',
  br: 'Brazil',
  in: 'India',
  au: 'Australia',
  dk: 'Denmark',
  ro: 'Romania',
  ch: 'Switzerland',
  se: 'Sweden',
  pl: 'Poland',
  ie: 'Ireland',
  jp: 'Japan',
  sg: 'Singapore',
  ph: 'Philippines',
  za: 'South Africa',
};

export const CATEGORY_LABELS: Record<string, string> = {
  software_engineering: 'Software Engineering',
  data_engineering: 'Data Engineering',
  devops: 'DevOps & SRE',
  fullstack: 'Fullstack',
  backend: 'Backend',
  frontend: 'Frontend',
  ai_engineering: 'AI Engineering',
  security: 'Security',
  qa: 'QA & Testing',
  data_analytics: 'Data Analytics',
  data_science: 'Data Science',
  mobile: 'Mobile',
  design: 'Design',
  product: 'Product',
  marketing: 'Marketing',
  finance: 'Finance',
  healthcare: 'Healthcare',
};

export const SOURCE_KINDS: Record<string, 'ats' | 'aggregator' | 'company' | 'other'> = {
  linkedin: 'aggregator',
  indeed: 'aggregator',
  whatjobs: 'aggregator',
  ziprecruiter: 'aggregator',
  remoteok: 'aggregator',
  weworkremotely: 'aggregator',
  adzuna: 'aggregator',
  greenhouse: 'ats',
  ashby: 'ats',
  lever: 'ats',
  smartrecruiters: 'ats',
  jazzhr: 'ats',
  workday: 'ats',
  bamboohr: 'ats',
  rippling: 'ats',
  workable: 'ats',
  recruitee: 'ats',
  taleo: 'ats',
  successfactors: 'ats',
  icims: 'ats',
};

export const SOURCE_DISPLAY_NAMES: Record<string, string> = {
  greenhouse: 'Greenhouse',
  smartrecruiters: 'SmartRecruiters',
  bamboohr: 'BambooHR',
  successfactors: 'SAP SuccessFactors',
  workatastartup: 'Work at a Startup',
  remoteok: 'RemoteOK',
  linkedin: 'LinkedIn',
  usajobs: 'USAJobs',
  whatjobs: 'WhatJobs',
  weworkremotely: 'We Work Remotely',
  zohorecruit: 'Zoho Recruit',
  jazzhr: 'JazzHR',
  ashby: 'Ashby',
  lever: 'Lever',
  workday: 'Workday',
};

export function getCountryFlag(code?: string): string {
  if (!code || code.length !== 2) return '🌍';
  const clean = code.toLowerCase();
  const first = clean.charCodeAt(0) - 97 + 0x1f1e6;
  const second = clean.charCodeAt(1) - 97 + 0x1f1e6;
  return String.fromCodePoint(first, second);
}

const regionNames = typeof Intl !== 'undefined' && Intl.DisplayNames
  ? new Intl.DisplayNames(['en'], { type: 'region' })
  : null;

export function getCountryName(code: string): string {
  if (!/^[a-z]{2}$/i.test(code)) return code;
  return COUNTRY_NAMES[code.toLowerCase()] ?? regionNames?.of(code.toUpperCase()) ?? code;
}

export function formatRelativeTime(dateStr?: string | null): string | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minutes ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 30) return `${diffDays} days ago`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths} ${diffMonths === 1 ? 'month' : 'months'} ago`;
}

export function formatCount(num?: number): string {
  if (!num) return '0';
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${Math.round(num / 1000)}k`;
  return String(num);
}

export function cleanHtmlSnippet(html?: string | null): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

