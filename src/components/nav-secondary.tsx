'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
}: {
  items: SecondaryNavItem[];
  activeSection?: string;
  onSelectSection?: (id: string) => void;
  className?: string;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="Support" className={cn('border-border border-t pt-4 pb-4', className)}>
      <ul className="flex flex-col gap-0.5">
        {items.map((item) => {
          const isActive = pathname === item.url || activeSection === item.id;

          return (
            <li key={item.id || item.title}>
              <Link
                href={item.url}
                onClick={() => onSelectSection?.(item.id)}
                className={cn(
                  'flex h-9 items-center gap-2.5 rounded-[10px] px-3 text-[13px] transition-colors',
                  isActive
                    ? 'bg-accent text-foreground font-medium'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                )}
              >
                <span
                  className={cn(
                    'flex size-4 shrink-0 items-center justify-center',
                    isActive && 'text-primary'
                  )}
                >
                  {item.icon}
                </span>
                <span className="flex-1 truncate">{item.title}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
