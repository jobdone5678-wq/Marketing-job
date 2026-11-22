export type AppliedJobKeys = { jobIds: string[]; urls: string[] };
export type CandidateJobApplication = {
  id: string;
  candidateId: string;
  jobId: string | null;
  title: string;
  company: string;
  location: string | null;
  provider: string;
  employmentType: string;
  jobUrl: string | null;
  status: string;
  captureStatus: string | null;
  appliedAt: string;
  jobState: string | null;
};
export type AppliedJobsResponse = {
  candidateId: string | null;
  candidateName: string | null;
  requiresCandidate: boolean;
  applications: CandidateJobApplication[];
  total: number;
  hasMore: boolean;
  appliedKeys: AppliedJobKeys;
};

export function isAppliedApplication(
  status: string,
  captureStatus: string | null | undefined
): boolean {
  if (
    captureStatus === 'started' ||
    captureStatus === 'in_progress' ||
    captureStatus === 'submit_attempted' ||
    captureStatus === 'failed'
  ) {
    return false;
  }
  if (captureStatus === 'submitted' || captureStatus === 'confirmed') {
    return true;
  }
  return status === 'Applied';
}

export function applicationLaunchUrl(applicationUrl: string, intentId: string) {
  const url = new URL(applicationUrl);
  if (!url.hash) url.hash = new URLSearchParams({ 'marketing-intent': intentId }).toString();
  return url.href;
}

// Match a posting, not a company or title. Tracking and application routes do not
// identify a different vacancy, while host, board and posting path still do.
export const applicationConfirmationPath =
  /\/(?:application\/(?:confirmation|received|complete|thank[-_]?you)|confirmation|thank[-_]?you(?:[-_]for[-_]applying)?|thanks|applied|application[-_](?:submitted|success|received|complete)|submission[-_]success|success|submitted)\/?$/i;

export const PRESERVED_JOB_PARAMS = new Set([
  'gh_jid',
  'jobid',
  'job_id',
  'jk',
  'requisition',
  'req_id',
  'id',
]);

export function canonicalJobUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
      url.pathname = url.pathname.replace(/\/+$/, '');
    }
    const filtered = new URLSearchParams();
    for (const [key, value] of url.searchParams.entries()) {
      if (PRESERVED_JOB_PARAMS.has(key.toLowerCase())) {
        filtered.append(key, value);
      }
    }
    filtered.sort();
    url.search = filtered.size ? `?${filtered.toString()}` : '';
    url.hash = '';
    return url.toString();
  } catch {
    return raw;
  }
}

export function applicationUrlKey(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const rawUrl = new URL(value);
    if (!['https:', 'http:'].includes(rawUrl.protocol)) return null;
    const fragment = rawUrl.hash.slice(1);
    const [route, query] = fragment.split(/\?([\s\S]*)/, 2);
    const hasHashRoute = /^!?\//.test(route);

    const canonical = canonicalJobUrl(value);
    const url = new URL(canonical);

    const greenhouse = url.hostname === 'greenhouse.io' || url.hostname.endsWith('.greenhouse.io');
    const identify = (params: URLSearchParams) => {
      const identity = new URLSearchParams();
      for (const [name, val] of params) {
        const key = name.toLowerCase();
        if (PRESERVED_JOB_PARAMS.has(key) || (greenhouse && ['for', 'token'].includes(key)))
          identity.append(key, val);
      }
      identity.sort();
      return identity.size ? '?' + identity.toString() : '';
    };

    const normalizePath = (path: string) =>
      path
        .replace(applicationConfirmationPath, '')
        .replace(/\/(?:application|apply)\/?$/i, '')
        .replace(/\/$/, '');

    const path = normalizePath(url.pathname);
    const postingPath = /(^|\.)keka\.com$/i.test(url.hostname)
      ? path.replace(/^\/careers\/applyjob\/(\d+)$/i, '/careers/jobdetails/$1')
      : path;

    const hashRoute = hasHashRoute
      ? '#' + normalizePath(route) + identify(new URLSearchParams(query))
      : '';

    const origin =
      url.origin === 'https://job-boards.greenhouse.io'
        ? 'https://boards.greenhouse.io'
        : url.origin;

    return origin + postingPath + identify(rawUrl.searchParams) + hashRoute;
  } catch {
    return null;
  }
}
export function withoutAppliedJobs<
  T extends { id?: string; application_url?: string; source_url?: string },
>(jobs: T[], keys: AppliedJobKeys) {
  const ids = new Set(keys.jobIds),
    urls = new Set(keys.urls);
  return jobs.filter((job) => {
    if (job.id && ids.has(job.id)) return false;
    if (
      [job.application_url, job.source_url].some((value) => {
        const key = applicationUrlKey(value);
        return key && urls.has(key);
      })
    )
      return false;
    return true;
  });
}
