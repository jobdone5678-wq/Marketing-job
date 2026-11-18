import { DashboardOverview } from '@/components/dashboard-overview';
import { requireProfile } from '@/lib/auth/require-profile';
import { database } from '@/lib/db/admin';
import { Suspense } from 'react';
import { WorkspaceSkeleton } from '@/components/workspace-ui';

export default async function DashboardPage() {
  const profile = await requireProfile();
  const { data: metrics } = await database().rpc('workspace_metrics', { p_actor: profile.id });

  return (
    <Suspense fallback={<WorkspaceSkeleton rows={5} />}>
      <DashboardOverview initialMetrics={metrics} />
    </Suspense>
  );
}
