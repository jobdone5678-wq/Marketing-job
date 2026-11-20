import { notFound } from 'next/navigation';
import { getFreehireJob } from '@/lib/jobs/freehire-api';
import { getJobLink } from '@/lib/jobs/freehire-display';
import { ApplicationHandoff } from '@/components/application-handoff';

export default async function ApplyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await getFreehireJob(id).catch(() => null);
  const jobUrl = getJobLink(job?.url);
  if (!job || !jobUrl) notFound();

  return <ApplicationHandoff job={{ jobUrl, title: job.title, company: job.company }} />;
}
