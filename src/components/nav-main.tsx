'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { RotateCwIcon } from 'lucide-react';

export interface NavItem {
  id: string;
  title: string;
  url: string;
  icon?: React.ReactNode;
  badge?: string | number;
}

const SECTIONS: [string, string[]][] = [
  ['Workspace', ['dashboard', 'candidates', 'submissions', 'rtr', 'placements']],
  ['Opportunities', ['public-jobs']],
  ['Connections', ['email-confirmations', 'integrations']],
];

export function NavMain({
  items,
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

  return (
    <nav aria-label="Workspace" className="flex flex-col">
      {SECTIONS.map(([title, ids], index) => {
        const entries = ids.flatMap((id) => items.filter((item) => item.id === id));
        if (!entries.length) return null;

        return (
          <div key={title} className={index === 0 ? '' : 'mt-6'}>
            <div className="text-muted-foreground mb-2 px-3 text-[11px] leading-4 font-medium">
              {title}
            </div>
            <ul className="flex flex-col gap-0.5">
              {entries.map((item) => {
                const active =
                  pathname === item.url ||
                  (item.url !== '/dashboard' && pathname.startsWith(item.url + '/'));

                return (
                  <li key={item.id}>
                    <Link
                      href={item.url}
                      aria-current={active ? 'page' : undefined}
                      onClick={() => onSelectSection?.(item.id)}
                      className={`flex h-9 items-center gap-2.5 rounded-[10px] px-3 text-[13px] transition-colors ${
                        active
                          ? 'bg-accent text-foreground font-medium'
                          : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                      }`}
                    >
                      <span
                        className={`flex size-4 shrink-0 items-center justify-center ${
                          active ? 'text-primary' : ''
                        }`}
                      >
                        {item.icon}
                      </span>
                      <span className="flex-1 truncate">{item.title}</span>
                      {item.badge ? (
                        <span className="figure text-muted-foreground text-[11px]">
                          {item.badge}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      {onRefreshJobs && (
        <button
          type="button"
          onClick={onRefreshJobs}
          className="border-border text-muted-foreground hover:text-foreground hover:border-input mt-6 flex h-9 w-full items-center justify-center gap-2 rounded-[10px] border text-[13px] transition-colors"
        >
          <RotateCwIcon className="size-4 stroke-[1.5]" />
          <span>Sync job feeds</span>
        </button>
      )}
    </nav>
  );
}
