"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/client";
import { CheckCircle2, Sparkles, ArrowRight, LayoutDashboard, ExternalLink, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function JobseekerConnectedPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState<string>("");
  const [paired, setPaired] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number>(3);

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    let active = true;

    async function initPairing() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setErrorMsg("Please sign in first.");
          setLoading(false);
          return;
        }

        const name = user.user_metadata?.full_name || user.email?.split("@")[0] || "Candidate";
        if (active) setUserName(name);

        // Call quick-pair endpoint to generate extension credentials
        const res = await fetch("/api/extension/quick-pair", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source: "jobseeker_connected" }),
        });

        const data = await res.json();

        if (res.ok && data.token) {
          if (active) setPaired(true);

          // Dispatch event to content script
          window.postMessage(
            {
              type: "NEXTKIN_EXTENSION_PAIRED",
              token: data.token,
              user: data.user || { id: user.id, name, email: user.email },
            },
            "*"
          );

          // Set DOM attributes for extension content scripts to read
          document.documentElement.setAttribute("data-nextkin-paired", "true");
          document.documentElement.setAttribute("data-nextkin-token", data.token);
          document.documentElement.setAttribute(
            "data-nextkin-user",
            JSON.stringify(data.user || { id: user.id, name, email: user.email })
          );
        } else {
          console.warn("Quick pair response:", data);
        }
      } catch (err: unknown) {
        console.warn("Pairing handshake error:", err);
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
          router.push("/dashboard");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [paired, router]);

  const handleGoToDashboard = () => {
    router.push("/dashboard");
  };

  const handleCloseTab = () => {
    if (typeof window !== "undefined") {
      window.close();
    }
  };

  return (
    <div className="min-h-screen w-full bg-background flex items-center justify-center p-4 antialiased">
      <div className="w-full max-w-lg bg-card rounded-2xl border border-border/80 shadow-md p-6 sm:p-8 text-center space-y-6 animate-fade-rise">
        <div className="inline-flex size-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 shadow-xs">
          <CheckCircle2 className="size-7" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {loading
              ? "Connecting Your Account..."
              : paired
              ? `Welcome, ${userName}!`
              : "Account Authenticated!"}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">
            Your candidate account is linked and ready. The NextKin extension is paired to assist your application autofill.
          </p>
          {paired && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 text-xs font-semibold">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Redirecting to candidate dashboard in {countdown}s...</span>
            </div>
          )}
        </div>

        {errorMsg && (
          <div className="p-3 text-xs rounded-xl bg-destructive/10 text-destructive border border-destructive/20 font-medium">
            {errorMsg}
          </div>
        )}

        <div className="p-4 rounded-xl bg-muted/40 border border-border/60 text-left space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-bold text-foreground">
            <Sparkles className="size-4 text-primary shrink-0" />
            <span>Next Steps on Your Career Journey</span>
          </div>
          <ul className="text-xs text-muted-foreground space-y-1.5 pl-6 list-disc">
            <li>Open any job listing on Greenhouse, Ashby, Lever, or Workday.</li>
            <li>Click <strong>Autofill Application</strong> in the floating extension panel.</li>
            <li>Manage your tailored resumes and track applications in NextKin.</li>
          </ul>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button
            onClick={handleGoToDashboard}
            className="flex-1 h-10 rounded-xl font-semibold text-xs sm:text-sm shadow-xs cursor-pointer"
          >
            <LayoutDashboard className="size-4 mr-1.5" />
            <span>Go to Candidate Dashboard</span>
            <ArrowRight className="size-4 ml-1.5" />
          </Button>
          <Button
            onClick={handleCloseTab}
            variant="outline"
            className="h-10 rounded-xl font-semibold text-xs sm:text-sm cursor-pointer"
          >
            <span>Return to Job Application</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
