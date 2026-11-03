"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, CheckCircle2, ArrowRight, Lock, Mail, User as UserIcon } from "lucide-react";

export function JobseekerAuthCard() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const supabase = useMemo(() => createClient(), []);

  const handleGoogleAuth = async () => {
    try {
      setGoogleLoading(true);
      setErrorMsg(null);
      const redirectTo = `${window.location.origin}/auth/callback?next=/auth/jobseeker/connected&role=job_seeker`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });
      if (error) throw error;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Google authentication failed";
      setErrorMsg(msg);
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      setErrorMsg("Please enter both email and password.");
      return;
    }

    if (mode === "signup" && !fullName.trim()) {
      setErrorMsg("Please provide your full name.");
      return;
    }

    if (password.length < 6) {
      setErrorMsg("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);

    try {
      if (mode === "signup") {
        const redirectTo = `${window.location.origin}/auth/callback?next=/auth/jobseeker/connected&role=job_seeker`;
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: {
              full_name: fullName.trim(),
              role: "job_seeker",
            },
            emailRedirectTo: redirectTo,
          },
        });

        if (error) throw error;

        if (data.session) {
          // Direct login without email confirmation
          router.push("/auth/jobseeker/connected");
        } else {
          setSuccessMsg(
            "Account created! Please check your email to confirm your account, or sign in if already verified."
          );
          setLoading(false);
        }
      } else {
        // Sign In
        const { data, error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (error) throw error;

        if (data.user) {
          router.push("/auth/jobseeker/connected");
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Authentication failed";
      setErrorMsg(msg);
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-card/95 backdrop-blur-md rounded-2xl border border-border/60 shadow-2xl p-6 sm:p-8 space-y-6">
      {/* Header */}
      <div className="space-y-2 text-center">
        <div className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-xs mb-1">
          <Sparkles className="size-5" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {mode === "signup" ? "Get Started with NextKin" : "Welcome Back"}
        </h1>
        <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
          {mode === "signup"
            ? "Create your applicant account to save your resume and unlock 1-click autofill across top job boards."
            : "Sign in to access your saved resume and autofill job applications instantly."}
        </p>
      </div>

      {/* Mode Switcher */}
      <div className="grid grid-cols-2 p-1 bg-muted/60 rounded-xl border border-border/40 text-xs font-semibold">
        <button
          type="button"
          onClick={() => {
            setMode("signup");
            setErrorMsg(null);
            setSuccessMsg(null);
          }}
          className={`py-2 rounded-lg transition-all ${
            mode === "signup"
              ? "bg-background text-foreground shadow-xs font-bold"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Create Account
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("signin");
            setErrorMsg(null);
            setSuccessMsg(null);
          }}
          className={`py-2 rounded-lg transition-all ${
            mode === "signin"
              ? "bg-background text-foreground shadow-xs font-bold"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Sign In
        </button>
      </div>

      {/* Alert Messages */}
      {errorMsg && (
        <div className="p-3 text-xs rounded-xl bg-destructive/10 text-destructive border border-destructive/20 font-medium">
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="p-3 text-xs rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-medium">
          {successMsg}
        </div>
      )}

      {/* Google Auth */}
      <Button
        type="button"
        variant="outline"
        onClick={handleGoogleAuth}
        disabled={googleLoading || loading}
        className="w-full h-11 rounded-xl border-border/80 hover:bg-muted/40 font-medium text-xs sm:text-sm flex items-center justify-center gap-2.5 transition-all"
      >
        <svg className="size-4" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
          />
        </svg>
        {googleLoading ? "Connecting to Google..." : "Continue with Google"}
      </Button>

      {/* Divider */}
      <div className="relative flex items-center justify-center">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border/50" />
        </div>
        <span className="relative px-3 bg-card text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
          Or with email
        </span>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === "signup" && (
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground/90">Full Name</Label>
            <div className="relative">
              <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Jane Doe"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="pl-9 h-10 rounded-xl text-xs sm:text-sm bg-background/50"
              />
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-foreground/90">Email Address</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              type="email"
              placeholder="jane@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="pl-9 h-10 rounded-xl text-xs sm:text-sm bg-background/50"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-foreground/90">Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="pl-9 h-10 rounded-xl text-xs sm:text-sm bg-background/50"
            />
          </div>
        </div>

        <Button
          type="submit"
          disabled={loading || googleLoading}
          className="w-full h-11 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs sm:text-sm shadow-md transition-all mt-2"
        >
          {loading ? (
            "Processing..."
          ) : (
            <span className="inline-flex items-center gap-1.5">
              {mode === "signup" ? "Create Account & Unlock Extension" : "Sign In & Connect"}
              <ArrowRight className="size-4" />
            </span>
          )}
        </Button>
      </form>

      {/* Feature Bullet Points */}
      <div className="pt-2 border-t border-border/40 space-y-2">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-medium">
          <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
          <span>Works on Ashby, Greenhouse, Lever, Workday & more</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-medium">
          <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
          <span>Real-time ATS Score & Grounded JD Matcher</span>
        </div>
      </div>
    </div>
  );
}
