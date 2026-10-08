"use client";

import { useEffect, Suspense } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { toast } from "sonner";

function NotificationInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const roleNotice = searchParams.get("role_notice");
    const currentRole = searchParams.get("current_role");
    const attemptedRole = searchParams.get("attempted_role");

    if (roleNotice === "existing_role" && currentRole) {
      const currentRoleLabel =
        currentRole === "super_admin"
          ? "Super Admin"
          : currentRole === "recruiter"
          ? "Recruiter"
          : "Candidate";

      const attemptedRoleLabel =
        attemptedRole === "recruiter"
          ? "Recruiter"
          : attemptedRole === "client"
          ? "Candidate"
          : "another role";

      toast.info(`Signed in as ${currentRoleLabel}`, {
        description: `This email is already registered with a ${currentRoleLabel} profile. To create a ${attemptedRoleLabel} account, please use a separate email.`,
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
