import { DashboardOverview } from "@/components/dashboard-overview";
import { requireProfile } from "@/lib/auth/require-profile";

export default async function DashboardPage() {
  let initialRole = '';
  try {
    const profile = await requireProfile('candidate_or_staff');
    initialRole = profile.role;
  } catch {
    // Client components handle unauthorized redirection.
  }
  return <DashboardOverview initialRole={initialRole} />;
}

