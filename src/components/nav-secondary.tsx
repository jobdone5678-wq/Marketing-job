"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { cn } from "cn"

export interface SecondaryNavItem {
  id: string
  title: string
  url: string
  icon: React.ReactNode
}

export function NavSecondary({
  items,
  activeSection,
  onSelectSection,
  ...props
}: {
  items: SecondaryNavItem[]
  activeSection?: string
  onSelectSection?: (id: string) => void
} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  const pathname = usePathname()

  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent>
        <SidebarMenu className="gap-0.5">
          {items.map((item) => {
            const isActive =
              pathname === item.url ||
              (item.url !== "/dashboard" && pathname.startsWith(item.url)) ||
              activeSection === item.id

            return (
              <SidebarMenuItem key={item.id || item.title}>
                <Link
                  href={item.url}
                  onClick={() => onSelectSection?.(item.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 overflow-hidden rounded-md px-3 py-1.5 text-left text-xs outline-hidden transition-all cursor-pointer",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold shadow-2xs"
                      : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                  )}
                >
                  <span className="size-4 shrink-0 flex items-center justify-center">
                    {item.icon}
                  </span>
                  <span className="truncate">{item.title}</span>
                </Link>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
