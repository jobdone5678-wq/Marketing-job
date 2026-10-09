"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/client";
import type { User } from "@supabase/supabase-js";
import type { UserProfile, AppRole } from "@/types/database";

export function useUserProfile() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const supabase = useMemo(() => createClient(), []);

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
      } else { setProfile(null); }
    } catch { setProfile(null); } finally {
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
  const isSuperAdmin = profile?.status === "active" && role === "super_admin";
  const isRecruiter = profile?.status === "active" && (role === "recruiter" || isSuperAdmin);
  const isClient = role === "client";

  return {
    user,
    profile,
    role,
    status: profile?.status || "pending",
    loading,
    isSuperAdmin,
    isRecruiter,
    isClient,
    refreshProfile: () => fetchProfile(user),
  };
}
