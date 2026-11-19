'use client';

import * as React from 'react';
import { NavMain, type NavItem } from '@/components/nav-main';
import { NavSecondary, type SecondaryNavItem } from '@/components/nav-secondary';
import { NavUser } from '@/components/nav-user';
import { BrandMark } from '@/components/brand-mark';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import {
  UserCheckIcon,
  PlugZapIcon,
  InboxIcon,
  SendHorizontalIcon,
  CompassIcon,
  SettingsIcon,
  LifeBuoyIcon,
  FileSignatureIcon,
} from 'lucide-react';
import { createClient } from '@/lib/client';
import Link from 'next/link';

const ICON = 'size-4 stroke-[1.5]';

// Candidate Navigation Items
const candidateNavItems: NavItem[] = [
  {
    id: 'public-jobs',
    title: 'Public jobs',
    url: '/dashboard/jobs',
    icon: <CompassIcon className={ICON} />,
  },
  {
    id: 'candidates',
    title: 'Resume profile',
    url: '/dashboard/candidates',
    icon: <UserCheckIcon className={ICON} />,
  },
  {
    id: 'submissions',
    title: 'Applications',
    url: '/dashboard/submissions',
    icon: <SendHorizontalIcon className={ICON} />,
  },
  {
    id: 'rtr',
    title: 'RTR agreements',
    url: '/dashboard/rtr',
    icon: <FileSignatureIcon className={ICON} />,
  },
  {
    id: 'email-confirmations',
    title: 'Email confirmations',
    url: '/dashboard/email-confirmations',
    icon: <InboxIcon className={ICON} />,
  },
];

const navSecondaryItems: SecondaryNavItem[] = [
  {
    id: 'settings',
    title: 'Settings',
    url: '/dashboard/settings',
    icon: <SettingsIcon className={ICON} />,
  },
  {
    id: 'help',
    title: 'Help',
    url: '/dashboard/help',
    icon: <LifeBuoyIcon className={ICON} />,
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
          icon: <PlugZapIcon className={ICON} />,
        },
      ]
    : [];

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader className="p-4 pb-0">
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-2">
            <Link
              href="/dashboard"
              className="flex min-w-0 flex-1 items-center gap-3 rounded-[10px] outline-none select-none"
            >
              <BrandMark className="size-8" />
              <span className="flex min-w-0 flex-col text-left">
                <span className="text-foreground truncate text-[13px] leading-4 font-medium">
                  Nextkinlife
                </span>
                <span className="text-muted-foreground truncate text-[11px] leading-4">
                  Candidate workspace
                </span>
              </span>
            </Link>
            <SidebarTrigger className="text-muted-foreground hover:bg-accent hover:text-foreground size-8 shrink-0 rounded-[8px] transition-colors" />
          </SidebarMenuItem>
        </SidebarMenu>

      </SidebarHeader>

      <SidebarContent className="px-4 pt-6">
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
          className="mt-auto"
        />
      </SidebarContent>

      <SidebarFooter className="gap-3 p-4 pt-0">
        <NavUser user={currentUser} />
      </SidebarFooter>
    </Sidebar>
  );
}
