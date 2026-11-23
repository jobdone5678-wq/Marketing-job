'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
} from '@/components/ui/sidebar';

export interface NavItem {
  id: string;
  title: string;
  url: string;
  icon: ReactNode;
}

export function NavMain({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu className="gap-1">
          {items.map(({ id, title, url, icon }) => {
            const active = pathname === url || pathname.startsWith(url + '/');

            return (
              <SidebarMenuItem key={id}>
                <Link
                  href={url}
                  aria-current={active ? 'page' : undefined}
                  className={`flex h-9 items-center gap-2.5 rounded-md px-3 text-xs font-medium transition-colors duration-150 focus-visible:outline-2 ${
                    active
                      ? 'bg-sidebar-accent text-foreground'
                      : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground'
                  }`}
                >
                  <span className={active ? 'text-primary' : 'text-muted-foreground'}>{icon}</span>
                  <span className="truncate">{title}</span>
                </Link>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
