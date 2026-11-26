'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error cleanly for client diagnostics
    console.error('Dashboard route error:', error);
  }, [error]);

  return (
    <main className="portal-page flex min-h-[60vh] flex-col items-center justify-center p-4">
      <div className="border-border/80 bg-card animate-fade-rise flex max-w-md flex-col items-center rounded-[16px] border p-8 text-center">
        <div className="bg-destructive/10 text-destructive mb-4 flex size-13 items-center justify-center rounded-[16px]">
          <AlertTriangle className="size-6" />
        </div>

        <h1 className="text-foreground text-[17px] font-medium tracking-tight">
          Workspace couldn&apos;t load
        </h1>
        <p className="text-muted-foreground mt-2 text-[13px] leading-relaxed">
          An unexpected issue prevented this view from loading completely. Your saved records and
          pipeline data remain secure.
        </p>

        {error?.message && (
          <div className="bg-muted/50 text-muted-foreground/90 border-border/60 mt-3.5 w-full truncate rounded-[10px] border p-2.5 font-mono text-[11px]">
            {error.message}
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button variant="default" size="sm" onClick={reset} className="cursor-pointer gap-2">
            <RotateCcw className="size-3.5" />
            <span>Try again</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            render={<Link href="/dashboard" />}
            className="cursor-pointer gap-2"
          >
            <Home className="size-3.5" />
            <span>Return to dashboard</span>
          </Button>
        </div>
      </div>
    </main>
  );
}
