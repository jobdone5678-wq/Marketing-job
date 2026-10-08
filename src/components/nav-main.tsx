"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { CirclePlusIcon, RefreshCwIcon, BriefcaseIcon } from "lucide-react"
import { cn } from "cn"

export interface NavItem {
  id: string
  title: string
  url: string
  icon?: React.ReactNode
}

export function NavMain({
  items,
  role = "recruiter",
  activeSection,
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
  const isCandidate = role === "client"

  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-2">
            {isCandidate ? (
              <Link
                href="/dashboard/jobs"
                onClick={() => onSelectSection?.("public-jobs")}
                className="flex flex-1 items-center gap-2 min-w-8 bg-primary text-primary-foreground duration-200 ease-linear hover:bg-primary/90 active:bg-primary/90 rounded-md px-3 py-2 text-sm font-medium cursor-pointer shadow-xs"
              >
                <BriefcaseIcon className="size-4 shrink-0" />
                <span className="truncate">Explore Jobs</span>
              </Link>
            ) : (
              <Link
                href="/dashboard/greenhouse"
                onClick={() => onSelectSection?.("greenhouse")}
                className="flex flex-1 items-center gap-2 min-w-8 bg-primary text-primary-foreground duration-200 ease-linear hover:bg-primary/90 active:bg-primary/90 rounded-md px-3 py-2 text-sm font-medium cursor-pointer shadow-xs"
              >
                <CirclePlusIcon className="size-4 shrink-0" />
                <span className="truncate">Track New Board</span>
              </Link>
            )}
            <Button
              size="icon"
              className="size-8 group-data-[collapsible=icon]:opacity-0 cursor-pointer shrink-0"
              variant="outline"
              title="Sync Job Feeds"
              onClick={onRefreshJobs}
            >
              <RefreshCwIcon className="size-3.5" />
              <span className="sr-only">Sync</span>
            </Button>
          </SidebarMenuItem>
        </SidebarMenu>

        <div className="px-2 py-1">
          <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
            {isCandidate ? "Candidate Portal" : "Recruiter Portal"}
          </span>
        </div>

        <SidebarMenu className="gap-1">
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
                    "flex w-full items-center gap-2.5 overflow-hidden rounded-md px-3 py-2 text-left text-sm outline-hidden transition-all cursor-pointer",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold shadow-2xs"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                  )}
                >
                  <span className="size-4 shrink-0 text-foreground flex items-center justify-center">
                    {item.icon}
                  </span>
                  <span className="truncate font-medium">{item.title}</span>
                </Link>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
