'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/client';
import {
  CheckCircle2,
  Sparkles,
  ArrowRight,
  LayoutDashboard,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function JobseekerConnectedPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState<string>('');
  const [paired, setPaired] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number>(3);

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let active = true;

    async function initPairing() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setErrorMsg('Please sign in first.');
          setLoading(false);
          return;
        }

        const name = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Candidate';
        if (active) setUserName(name);

        // Call quick-pair endpoint to generate extension credentials
        const res = await fetch('/api/extension/quick-pair', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: 'jobseeker_connected' }),
        });

        const data = await res.json();

        if (res.ok && data.token) {
          if (active) setPaired(true);

          // Dispatch event to content script
          window.postMessage(
            {
              type: 'NEXTKIN_EXTENSION_PAIRED',
              token: data.token,
              user: data.user || { id: user.id, name, email: user.email },
            },
            window.location.origin
          );
        } else {
          if (active) setErrorMsg(data.error || 'Could not connect to NextKinHR.');
        }
      } catch (err: unknown) {
        console.warn('Pairing handshake error:', err);
        if (active) setErrorMsg('Could not connect to NextKinHR. Reload to try again.');
      } finally {
        if (active) setLoading(false);
      }
    }

    initPairing();

    return () => {
      active = false;
    };
  }, [supabase]);

  // Auto-redirect countdown to candidate dashboard once paired
  useEffect(() => {
    if (!paired) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          router.push('/dashboard');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [paired, router]);

  const handleGoToDashboard = () => {
    router.push('/dashboard');
  };

  const handleCloseTab = () => {
    if (typeof window !== 'undefined') {
      window.close();
    }
  };

  return (
    <div className="bg-background flex min-h-screen w-full items-center justify-center p-4 antialiased">
      <div className="bg-card border-border/80 animate-fade-rise w-full max-w-lg space-y-6 rounded-2xl border p-6 text-center shadow-md sm:p-8">
        <div className="inline-flex size-14 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 shadow-xs dark:text-emerald-400">
          <CheckCircle2 className="size-7" />
        </div>

        <div className="space-y-2">
          <h1 className="text-foreground text-2xl font-bold tracking-tight">
            {loading
              ? 'Connecting Your Account...'
              : paired
                ? `Welcome, ${userName}!`
                : 'Connect Recruiting Copilot'}
          </h1>
          <p className="text-muted-foreground mx-auto max-w-sm text-xs leading-relaxed sm:text-sm">
            Connect your NextKinHR account to the Recruiting Copilot extension.
          </p>
          {paired && (
            <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
              <span>Redirecting to candidate dashboard in {countdown}s...</span>
            </div>
          )}
        </div>

        {errorMsg && (
          <div className="bg-destructive/10 text-destructive border-destructive/20 rounded-xl border p-3 text-xs font-medium">
            {errorMsg}
          </div>
        )}

        <div className="bg-muted/40 border-border/60 space-y-2.5 rounded-xl border p-4 text-left">
          <div className="text-foreground flex items-center gap-2 text-xs font-bold">
            <Sparkles className="text-primary size-4 shrink-0" />
            <span>Next Steps on Your Career Journey</span>
          </div>
          <ul className="text-muted-foreground list-disc space-y-1.5 pl-6 text-xs">
            <li>Open any job listing on Greenhouse, Ashby, Lever, or Workday.</li>
            <li>Open Recruiting Copilot from the Chrome toolbar.</li>
            <li>
              Open an application form and click <strong>Autofill Application Now</strong>.
            </li>
          </ul>
        </div>

        <div className="flex flex-col gap-3 pt-2 sm:flex-row">
          {errorMsg === 'Please sign in first.' && (
            <Link href="/auth/jobseeker" className="text-primary text-sm font-semibold">
              Sign in to NextKinHR
            </Link>
          )}
          <Button
            onClick={handleGoToDashboard}
            className="h-10 flex-1 cursor-pointer rounded-xl text-xs font-semibold shadow-xs sm:text-sm"
          >
            <LayoutDashboard className="mr-1.5 size-4" />
            <span>Go to Candidate Dashboard</span>
            <ArrowRight className="ml-1.5 size-4" />
          </Button>
          <Button
            onClick={handleCloseTab}
            variant="outline"
            className="h-10 cursor-pointer rounded-xl text-xs font-semibold sm:text-sm"
          >
            <span>Return to Job Application</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
