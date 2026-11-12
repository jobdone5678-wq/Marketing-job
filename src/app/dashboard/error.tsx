"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error cleanly for client diagnostics
    console.error("Dashboard route error:", error);
  }, [error]);

  return (
    <main className="portal-page flex min-h-[60vh] flex-col items-center justify-center p-4">
      <div className="flex max-w-md flex-col items-center text-center p-8 rounded-2xl border border-border/80 bg-card shadow-xs animate-fade-rise">
        <div className="flex size-13 items-center justify-center rounded-2xl bg-destructive/10 text-destructive mb-4">
          <AlertTriangle className="size-6" />
        </div>

        <h1 className="text-lg font-bold tracking-tight text-foreground">
          Workspace couldn't load
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          An unexpected issue prevented this view from loading completely. Your
          saved records and pipeline data remain secure.
        </p>

        {error?.message && (
          <div className="mt-3.5 w-full rounded-lg bg-muted/50 p-2.5 font-mono text-[11px] text-muted-foreground/90 truncate border border-border/60">
            {error.message}
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button
            variant="default"
            size="sm"
            onClick={reset}
            className="gap-2 cursor-pointer"
          >
            <RotateCcw className="size-3.5" />
            <span>Try again</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            render={<Link href="/dashboard" />}
            className="gap-2 cursor-pointer"
          >
            <Home className="size-3.5" />
            <span>Return to dashboard</span>
          </Button>
        </div>
      </div>
    </main>
  );
}
