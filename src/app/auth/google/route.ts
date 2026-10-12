import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/server";
import { registrationRole } from "@/lib/auth/session-profile";
import { OAUTH_REGISTRATION_COOKIE, OAUTH_REGISTRATION_MAX_AGE, readOAuthRegistration, signOAuthRegistration } from "@/lib/auth/oauth-registration";
import { database } from "@/lib/db/admin";

export async function GET(request: Request) {
  const { searchParams, origin, protocol } = new URL(request.url);
  const role = registrationRole(searchParams.get("role"));
  if (!role) return NextResponse.redirect(`${origin}/?error=${encodeURIComponent("Choose a valid account role.")}`);
  try {
    const cookieStore = await cookies();
    // Check the signing secret before creating any database intent.
    const intent = readOAuthRegistration(signOAuthRegistration(role));
    if (!intent) throw new Error("Unable to start Google registration. Please retry.");
    const { data: savedIntent, error: intentError } = await database().from("oauth_registration_intents")
      .insert({ id: intent.id, role }).select("started_at").single();
    if (intentError || !savedIntent) throw new Error("Google registration is unavailable. Contact an administrator to check the Google staff registration database update.");
    cookieStore.set(OAUTH_REGISTRATION_COOKIE, signOAuthRegistration(role, savedIntent.started_at, intent.id), {
      httpOnly: true, secure: protocol === "https:", sameSite: "lax", path: "/auth", maxAge: OAUTH_REGISTRATION_MAX_AGE,
    });
    const callback = new URL("/auth/callback", origin);
    callback.searchParams.set("oauth_registration", "1");
    callback.searchParams.set("registration_id", intent.id);
    const phone = searchParams.get("phone");
    if (phone) callback.searchParams.set("phone", phone.slice(0, 50));
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback.toString(), skipBrowserRedirect: true, queryParams: { access_type: "offline", prompt: "select_account" } },
    });
    if (error || !data.url) throw new Error("Unable to start Google sign-in. Please retry.");
    return NextResponse.redirect(data.url);
  } catch (error) {
    (await cookies()).set(OAUTH_REGISTRATION_COOKIE, "", { path: "/auth", maxAge: 0 });
    const message = error instanceof Error ? error.message : "Unable to start Google sign-in. Please retry.";
    return NextResponse.redirect(`${origin}/?error=${encodeURIComponent(message)}`);
  }
}
