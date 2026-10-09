import { createClient } from "@/lib/client";
import type { UserProfile } from "@/types/database";

export async function getCurrentUserProfile(): Promise<UserProfile | null> {
  const supabase = createClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData?.user) return null;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", authData.user.id)
    .single();

  if (error || !profile) return null;

  return profile as UserProfile;
}

export function isSuperAdmin(profile: UserProfile | null): boolean {
  return profile?.status === "active" && profile.role === "super_admin";
}

export function isRecruiter(profile: UserProfile | null): boolean {
  return profile?.status === "active" && ["recruiter","super_admin"].includes(profile.role);
}

export function isClient(profile: UserProfile | null): boolean {
  return profile?.role === "client";
}
