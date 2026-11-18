'use client';

import Link from 'next/link';
import { Sparkles, ShieldCheck } from 'lucide-react';
import { SignupForm } from '@/components/signup-form';

export function AuthPanel() {
  return (
    <div className="from-background via-background/98 to-muted/20 border-border/40 relative flex h-full flex-col justify-between overflow-y-auto border-r bg-gradient-to-b p-6 select-none md:p-8 lg:p-12">
      {/* Brand Header */}
      <div className="mb-6 flex w-full items-center justify-between">
        <Link
          href="/"
          className="group text-foreground flex items-center gap-2.5 font-medium transition-transform duration-200"
        >
          <div className="from-primary/20 via-primary/10 text-primary border-primary/25 flex size-8 shrink-0 items-center justify-center rounded-lg border bg-gradient-to-br to-transparent shadow-2xs transition-transform duration-200 group-hover:scale-105">
            <Sparkles className="size-4" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-foreground text-sm font-semibold tracking-tight">
              Nextkinlife
            </span>
            <span className="bg-primary/10 text-primary border-primary/20 inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold">
              Recruit
            </span>
          </div>
        </Link>

        <div className="text-muted-foreground bg-muted/40 border-border/50 hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium sm:inline-flex">
          <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
          Portal Ready
        </div>
      </div>

      {/* Center Auth Card */}
      <div className="flex flex-1 items-center justify-center py-4">
        <div className="w-full max-w-sm sm:max-w-md">
          <SignupForm />
        </div>
      </div>

      {/* Footer Attestation */}
      <div className="text-muted-foreground border-border/40 mt-6 flex flex-col items-center justify-between gap-2 border-t pt-4 text-[11px] sm:flex-row">
        <span>Owned by Nextkinlife LLC · © {new Date().getFullYear()}</span>
        <div className="text-muted-foreground/80 flex items-center gap-1.5">
          <ShieldCheck className="text-primary/70 size-3.5" />
          <span>SOC 2 Type II · 256-bit TLS</span>
        </div>
      </div>
    </div>
  );
}
