'use client';

import * as React from 'react';
import Link from 'next/link';
import { NavMain, type NavItem } from '@/components/nav-main';
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
  InboxIcon,
  SendHorizontalIcon,
  CompassIcon,
  FileSignatureIcon,
} from 'lucide-react';
import { createClient } from '@/lib/client';

const ICON = 'size-4 stroke-[1.5]';

const candidateNavItems: NavItem[] = [
  {
    id: 'candidates',
    title: 'My Profile',
    url: '/dashboard/candidates',
    icon: <UserCheckIcon className={ICON} />,
  },
  {
    id: 'jobs',
    title: 'Current Jobs',
    url: '/dashboard/jobs',
    icon: <CompassIcon className={ICON} />,
  },
  {
    id: 'submissions',
    title: 'Applications',
    url: '/dashboard/submissions',
    icon: <SendHorizontalIcon className={ICON} />,
  },
  {
    id: 'rtr',
    title: 'My RTR',
    url: '/dashboard/rtr',
    icon: <FileSignatureIcon className={ICON} />,
  },
  {
    id: 'email-confirmations',
    title: 'Email Sync',
    url: '/dashboard/email-confirmations',
    icon: <InboxIcon className={ICON} />,
  },
];

export function AppSidebar(props: React.ComponentProps<typeof Sidebar>) {
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

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader className="p-4 pb-0">
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-2">
            <Link
              href="/dashboard/candidates"
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
        <NavMain items={candidateNavItems} />
      </SidebarContent>

      <SidebarFooter className="gap-3 p-4 pt-0">
        <NavUser user={currentUser} />
      </SidebarFooter>
    </Sidebar>
  );
}
