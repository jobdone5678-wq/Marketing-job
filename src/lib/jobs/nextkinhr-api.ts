import type { Job, Slice, JobCopy, FacetsData } from './nextkinhr-types';

const API_BASE = (
  process.env.FREEHIRE_API_URL ||
  process.env.NEXT_PUBLIC_FREEHIRE_API_URL ||
  'https://freehire.me'
).replace(/\/+$/, '');

type JobResponse<T> = {
  data: T;
  meta?: { total?: number; has_more?: boolean };
};

async function fetchJobs<T>(path: string): Promise<JobResponse<T> | null> {
  const response = await fetch(`${API_BASE}/api/v1/jobs${path}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(6_000),
    cache: 'no-store',
  });

  if (response.status === 404) return null;
  if (!response.ok)
    throw new Error(`FreeHire returned HTTP ${response.status} for ${path.split('?')[0]}`);
  return (await response.json()) as JobResponse<T>;
}

async function fetchJobList(path: string) {
  const response = await fetchJobs<Job[]>(path);
  if (!response || !Array.isArray(response.data)) {
    throw new Error(`FreeHire returned an invalid list for ${path.split('?')[0]}`);
  }
  return response;
}

export async function searchNextkinhrJobs(
  params: URLSearchParams,
  limit: number,
  offset: number
): Promise<Slice<Job> | null> {
  const query = new URLSearchParams(params);
  query.set('limit', String(limit));
  query.set('offset', String(offset));

  try {
    const { data, meta } = await fetchJobList(`/search?${query}`);
    const total = meta?.total;
    return {
      items: data,
      total,
      hasMore:
        meta?.has_more ??
        (total === undefined ? data.length === limit : offset + data.length < total),
    };
  } catch (error) {
    console.error('Failed to load FreeHire jobs from remote API:', error);
    return {
      items: [],
      total: 0,
      hasMore: false,
      error: error instanceof Error ? error.message : 'Unable to connect to FreeHire',
    };
  }
}

export async function getNextkinhrJob(slug: string): Promise<Job | null> {
  const response = await fetchJobs<Job>(`/${encodeURIComponent(slug)}`);
  if (response?.data?.public_slug) return response.data;
  return null;
}

export async function getNextkinhrFacets(source?: string): Promise<FacetsData | undefined> {
  const params = new URLSearchParams({ facets: 'category,work_mode,countries,skills' });
  if (source) params.set('source', source);
  try {
    const response = await fetchJobs<FacetsData>(`/facets?${params}`);
    if (response?.data?.facets) return response.data;
  } catch (error) {
    console.warn('Unable to load FreeHire facets from remote:', error);
  }
  return undefined;
}

export async function getSimilarNextkinhrJobs(slug: string): Promise<Job[]> {
  try {
    return (await fetchJobList(`/${encodeURIComponent(slug)}/similar`)).data;
  } catch {
    return [];
  }
}

export async function getNextkinhrJobCopies(slug: string): Promise<JobCopy[]> {
  try {
    const response = await fetchJobs<JobCopy[]>(`/${encodeURIComponent(slug)}/copies`);
    if (response && Array.isArray(response.data)) {
      return response.data;
    }
  } catch {
    // Return empty array
  }
  return [];
}
