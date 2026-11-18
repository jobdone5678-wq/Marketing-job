'use client';

import * as React from 'react';
import { NavMain, type NavItem } from '@/components/nav-main';
import { NavSecondary, type SecondaryNavItem } from '@/components/nav-secondary';
import { NavUser } from '@/components/nav-user';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import {
  LayoutDashboardIcon,
  Building2Icon,
  SearchIcon,
  CommandIcon,
  UsersIcon,
  UserCheckIcon,
  PlugZapIcon,
  CreditCardIcon,
  InboxIcon,
  SendHorizontalIcon,
  CircleDollarSignIcon,
  CompassIcon,
  ShieldCheckIcon,
  SparklesIcon,
  SlidersHorizontalIcon,
  LifeBuoyIcon,
  FileSignatureIcon,
  GlobeIcon,
} from 'lucide-react';
import { createClient } from '@/lib/client';
import Link from 'next/link';

// Candidate Navigation Items
const candidateNavItems: NavItem[] = [
  {
    id: 'public-jobs',
    title: 'Public Jobs',
    url: '/dashboard/jobs',
    icon: <CompassIcon className="size-4 stroke-[1.8]" />,
  },
  {
    id: 'candidates',
    title: 'My Applications and Resume',
    url: '/dashboard/candidates',
    icon: <UserCheckIcon className="size-4 stroke-[1.8]" />,
  },
  {
    id: 'submissions',
    title: 'My Applications',
    url: '/dashboard/submissions',
    icon: <SendHorizontalIcon className="size-4 stroke-[1.8]" />,
  },
  {
    id: 'rtr',
    title: 'My RTR Agreements',
    url: '/dashboard/rtr',
    icon: <FileSignatureIcon className="size-4 stroke-[1.8]" />,
  },
  {
    id: 'email-confirmations',
    title: 'Email Confirmations',
    url: '/dashboard/email-confirmations',
    icon: <InboxIcon className="size-4 stroke-[1.8]" />,
  },
];

const navSecondaryItems: SecondaryNavItem[] = [
  {
    id: 'settings',
    title: 'Settings',
    url: '/dashboard/settings',
    icon: <SlidersHorizontalIcon className="size-4 stroke-[1.8]" />,
  },
  {
    id: 'help',
    title: 'Get Help',
    url: '/dashboard/help',
    icon: <LifeBuoyIcon className="size-4 stroke-[1.8]" />,
  },
  {
    id: 'search',
    title: 'Search Jobs',
    url: '/dashboard/jobs',
    icon: <SearchIcon className="size-4 stroke-[1.8]" />,
  },
];

export function AppSidebar({
  activeSection,
  onSelectSection,
  onRefreshJobs,
  ...props
}: {
  activeSection?: string;
  onSelectSection?: (id: string) => void;
  onRefreshJobs?: () => void;
} & React.ComponentProps<typeof Sidebar>) {
  const [currentUser, setCurrentUser] = React.useState({
    name: 'Loading account',
    email: '',
    avatar: '',
    role: '',
  });

  React.useEffect(() => {
    const client = createClient();
    let cancelled = false;
    async function load() {
      const {
        data: { user },
      } = await client.auth.getUser();
      const { data: profile } = user
        ? await client.from('profiles').select('role,status,full_name').eq('id', user.id).single()
        : { data: null };
      if (!cancelled)
        setCurrentUser({
          name: profile?.full_name || user?.user_metadata?.full_name || user?.email || 'Account',
          email: user?.email || '',
          avatar: (user?.user_metadata?.avatar_url || user?.user_metadata?.picture || '') as string,
          role: profile?.status === 'active' ? profile.role : '',
        });
    }
    void load();
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange(() => {
      setTimeout(() => void load(), 0);
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const isAllowedRole = currentUser.role === 'candidate';
  const mainItems = isAllowedRole ? candidateNavItems : [];

  const navigationItems = currentUser.role
    ? [
        ...mainItems,
        {
          id: 'integrations',
          title: 'Integrations',
          url: '/dashboard/integrations',
          icon: <PlugZapIcon className="size-4 stroke-[1.8]" />,
        },
      ]
    : [];

  return (
    <Sidebar collapsible="offcanvas" className="border-border/50 bg-sidebar border-r" {...props}>
      {/* Premium Workspace Identity Header */}
      <SidebarHeader className="border-border/40 border-b pb-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <Link
              href="/dashboard/jobs"
              onClick={() => onSelectSection?.('public-jobs')}
              className="group hover:bg-sidebar-accent/70 text-foreground flex cursor-pointer items-center gap-3 rounded-lg p-1.5 transition-all duration-150 select-none"
            >
              <div className="from-primary/20 via-primary/10 text-primary border-primary/25 group-hover:border-primary/40 flex size-8.5 shrink-0 items-center justify-center rounded-lg border bg-gradient-to-br to-transparent shadow-2xs transition-transform duration-150 group-hover:scale-105">
                <CommandIcon className="size-4 stroke-[2.2]" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col text-left">
                <div className="flex items-center gap-1.5">
                  <span className="text-foreground truncate text-[13px] font-bold tracking-tight">
                    Nextkinlife
                  </span>
                  <span className="text-primary py-0.2 bg-primary/10 border-primary/20 rounded-sm border px-1.5 text-[9.5px] font-semibold">
                    Recruit
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-emerald-500" />
                  <span className="text-muted-foreground truncate text-[10.5px] font-medium capitalize">
                    {currentUser.role === 'candidate' ? 'Candidate Workspace' : 'Portal Workspace'}
                  </span>
                </div>
              </div>
            </Link>
          </SidebarMenuItem>
        </SidebarMenu>

        {/* Interactive Quick Jump / Search Trigger */}
        <div className="px-1 pt-1.5">
          <Link
            href="/dashboard/jobs"
            onClick={() => onSelectSection?.('public-jobs')}
            className="group border-border/50 bg-muted/20 text-muted-foreground hover:bg-sidebar-accent/80 hover:text-foreground hover:border-border flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg border px-2.5 text-xs shadow-2xs transition-all duration-150 active:scale-[0.99]"
          >
            <SearchIcon className="group-hover:text-primary size-3.5 opacity-60 transition-colors group-hover:opacity-100" />
            <span className="flex-1 truncate text-left text-[11.5px] font-normal">
              Quick search or jump...
            </span>
            <kbd className="border-border/80 bg-background/80 text-muted-foreground/80 pointer-events-none inline-flex h-4.5 items-center gap-0.5 rounded border px-1.5 font-mono text-[9px] font-medium shadow-2xs select-none">
              ⌘K
            </kbd>
          </Link>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-1">
        <NavMain
          items={navigationItems}
          role={currentUser.role}
          activeSection={activeSection}
          onSelectSection={onSelectSection}
          onRefreshJobs={onRefreshJobs}
        />
        <NavSecondary
          items={navSecondaryItems}
          activeSection={activeSection}
          onSelectSection={onSelectSection}
          className="mt-auto px-1"
        />
      </SidebarContent>

      <SidebarFooter className="border-border/40 border-t p-2">
        <div className="text-muted-foreground/60 flex items-center justify-between px-2.5 pb-1 text-[10px] select-none">
          <span>Nextkinlife LLC</span>
          <span className="text-muted-foreground/50 font-mono text-[9px]">v3.2</span>
        </div>
        <NavUser user={currentUser} />
      </SidebarFooter>
    </Sidebar>
  );
}
