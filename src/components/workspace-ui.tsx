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
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between pb-1 animate-fade-rise">
      <div className="min-w-0 flex-1">
        {eyebrow && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-semibold tracking-wide uppercase mb-2">
            <span>{eyebrow}</span>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            {title}
          </h1>
          {badge}
        </div>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 shrink-0 sm:pt-1">
          {actions}
        </div>
      )}
    </div>
  );
}

export function WorkspaceSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div
      role="status"
      aria-label="Loading workspace"
      className="divide-y divide-border/60 rounded-xl border border-border/80 bg-card overflow-hidden shadow-xs animate-fade-in"
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
    <div className="flex min-h-[18rem] flex-col items-center justify-center gap-3.5 rounded-2xl border border-dashed border-border/80 bg-card/60 p-8 text-center animate-fade-rise">
      <div className="relative flex size-12 items-center justify-center rounded-2xl border border-border/80 bg-muted/40 shadow-xs">
        <Icon className="size-5 text-muted-foreground" />
      </div>
      <div className="max-w-md">
        <h2 className="text-base font-semibold text-foreground tracking-tight">{title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function WorkspaceError({
  message,
  children,
}: {
  message: string;
  children?: ReactNode;
}) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm shadow-xs animate-fade-rise"
    >
      <div className="size-7 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0 mt-0.5">
        <AlertCircle className="size-4 text-destructive" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-destructive">{message}</p>
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
    <div className="rounded-xl border border-border/80 bg-card p-4 sm:p-5 shadow-xs transition-all duration-200 hover:shadow-sm hover:border-border">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground tracking-wide uppercase">{title}</span>
        {Icon && (
          <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Icon className="size-4" />
          </div>
        )}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-mono tabular-nums">
          {value}
        </span>
        {change && (
          <span
            className={`inline-flex items-center text-xs font-semibold ${
              isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {isPositive ? <ArrowUpRight className="size-3 mr-0.5" /> : <ArrowDownRight className="size-3 mr-0.5" />}
            {change}
          </span>
        )}
      </div>
      {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
    </div>
  );
}
