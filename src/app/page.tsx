"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthPanel } from "@/components/auth-panel";
import { MotionHero } from "@/components/motion-hero";
import { createClient } from "@/lib/client";
import type { User } from "@supabase/supabase-js";

export default function Page() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    // If confirmation parameters (code, token_hash) are present on root URL,
    // forward immediately to /auth/callback to exchange session and navigate to /dashboard
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const token_hash = params.get("token_hash");
      const type = params.get("type");

      if (code || (token_hash && type)) {
        window.location.href = `/auth/callback${window.location.search}`;
        return;
      }

      // If an error query parameter is present (such as access-denied or auth-error), do not auto-redirect
      if (params.get("error") || params.get("error_description")) {
        supabase.auth.signOut().then(() => {
          setUser(null);
          setLoading(false);
        });
        return;
      }
    }

    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUser(data.user);
        window.location.href = "/dashboard";
      } else {
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user);
        router.replace("/dashboard");
      } else {
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase, router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="text-xs text-muted-foreground">
            Loading Marketing Portal...
          </span>
        </div>
      </div>
    );
  }

  // Unauthenticated: Render Two-Column Split Layout (Auth + Motion Hero)
  return (
    <div className="grid h-screen max-h-screen w-full lg:grid-cols-2 overflow-hidden bg-background text-foreground">
      <AuthPanel />
      <MotionHero />
    </div>
  );
}
