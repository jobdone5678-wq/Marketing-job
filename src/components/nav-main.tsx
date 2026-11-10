"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { RotateCwIcon } from "lucide-react"

export interface NavItem {
  id: string
  title: string
  url: string
  icon?: React.ReactNode
  badge?: string | number
}

export function NavMain({
  items,
  role = "",
  onSelectSection,
  onRefreshJobs,
}: {
  items: NavItem[]
  role?: string
  activeSection?: string
  onSelectSection?: (id: string) => void
  onRefreshJobs?: () => void
}) {
  const pathname = usePathname()

  const sections =
    role === "client"
      ? [
          ["My Workspace", ["dashboard", "candidates", "resumes", "submissions", "rtr", "placements"]],
          ["Opportunities", ["public-jobs", "outside-jobs"]],
          ["Connections", ["email-confirmations", "integrations"]],
        ]
      : [
          ["Workspace", ["dashboard", "candidates", "public-jobs", "outside-jobs", "job-matching", "resumes", "submissions", "rtr"]],
          ["Communications", ["email-confirmations", "integrations"]],
          ["Operations", ["vendors", "placements"]],
          ["Administration", ["team", "billing"]],
        ]

  return (
    <div className="flex flex-col gap-1 py-1">
      {sections.map(([title, ids]) => {
        const entries = (ids as string[]).flatMap((id) =>
          items.filter((item) => item.id === id)
        )
        if (!entries.length) return null

        return (
          <SidebarGroup key={title as string} className="py-1">
            <SidebarGroupLabel className="text-[10px] font-semibold tracking-wider text-muted-foreground/60 uppercase px-3 py-1 flex items-center justify-between select-none">
              <span>{title as string}</span>
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {entries.map((item) => {
                  const active =
                    pathname === item.url ||
                    (item.url !== "/dashboard" && pathname.startsWith(item.url + "/"))

                  return (
                    <SidebarMenuItem key={item.id}>
                      <Link
                        href={item.url}
                        aria-current={active ? "page" : undefined}
                        onClick={() => onSelectSection?.(item.id)}
                        className={`group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs transition-all duration-150 focus-visible:outline-2 focus-visible:outline-primary active:scale-[0.99] cursor-pointer ${
                          active
                            ? "bg-sidebar-accent font-semibold text-foreground shadow-2xs border border-border/40"
                            : "text-muted-foreground/80 hover:bg-sidebar-accent/50 hover:text-foreground"
                        }`}
                      >
                        {/* Interactive left active accent pill */}
                        {active && (
                          <span
                            aria-hidden="true"
                            className="absolute left-1 top-1/2 -translate-y-1/2 w-1 h-3.5 rounded-full bg-primary"
                          />
                        )}

                        <span
                          className={`flex size-4 shrink-0 items-center justify-center transition-all duration-150 group-hover:scale-110 ${
                            active
                              ? "text-primary opacity-100"
                              : "opacity-75 group-hover:opacity-100 group-hover:text-foreground"
                          }`}
                        >
                          {item.icon}
                        </span>
                        <span className="truncate flex-1 font-medium">{item.title}</span>

                        {/* Interactive badge/counter if present */}
                        {item.badge ? (
                          <span className="ml-auto inline-flex items-center px-1.5 py-0.2 rounded-full text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
                            {item.badge}
                          </span>
                        ) : null}
                      </Link>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )
      })}

      {onRefreshJobs && (
        <div className="px-3 pt-2 pb-1">
          <button
            type="button"
            onClick={onRefreshJobs}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all duration-150 hover:bg-accent/80 hover:text-foreground hover:border-border cursor-pointer shadow-2xs active:scale-[0.98]"
          >
            <RotateCwIcon className="size-3.5 opacity-80" />
            <span>Sync Job Feeds</span>
          </button>
        </div>
      )}
    </div>
  )
}
