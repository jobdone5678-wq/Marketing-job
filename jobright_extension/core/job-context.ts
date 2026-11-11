export interface JobInput {
  title?: string;
  jobTitle?: string;
  company?: string;
  companyName?: string;
  description?: string;
  jobDescription?: string;
  url?: string;
  jobUrl?: string;
  [key: string]: unknown;
}

export interface JobContextResult {
  valid: boolean;
  jobKey: string;
  url: string;
  title: string;
  company: string;
  description: string;
  jdHash: string;
  reasons: string[];
}

export function canonicalJobUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  try {
    const url = new URL(rawUrl);
    url.hash = '';
    const paramsToRemove: string[] = [];
    for (const key of url.searchParams.keys()) {
      if (/^(utm_|fbclid$|gclid$|ref$)/i.test(key)) {
        paramsToRemove.push(key);
      }
    }
    for (const p of paramsToRemove) url.searchParams.delete(p);
    url.searchParams.sort();
    return url.toString();
  } catch {
    return String(rawUrl).split('#')[0];
  }
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export function createJobContext(input?: JobInput | null): JobContextResult {
  const data = input || {};
  const title = (data.title || data.jobTitle || '').trim();
  const company = (data.company || data.companyName || '').trim();
  const description = (data.description || data.jobDescription || '').trim();
  const rawUrl = data.url || data.jobUrl || '';
  const url = canonicalJobUrl(rawUrl);

  const reasons: string[] = [];
  if (!title) reasons.push('Job title is required.');
  if (!company) reasons.push('Hiring company name is required.');
  if (!description || description.length < 30) {
    reasons.push('A complete job description is required.');
  }

  const jdHash = 'jd_' + hashString(description);
  const jobKey = 'job_' + hashString(url ? `${url}:${title}:${company}` : `${title}:${company}:${jdHash}`);

  return {
    valid: reasons.length === 0,
    jobKey,
    url,
    title,
    company,
    description,
    jdHash,
    reasons
  };
}

export const NextkinJobContext = { create: createJobContext, canonicalUrl: canonicalJobUrl };
export default NextkinJobContext;

