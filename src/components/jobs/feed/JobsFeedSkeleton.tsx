
export function JobsFeedSkeleton() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 font-sans">
      <div className="flex w-full flex-col gap-3">
        {/* Toolbar skeleton */}
        <div className="flex items-center justify-between py-1">
          <div className="flex gap-2">
            <div className="h-8 w-16 animate-pulse rounded-lg bg-neutral-200 dark:bg-neutral-800" />
            <div className="h-8 w-16 animate-pulse rounded-lg bg-neutral-200 dark:bg-neutral-800" />
          </div>
          <div className="flex gap-3">
            <div className="h-6 w-20 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
            <div className="h-6 w-24 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
          </div>
        </div>

        {/* Filter bar skeleton */}
        <div className="rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="h-9 w-full animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-800" />
          <div className="mt-2.5 flex gap-2 border-t border-neutral-100 pt-2 dark:border-neutral-800">
            <div className="h-5 w-20 animate-pulse rounded-full bg-neutral-100 dark:bg-neutral-800" />
            <div className="h-5 w-24 animate-pulse rounded-full bg-neutral-100 dark:bg-neutral-800" />
            <div className="h-5 w-16 animate-pulse rounded-full bg-neutral-100 dark:bg-neutral-800" />
          </div>
        </div>

        {/* Job card skeletons */}
        <div className="flex flex-col gap-3.5 pt-1">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div className="flex items-center gap-3">
                <div className="size-8 animate-pulse rounded-lg bg-neutral-200 dark:bg-neutral-800" />
                <div className="space-y-1.5">
                  <div className="h-3 w-32 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
                </div>
              </div>
              <div className="mt-3 h-5 w-3/4 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
              <div className="mt-2 h-3.5 w-1/3 animate-pulse rounded bg-neutral-200 dark:bg-neutral-800" />
              <div className="mt-2 h-3 w-full animate-pulse rounded bg-neutral-100 dark:bg-neutral-800/60" />
              <div className="mt-3 flex gap-2">
                <div className="h-5 w-16 animate-pulse rounded-full bg-neutral-100 dark:bg-neutral-800" />
                <div className="h-5 w-20 animate-pulse rounded-full bg-neutral-100 dark:bg-neutral-800" />
                <div className="h-5 w-14 animate-pulse rounded-full bg-neutral-100 dark:bg-neutral-800" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

