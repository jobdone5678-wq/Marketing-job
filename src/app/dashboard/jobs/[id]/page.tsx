import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { sanitizeJobHtml } from '@/lib/html-sanitizer';
import {
  getFreehireJob,
  getSimilarFreehireJobs,
  getFreehireJobCopies,
} from '@/lib/jobs/freehire-api';
import { JobDetailClient } from '@/app/jobs/[id]/JobDetailClient';

interface DashboardJobDetailPageProps {
  params: Promise<{ id: string }>;
}

const loadJob = cache(async (id: string) => {
  try {
    return { job: await getFreehireJob(id) };
  } catch (error) {
    console.error('Unable to load FreeHire job details in dashboard:', error);
    return { unavailable: true };
  }
});

export async function generateMetadata({ params }: DashboardJobDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const { job } = await loadJob(id);
  return {
    title: job
      ? `${job.title}${job.company ? ` at ${job.company}` : ''} · nextkinhr`
      : 'Job Details · nextkinhr',
    description: job?.enrichment?.summary || job?.title,
  };
}

export default async function DashboardJobDetailPage({ params }: DashboardJobDetailPageProps) {
  const { id } = await params;
  const result = await loadJob(id);

  if (result.unavailable) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground text-sm">
          This job opening could not be loaded from FreeHire.me. Try refreshing the page.
        </p>
      </div>
    );
  }

  if (!result.job) notFound();
  const job = { ...result.job, description: sanitizeJobHtml(result.job.description) };
  const [similarJobs, copies] = await Promise.all([
    getSimilarFreehireJobs(id),
    getFreehireJobCopies(id),
  ]);

  return <JobDetailClient job={job} similarJobs={similarJobs} copies={copies} />;
}
