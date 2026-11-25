'use client';
import Link from 'next/link';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSidebar } from '@/components/ui/sidebar';
import { ChevronsUpDownIcon, CircleUserRoundIcon, LogOutIcon } from 'lucide-react';

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
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="border-border hover:bg-accent/60 data-popup-open:bg-accent flex w-full items-center gap-3 rounded-[12px] border p-2 text-left transition-colors"
          />
        }
      >
        <Avatar className="size-8 rounded-lg">
          {user.avatar ? <AvatarImage src={user.avatar} alt="" /> : null}
          <AvatarFallback className="bg-secondary text-secondary-foreground rounded-lg text-[11px] font-medium">
            {initials}
          </AvatarFallback>
        </Avatar>
        <span className="grid min-w-0 flex-1 text-left">
          <span className="text-foreground truncate text-[13px] leading-4 font-medium">
            {user.name}
          </span>
          <span className="text-muted-foreground truncate text-[11px] leading-4">{user.email}</span>
        </span>
        <ChevronsUpDownIcon className="text-muted-foreground size-4 shrink-0 stroke-[1.5]" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="border-border min-w-56 rounded-[12px] border"
        side={isMobile ? 'bottom' : 'right'}
        align="end"
        sideOffset={8}
      >
        <div className="px-3 py-2.5">
          <div className="text-foreground truncate text-[13px] font-medium">{user.name}</div>
          <div className="text-muted-foreground truncate text-[11px]">{user.email}</div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          render={<Link href="/dashboard/candidates" />}
          className="gap-2.5 rounded-[8px] px-3 py-2 text-[13px]"
        >
          <CircleUserRoundIcon className="size-4 stroke-[1.5]" />
          <span>My Profile</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={async () => {
            const { createClient } = await import('@/lib/client');
            const supabase = createClient();
            await supabase.auth.signOut();
            window.location.href = '/';
          }}
          className="text-destructive focus:text-destructive focus:bg-destructive/10 gap-2.5 rounded-[8px] px-3 py-2 text-[13px]"
        >
          <LogOutIcon className="size-4 stroke-[1.5]" />
          <span>Sign out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
