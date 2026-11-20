import type { Job } from './freehire-types';

export function formatJobSalary(job: Job): string | null {
  const {
    salary_min: min,
    salary_max: max,
    salary_currency: currency,
    salary_period: period,
  } = job.enrichment ?? {};
  const format = (amount: number) => {
    const value = amount.toLocaleString();
    return currency ? `${currency.toUpperCase()} ${value}` : value;
  };

  let salary: string;
  if (min == null) {
    if (max == null) return null;
    salary = `Up to ${format(max)}`;
  } else if (max != null) {
    salary = min === max ? format(min) : `${format(min)} – ${format(max)}`;
  } else {
    salary = `From ${format(min)}`;
  }
  return period ? `${salary} / ${period.replace(/_/g, ' ')}` : salary;
}

export function getJobLink(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.href;
  } catch {
    return undefined;
  }
}

export function normalizeJobSkill(skill: string): string {
  return skill.toLowerCase().trim();
}
