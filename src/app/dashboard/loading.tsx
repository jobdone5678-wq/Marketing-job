import { WorkspaceSkeleton } from '@/components/workspace-ui';

export default function Loading() {
  return (
    <main className="portal-page animate-fade-in space-y-6" aria-busy="true">
      {/* Header Skeleton */}
      <div className="flex flex-col gap-4 pb-1 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="skeleton h-4 w-28 rounded-full" />
          <div className="skeleton h-7 w-64 rounded-lg" />
          <div className="skeleton h-4 w-80 max-w-full rounded-md" />
        </div>
        <div className="flex gap-2">
          <div className="skeleton h-8 w-24 rounded-lg" />
          <div className="skeleton h-8 w-28 rounded-lg" />
        </div>
      </div>

      {/* Metric Cards Skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border-border/70 bg-card space-y-3 rounded-xl border p-4">
            <div className="flex justify-between">
              <div className="skeleton h-3 w-20 rounded" />
              <div className="skeleton size-7 rounded-lg" />
            </div>
            <div className="skeleton h-7 w-16 rounded" />
            <div className="skeleton h-2.5 w-28 rounded" />
          </div>
        ))}
      </div>

      {/* Main Table Skeleton */}
      <WorkspaceSkeleton rows={6} />
    </main>
  );
}
