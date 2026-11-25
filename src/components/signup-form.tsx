'use client';

import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import type { User } from '@supabase/supabase-js';
import type { UserProfile } from '@/types/database';
import { ensureSessionProfile, readSessionProfile } from '@/lib/auth/session-profile';
import { extensionConnectNext } from '@/lib/auth/extension-connect';
import {
  ArrowRightIcon,
  PhoneIcon,
  MailIcon,
  KeyRoundIcon,
  RotateCcwIcon,
  ArrowLeftIcon,
  ShieldCheckIcon,
} from 'lucide-react';

function signInDestination() {
  const next = new URLSearchParams(window.location.search).get('next');
  return extensionConnectNext(next) ?? '/dashboard';
}

function authCallbackUrl() {
  const callback = new URL('/auth/callback', window.location.origin);
  callback.searchParams.set('next', signInDestination());
  return callback.href;
}

export function SignupForm() {
  const router = useRouter();

  const [email, setEmail] = useState('');

  // OTP Verification state
  const [otpStep, setOtpStep] = useState(false);
  const [otpCode, setOtpCode] = useState('');
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

  const loadProfile = useCallback(
    async (user: User | null) => {
      const requestId = ++profileRequest.current;
      setCurrentProfile(null);
      setProfileLoading(!!user);
      if (!user) {
        return;
      }
      try {
        const data = await readSessionProfile(supabase, user.id);
        if (requestId !== profileRequest.current) return;
        if (!data)
          throw new Error('Your account profile is missing. Please contact an administrator.');
        setCurrentProfile(data);
      } catch (error) {
        if (requestId === profileRequest.current)
          setErrorMsg(
            error instanceof Error ? error.message : 'Unable to load your account profile.'
          );
      } finally {
        if (requestId === profileRequest.current) setProfileLoading(false);
      }
    },
    [supabase]
  );

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
    const timer = setTimeout(() => {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const urlErrorDesc = params.get('error_description');
        const urlError = params.get('error');

        if (urlErrorDesc) {
          setErrorMsg(urlErrorDesc);
        } else if (urlError) {
          if (urlError === 'auth-code-error') {
            setErrorMsg(
              'Authentication session timed out or was cancelled. Please request a new code.'
            );
          } else {
            setErrorMsg(urlError);
          }
        }
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // STEP 1: Request Email OTP with Mandatory Phone
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const cleanEmail = email.trim();
    const derivedName = cleanEmail.split('@')[0] || 'User';

    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: {
          shouldCreateUser: true,
          data: {
            full_name: derivedName,
          },
          emailRedirectTo: authCallbackUrl(),
        },
      });

      if (error) {
        if (
          error.status === 429 ||
          (error as { code?: string }).code === 'over_email_send_rate_limit'
        ) {
          // Free tier rate limit hit: explain clearly and still allow entering code if already sent
          setErrorMsg(
            'Supabase email rate limit reached (free tier limit of 3 emails/hour). If you already received a verification code in your email earlier, enter it below.'
          );
          setOtpStep(true);
        } else {
          setErrorMsg(error.message);
        }
      } else {
        setOtpStep(true);
        setCountdown(45);
        setSuccessMsg(
          `A verification code has been sent to ${cleanEmail}. Please check your inbox or spam.`
        );
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to send verification code.';
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
      setErrorMsg('Please enter the complete verification code.');
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
        type: 'email',
      });

      // If 'email' type fails, try 'magiclink' (used by Supabase for existing users) and 'signup' (for new user registrations)
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
        setErrorMsg(
          error.message ||
            'Invalid or expired verification code. Please check the code or request a new one.'
        );
      } else if (data.user) {
        const derivedName = data.user.email?.split('@')[0] || 'User';
        const prof = await ensureSessionProfile(supabase, data.user, {
          fullName: derivedName,
          phone: null,
        });
        ++profileRequest.current;
        setCurrentUser(data.user);
        setCurrentProfile(prof);
        setProfileLoading(false);

        if (prof.status === 'active') {
          const destination = signInDestination();
          if (destination === '/dashboard') {
            setSuccessMsg('Verification successful! Opening dashboard...');
            router.push(destination);
          } else {
            window.location.assign(destination);
          }
        } else {
          setErrorMsg(
            `Your account is ${prof.status}. Please contact an administrator before accessing the portal.`
          );
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Verification failed. Please try again.';
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
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          shouldCreateUser: true,
          emailRedirectTo: authCallbackUrl(),
        },
      });

      if (error) {
        setErrorMsg(error.message);
      } else {
        setCountdown(45);
        setSuccessMsg(`New verification code sent to ${email.trim()}.`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not resend code.';
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
      const google = new URL('/auth/google', window.location.origin);
      google.searchParams.set('next', signInDestination());
      window.location.assign(google.href);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to initiate Google login.';
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
    setOtpCode('');
    setSuccessMsg('Signed out successfully.');
    setLoading(false);
  };

  // Authenticated State View
  if (currentUser) {
    const badgeColor =
      'bg-primary/10 text-primary border-primary/20';

    return (
      <div className="border-border bg-card flex flex-col gap-4 rounded-[16px] border p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-[13px]">Current Session</span>
          <Badge variant="outline" className={badgeColor}>
            Candidate
          </Badge>
        </div>

        <div>
          <h2 className="text-foreground text-[17px] font-medium tracking-tight">
            {currentProfile?.full_name || currentUser.user_metadata?.full_name || currentUser.email}
          </h2>
          <p className="text-muted-foreground mt-0.5 text-[13px]">{currentUser.email}</p>
          {currentProfile?.phone && (
            <p className="text-muted-foreground mt-0.5 flex items-center gap-1 text-[13px]">
              <PhoneIcon className="text-primary size-3" />
              {currentProfile.phone}
            </p>
          )}
        </div>

        {errorMsg && (
          <p
            role="alert"
            className="border-destructive/30 bg-destructive/10 text-destructive rounded-[10px] border p-3 text-[13px]"
          >
            {errorMsg}
          </p>
        )}
        {currentProfile && ['rejected', 'suspended'].includes(currentProfile.status) && (
          <p role="alert" className="text-destructive text-[13px]">
            Your account is {currentProfile.status}. Contact an administrator to review access.
          </p>
        )}

        <div className="flex flex-col gap-2 pt-2">
          <Button
            disabled={profileLoading || currentProfile?.status !== 'active'}
            onClick={() => router.push('/dashboard')}
            className="bg-primary text-primary-foreground flex h-9 w-full cursor-pointer items-center justify-center gap-1.5 text-[13px] font-medium disabled:opacity-50"
          >
            Enter Portal Dashboard
            <ArrowRightIcon className="size-3.5" />
          </Button>
          {!currentProfile && !profileLoading && (
            <Button
              variant="outline"
              onClick={() => loadProfile(currentUser)}
              className="h-9 w-full text-[13px]"
            >
              Retry Account Profile
            </Button>
          )}
          <Button
            onClick={handleSignOut}
            disabled={loading}
            variant="outline"
            className="h-9 w-full cursor-pointer text-[13px]"
          >
            {loading ? 'Signing out...' : 'Sign Out'}
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
          <div className="text-primary bg-primary/10 border-primary/20 inline-flex items-center gap-1.5 rounded-[6px] border px-2.5 py-1 text-[13px] font-medium">
            <KeyRoundIcon className="size-3.5" />
            Verification Required
          </div>
          <h1 className="text-foreground text-[20px] leading-7 font-medium tracking-tight">
            Enter Verification Code
          </h1>
          <p className="text-muted-foreground text-[13px] leading-5">
            We sent a verification code and a sign-in link to{' '}
            <span className="text-foreground decoration-primary/40 font-medium underline underline-offset-2">
              {email}
            </span>
            . Enter the code below or click the sign-in link in your email.
          </p>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="bg-destructive/10 text-destructive border-destructive/20 rounded-[12px] border p-3 text-[13px] leading-5"
          >
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div
            role="status"
            className="rounded-[12px] border border-primary/20 bg-primary/10 p-3 text-[13px] leading-5 text-primary"
          >
            {successMsg}
          </div>
        )}

        <form onSubmit={handleVerifyOtp} className="flex flex-col gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="otpCode" className="text-foreground/90 text-[13px] font-medium">
              Verification Code (OTP)
            </Label>
            <div className="relative">
              <KeyRoundIcon className="text-muted-foreground/70 pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
              <Input
                id="otpCode"
                type="text"
                inputMode="numeric"
                maxLength={10}
                placeholder="123456"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                required
                autoFocus
                className="bg-card border-border focus-visible:ring-ring/15 focus-visible:border-ring h-11 rounded-[12px] pr-4 pl-10 text-center font-mono text-[17px] font-medium tracking-[0.25em] focus-visible:ring-2"
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading || otpCode.length < 6}
            className="bg-primary hover:bg-primary/90 text-primary-foreground flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-[12px] text-[13px] font-medium transition-colors duration-150 active:scale-[0.98]"
          >
            {loading ? (
              <>
                <div className="border-primary-foreground size-3.5 animate-spin rounded-full border-2 border-t-transparent" />
                <span>Verifying Code...</span>
              </>
            ) : (
              <>
                <span>Verify & Enter Portal</span>
                <ArrowRightIcon className="size-3.5" />
              </>
            )}
          </Button>

          <div className="border-border/40 flex items-center justify-between border-t pt-2 text-[13px]">
            <button
              type="button"
              onClick={() => {
                setOtpStep(false);
                setOtpCode('');
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className="text-muted-foreground hover:text-foreground inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-medium transition-colors"
            >
              <ArrowLeftIcon className="size-3.5" />
              Edit details
            </button>

            <button
              type="button"
              onClick={handleResendOtp}
              disabled={countdown > 0 || loading}
              className={`inline-flex cursor-pointer items-center gap-1.5 text-[13px] font-medium transition-colors ${
 countdown > 0
 ?'text-muted-foreground cursor-not-allowed opacity-60'
                  : 'text-primary hover:underline'
              }`}
            >
              <RotateCcwIcon className="size-3.5" />
              {countdown > 0 ? `Resend code (${countdown}s)` : 'Resend code'}
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
        <h1 className="text-foreground text-[20px] leading-7 font-medium tracking-tight">
          Portal Access
        </h1>
        <p className="text-muted-foreground text-[13px] leading-5">
          Verify your email to create your candidate account. Existing accounts keep their saved
          profile.
        </p>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="bg-destructive/10 text-destructive border-destructive/20 rounded-[12px] border p-3 text-[13px] leading-5"
        >
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div
          role="status"
          className="rounded-[12px] border border-primary/20 bg-primary/10 p-3 text-[13px] leading-5 text-primary"
        >
          {successMsg}
        </div>
      )}

      <form onSubmit={handleSendOtp} className="flex flex-col gap-4">
        {/* Email Address */}
        <div className="space-y-1">
          <Label htmlFor="email" className="text-foreground text-[13px] font-medium">
            Email Address <span className="text-destructive">*</span>
          </Label>
          <div className="relative">
            <MailIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
            <Input
              id="email"
              type="email"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="bg-background border-border focus-visible:ring-ring/15 focus-visible:border-ring h-11 rounded-[10px] pr-3 pl-9 text-[13px] focus-visible:ring-2"
            />
          </div>
        </div>

        {/* Submit Button (Send Email OTP) */}
        <Button
          type="submit"
          disabled={loading}
          className="bg-primary hover:bg-primary/90 text-primary-foreground group mt-1 flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] text-[13px] font-medium transition-colors duration-150 active:scale-[0.98]"
        >
          {loading ? (
            <>
              <div className="border-primary-foreground size-3.5 animate-spin rounded-full border-2 border-t-transparent" />
              <span>Sending Verification Code...</span>
            </>
          ) : (
            <>
              <MailIcon className="size-3.5" />
              <span>Send Email OTP Code</span>
              <ArrowRightIcon className="text-primary-foreground/70 size-3 transition-transform group-hover:translate-x-0.5" />
            </>
          )}
        </Button>

        <div className="after:border-border/60 relative my-0.5 text-center text-[13px] after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t">
          <span className="bg-background text-muted-foreground relative z-10 px-2.5 text-[11px] font-medium">
            Or continue with Google
          </span>
        </div>

        {/* Google OAuth Button */}
        <Button
          type="button"
          variant="outline"
          onClick={handleGoogleSignIn}
          disabled={googleLoading}
          className="border-border hover:border-border hover:bg-muted/50 bg-background flex h-11 w-full cursor-pointer items-center justify-center gap-2.5 rounded-[10px] text-[13px] font-medium transition-colors active:scale-[0.98]"
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
          <span>{googleLoading ? 'Connecting to Google...' : 'Continue with Google'}</span>
        </Button>

        <div className="border-border/40 text-muted-foreground flex items-center justify-center gap-1.5 border-t pt-2 text-center text-[11px]">
          <ShieldCheckIcon className="text-primary size-3 shrink-0" />
          <span>Passwordless login: Secure 6-digit OTP codes sent directly to your email.</span>
        </div>
      </form>
    </div>
  );
}
