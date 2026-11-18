'use client';
import Link from 'next/link';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { EllipsisVerticalIcon, CircleUserRoundIcon, LogOutIcon } from 'lucide-react';

export function NavUser({
  user,
}: {
  user: {
    name: string;
    email: string;
    avatar: string;
    role?: string;
  };
}) {
  const { isMobile } = useSidebar();
  const roleDisplay = user.role === 'candidate' ? 'Candidate' : undefined;

  const initials = (() => {
    if (!user.name || user.name === 'Loading account' || user.name === 'Account') {
      return user.email ? user.email.slice(0, 2).toUpperCase() : 'U';
    }
    const words = user.name.trim().split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      return (words[0][0] + words[words.length - 1][0]).toUpperCase();
    }
    return user.name.slice(0, 2).toUpperCase();
  })();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="group border-border/40 bg-card/40 hover:border-border hover:bg-sidebar-accent/70 aria-expanded:bg-sidebar-accent/80 relative flex cursor-pointer items-center gap-2.5 rounded-lg border p-2 text-left shadow-2xs transition-all duration-150"
              />
            }
          >
            <Avatar className="ring-border/60 group-hover:ring-primary/40 size-8 rounded-lg shadow-xs ring-1 transition-all duration-150">
              {user.avatar ? <AvatarImage src={user.avatar} alt={user.name} /> : null}
              <AvatarFallback className="bg-primary/10 text-primary ring-primary/20 rounded-lg text-xs font-semibold ring-1">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="grid min-w-0 flex-1 text-left text-xs leading-tight">
              <div className="flex items-center gap-1.5">
                <span className="text-foreground truncate text-[12.5px] font-semibold">
                  {user.name}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-1.5">
                {roleDisplay && (
                  <span className="py-0.2 bg-primary/10 text-primary border-primary/25 shrink-0 rounded border px-1.5 text-[9.5px] font-semibold">
                    {roleDisplay}
                  </span>
                )}
                <span className="text-muted-foreground truncate text-[11px]">{user.email}</span>
              </div>
            </div>
            <EllipsisVerticalIcon className="text-muted-foreground/60 group-hover:text-foreground ml-auto size-4 transition-colors" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="border-border/60 min-w-56 rounded-lg border shadow-lg"
            side={isMobile ? 'bottom' : 'right'}
            align="end"
            sideOffset={6}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2.5 px-2.5 py-2 text-left text-xs">
                  <Avatar className="ring-border/50 size-8 rounded-lg shadow-xs ring-1">
                    {user.avatar ? <AvatarImage src={user.avatar} alt={user.name} /> : null}
                    <AvatarFallback className="bg-primary/10 text-primary ring-primary/20 rounded-lg text-xs font-semibold ring-1">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid min-w-0 flex-1 text-left text-xs leading-tight">
                    <div className="flex items-center gap-1.5">
                      <span className="text-foreground truncate font-semibold">{user.name}</span>
                    </div>
                    <span className="text-muted-foreground mt-0.5 truncate text-[11px]">
                      {user.email}
                    </span>
                  </div>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                render={<Link href="/dashboard/settings" />}
                className="cursor-pointer gap-2 py-1.5 text-xs"
              >
                <CircleUserRoundIcon className="size-4 opacity-75" />
                <span>Account settings</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={async () => {
                const { createClient } = await import('@/lib/client');
                const supabase = createClient();
                await supabase.auth.signOut();
                window.location.href = '/';
              }}
              className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer gap-2 py-1.5 text-xs"
            >
              <LogOutIcon className="size-4" />
              <span>Sign out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
