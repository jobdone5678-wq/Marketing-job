"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/client";
import { CheckCircle2, Sparkles, ArrowRight, UploadCloud, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function JobseekerConnectedPage() {
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState<string>("");
  const [paired, setPaired] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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

  const handleCloseTab = () => {
    if (typeof window !== "undefined") {
      window.close();
    }
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-background via-muted/10 to-muted/30 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-card rounded-2xl border border-border/60 shadow-2xl p-6 sm:p-8 text-center space-y-6">
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
            Your NextKin applicant account is active. Your extension is now linked and ready to autofill job applications.
          </p>
        </div>

        {errorMsg && (
          <div className="p-3 text-xs rounded-xl bg-destructive/10 text-destructive border border-destructive/20 font-medium">
            {errorMsg}
          </div>
        )}

        <div className="p-4 rounded-xl bg-muted/40 border border-border/50 text-left space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-bold text-foreground">
            <Sparkles className="size-4 text-emerald-500 shrink-0" />
            <span>Next Steps on Your Job Application</span>
          </div>
          <ul className="text-xs text-muted-foreground space-y-1.5 pl-6 list-disc">
            <li>Return to your job application tab (Greenhouse, Ashby, etc.).</li>
            <li>Click <strong>Autofill</strong> on the extension to apply with one click.</li>
            <li>Upload or update your resume anytime via the extension panel.</li>
          </ul>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button
            onClick={handleCloseTab}
            className="flex-1 h-11 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs sm:text-sm shadow-md"
          >
            <span>Return to Job Application</span>
            <ArrowRight className="size-4 ml-1.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
