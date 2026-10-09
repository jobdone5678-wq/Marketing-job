import { NextResponse } from "next/server";
import { createClient } from "@/lib/server";
import type { AppRole } from "@/types/database";
import type { EmailOtpType } from "@supabase/supabase-js";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/dashboard";
  const requestedRole = (searchParams.get("role") as AppRole) || "recruiter";
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
      const incomingPhone = phoneParam || (user.user_metadata?.phone as string) || null;

      // Ensure user has a profile record in profiles table
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, role, status, full_name, phone")
        .eq("id", user.id)
        .single();

      if (!profile) {
        const roleFromMeta = (user.user_metadata?.role as AppRole) || requestedRole;
        const validRole: AppRole =
          roleFromMeta === "client" ? "client" : "recruiter";
        const fullName =
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.email?.split("@")[0] ||
          "Recruiter";

        await supabase.from("profiles").upsert({
          id: user.id,
          email: user.email || "",
          full_name: fullName,
          role: validRole,
          phone: incomingPhone,
          status: validRole === "recruiter" ? "pending" : "active",
        });
      } else if (!profile.phone && incomingPhone) {
        await supabase
          .from("profiles")
          .update({ phone: incomingPhone })
          .eq("id", user.id);
      }

      // Successfully authenticated! Redirect directly to dashboard
      const destination = new URL(next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "/dashboard", origin);
      return NextResponse.redirect(destination.origin === origin ? destination : `${origin}/dashboard`);
    } catch (err) {
      console.error("Error setting up profile in auth callback:", err);
      return NextResponse.redirect(`${origin}/dashboard`);
    }
  }

  return NextResponse.redirect(`${origin}/?error=auth-code-error`);
}
