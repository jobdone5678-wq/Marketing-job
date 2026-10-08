"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/client";
import type { User } from "@supabase/supabase-js";
import type { UserProfile, AppRole } from "@/types/database";

export function useUserProfile() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const supabase = createClient();

  const fetchProfile = useCallback(async (authUser: User | null) => {
    if (!authUser) {
      setProfile(null);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", authUser.id)
        .single();

      if (data && !error) {
        setProfile(data as UserProfile);
      } else {
        // Fallback to auth metadata if profile query has delay or not populated yet
        const metaRole = (authUser.user_metadata?.role as AppRole) || "client";
        setProfile({
          id: authUser.id,
          email: authUser.email || "",
          full_name: authUser.user_metadata?.full_name || authUser.email?.split("@")[0] || null,
          role: metaRole,
          status: "active",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    } catch {
      // In case of error fallback gracefully
      const metaRole = (authUser.user_metadata?.role as AppRole) || "client";
      setProfile({
        id: authUser.id,
        email: authUser.email || "",
        full_name: authUser.user_metadata?.full_name || authUser.email?.split("@")[0] || null,
        role: metaRole,
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const authUser = data?.user ?? null;
      setUser(authUser);
      fetchProfile(authUser);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const authUser = session?.user ?? null;
      setUser(authUser);
      fetchProfile(authUser);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase, fetchProfile]);

  const role: AppRole = profile?.role || "client";
  const isSuperAdmin = role === "super_admin";
  const isRecruiter = role === "recruiter" || isSuperAdmin;
  const isClient = role === "client";

  return {
    user,
    profile,
    role,
    status: profile?.status || "active",
    loading,
    isSuperAdmin,
    isRecruiter,
    isClient,
    refreshProfile: () => fetchProfile(user),
  };
}
