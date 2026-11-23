'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { ChevronRight, Search } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';

const titles: Record<string, string> = {
  '/dashboard/candidates': 'My Profile',
  '/dashboard/submissions': 'My Applications',
  '/dashboard/jobs': 'Current Jobs',
  '/dashboard/outside-jobs': 'Captured Jobs',
  '/dashboard/rtr': 'My RTR',
  '/dashboard/email-confirmations': 'Email Sync',
};

export function SiteHeader({ title, subtitle }: { title?: string; subtitle?: string }) {
  const path = usePathname();
  const section = Object.keys(titles)
    .sort((a, b) => b.length - a.length)
    .find((key) => path === key || path.startsWith(key + '/'));
  const resolvedTitle = title || titles[section || ''] || 'Workspace details';

  return (
    <header className="border-border/60 bg-card sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4 transition-colors sm:px-6">
      <a href="#workspace-content" className="skip-link">
        Skip to workspace
      </a>

      {/* Left side: Sidebar trigger & Breadcrumbs */}
      <div className="flex min-w-0 items-center gap-2.5">
        <SidebarTrigger className="text-muted-foreground hover:bg-muted/70 hover:text-foreground size-8 rounded-md transition-colors" />
        <div className="bg-border/60 hidden h-4 w-px sm:block" />

        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5">
          <Link
            href="/dashboard"
            className="text-muted-foreground hover:text-foreground hidden items-center gap-1 text-xs font-medium transition-colors sm:inline-flex"
          >
            <span>NextKinHR</span>
          </Link>
          <ChevronRight className="text-muted-foreground/40 hidden size-3 sm:block" />
          <span className="text-foreground truncate text-xs font-medium">
            {resolvedTitle}
          </span>
          {subtitle && (
            <span className="text-muted-foreground hidden truncate text-xs md:inline">
              · {subtitle}
            </span>
          )}
        </nav>
      </div>

      {/* Right side: Search & Theme */}
      <div className="flex items-center gap-2">
        <Link
          href="/dashboard/jobs"
          aria-label="Search jobs"
          className="border-border/60 bg-muted/40 text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground flex h-8 items-center gap-2 rounded-md border px-2.5 text-xs transition-colors duration-150"
        >
          <Search className="size-3.5 stroke-[1.5]" />
          <span className="hidden font-normal md:inline">Search jobs</span>
        </Link>

        <ThemeToggle />
      </div>
    </header>
  );
}
