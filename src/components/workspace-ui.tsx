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
    <div className="animate-fade-rise flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 flex-1">
        {eyebrow && <p className="text-muted-foreground mb-2 text-[11px]">{eyebrow}</p>}
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-foreground text-[22px] leading-7 font-medium tracking-tight">
            {title}
          </h1>
          {badge}
        </div>
        <p className="text-muted-foreground mt-2 max-w-2xl text-[13px] leading-5">{description}</p>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function WorkspaceSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div
      role="status"
      aria-label="Loading workspace"
      className="divide-border panel animate-fade-in divide-y overflow-hidden"
    >
      <span className="sr-only">Loading saved records…</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 p-4">
          <div className="skeleton size-10 shrink-0 rounded-[10px]" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-4 w-1/3 rounded-[6px]" />
            <div className="skeleton h-4 w-2/3 rounded-[6px]" />
          </div>
          <div className="skeleton hidden h-8 w-24 rounded-[8px] sm:block" />
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
    <div className="border-border animate-fade-rise flex min-h-[18rem] flex-col items-center justify-center gap-3 rounded-[16px] border border-dashed p-8 text-center">
      <Icon aria-hidden="true" className="text-muted-foreground size-5 stroke-[1.5]" />
      <div className="max-w-md">
        <h2 className="text-foreground text-[15px] font-medium tracking-tight">{title}</h2>
        <p className="text-muted-foreground mt-2 text-[13px] leading-5">{description}</p>
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function WorkspaceError({ message, children }: { message: string; children?: ReactNode }) {
  return (
    <div
      role="alert"
      className="border-destructive/30 bg-destructive/5 animate-fade-rise flex items-start gap-2.5 rounded-[14px] border p-4"
    >
      <AlertCircle
        aria-hidden="true"
        className="text-destructive mt-0.5 size-4 shrink-0 stroke-[1.5]"
      />
      <div className="min-w-0 flex-1">
        <p className="text-destructive text-[13px] font-medium">{message}</p>
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
    <div className="panel hover:border-input flex flex-col gap-4 p-5 transition-colors">
      <span className="text-muted-foreground text-[13px] leading-5">{title}</span>
      <div className="flex items-baseline gap-2">
        <span className="figure text-foreground text-[32px] leading-8">{value}</span>
        {change && (
          <span
            className={`inline-flex items-center text-[13px] ${
              isPositive ? 'text-primary' : 'text-destructive'
            }`}
          >
            {isPositive ? (
              <ArrowUpRight aria-hidden="true" className="mr-0.5 size-3.5 stroke-[1.5]" />
            ) : (
              <ArrowDownRight aria-hidden="true" className="mr-0.5 size-3.5 stroke-[1.5]" />
            )}
            {change}
          </span>
        )}
      </div>
      {description && (
        <span className="text-muted-foreground text-[13px] leading-5">{description}</span>
      )}
    </div>
  );
}
