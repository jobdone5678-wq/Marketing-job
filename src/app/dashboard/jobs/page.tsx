import type { Metadata } from 'next';
import { Suspense } from 'react';
import { searchNextkinhrJobs, getNextkinhrFacets } from '@/lib/jobs/nextkinhr-api';
import { JobsFeedClient } from '@/app/jobs/JobsFeedClient';
import { JobsFeedSkeleton } from '@/components/jobs/feed/JobsFeedSkeleton';
import { requireProfile } from '@/lib/auth/require-profile';
import { database } from '@/lib/db/admin';
import { candidateJobApplications } from '@/lib/jobs/applications';

export const metadata: Metadata = {
  title: 'Jobs · Dashboard',
  description: 'Search live job openings on NextKinHR.',
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

  let candidateResume: { text: string; skills: string[] } | null = null;
  let appliedKeys: string[] = [];

  try {
    const profile = await requireProfile();
    if (profile) {
      const db = database();
      const { data: candidate } = await db
        .from('candidates')
        .select('id, primary_skills, secondary_skills, confirmed_facts')
        .eq('user_id', profile.id)
        .maybeSingle();

      if (candidate) {
        const { appliedKeys: keys } = await candidateJobApplications(candidate.id);
        appliedKeys = Array.from(keys.urls);
        const facts = (candidate.confirmed_facts || {}) as Record<string, any>;
        const text = String(facts.raw_text || facts.resume_text || '');
        const skillsList: string[] = Array.isArray(facts.skills)
          ? facts.skills
          : [
              ...(candidate.primary_skills ? candidate.primary_skills.split(/,\s*/) : []),
              ...(candidate.secondary_skills ? candidate.secondary_skills.split(/,\s*/) : []),
            ].filter(Boolean);
        candidateResume = { text, skills: skillsList };
      }
    }
  } catch {
    // Unauthenticated or guest view fallback
  }

  const [initial, facets] = await Promise.all([
    searchNextkinhrJobs(urlParams, pageSize, offset),
    getNextkinhrFacets(),
  ]);

  return (
    <Suspense fallback={<JobsFeedSkeleton />}>
      <JobsFeedClient
        initial={initial}
        currentPage={page}
        pageSize={pageSize}
        facets={facets}
        appliedKeys={appliedKeys}
        candidateResume={candidateResume}
        error={initial?.error || null}
      />
    </Suspense>
  );
}
