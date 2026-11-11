"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2, RotateCcw, ShieldCheck, ArrowRight } from "lucide-react";
import { ensureSessionProfile } from "@/lib/auth/session-profile";

export function JobseekerAuthCard() {
  const router = useRouter();

  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [countdown, setCountdown] = useState(0);

  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const otpInputRef = useRef<HTMLInputElement>(null);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  useEffect(() => {
    if (step === "otp") {
      const timer = setTimeout(() => {
        otpInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [step]);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setErrorMsg("Please enter a valid email address.");
      return;
    }

    setLoading(true);

    try {
      const redirectUrl =
        typeof window !== "undefined"
          ? `${window.location.origin}/auth/callback?next=/auth/jobseeker/connected`
          : "";

      const { error } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: {
          shouldCreateUser: true,
          data: {
            full_name: cleanEmail.split("@")[0] || "Candidate",
          },
          emailRedirectTo: redirectUrl,
        },
      });

      if (error) {
        if (
          error.status === 429 ||
          (error as { code?: string }).code === "over_email_send_rate_limit"
        ) {
          setErrorMsg("Rate limit reached. If you received a code recently, enter it below.");
          setStep("otp");
        } else {
          setErrorMsg(error.message);
        }
      } else {
        setStep("otp");
        setCountdown(45);
        setSuccessMsg(`We dispatched a 6-digit access code to ${cleanEmail}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send code";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const cleanCode = otpCode.trim();
    if (cleanCode.length < 6) {
      setErrorMsg("Please enter all 6 digits of the code");
      return;
    }

    setLoading(true);

    try {
      const cleanEmail = email.trim().toLowerCase();

      let { data, error } = await supabase.auth.verifyOtp({
        email: cleanEmail,
        token: cleanCode,
        type: "email",
      });

      if (
        error &&
        (error.message.includes("invalid") ||
          error.message.includes("expired") ||
          error.status === 400 ||
          error.status === 401)
      ) {
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
        setErrorMsg(error.message || "Invalid or expired code. Please request a new code.");
      } else if (data.user) {
        await ensureSessionProfile(supabase, data.user, {
          fullName: data.user.email?.split("@")[0] || "Candidate",
        });

        router.push("/auth/jobseeker/connected");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Verification failed";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (countdown > 0) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      const redirectUrl =
        typeof window !== "undefined"
          ? `${window.location.origin}/auth/callback?next=/auth/jobseeker/connected`
          : "";

      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          shouldCreateUser: true,
          emailRedirectTo: redirectUrl,
        },
      });

      if (error) {
        setErrorMsg(error.message);
      } else {
        setCountdown(45);
        setSuccessMsg("A fresh code was dispatched to your email");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to resend code";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    try {
      setGoogleLoading(true);
      setErrorMsg(null);
      const redirectTo = `${window.location.origin}/auth/callback?next=/auth/jobseeker/connected`;
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

  return (
    <div className="w-full max-w-[420px] rounded-xl border border-[#EAEAEA] bg-white p-7 sm:p-8 shadow-[0_1px_3px_rgba(0,0,0,0.02)] font-sans">
      {/* Header */}
      <div className="mb-6 space-y-1.5">
        <div className="flex items-center justify-between mb-3">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider bg-[#EDF3EC] text-[#346538]">
            <span className="size-1.5 rounded-full bg-[#346538]" />
            Candidate Access
          </span>
          <span className="text-[11px] font-mono text-[#787774]">Free account</span>
        </div>

        <h2 className="text-xl font-medium tracking-tight text-[#111111]">
          {step === "email" ? "Sign in with Email" : "Enter Verification Code"}
        </h2>
        <p className="text-xs text-[#787774] leading-relaxed">
          {step === "email"
            ? "Enter your email address to receive a secure six-digit login code."
            : `Enter the six-digit code sent to ${email}`}
        </p>
      </div>

      {errorMsg && (
        <div className="mb-4 rounded-[6px] border border-[#FDEBEC] bg-[#FDEBEC] px-3.5 py-2.5 text-xs text-[#9F2F2D] leading-relaxed">
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="mb-4 rounded-[6px] border border-[#EDF3EC] bg-[#EDF3EC] px-3.5 py-2.5 text-xs text-[#346538] leading-relaxed">
          {successMsg}
        </div>
      )}

      {step === "email" ? (
        <div className="space-y-4">
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="candidate-email" className="block text-xs font-medium text-[#111111]">
                Email address
              </label>
              <input
                id="candidate-email"
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                className="w-full h-10 rounded-[6px] border border-[#EAEAEA] bg-white px-3 text-xs text-[#111111] placeholder:text-[#787774]/60 focus:border-[#111111] focus:outline-none transition-colors"
              />
            </div>

            {/* Utilitarian Solid Button */}
            <button
              type="submit"
              disabled={loading || googleLoading || !email.trim()}
              className="w-full h-10 rounded-[6px] bg-[#111111] hover:bg-[#262626] active:scale-[0.98] text-white text-xs font-medium transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Sending code...</span>
                </>
              ) : (
                <span>Continue with email</span>
              )}
            </button>
          </form>

          <div className="relative flex items-center justify-center py-1">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#EAEAEA]" />
            </div>
            <span className="relative bg-white px-2 text-[10px] text-[#787774] uppercase font-mono tracking-wider">
              or
            </span>
          </div>

          <button
            type="button"
            onClick={handleGoogleAuth}
            disabled={googleLoading || loading}
            className="w-full h-10 rounded-[6px] border border-[#EAEAEA] bg-white hover:bg-[#F7F6F3] text-xs font-medium text-[#111111] transition-all flex items-center justify-center gap-2.5 active:scale-[0.98] cursor-pointer"
          >
            <svg className="size-3.5" viewBox="0 0 24 24">
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
            <span>{googleLoading ? "Connecting..." : "Continue with Google"}</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="candidate-otp" className="block text-xs font-medium text-[#111111]">
                  Verification code
                </label>
                <span className="text-[10px] font-mono text-[#787774]">6 digits</span>
              </div>
              <input
                id="candidate-otp"
                ref={otpInputRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="000000"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                required
                autoFocus
                className="w-full h-11 rounded-[6px] border border-[#EAEAEA] bg-white text-center text-lg font-mono tracking-[0.35em] tabular-nums text-[#111111] focus:border-[#111111] focus:outline-none transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading || otpCode.length < 6}
              className="w-full h-10 rounded-[6px] bg-[#111111] hover:bg-[#262626] active:scale-[0.98] text-white text-xs font-medium transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Verifying...</span>
                </>
              ) : (
                <span>Verify and continue</span>
              )}
            </button>
          </form>

          <div className="flex items-center justify-between text-xs pt-1 text-[#787774]">
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setOtpCode("");
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className="hover:text-[#111111] transition-colors cursor-pointer"
            >
              Use different email
            </button>

            <button
              type="button"
              disabled={loading || countdown > 0}
              onClick={handleResendOtp}
              className={`cursor-pointer ${
                countdown > 0
                  ? "text-[#787774]/70 cursor-not-allowed"
                  : "text-[#111111] hover:underline"
              }`}
            >
              {countdown > 0 ? `Resend in ${countdown}s` : "Resend code"}
            </button>
          </div>
        </div>
      )}

      {/* Privacy Note */}
      <div className="mt-6 pt-4 border-t border-[#EAEAEA] text-[11px] text-[#787774] leading-relaxed flex items-start gap-2">
        <span className="size-1.5 rounded-full bg-[#346538] mt-1.5 shrink-0" />
        <span>
          Applicant credentials pair directly with the NextKin browser extension and remain isolated in your personal encrypted vault.
        </span>
      </div>
    </div>
  );
}
