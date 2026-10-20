"use client"
import Link from "next/link"
import {usePathname} from "next/navigation"
import {SidebarTrigger} from "@/components/ui/sidebar"
import {ChevronRight, CircleHelp, Search} from 'lucide-react'
import {ThemeToggle} from '@/components/theme-toggle'

const titles: Record<string, string> = {
  '/dashboard/resumes':'Resume workspace',
  '/dashboard/integrations':'Integrations',
  '/dashboard/billing':'SaaS billing',
  '/dashboard': 'Dashboard',
  '/dashboard/job-matching': 'JD candidate matching',
  '/dashboard/candidates': 'Candidates',
  '/dashboard/candidates/new': 'New candidate',
  '/dashboard/submissions': 'Job submissions',
  '/dashboard/submissions/new': 'Log application',
  '/dashboard/vendors': 'Prime vendors',
  '/dashboard/vendors/new': 'New vendor',
  '/dashboard/jobs': 'Public jobs',
  '/dashboard/greenhouse': 'Greenhouse portals',
  '/dashboard/ashby': 'Ashby portals',
  '/dashboard/settings': 'Settings',
  '/dashboard/help': 'Help & guidance',
  '/dashboard/team': 'Team & assignments',
  '/dashboard/placements': 'Placements & compensation',
  '/dashboard/payroll': 'Recruiter payroll',
  '/dashboard/commissions': 'Commissions',
  '/dashboard/email-confirmations': 'Email confirmations',
};

export function SiteHeader({title, subtitle}: {title?: string; subtitle?: string}) {
  const path = usePathname();
  const section = Object.keys(titles).sort((a,b) => b.length - a.length).find(key => path === key || path.startsWith(key + '/'));
  const resolvedTitle = title || titles[section || ''] || 'Workspace details';

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border bg-card/80 px-4 sm:px-6">
      <a href="#workspace-content" className="skip-link">Skip to workspace</a>
      <div className="flex min-w-0 items-center gap-2.5">
        <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
        <span className="hidden text-xs font-medium text-muted-foreground sm:block">Workspace</span>
        <ChevronRight className="hidden size-3 text-muted-foreground/50 sm:block" />
        <span className="truncate text-xs font-semibold text-foreground tracking-tight">{resolvedTitle}</span>
        {subtitle && <span className="hidden truncate text-xs text-muted-foreground md:inline">· {subtitle}</span>}
      </div>
      <div className="flex items-center gap-1">
        <Link href="/dashboard/jobs" aria-label="Search jobs" className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
          <Search className="size-3.5" />
        </Link>
        <ThemeToggle />
        <Link href="/dashboard/help" aria-label="Help and guidance" className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
          <CircleHelp className="size-3.5" />
        </Link>
      </div>
    </header>
  );
}
