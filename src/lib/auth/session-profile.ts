import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { UserProfile } from "@/types/database";

// There is one account role: candidate (job seekers). Registration never chooses a role.
export async function readSessionProfile(supabase: SupabaseClient, userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw new Error("Unable to load your account profile. Please retry or contact an administrator.");
  return data as UserProfile | null;
}

// The stored profile is authoritative. A sign-in must never change an existing profile.
export async function ensureSessionProfile(
  supabase: SupabaseClient,
  user: User,
  details: { fullName?: string; phone?: string | null } = {},
): Promise<UserProfile> {
  const existing = await readSessionProfile(supabase, user.id);
  if (existing) return existing;

  const { data, error } = await supabase.from("profiles").insert({
    id: user.id,
    email: user.email || "",
    full_name: details.fullName || user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "User",
    phone: details.phone || user.user_metadata?.phone || null,
    role: "candidate",
    status: "active",
  }).select("*").single();
  if (error || !data) throw new Error("Unable to create your account profile. Please retry or contact an administrator.");
  return data as UserProfile;
}

export function authDestination(profile: UserProfile, next = "/dashboard"): string {
  if (profile.status !== "active") return "/";
  return next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "/dashboard";
}
