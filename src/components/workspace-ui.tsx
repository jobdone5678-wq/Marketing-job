import type { ReactNode } from 'react';
import { Inbox, AlertCircle, ArrowUpRight, ArrowDownRight } from 'lucide-react';

export function WorkspaceHeading({
  eyebrow,
  title,
  description,
  actions,
  badge,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <div className="animate-fade-rise flex flex-col gap-4 pb-1 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        {eyebrow && (
          <div className="bg-primary/10 text-primary mb-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase">
            <span>{eyebrow}</span>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-foreground text-xl font-bold tracking-tight sm:text-2xl">{title}</h1>
          {badge}
        </div>
        <p className="text-muted-foreground mt-1 max-w-3xl text-sm leading-relaxed">
          {description}
        </p>
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:pt-1">{actions}</div>
      )}
    </div>
  );
}

export function WorkspaceSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div
      role="status"
      aria-label="Loading workspace"
      className="divide-border/60 border-border/80 bg-card animate-fade-in divide-y overflow-hidden rounded-xl border shadow-xs"
    >
      <span className="sr-only">Loading saved records…</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 p-4.5">
          <div className="skeleton size-10 shrink-0 rounded-xl" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3.5 w-1/3 rounded-md" />
            <div className="skeleton h-2.5 w-2/3 rounded-md" />
          </div>
          <div className="skeleton hidden h-7 w-24 rounded-lg sm:block" />
        </div>
      ))}
    </div>
  );
}

export function WorkspaceEmpty({
  title,
  description,
  action,
  icon: Icon = Inbox,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: typeof Inbox;
}) {
  return (
    <div className="border-border/80 bg-card/60 animate-fade-rise flex min-h-[18rem] flex-col items-center justify-center gap-3.5 rounded-2xl border border-dashed p-8 text-center">
      <div className="border-border/80 bg-muted/40 relative flex size-12 items-center justify-center rounded-2xl border shadow-xs">
        <Icon className="text-muted-foreground size-5" />
      </div>
      <div className="max-w-md">
        <h2 className="text-foreground text-base font-semibold tracking-tight">{title}</h2>
        <p className="text-muted-foreground mt-1 text-sm leading-relaxed">{description}</p>
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function WorkspaceError({ message, children }: { message: string; children?: ReactNode }) {
  return (
    <div
      role="alert"
      className="border-destructive/30 bg-destructive/5 animate-fade-rise flex items-start gap-3 rounded-xl border p-4 text-sm shadow-xs"
    >
      <div className="bg-destructive/10 mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg">
        <AlertCircle className="text-destructive size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-destructive font-medium">{message}</p>
        {children && <div className="mt-2.5">{children}</div>}
      </div>
    </div>
  );
}

export function WorkspaceStatCard({
  title,
  value,
  change,
  isPositive,
  icon: Icon,
  description,
}: {
  title: string;
  value: string | number;
  change?: string;
  isPositive?: boolean;
  icon?: typeof Inbox;
  description?: string;
}) {
  return (
    <div className="border-border/80 bg-card hover:border-border rounded-xl border p-4 shadow-xs transition-all duration-200 hover:shadow-sm sm:p-5">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {title}
        </span>
        {Icon && (
          <div className="bg-primary/10 text-primary flex size-8 items-center justify-center rounded-lg">
            <Icon className="size-4" />
          </div>
        )}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-foreground font-mono text-2xl font-bold tracking-tight tabular-nums sm:text-3xl">
          {value}
        </span>
        {change && (
          <span
            className={`inline-flex items-center text-xs font-semibold ${
              isPositive
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {isPositive ? (
              <ArrowUpRight className="mr-0.5 size-3" />
            ) : (
              <ArrowDownRight className="mr-0.5 size-3" />
            )}
            {change}
          </span>
        )}
      </div>
      {description && <p className="text-muted-foreground mt-1 text-xs">{description}</p>}
    </div>
  );
}
