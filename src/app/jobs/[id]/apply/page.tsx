import { notFound } from 'next/navigation';
import { getNextkinhrJob } from '@/lib/jobs/nextkinhr-api';
import { getJobLink } from '@/lib/jobs/nextkinhr-display';
import { ApplicationHandoff } from '@/components/application-handoff';

export default async function ApplyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await getNextkinhrJob(id).catch(() => null);
  const jobUrl = getJobLink(job?.url);
  if (!job || !jobUrl) notFound();

  return <ApplicationHandoff job={{ jobUrl, title: job.title, company: job.company }} />;
}
