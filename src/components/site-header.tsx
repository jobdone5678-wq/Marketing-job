"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ChevronRight, CircleHelp, Search, Sparkles } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

const titles: Record<string, string> = {
  "/dashboard/integrations": "Integrations & APIs",
  "/dashboard/billing": "SaaS Billing",
  "/dashboard": "Executive Dashboard",
  "/dashboard/job-matching": "JD Candidate Matching",
  "/dashboard/candidates": "Candidate Bench",
  "/dashboard/candidates/new": "New Candidate",
  "/dashboard/submissions": "Job Submissions",
  "/dashboard/submissions/new": "Log Application",
  "/dashboard/vendors": "Prime Vendors",
  "/dashboard/vendors/new": "New Vendor",
  "/dashboard/jobs": "Job Discovery",
  "/dashboard/outside-jobs": "Captured Jobs",
  "/dashboard/greenhouse": "Greenhouse ATS",
  "/dashboard/ashby": "Ashby ATS",
  "/dashboard/settings": "Workspace Settings",
  "/dashboard/help": "Documentation & Guides",
  "/dashboard/rtr": "Right to Represent (RTR)",
  "/dashboard/email-confirmations": "Email Confirmations",
};

export function SiteHeader({
  title,
  subtitle,
}: {
  title?: string;
  subtitle?: string;
}) {
  const path = usePathname();
  const section = Object.keys(titles)
    .sort((a, b) => b.length - a.length)
    .find((key) => path === key || path.startsWith(key + "/"));
  const resolvedTitle = title || titles[section || ""] || "Workspace details";

  return (
    <header className="sticky top-0 z-30 flex h-13 shrink-0 items-center justify-between gap-3 border-b border-border/80 bg-card/85 px-4 backdrop-blur-md transition-colors sm:px-6">
      <a href="#workspace-content" className="skip-link">
        Skip to workspace
      </a>

      {/* Left side: Sidebar trigger & Breadcrumbs */}
      <div className="flex min-w-0 items-center gap-2.5">
        <SidebarTrigger className="size-8 text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors rounded-md" />
        <div className="hidden h-4 w-px bg-border/70 sm:block" />
        
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 min-w-0">
          <Link
            href="/dashboard"
            className="hidden text-xs font-medium text-muted-foreground hover:text-foreground transition-colors sm:inline-flex items-center gap-1"
          >
            <span>NextKinHR</span>
          </Link>
          <ChevronRight className="hidden size-3 text-muted-foreground/40 sm:block" />
          <span className="truncate text-xs font-semibold text-foreground tracking-tight">
            {resolvedTitle}
          </span>
          {subtitle && (
            <span className="hidden truncate text-xs text-muted-foreground md:inline">
              · {subtitle}
            </span>
          )}
        </nav>
      </div>

      {/* Right side: Search, Live Status, Theme, Help */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        <Link
          href="/dashboard/jobs"
          aria-label="Search jobs"
          className="flex h-8 items-center gap-2 rounded-lg border border-border/70 bg-muted/40 px-2.5 text-xs text-muted-foreground hover:border-border hover:bg-muted/80 hover:text-foreground transition-all duration-150"
        >
          <Search className="size-3.5" />
          <span className="hidden md:inline font-normal">Search jobs…</span>
          <kbd className="hidden lg:inline-flex items-center rounded border border-border bg-background px-1.5 font-mono text-[10px] text-muted-foreground">
            ⌘K
          </kbd>
        </Link>

        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
          <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span>Live Sync</span>
        </div>

        <ThemeToggle />

        <Link
          href="/dashboard/help"
          aria-label="Help and guidance"
          className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <CircleHelp className="size-4" />
        </Link>
      </div>
    </header>
  );
}
