'use client';

import * as React from 'react';
import { NavMain, type NavItem } from '@/components/nav-main';
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
  CommandIcon,
  UserCheckIcon,
  InboxIcon,
  SendHorizontalIcon,
  FileSignatureIcon,
  BriefcaseIcon,
} from 'lucide-react';
import { createClient } from '@/lib/client';
import Link from 'next/link';

const candidateNavItems: NavItem[] = [
  {
    id: 'candidates',
    title: 'My Profile',
    url: '/dashboard/candidates',
    icon: <UserCheckIcon className="size-4 stroke-[1.8]" />,
  },
  {
    id: 'jobs',
    title: 'Current Jobs',
    url: '/dashboard/jobs',
    icon: <BriefcaseIcon className="size-4 stroke-[1.8]" />,
  },
  {
    id: 'submissions',
    title: 'My Applications',
    url: '/dashboard/submissions',
    icon: <SendHorizontalIcon className="size-4 stroke-[1.8]" />,
  },
  {
    id: 'rtr',
    title: 'My RTR',
    url: '/dashboard/rtr',
    icon: <FileSignatureIcon className="size-4 stroke-[1.8]" />,
  },
  {
    id: 'email-confirmations',
    title: 'Email Sync',
    url: '/dashboard/email-confirmations',
    icon: <InboxIcon className="size-4 stroke-[1.8]" />,
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
    <Sidebar collapsible="offcanvas" className="border-border/50 bg-sidebar border-r" {...props}>
      {/* Premium Workspace Identity Header */}
      <SidebarHeader className="border-border/40 border-b pb-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <Link
              href="/dashboard/candidates"
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
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-emerald-500" />
                  <span className="text-muted-foreground truncate text-[10.5px] font-medium capitalize">
                    Candidate Workspace
                  </span>
                </div>
              </div>
            </Link>
          </SidebarMenuItem>
        </SidebarMenu>

      </SidebarHeader>

      <SidebarContent className="px-1">
        <NavMain items={candidateNavItems} />
      </SidebarContent>

      <SidebarFooter className="border-border/40 border-t p-2">
        <NavUser user={currentUser} />
      </SidebarFooter>
    </Sidebar>
  );
}
