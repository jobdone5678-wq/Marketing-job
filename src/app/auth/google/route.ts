import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/server";
import { OAUTH_REGISTRATION_COOKIE, OAUTH_REGISTRATION_MAX_AGE, readOAuthRegistration, signOAuthRegistration } from "@/lib/auth/oauth-registration";

export async function GET(request: Request) {
  const { searchParams, origin, protocol } = new URL(request.url);
  const next = searchParams.get("next") ?? "/dashboard";
  try {
    const cookieStore = await cookies();
    // The signed intent proves this callback belongs to a registration this server started.
    const intent = readOAuthRegistration(signOAuthRegistration());
    if (!intent) throw new Error("Unable to start Google registration. Please retry.");
    cookieStore.set(OAUTH_REGISTRATION_COOKIE, signOAuthRegistration(intent.startedAt, intent.id), {
      httpOnly: true, secure: protocol === "https:", sameSite: "lax", path: "/auth", maxAge: OAUTH_REGISTRATION_MAX_AGE,
    });
    const callback = new URL("/auth/callback", origin);
    callback.searchParams.set("oauth_registration", "1");
    callback.searchParams.set("registration_id", intent.id);
    callback.searchParams.set("next", next);
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
