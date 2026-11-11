"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { User } from "@supabase/supabase-js";
import type { UserProfile } from "@/types/database";
import { ensureSessionProfile, readSessionProfile } from "@/lib/auth/session-profile";
import {
  ArrowRightIcon,
  PhoneIcon,
  MailIcon,
  KeyRoundIcon,
  RotateCcwIcon,
  ArrowLeftIcon,
  ShieldCheckIcon,
} from "lucide-react";

export function SignupForm() {
  const router = useRouter();

  const [email, setEmail] = useState("");

  // OTP Verification state
  const [otpStep, setOtpStep] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [countdown, setCountdown] = useState(0);

  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentProfile, setCurrentProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const profileRequest = useRef(0);

  const supabase = useMemo(() => createClient(), []);

  const loadProfile = useCallback(async (user: User | null) => {
    const requestId = ++profileRequest.current;
    setCurrentProfile(null);
    setProfileLoading(!!user);
    if (!user) {
      return;
    }
    try {
      const data = await readSessionProfile(supabase, user.id);
      if (requestId !== profileRequest.current) return;
      if (!data) throw new Error("Your account profile is missing. Please contact an administrator.");
      setCurrentProfile(data);
    } catch (error) {
      if (requestId === profileRequest.current) setErrorMsg(error instanceof Error ? error.message : "Unable to load your account profile.");
    } finally {
      if (requestId === profileRequest.current) setProfileLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setCurrentUser(data.user);
        loadProfile(data.user);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setCurrentUser(u);
      loadProfile(u);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase, loadProfile]);

  // Countdown timer for OTP resend
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  useEffect(() => {
    const timer=setTimeout(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const urlErrorDesc = params.get("error_description");
      const urlError = params.get("error");

      if (urlErrorDesc) {
        setErrorMsg(urlErrorDesc);
      } else if (urlError) {
        if (urlError === "auth-code-error") {
          setErrorMsg("Authentication session timed out or was cancelled. Please request a new code.");
        } else {
          setErrorMsg(urlError);
        }
      }

    }
    },0);
    return () => clearTimeout(timer);
  }, []);

  // STEP 1: Request Email OTP with Mandatory Phone
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const cleanEmail = email.trim();
    const derivedName = cleanEmail.split("@")[0] || "User";

    if (!cleanEmail || !cleanEmail.includes("@")) {
      setErrorMsg("Please enter a valid email address.");
      return;
    }

    setLoading(true);

    try {
      const redirectUrl =
        typeof window !== "undefined"
          ? `${window.location.origin}/auth/callback?next=/dashboard`
          : "";

      const { error } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: {
          shouldCreateUser: true,
          data: {
            full_name: derivedName,
          },
          emailRedirectTo: redirectUrl,
        },
      });

      if (error) {
        if (error.status === 429 || (error as { code?: string }).code === "over_email_send_rate_limit") {
          // Free tier rate limit hit: explain clearly and still allow entering code if already sent
          setErrorMsg(
            "Supabase email rate limit reached (free tier limit of 3 emails/hour). If you already received a verification code in your email earlier, enter it below."
          );
          setOtpStep(true);
        } else {
          setErrorMsg(error.message);
        }
      } else {
        setOtpStep(true);
        setCountdown(45);
        setSuccessMsg(`A verification code has been sent to ${cleanEmail}. Please check your inbox or spam.`);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to send verification code.";
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  };

  // STEP 2: Verify Email OTP
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const cleanCode = otpCode.trim();
    if (!cleanCode || cleanCode.length < 6) {
      setErrorMsg("Please enter the complete verification code.");
      return;
    }

    setLoading(true);

    try {
      const cleanEmail = email.trim();
      // Supabase GoTrue issues tokens under different OTP types depending on user status:
      // 'email', 'magiclink' (for existing accounts), or 'signup' (for new user confirmation)
      let { data, error } = await supabase.auth.verifyOtp({
        email: cleanEmail,
        token: cleanCode,
        type: "email",
      });

      // If 'email' type fails, try 'magiclink' (used by Supabase for existing users) and 'signup' (for new user registrations)
      if (error && (error.message.includes("invalid") || error.message.includes("expired") || error.status === 400 || error.status === 401)) {
        const retryMagic = await supabase.auth.verifyOtp({
          email: cleanEmail,
          token: cleanCode,
          type: "magiclink",
        });
        if (!retryMagic.error) {
          data = retryMagic.data;
          error = null;
        } else {
          const retrySignup = await supabase.auth.verifyOtp({
            email: cleanEmail,
            token: cleanCode,
            type: "signup",
          });
          if (!retrySignup.error) {
            data = retrySignup.data;
            error = null;
          }
        }
      }

      if (error) {
        setErrorMsg(error.message || "Invalid or expired verification code. Please check the code or request a new one.");
      } else if (data.user) {
        const derivedName = data.user.email?.split("@")[0] || "User";
        const prof = await ensureSessionProfile(supabase, data.user, {
          fullName: derivedName,
          phone: null,
        });
        ++profileRequest.current;
        setCurrentUser(data.user);
        setCurrentProfile(prof);
        setProfileLoading(false);

        if (prof.status === "active") {
          setSuccessMsg("Verification successful! Opening dashboard...");
          router.push("/dashboard");
        } else {
          setErrorMsg(`Your account is ${prof.status}. Please contact an administrator before accessing the portal.`);
        }
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Verification failed. Please try again.";
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  };

  // Resend OTP
  const handleResendOtp = async () => {
    if (countdown > 0) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      const redirectUrl =
        typeof window !== "undefined"
          ? `${window.location.origin}/auth/callback?next=/dashboard`
          : "";

      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: true,
          emailRedirectTo: redirectUrl,
        },
      });

      if (error) {
        setErrorMsg(error.message);
      } else {
        setCountdown(45);
        setSuccessMsg(`New verification code sent to ${email.trim()}.`);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not resend code.";
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  };

  // Google OAuth with Mandatory Phone Check
  const handleGoogleSignIn = async () => {
    setErrorMsg(null);

    setGoogleLoading(true);
    try {
      // OAuth needs a full browser navigation so the server can set PKCE and
      // registration cookies before redirecting to Google.
      window.location.assign(new URL(`/auth/google?next=${encodeURIComponent("/dashboard")}`, window.location.origin).href);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to initiate Google login.";
      setErrorMsg(message);
      setGoogleLoading(false);
    }
  };

  const handleSignOut = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    setCurrentUser(null);
    setCurrentProfile(null);
    setErrorMsg(null);
    setOtpStep(false);
    setOtpCode("");
    setSuccessMsg("Signed out successfully.");
    setLoading(false);
  };

  // Authenticated State View
  if (currentUser) {
    const badgeColor = "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30";

    return (
      <div className="flex flex-col gap-4 p-5 sm:p-6 border rounded-2xl border-border/70 bg-card/90 backdrop-blur-xs shadow-xs">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Current Session</span>
          <Badge variant="outline" className={badgeColor}>
            Candidate
          </Badge>
        </div>

        <div>
          <h2 className="text-lg font-bold tracking-tight text-foreground">
            {currentProfile?.full_name || currentUser.user_metadata?.full_name || currentUser.email}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">{currentUser.email}</p>
          {currentProfile?.phone && (
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
              <PhoneIcon className="size-3 text-primary" />
              {currentProfile.phone}
            </p>
          )}
        </div>

        {errorMsg && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">{errorMsg}</p>}
        {currentProfile && ["rejected", "suspended"].includes(currentProfile.status) && <p role="alert" className="text-xs text-destructive">Your account is {currentProfile.status}. Contact an administrator to review access.</p>}

        <div className="flex flex-col gap-2 pt-2">
          <Button
            disabled={profileLoading || currentProfile?.status !== "active"}
            onClick={() => router.push("/dashboard")}
            className="w-full bg-primary text-primary-foreground font-medium flex items-center justify-center gap-1.5 cursor-pointer h-9 text-xs disabled:opacity-50"
          >
            Enter Portal Dashboard
            <ArrowRightIcon className="size-3.5" />
          </Button>
          {!currentProfile && !profileLoading && <Button variant="outline" onClick={() => loadProfile(currentUser)} className="w-full h-9 text-xs">Retry Account Profile</Button>}
          <Button
            onClick={handleSignOut}
            disabled={loading}
            variant="outline"
            className="w-full cursor-pointer h-9 text-xs"
          >
            {loading ? "Signing out..." : "Sign Out"}
          </Button>
        </div>
      </div>
    );
  }

  // STEP 2: OTP Verification Screen
  if (otpStep) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col items-center gap-1.5 text-center sm:items-start sm:text-left">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs text-primary font-semibold bg-primary/10 border border-primary/20">
            <KeyRoundIcon className="size-3.5" />
            Verification Required
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
            Enter Verification Code
          </h1>
          <p className="text-xs text-muted-foreground leading-relaxed">
            We sent a verification code and a sign-in link to{" "}
            <span className="font-semibold text-foreground underline decoration-primary/40 underline-offset-2">
              {email}
            </span>
            . Enter the code below or click the sign-in link in your email.
          </p>
        </div>

        {errorMsg && (
          <div role="alert" className="p-3 text-xs rounded-xl bg-destructive/10 text-destructive border border-destructive/20 leading-relaxed">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div role="status" className="p-3 text-xs rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 leading-relaxed">
            {successMsg}
          </div>
        )}

        <form onSubmit={handleVerifyOtp} className="flex flex-col gap-3.5">
          <div className="space-y-1.5">
            <Label htmlFor="otpCode" className="text-xs font-semibold text-foreground/90">
              Verification Code (OTP)
            </Label>
            <div className="relative">
              <KeyRoundIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/70 pointer-events-none" />
              <Input
                id="otpCode"
                type="text"
                inputMode="numeric"
                maxLength={10}
                placeholder="123456"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                required
                autoFocus
                className="h-11 pl-10 pr-4 text-lg tracking-[0.25em] font-mono text-center font-bold bg-background/80 border-border/80 focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:border-primary rounded-xl shadow-2xs"
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading || otpCode.length < 6}
            className="w-full h-10 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-xs hover:shadow active:scale-[0.99] transition-all duration-150 cursor-pointer text-xs flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="size-3.5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                <span>Verifying Code...</span>
              </>
            ) : (
              <>
                <span>Verify & Enter Portal</span>
                <ArrowRightIcon className="size-3.5" />
              </>
            )}
          </Button>

          <div className="flex items-center justify-between text-xs pt-2 border-t border-border/40">
            <button
              type="button"
              onClick={() => {
                setOtpStep(false);
                setOtpCode("");
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer text-xs font-medium"
            >
              <ArrowLeftIcon className="size-3.5" />
              Edit details
            </button>

            <button
              type="button"
              onClick={handleResendOtp}
              disabled={countdown > 0 || loading}
              className={`inline-flex items-center gap-1.5 transition-colors cursor-pointer text-xs font-medium ${
                countdown > 0
                  ? "text-muted-foreground cursor-not-allowed opacity-60"
                  : "text-primary hover:underline"
              }`}
            >
              <RotateCcwIcon className="size-3.5" />
              {countdown > 0 ? `Resend code (${countdown}s)` : "Resend code"}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // STEP 1: Registration / Login Screen with Mandatory Phone & Passwordless OTP
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-1 text-center sm:items-start sm:text-left">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
          Portal Access
        </h1>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Verify your email to create your candidate account. Existing accounts keep their saved profile.
        </p>
      </div>

      {errorMsg && (
        <div role="alert" className="p-3 text-xs rounded-xl bg-destructive/10 text-destructive border border-destructive/20 leading-relaxed">
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div role="status" className="p-3 text-xs rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 leading-relaxed">
          {successMsg}
        </div>
      )}

      <form onSubmit={handleSendOtp} className="flex flex-col gap-3.5">
        {/* Email Address */}
        <div className="space-y-1">
          <Label htmlFor="email" className="text-xs font-medium text-foreground">
            Email Address <span className="text-destructive">*</span>
          </Label>
          <div className="relative">
            <MailIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              id="email"
              type="email"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-9.5 pl-9 pr-3 text-xs bg-background border-border/80 rounded-lg shadow-2xs focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary"
            />
          </div>
        </div>

        {/* Submit Button (Send Email OTP) */}
        <Button
          type="submit"
          disabled={loading}
          className="w-full mt-1 h-9.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-xs hover:shadow active:scale-[0.99] transition-all duration-150 cursor-pointer text-xs flex items-center justify-center gap-2 group"
        >
          {loading ? (
            <>
              <div className="size-3.5 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              <span>Sending Verification Code...</span>
            </>
          ) : (
            <>
              <MailIcon className="size-3.5" />
              <span>Send Email OTP Code</span>
              <ArrowRightIcon className="size-3 text-primary-foreground/70 transition-transform group-hover:translate-x-0.5" />
            </>
          )}
        </Button>

        <div className="relative my-0.5 text-center text-xs after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t after:border-border/60">
          <span className="relative z-10 bg-background px-2.5 text-[10px] font-medium text-muted-foreground">
            Or continue with Google
          </span>
        </div>

        {/* Google OAuth Button */}
        <Button
          type="button"
          variant="outline"
          onClick={handleGoogleSignIn}
          disabled={googleLoading}
          className="w-full h-9.5 rounded-lg border-border/70 hover:border-border hover:bg-muted/50 bg-background cursor-pointer text-xs font-medium flex items-center justify-center gap-2.5 shadow-2xs active:scale-[0.99] transition-all"
        >
          <svg className="size-4 shrink-0" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              fill="#EA4335"
            />
          </svg>
          <span>{googleLoading ? "Connecting to Google..." : "Continue with Google"}</span>
        </Button>

        <div className="pt-2 border-t border-border/40 text-[10px] text-muted-foreground flex items-center justify-center gap-1.5 text-center">
          <ShieldCheckIcon className="size-3 text-primary shrink-0" />
          <span>Passwordless login: Secure 6-digit OTP codes sent directly to your email.</span>
        </div>
      </form>
    </div>
  );
}
