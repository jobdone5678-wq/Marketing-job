'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { RotateCwIcon } from 'lucide-react';

export interface NavItem {
  id: string;
  title: string;
  url: string;
  icon?: React.ReactNode;
  badge?: string | number;
}

export function NavMain({
  items,
  role = '',
  onSelectSection,
  onRefreshJobs,
}: {
  items: NavItem[];
  role?: string;
  activeSection?: string;
  onSelectSection?: (id: string) => void;
  onRefreshJobs?: () => void;
}) {
  const pathname = usePathname();

  const sections = [
    ['My Workspace', ['dashboard', 'candidates', 'submissions', 'rtr', 'placements']],
    ['Opportunities', ['public-jobs']],
    ['Connections', ['email-confirmations', 'integrations']],
  ];

  return (
    <div className="flex flex-col gap-1 py-1">
      {sections.map(([title, ids]) => {
        const entries = (ids as string[]).flatMap((id) => items.filter((item) => item.id === id));
        if (!entries.length) return null;

        return (
          <SidebarGroup key={title as string} className="py-1">
            <SidebarGroupLabel className="text-muted-foreground/60 flex items-center justify-between px-3 py-1 text-[10px] font-semibold tracking-wider uppercase select-none">
              <span>{title as string}</span>
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {entries.map((item) => {
                  const active =
                    pathname === item.url ||
                    (item.url !== '/dashboard' && pathname.startsWith(item.url + '/'));

                  return (
                    <SidebarMenuItem key={item.id}>
                      <Link
                        href={item.url}
                        aria-current={active ? 'page' : undefined}
                        onClick={() => onSelectSection?.(item.id)}
                        className={`group focus-visible:outline-primary relative flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-xs transition-all duration-150 focus-visible:outline-2 active:scale-[0.99] ${
                          active
                            ? 'bg-sidebar-accent text-foreground border-border/40 border font-semibold shadow-2xs'
                            : 'text-muted-foreground/80 hover:bg-sidebar-accent/50 hover:text-foreground'
                        }`}
                      >
                        {/* Interactive left active accent pill */}
                        {active && (
                          <span
                            aria-hidden="true"
                            className="bg-primary absolute top-1/2 left-1 h-3.5 w-1 -translate-y-1/2 rounded-full"
                          />
                        )}

                        <span
                          className={`flex size-4 shrink-0 items-center justify-center transition-all duration-150 group-hover:scale-110 ${
                            active
                              ? 'text-primary opacity-100'
                              : 'group-hover:text-foreground opacity-75 group-hover:opacity-100'
                          }`}
                        >
                          {item.icon}
                        </span>
                        <span className="flex-1 truncate font-medium">{item.title}</span>

                        {/* Interactive badge/counter if present */}
                        {item.badge ? (
                          <span className="py-0.2 bg-primary/10 text-primary border-primary/20 ml-auto inline-flex items-center rounded-full border px-1.5 text-[10px] font-semibold">
                            {item.badge}
                          </span>
                        ) : null}
                      </Link>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        );
      })}

      {onRefreshJobs && (
        <div className="px-3 pt-2 pb-1">
          <button
            type="button"
            onClick={onRefreshJobs}
            className="border-border/60 bg-muted/20 text-muted-foreground hover:bg-accent/80 hover:text-foreground hover:border-border flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium shadow-2xs transition-all duration-150 active:scale-[0.98]"
          >
            <RotateCwIcon className="size-3.5 opacity-80" />
            <span>Sync Job Feeds</span>
          </button>
        </div>
      )}
    </div>
  );
}
