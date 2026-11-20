import { notFound } from 'next/navigation';
import { z } from 'zod';
import { ApplicationHandoff } from '@/components/application-handoff';
import { requireProfile } from '@/lib/auth/require-profile';
import { checkDb, database } from '@/lib/db/admin';
import { getJobLink } from '@/lib/jobs/freehire-display';

export default async function ApplyOutsideJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const profile = await requireProfile();
  const { data: job, error } = await database()
    .from('outside_jobs')
    .select('title,company,job_url,capture_owner_id,candidate:candidates(user_id)')
    .eq('id', id)
    .maybeSingle();
  checkDb(error);

  const candidate = Array.isArray(job?.candidate) ? job.candidate[0] : job?.candidate;
  const jobUrl = getJobLink(job?.job_url);
  if (!job || !jobUrl || (job.capture_owner_id ?? candidate?.user_id) !== profile.id) notFound();

  return (
    <ApplicationHandoff
      job={{ jobUrl, title: job.title, company: job.company }}
      actorId={profile.id}
    />
  );
}
