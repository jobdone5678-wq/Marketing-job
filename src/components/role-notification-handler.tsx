"use client";

import { useEffect, Suspense } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";
import { registrationRole, roleLabel, roleMismatchMessage } from "@/lib/auth/session-profile";
import type { AppRole } from "@/types/database";

function NotificationInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const roleNotice = searchParams.get("role_notice");
    const currentRole = searchParams.get("current_role");
    const attemptedRole = searchParams.get("attempted_role");

    if (roleNotice === "existing_role" && currentRole) {
      const currentRoleLabel = roleLabel(currentRole);
      const requested = registrationRole(attemptedRole);

      toast.info(`Signed in as ${currentRoleLabel}`, {
        description: requested ? roleMismatchMessage(currentRole as AppRole, requested) : "Ask an administrator to review your account role if it is incorrect.",
        duration: 6500,
      });

      // Clean query parameters from URL without reloading
      const newParams = new URLSearchParams(searchParams.toString());
      newParams.delete("role_notice");
      newParams.delete("current_role");
      newParams.delete("attempted_role");
      const query = newParams.toString();
      const newUrl = query ? `${pathname}?${query}` : pathname;
      router.replace(newUrl);
    }
  }, [searchParams, pathname, router]);

  return null;
}

export function RoleNotificationHandler() {
  return (
    <Suspense fallback={null}>
      <NotificationInner />
    </Suspense>
  );
}
