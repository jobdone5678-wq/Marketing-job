'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { ChevronRight, CircleHelp, Search } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';

const titles: Record<string, string> = {
  '/dashboard/integrations': 'Integrations',
  '/dashboard/billing': 'Billing',
  '/dashboard': 'Overview',
  '/dashboard/job-matching': 'Candidate matching',
  '/dashboard/candidates': 'Resume profile',
  '/dashboard/candidates/new': 'New candidate',
  '/dashboard/submissions': 'Applications',
  '/dashboard/submissions/new': 'Log application',
  '/dashboard/vendors': 'Prime vendors',
  '/dashboard/vendors/new': 'New vendor',
  '/dashboard/jobs': 'Public jobs',
  '/dashboard/outside-jobs': 'Captured jobs',
  '/dashboard/greenhouse': 'Greenhouse',
  '/dashboard/ashby': 'Ashby',
  '/dashboard/placements': 'Placements',
  '/dashboard/settings': 'Settings',
  '/dashboard/help': 'Help',
  '/dashboard/rtr': 'RTR agreements',
  '/dashboard/email-confirmations': 'Email confirmations',
};

export function SiteHeader({ title, subtitle }: { title?: string; subtitle?: string }) {
  const path = usePathname();
  const router = useRouter();
  const { open, isMobile } = useSidebar();
  const [term, setTerm] = React.useState('');

  const section = Object.keys(titles)
    .sort((a, b) => b.length - a.length)
    .find((key) => path === key || path.startsWith(key + '/'));
  const resolvedTitle = title || titles[section || ''] || 'Workspace';

  // The trigger lives inside the sidebar while it is open, and moves here once it is away.
  const showTrigger = isMobile || !open;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const value = term.trim();
    router.push(value ? '/dashboard/jobs?q=' + encodeURIComponent(value) : '/dashboard/jobs');
  }

  return (
    <header className="panel flex h-14 shrink-0 items-center gap-3 px-3 sm:gap-4 sm:px-4">
      <a href="#workspace-content" className="skip-link">
        Skip to workspace
      </a>

      {/* Left */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {showTrigger && (
          <SidebarTrigger className="text-muted-foreground hover:bg-accent hover:text-foreground size-8 shrink-0 rounded-[8px] transition-colors" />
        )}

        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5">
          <Link
            href="/dashboard"
            className="text-muted-foreground hover:text-foreground hidden shrink-0 text-[13px] transition-colors xl:inline"
          >
            Nextkinlife
          </Link>
          <ChevronRight
            aria-hidden="true"
            className="text-muted-foreground hidden size-3.5 shrink-0 stroke-[1.5] xl:block"
          />
          <span className="text-foreground truncate text-[13px] font-medium">{resolvedTitle}</span>
          {subtitle && (
            <span className="text-muted-foreground hidden truncate text-[13px] 2xl:inline">
              · {subtitle}
            </span>
          )}
        </nav>
      </div>

      {/* Centre */}
      <form
        role="search"
        onSubmit={submit}
        className="w-full max-w-[18rem] shrink-0 sm:max-w-sm md:max-w-md"
      >
        <label htmlFor="workspace-search" className="sr-only">
          Search jobs
        </label>
        <div className="border-border bg-surface-sunken focus-within:border-primary/40 focus-within:bg-card focus-within:ring-primary/10 flex h-9 items-center gap-2 rounded-[10px] border px-3 transition-colors focus-within:ring-2">
          <Search
            aria-hidden="true"
            className="text-muted-foreground size-4 shrink-0 stroke-[1.5]"
          />
          <input
            id="workspace-search"
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search jobs"
            className="text-foreground placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-[13px] outline-none focus:outline-none focus-visible:outline-none [&::-webkit-search-cancel-button]:appearance-none"
          />
        </div>
      </form>

      {/* Right */}
      <div className="flex flex-1 items-center justify-end gap-1">
        <ThemeToggle />
        <Link
          href="/dashboard/help"
          aria-label="Help"
          className="text-muted-foreground hover:bg-accent hover:text-foreground flex size-8 items-center justify-center rounded-[8px] transition-colors"
        >
          <CircleHelp className="size-4 stroke-[1.5]" />
        </Link>
      </div>
    </header>
  );
}
