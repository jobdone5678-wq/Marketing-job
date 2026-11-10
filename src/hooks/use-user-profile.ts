"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { createClient } from "@/lib/client";
import type { User } from "@supabase/supabase-js";
import type { UserProfile, AppRole } from "@/types/database";
import { readSessionProfile } from "@/lib/auth/session-profile";

export function useUserProfile() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const profileRequest = useRef(0);

  const supabase = useMemo(() => createClient(), []);

  const fetchProfile = useCallback(async (authUser: User | null) => {
    const requestId = ++profileRequest.current;
    setProfile(null);
    setProfileError(null);
    setLoading(true);
    if (!authUser) {
      setProfile(null);
      setLoading(false);
      return;
    }

    try {
      const data = await readSessionProfile(supabase, authUser.id);
      if (requestId !== profileRequest.current) return;
      if (!data) throw new Error("Your account profile is missing. Please contact an administrator.");
      setProfile(data);
    } catch (error) {
      if (requestId === profileRequest.current) {
        setProfile(null);
        setProfileError(error instanceof Error ? error.message : "Unable to load your account profile.");
      }
    } finally {
      if (requestId === profileRequest.current) setLoading(false);
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

  const role: AppRole | null = profile?.role || null;
  const isSuperAdmin = profile?.status === "active" && role === "super_admin";
  const isRecruiter = profile?.status === "active" && (role === "recruiter" || isSuperAdmin);
  const isTechnicalRecruiter=profile?.status==='active'&&role==='technical_recruiter';
  const isClient = profile?.status === "active" && role === "client";

  return {
    user,
    profile,
    role,
    status: profile?.status || "pending",
    loading,
    profileError,
    isSuperAdmin,
    isRecruiter,
    isTechnicalRecruiter,
    isClient,
    refreshProfile: () => fetchProfile(user),
  };
}
