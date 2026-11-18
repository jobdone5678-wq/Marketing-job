import { OutsideJobsTable } from './_components/outside-jobs-table';
import { headers } from 'next/headers';

async function getOutsideJobs() {
  const host = headers().get('host');
  const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
  const res = await fetch(`${protocol}://${host}/api/outside-jobs`, {
    headers: headers(),
    cache: 'no-store',
  });
  const data = await res.json();
  return data.outsideJobs || [];
}

export default async function OutsideJobsPage() {
  const initialJobs = await getOutsideJobs();

  return (
    <div className="mx-auto max-w-7xl p-6">
      <OutsideJobsTable initialJobs={initialJobs} />
    </div>
  );
}
