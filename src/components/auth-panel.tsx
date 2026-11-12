"use client";

import Link from "next/link";
import { Sparkles, ShieldCheck } from "lucide-react";
import { SignupForm } from "@/components/signup-form";

export function AuthPanel() {
  return (
    <div className="relative h-full overflow-y-auto p-6 md:p-8 lg:p-12 bg-gradient-to-b from-background via-background/98 to-muted/20 flex flex-col justify-between border-r border-border/40 select-none">
      {/* Brand Header */}
      <div className="flex items-center justify-between w-full mb-6">
        <Link
          href="/"
          className="group flex items-center gap-2.5 font-medium text-foreground transition-transform duration-200"
        >
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 via-primary/10 to-transparent text-primary border border-primary/25 shadow-2xs group-hover:scale-105 transition-transform duration-200">
            <Sparkles className="size-4" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold tracking-tight text-foreground">
              Nextkinlife
            </span>
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
              Recruit
            </span>
          </div>
        </Link>

        <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium text-muted-foreground bg-muted/40 border border-border/50">
          <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
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
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-muted-foreground mt-6 pt-4 border-t border-border/40">
        <span>Owned by Nextkinlife LLC · © {new Date().getFullYear()}</span>
        <div className="flex items-center gap-1.5 text-muted-foreground/80">
          <ShieldCheck className="size-3.5 text-primary/70" />
          <span>SOC 2 Type II · 256-bit TLS</span>
        </div>
      </div>
    </div>
  );
}
