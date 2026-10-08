import { createClient } from "@/lib/client";
import type { UserProfile, AppRole } from "@/types/database";

export async function getCurrentUserProfile(): Promise<UserProfile | null> {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData?.user) return null;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", authData.user.id)
    .single();

  if (error || !profile) {
    return {
      id: authData.user.id,
      email: authData.user.email || "",
      full_name: authData.user.user_metadata?.full_name || null,
      role: (authData.user.user_metadata?.role as AppRole) || "client",
      status: "active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  return profile as UserProfile;
}

export function isSuperAdmin(profile: UserProfile | null): boolean {
  return profile?.role === "super_admin";
}

export function isRecruiter(profile: UserProfile | null): boolean {
  return profile?.role === "recruiter" || profile?.role === "super_admin";
}

export function isClient(profile: UserProfile | null): boolean {
  return profile?.role === "client";
}
