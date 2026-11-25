export default function Loading() {
  return (
    <main className="portal-page animate-fade-in space-y-8" aria-busy="true">
      <span className="sr-only">Loading workspace</span>

      {/* Heading */}
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="space-y-2">
          <div className="skeleton h-7 w-56 rounded-[8px]" />
          <div className="skeleton h-4 w-80 max-w-full rounded-[6px]" />
        </div>
        <div className="flex gap-2">
          <div className="skeleton h-9 w-24 rounded-[10px]" />
          <div className="skeleton h-9 w-32 rounded-[10px]" />
        </div>
      </div>

      {/* Provenance */}
      <div className="border-border flex items-center justify-between border-y py-3">
        <div className="skeleton h-4 w-56 rounded-[6px]" />
        <div className="skeleton h-4 w-28 rounded-[6px]" />
      </div>

      {/* Totals */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="panel flex flex-col gap-4 p-5">
            <div className="skeleton h-4 w-28 rounded-[6px]" />
            <div className="skeleton h-8 w-16 rounded-[6px]" />
            <div className="skeleton h-4 w-36 rounded-[6px]" />
          </div>
        ))}
      </div>

      {/* Lifecycle */}
      <div className="panel space-y-5 p-6">
        <div className="skeleton h-5 w-64 rounded-[6px]" />
        <div className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="border-border space-y-2 pt-4 lg:border-t">
              <div className="skeleton h-4 w-32 rounded-[6px]" />
              <div className="skeleton h-4 w-full rounded-[6px]" />
            </div>
          ))}
        </div>
      </div>

      {/* Chart and pipeline */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="panel space-y-6 p-6 lg:col-span-2">
          <div className="skeleton h-5 w-48 rounded-[6px]" />
          <div className="skeleton h-64 w-full rounded-[12px]" />
        </div>
        <div className="panel space-y-5 p-6">
          <div className="skeleton h-5 w-44 rounded-[6px]" />
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="space-y-2">
              <div className="skeleton h-4 w-full rounded-[6px]" />
              <div className="skeleton h-1.5 w-full rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
