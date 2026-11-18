'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { ChevronRight, CircleHelp, Search, Sparkles } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';

const titles: Record<string, string> = {
  '/dashboard/integrations': 'Integrations & APIs',
  '/dashboard/billing': 'SaaS Billing',
  '/dashboard': 'Executive Dashboard',
  '/dashboard/job-matching': 'JD Candidate Matching',
  '/dashboard/candidates': 'Candidate Bench',
  '/dashboard/candidates/new': 'New Candidate',
  '/dashboard/submissions': 'Job Submissions',
  '/dashboard/submissions/new': 'Log Application',
  '/dashboard/vendors': 'Prime Vendors',
  '/dashboard/vendors/new': 'New Vendor',
  '/dashboard/jobs': 'Job Discovery',
  '/dashboard/outside-jobs': 'Captured Jobs',
  '/dashboard/greenhouse': 'Greenhouse ATS',
  '/dashboard/ashby': 'Ashby ATS',
  '/dashboard/settings': 'Workspace Settings',
  '/dashboard/help': 'Documentation & Guides',
  '/dashboard/rtr': 'Right to Represent (RTR)',
  '/dashboard/email-confirmations': 'Email Confirmations',
};

export function SiteHeader({ title, subtitle }: { title?: string; subtitle?: string }) {
  const path = usePathname();
  const section = Object.keys(titles)
    .sort((a, b) => b.length - a.length)
    .find((key) => path === key || path.startsWith(key + '/'));
  const resolvedTitle = title || titles[section || ''] || 'Workspace details';

  return (
    <header className="border-border/80 bg-card/85 sticky top-0 z-30 flex h-13 shrink-0 items-center justify-between gap-3 border-b px-4 backdrop-blur-md transition-colors sm:px-6">
      <a href="#workspace-content" className="skip-link">
        Skip to workspace
      </a>

      {/* Left side: Sidebar trigger & Breadcrumbs */}
      <div className="flex min-w-0 items-center gap-2.5">
        <SidebarTrigger className="text-muted-foreground hover:bg-muted/70 hover:text-foreground size-8 rounded-md transition-colors" />
        <div className="bg-border/70 hidden h-4 w-px sm:block" />

        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5">
          <Link
            href="/dashboard"
            className="text-muted-foreground hover:text-foreground hidden items-center gap-1 text-xs font-medium transition-colors sm:inline-flex"
          >
            <span>NextKinHR</span>
          </Link>
          <ChevronRight className="text-muted-foreground/40 hidden size-3 sm:block" />
          <span className="text-foreground truncate text-xs font-semibold tracking-tight">
            {resolvedTitle}
          </span>
          {subtitle && (
            <span className="text-muted-foreground hidden truncate text-xs md:inline">
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
          className="border-border/70 bg-muted/40 text-muted-foreground hover:border-border hover:bg-muted/80 hover:text-foreground flex h-8 items-center gap-2 rounded-lg border px-2.5 text-xs transition-all duration-150"
        >
          <Search className="size-3.5" />
          <span className="hidden font-normal md:inline">Search jobs…</span>
          <kbd className="border-border bg-background text-muted-foreground hidden items-center rounded border px-1.5 font-mono text-[10px] lg:inline-flex">
            ⌘K
          </kbd>
        </Link>

        <div className="hidden items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-700 sm:flex dark:text-emerald-400">
          <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
          <span>Live Sync</span>
        </div>

        <ThemeToggle />

        <Link
          href="/dashboard/help"
          aria-label="Help and guidance"
          className="text-muted-foreground hover:bg-muted hover:text-foreground flex size-8 items-center justify-center rounded-lg transition-colors"
        >
          <CircleHelp className="size-4" />
        </Link>
      </div>
    </header>
  );
}
