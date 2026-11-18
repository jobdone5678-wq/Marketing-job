'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';

export function formatMoney(amount: number | string, currency: string) {
  return `${currency} ${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function StatusLabel({ value }: { value: string }) {
  const tone = ['active', 'paid', 'approved', 'submitted', 'offer_accepted'].includes(value)
    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20'
    : ['rejected', 'cancelled', 'failed', 'overdue', 'suspended', 'ended_early'].includes(value)
      ? 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20'
      : [
            'pending',
            'needs_review',
            'partially_paid',
            'awaiting_approval',
            'joining_scheduled',
          ].includes(value)
        ? 'bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/20'
        : 'bg-muted/60 text-muted-foreground border-border/40';

  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${tone}`}
    >
      {value.replaceAll('_', ' ')}
    </span>
  );
}

export function OperationsCard({
  title,
  count,
  action,
  onAction,
  href,
  children,
}: {
  title: string;
  count?: number;
  action?: string;
  onAction?: () => void;
  href?: string;
  children: ReactNode;
}) {
  return (
    <article className="border-border/60 bg-card hover:border-border min-w-0 rounded-xl border p-5 shadow-2xs transition-all duration-200">
      <div className="border-border/40 mb-3 flex flex-wrap items-center justify-between gap-2 border-b pb-3">
        <h3 className="text-foreground flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span>{title}</span>
          {count !== undefined && (
            <span className="bg-primary/10 border-primary/20 text-primary rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums">
              {count}
            </span>
          )}
        </h3>
        {action &&
          (href ? (
            <Link
              className="text-primary hover:text-primary/80 inline-flex items-center gap-1 text-xs font-medium transition-colors"
              href={href}
            >
              <span>{action}</span>
              <span aria-hidden="true">↗</span>
            </Link>
          ) : (
            <button
              type="button"
              className="text-primary hover:text-primary/80 inline-flex cursor-pointer items-center gap-1 text-xs font-medium transition-colors"
              onClick={onAction}
            >
              <span>{action}</span>
              <span aria-hidden="true">↗</span>
            </button>
          ))}
      </div>
      <div className="min-w-0">{children}</div>
    </article>
  );
}

export function ActionSheet({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Sheet>
      <SheetTrigger render={<Button />}>{title}</SheetTrigger>
      <SheetContent className="data-[side=right]:w-full data-[side=right]:sm:max-w-3xl">
        <SheetHeader className="border-border border-b pr-12">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>
            {description || 'Review the details before saving. Changes refresh the dashboard.'}
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

export function RecordSheet({
  title,
  open,
  onOpenChange,
  children,
}: {
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="data-[side=right]:w-full data-[side=right]:sm:max-w-3xl">
        <SheetHeader className="border-border border-b pr-12">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>
            Employment dates, agreed amounts, external payments and history.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
