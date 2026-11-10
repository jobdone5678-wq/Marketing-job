import { NextResponse } from "next/server";
import { createClient } from "@/lib/server";
import { authDestination, ensureSessionProfile, registrationRole } from "@/lib/auth/session-profile";
import type { EmailOtpType } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { database } from "@/lib/db/admin";
import { OAUTH_REGISTRATION_COOKIE, readOAuthRegistration } from "@/lib/auth/oauth-registration";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/dashboard";
  const cookieStore = await cookies();
  const googleCallback = searchParams.get("oauth_registration") === "1";
  const registration = googleCallback ? readOAuthRegistration(cookieStore.get(OAUTH_REGISTRATION_COOKIE)?.value) : null;
  cookieStore.set(OAUTH_REGISTRATION_COOKIE, "", { path: "/auth", maxAge: 0 });
  const requestedRole = registration?.role || registrationRole(searchParams.get("role"));
  const phoneParam = searchParams.get("phone");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  // Handle incoming OAuth or confirmation errors
  if (error || errorDescription) {
    const errorMsg =
      errorDescription ||
      (error === "server_error"
        ? "Authentication encountered a temporary server error. Please try again."
        : error);
    return NextResponse.redirect(
      `${origin}/?error=${encodeURIComponent(errorMsg || "Authentication failed")}`
    );
  }

  if (googleCallback && (!code || !registration || searchParams.get("registration_id") !== registration.id)) {
    return NextResponse.redirect(`${origin}/?error=${encodeURIComponent("Your Google registration session expired or could not be verified. Please select your role and start Google sign-in again.")}`);
  }

  const supabase = await createClient();
  let user = null;

  // 1. PKCE Authorization Code Exchange (OAuth or email with PKCE)
  if (code) {
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      console.error("exchangeCodeForSession error:", exchangeError);
      return NextResponse.redirect(
        `${origin}/?error=${encodeURIComponent(exchangeError.message || "Unable to exchange login session")}`
      );
    }
    user = data?.user;
  }
  // 2. Email OTP / Token Hash Verification (Supabase Email Confirmation link)
  else if (token_hash && type) {
    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    });
    if (verifyError) {
      console.error("verifyOtp error:", verifyError);
      return NextResponse.redirect(
        `${origin}/?error=${encodeURIComponent(
          verifyError.message || "Email confirmation link is invalid or has expired."
        )}`
      );
    }
    user = data?.user;
  }
  // 3. Check if session already exists
  else {
    const { data } = await supabase.auth.getUser();
    if (data?.user) {
      user = data.user;
    }
  }

  if (user) {
    try {
      if (registration && (registration.role === "recruiter" || registration.role === "technical_recruiter")) {
        const { error: registrationError } = await database().rpc("register_new_oauth_staff", {
          p_profile: user.id, p_role: registration.role, p_intent: registration.id,
        });
        if (registrationError) throw new Error("Unable to register your staff account. Please contact an administrator to check the Google staff registration database update.");
      }
      const profile = await ensureSessionProfile(supabase, user, requestedRole, { phone: phoneParam });
      const destination = new URL(authDestination(profile, requestedRole, next), origin);
      return NextResponse.redirect(destination.origin === origin ? destination : `${origin}/dashboard`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to load your account profile. Please retry or contact an administrator.";
      return NextResponse.redirect(`${origin}/?error=${encodeURIComponent(message)}`);
    }
  }

  return NextResponse.redirect(`${origin}/?error=auth-code-error`);
}
