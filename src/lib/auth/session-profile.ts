import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { AppRole, UserProfile } from "@/types/database";

export function registrationRole(value: unknown): Exclude<AppRole, "super_admin"> | null {
  return value === "recruiter" || value === "technical_recruiter" || value === "client" ? value : null;
}

export function roleLabel(value: unknown): string {
  switch (value) {
    case "super_admin": return "Super Admin";
    case "recruiter": return "Recruiter";
    case "technical_recruiter": return "Technical Recruiter";
    case "client": return "Candidate";
    default: return "Account role unavailable";
  }
}

export function roleMismatchMessage(currentRole: AppRole, requestedRole: AppRole): string {
  return `This email is registered as ${roleLabel(currentRole)}. Selecting ${roleLabel(requestedRole)} does not change its account role. Ask an administrator to review the account if the registered role is incorrect.`;
}

export async function readSessionProfile(supabase: SupabaseClient, userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw new Error("Unable to load your account profile. Please retry or contact an administrator.");
  return data as UserProfile | null;
}

// The stored profile is authoritative. Registration preferences only apply when
// no profile exists; a sign-in must never change an existing role or approval.
export async function ensureSessionProfile(
  supabase: SupabaseClient,
  user: User,
  requestedRole: Exclude<AppRole, "super_admin"> | null,
  details: { fullName?: string; phone?: string | null } = {},
): Promise<UserProfile> {
  const existing = await readSessionProfile(supabase, user.id);
  if (existing) return existing;

  const role = requestedRole || registrationRole(user.user_metadata?.role) || "client";
  const { data, error } = await supabase.from("profiles").insert({
    id: user.id,
    email: user.email || "",
    full_name: details.fullName || user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "User",
    phone: details.phone || user.user_metadata?.phone || null,
    role,
    status: role === "client" ? "active" : "pending",
  }).select("*").single();
  if (error || !data) throw new Error("Unable to create your account profile. Please retry or contact an administrator.");
  return data as UserProfile;
}

export function authDestination(profile: UserProfile, requestedRole: AppRole | null, next = "/dashboard"): string {
  if (requestedRole && profile.role !== requestedRole) {
    return `/?${new URLSearchParams({ role_notice: "existing_role", current_role: profile.role, attempted_role: requestedRole })}`;
  }
  if (profile.status !== "active") return "/";
  return next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "/dashboard";
}
