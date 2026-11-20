import type { Metadata } from 'next';
import { Suspense } from 'react';
import { searchFreehireJobs, getFreehireFacets } from '@/lib/jobs/freehire-api';
import { JobsFeedClient } from '@/app/jobs/JobsFeedClient';
import { JobsFeedSkeleton } from '@/components/jobs/feed/JobsFeedSkeleton';

export const metadata: Metadata = {
  title: 'Jobs · Dashboard',
  description: 'Search live job openings from FreeHire.me.',
};

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DashboardJobsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(typeof params.page === 'string' ? params.page : '1', 10) || 1);
  const pageSize = 20;
  const offset = (page - 1) * pageSize;

  const urlParams = new URLSearchParams();
  if (typeof params.q === 'string' && params.q) urlParams.set('q', params.q);
  if (typeof params.category === 'string' && params.category) urlParams.set('category', params.category);
  if (typeof params.work_mode === 'string' && params.work_mode) urlParams.set('work_mode', params.work_mode);
  if (typeof params.countries === 'string' && params.countries) urlParams.set('countries', params.countries);
  if (typeof params.skills === 'string' && params.skills) urlParams.set('skills', params.skills);
  if (typeof params.seniority === 'string' && params.seniority) urlParams.set('seniority', params.seniority);
  if (typeof params.reality === 'string' && params.reality) urlParams.set('reality', params.reality);
  if (typeof params.sort === 'string' && params.sort) urlParams.set('sort', params.sort);

  const [initial, facets] = await Promise.all([
    searchFreehireJobs(urlParams, pageSize, offset),
    getFreehireFacets(),
  ]);

  return (
    <Suspense fallback={<JobsFeedSkeleton />}>
      <JobsFeedClient
        initial={initial}
        currentPage={page}
        pageSize={pageSize}
        facets={facets}
      />
    </Suspense>
  );
}
