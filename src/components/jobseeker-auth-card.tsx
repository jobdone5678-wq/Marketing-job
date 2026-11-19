'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/client';
import { Loader2 } from 'lucide-react';
import { VerifiedStamp } from '@/components/brand-mark';
import { ensureSessionProfile } from '@/lib/auth/session-profile';

export function JobseekerAuthCard() {
  const router = useRouter();

  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
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
    if (step === 'otp') {
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
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    setLoading(true);

    try {
      const redirectUrl =
        typeof window !== 'undefined'
          ? `${window.location.origin}/auth/callback?next=/auth/jobseeker/connected`
          : '';

      const { error } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: {
          shouldCreateUser: true,
          data: {
            full_name: cleanEmail.split('@')[0] || 'Candidate',
          },
          emailRedirectTo: redirectUrl,
        },
      });

      if (error) {
        if (
          error.status === 429 ||
          (error as { code?: string }).code === 'over_email_send_rate_limit'
        ) {
          setErrorMsg('Rate limit reached. If you received a code recently, enter it below.');
          setStep('otp');
        } else {
          setErrorMsg(error.message);
        }
      } else {
        setStep('otp');
        setCountdown(45);
        setSuccessMsg(`We sent a 6-digit code to ${cleanEmail}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send code';
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
      setErrorMsg('Please enter all 6 digits of the code');
      return;
    }

    setLoading(true);

    try {
      const cleanEmail = email.trim().toLowerCase();

      let { data, error } = await supabase.auth.verifyOtp({
        email: cleanEmail,
        token: cleanCode,
        type: 'email',
      });

      if (
        error &&
        (error.message.includes('invalid') ||
          error.message.includes('expired') ||
          error.status === 400 ||
          error.status === 401)
      ) {
        const retryMagic = await supabase.auth.verifyOtp({
          email: cleanEmail,
          token: cleanCode,
          type: 'magiclink',
        });

        if (!retryMagic.error) {
          data = retryMagic.data;
          error = null;
        } else {
          const retrySignup = await supabase.auth.verifyOtp({
            email: cleanEmail,
            token: cleanCode,
            type: 'signup',
          });
          if (!retrySignup.error) {
            data = retrySignup.data;
            error = null;
          }
        }
      }

      if (error) {
        setErrorMsg(error.message || 'Invalid or expired code. Please request a new code.');
      } else if (data.user) {
        await ensureSessionProfile(supabase, data.user, {
          fullName: data.user.email?.split('@')[0] || 'Candidate',
        });

        router.push('/auth/jobseeker/connected');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Verification failed';
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
        typeof window !== 'undefined'
          ? `${window.location.origin}/auth/callback?next=/auth/jobseeker/connected`
          : '';

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
        setSuccessMsg('A new code is on its way to your email');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to resend code';
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
        provider: 'google',
        options: {
          redirectTo,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });
      if (error) throw error;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Google authentication failed';
      setErrorMsg(msg);
      setGoogleLoading(false);
    }
  };

  const fieldClass =
    'border-border bg-card text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-ring/15 h-11 w-full rounded-[10px] border px-3.5 text-[13px] transition-colors outline-none focus:ring-3';
  const primaryButtonClass =
    'bg-primary text-primary-foreground hover:bg-primary/90 flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] text-[13px] font-medium transition-colors active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div className="panel w-full max-w-[420px] p-7 sm:p-8">
      {/* Header */}
      <div className="mb-6">
        <div className="mb-5 flex items-center justify-between">
          <span className="text-muted-foreground inline-flex items-center gap-2 text-[13px]">
            <VerifiedStamp className="size-4" />
            Candidate access
          </span>
          <span className="figure text-muted-foreground text-[11px]">Free account</span>
        </div>

        <h2 className="text-foreground text-[20px] leading-7 font-medium tracking-tight">
          {step === 'email' ? 'Sign in' : 'Enter your code'}
        </h2>
        <p className="text-muted-foreground mt-2 text-[13px] leading-5">
          {step === 'email'
            ? 'We send a six-digit code to your email — no password to remember'
            : `Six digits, sent to ${email}`}
        </p>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/5 text-destructive mb-4 rounded-[10px] border px-3.5 py-2.5 text-[13px] leading-5"
        >
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="border-primary/25 bg-primary/5 text-primary mb-4 rounded-[10px] border px-3.5 py-2.5 text-[13px] leading-5">
          {successMsg}
        </div>
      )}

      {step === 'email' ? (
        <div className="space-y-4">
          <form onSubmit={handleSendOtp} className="space-y-4">
            <div className="space-y-2">
              <label
                htmlFor="candidate-email"
                className="text-foreground block text-[13px] font-medium"
              >
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
                className={fieldClass}
              />
            </div>

            <button
              type="submit"
              disabled={loading || googleLoading || !email.trim()}
              className={primaryButtonClass}
            >
              {loading ? (
                <>
                  <Loader2 aria-hidden="true" className="size-4 animate-spin stroke-[1.5]" />
                  <span>Sending code</span>
                </>
              ) : (
                <span>Continue with email</span>
              )}
            </button>
          </form>

          <div className="flex items-center gap-3 py-1">
            <span className="bg-border h-px flex-1" />
            <span className="text-muted-foreground text-[11px]">or</span>
            <span className="bg-border h-px flex-1" />
          </div>

          <button
            type="button"
            onClick={handleGoogleAuth}
            disabled={googleLoading || loading}
            className="border-border text-foreground hover:bg-accent flex h-11 w-full cursor-pointer items-center justify-center gap-2.5 rounded-[10px] border text-[13px] font-medium transition-colors active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24">
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
            <span>{googleLoading ? 'Connecting' : 'Continue with Google'}</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="candidate-otp"
                  className="text-foreground block text-[13px] font-medium"
                >
                  Verification code
                </label>
                <span className="figure text-muted-foreground text-[11px]">6 digits</span>
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
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                required
                autoFocus
                className="figure border-border bg-card text-foreground placeholder:text-muted-foreground/50 focus:border-ring focus:ring-ring/15 h-14 w-full rounded-[10px] border text-center text-[22px] tracking-[0.35em] transition-colors outline-none focus:ring-3"
              />
            </div>

            <button type="submit" disabled={loading || otpCode.length < 6} className={primaryButtonClass}>
              {loading ? (
                <>
                  <Loader2 aria-hidden="true" className="size-4 animate-spin stroke-[1.5]" />
                  <span>Verifying</span>
                </>
              ) : (
                <span>Verify and continue</span>
              )}
            </button>
          </form>

          <div className="text-muted-foreground flex items-center justify-between pt-1 text-[13px]">
            <button
              type="button"
              onClick={() => {
                setStep('email');
                setOtpCode('');
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className="hover:text-foreground cursor-pointer transition-colors"
            >
              Use a different email
            </button>

            <button
              type="button"
              disabled={loading || countdown > 0}
              onClick={handleResendOtp}
              className={
                countdown > 0
                  ? 'text-muted-foreground cursor-not-allowed'
                  : 'text-foreground cursor-pointer hover:underline'
              }
            >
              {countdown > 0 ? `Resend in ${countdown}s` : 'Resend code'}
            </button>
          </div>
        </div>
      )}

      {/* Privacy note */}
      <p className="border-border text-muted-foreground mt-6 border-t pt-4 text-[13px] leading-5">
        Your sign-in pairs this account with the Nextkin browser extension. Profile data stays in
        your own workspace.
      </p>
    </div>
  );
}
