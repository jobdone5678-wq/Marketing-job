'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowUpRight } from 'lucide-react';
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
    ? 'bg-primary/10 text-primary border-primary/20'
    : ['rejected', 'cancelled', 'failed', 'overdue', 'suspended', 'ended_early'].includes(value)
      ? 'bg-destructive/10 text-destructive border-destructive/20'
      : [
            'pending',
            'needs_review',
            'partially_paid',
            'awaiting_approval',
            'joining_scheduled',
          ].includes(value)
        ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20'
        : 'bg-surface-sunken text-muted-foreground border-border';

  return (
    <span
      className={`inline-flex h-6 items-center rounded-[6px] border px-2 text-[11px] font-medium whitespace-nowrap ${tone}`}
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
    <article className="panel hover:border-input min-w-0 p-5 transition-colors">
      <div className="border-border mb-4 flex flex-wrap items-center justify-between gap-2 border-b pb-3">
        <h3 className="text-foreground flex items-baseline gap-2 text-[15px] font-medium tracking-tight">
          <span>{title}</span>
          {count !== undefined && (
            <span className="figure text-muted-foreground text-[11px]">{count}</span>
          )}
        </h3>
        {action &&
          (href ? (
            <Link
              className="text-primary inline-flex items-center gap-1.5 text-[13px] font-medium transition-colors hover:underline"
              href={href}
            >
              <span>{action}</span>
              <ArrowUpRight aria-hidden="true" className="size-3.5 stroke-[1.5]" />
            </Link>
          ) : (
            <button
              type="button"
              className="text-primary inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-medium transition-colors hover:underline"
              onClick={onAction}
            >
              <span>{action}</span>
              <ArrowUpRight aria-hidden="true" className="size-3.5 stroke-[1.5]" />
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
