'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { cn } from 'cn';

export interface SecondaryNavItem {
  id: string;
  title: string;
  url: string;
  icon: React.ReactNode;
}

export function NavSecondary({
  items,
  activeSection,
  onSelectSection,
  className,
  ...props
}: {
  items: SecondaryNavItem[];
  activeSection?: string;
  onSelectSection?: (id: string) => void;
} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  const pathname = usePathname();

  return (
    <SidebarGroup className={cn('border-border/40 border-t pt-2', className)} {...props}>
      <SidebarGroupContent>
        <SidebarMenu className="gap-0.5">
          {items.map((item) => {
            const isActive =
              pathname === item.url ||
              (item.url !== '/dashboard' && pathname.startsWith(item.url)) ||
              activeSection === item.id;

            return (
              <SidebarMenuItem key={item.id || item.title}>
                <Link
                  href={item.url}
                  onClick={() => onSelectSection?.(item.id)}
                  className={cn(
                    'group flex w-full cursor-pointer items-center gap-2.5 overflow-hidden rounded-lg px-3 py-1.5 text-left text-xs outline-hidden transition-all duration-150 active:scale-[0.99]',
                    isActive
                      ? 'bg-sidebar-accent text-foreground border-border/40 border font-semibold shadow-2xs'
                      : 'text-muted-foreground/80 hover:bg-sidebar-accent/50 hover:text-foreground'
                  )}
                >
                  <span className="flex size-4 shrink-0 items-center justify-center opacity-75 transition-transform duration-150 group-hover:scale-110 group-hover:opacity-100">
                    {item.icon}
                  </span>
                  <span className="flex-1 truncate font-medium">{item.title}</span>
                </Link>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
