"use client"

import * as React from "react"
import { NavMain, type NavItem } from "@/components/nav-main"
import { NavSecondary, type SecondaryNavItem } from "@/components/nav-secondary"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import {
  LayoutDashboardIcon,
  Building2Icon,
  SearchIcon,
  CommandIcon,
  UsersIcon,
  UserCheckIcon,
  PlugZapIcon,
  CreditCardIcon,
  InboxIcon,
  SendHorizontalIcon,
  CircleDollarSignIcon,
  CompassIcon,
  ShieldCheckIcon,
  SparklesIcon,
  SlidersHorizontalIcon,
  LifeBuoyIcon,
  FileSignatureIcon,
  GlobeIcon,
} from "lucide-react"
import { createClient } from "@/lib/client"
import Link from "next/link"

// Candidate Navigation Items
const candidateNavItems: NavItem[] = [
  {
    id: "public-jobs",
    title: "Public Jobs",
    url: "/dashboard/jobs",
    icon: <CompassIcon className="size-4 stroke-[1.8]" />,
  },
  {
    id: "candidates",
    title: "My Profile & Resume",
    url: "/dashboard/candidates",
    icon: <UserCheckIcon className="size-4 stroke-[1.8]" />,
  },
  {
    id: "submissions",
    title: "My Applications",
    url: "/dashboard/submissions",
    icon: <SendHorizontalIcon className="size-4 stroke-[1.8]" />,
  },
  {
    id: "rtr",
    title: "My RTR Agreements",
    url: "/dashboard/rtr",
    icon: <FileSignatureIcon className="size-4 stroke-[1.8]" />,
  },
  {
    id: "email-confirmations",
    title: "Email Confirmations",
    url: "/dashboard/email-confirmations",
    icon: <InboxIcon className="size-4 stroke-[1.8]" />,
  },
  {
    id: "outside-jobs",
    title: "Outside Jobs",
    url: "/dashboard/outside-jobs",
    icon: <GlobeIcon className="size-4 stroke-[1.8]" />,
  },
]

const navSecondaryItems: SecondaryNavItem[] = [
  {
    id: "settings",
    title: "Settings",
    url: "/dashboard/settings",
    icon: <SlidersHorizontalIcon className="size-4 stroke-[1.8]" />,
  },
  {
    id: "help",
    title: "Get Help",
    url: "/dashboard/help",
    icon: <LifeBuoyIcon className="size-4 stroke-[1.8]" />,
  },
  {
    id: "search",
    title: "Search Jobs",
    url: "/dashboard/jobs",
    icon: <SearchIcon className="size-4 stroke-[1.8]" />,
  },
]

export function AppSidebar({
  activeSection,
  onSelectSection,
  onRefreshJobs,
  ...props
}: {
  activeSection?: string
  onSelectSection?: (id: string) => void
  onRefreshJobs?: () => void
} & React.ComponentProps<typeof Sidebar>) {
  const [currentUser, setCurrentUser] = React.useState({
    name: "Loading account",
    email: "",
    avatar: "",
    role: "",
  })

  React.useEffect(() => {
    const client = createClient()
    let cancelled = false
    async function load() {
      const {
        data: { user },
      } = await client.auth.getUser()
      const { data: profile } = user
        ? await client
            .from("profiles")
            .select("role,status,full_name")
            .eq("id", user.id)
            .single()
        : { data: null }
      if (!cancelled)
        setCurrentUser({
          name:
            profile?.full_name ||
            user?.user_metadata?.full_name ||
            user?.email ||
            "Account",
          email: user?.email || "",
          avatar: (user?.user_metadata?.avatar_url ||
            user?.user_metadata?.picture ||
            "") as string,
          role: profile?.status === "active" ? profile.role : "",
        })
    }
    void load()
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange(() => {
      setTimeout(() => void load(), 0)
    })
    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  const isAllowedRole = currentUser.role === "client" || currentUser.role === "candidate"
  const mainItems = isAllowedRole ? candidateNavItems : []

  const navigationItems = currentUser.role
    ? [
        ...mainItems,
        {
          id: "integrations",
          title: "Integrations",
          url: "/dashboard/integrations",
          icon: <PlugZapIcon className="size-4 stroke-[1.8]" />,
        },
      ]
    : []

  return (
    <Sidebar collapsible="offcanvas" className="border-r border-border/50 bg-sidebar" {...props}>
      {/* Premium Workspace Identity Header */}
      <SidebarHeader className="border-b border-border/40 pb-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <Link
              href="/dashboard/jobs"
              onClick={() => onSelectSection?.("public-jobs")}
              className="group flex items-center gap-3 p-1.5 rounded-lg hover:bg-sidebar-accent/70 transition-all duration-150 cursor-pointer text-foreground select-none"
            >
              <div className="flex size-8.5 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 via-primary/10 to-transparent text-primary border border-primary/25 shadow-2xs group-hover:scale-105 group-hover:border-primary/40 transition-transform duration-150">
                <CommandIcon className="size-4 stroke-[2.2]" />
              </div>
              <div className="flex flex-col text-left min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-bold tracking-tight text-foreground truncate">
                    Nextkinlife
                  </span>
                  <span className="text-[9.5px] font-semibold text-primary px-1.5 py-0.2 rounded-sm bg-primary/10 border border-primary/20">
                    Recruit
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  <span className="text-[10.5px] text-muted-foreground truncate capitalize font-medium">
                    {currentUser.role === "candidate" ? "Candidate Workspace" : currentUser.role === "client" ? "Client Workspace" : "Portal Workspace"}
                  </span>
                </div>
              </div>
            </Link>
          </SidebarMenuItem>
        </SidebarMenu>

        {/* Interactive Quick Jump / Search Trigger */}
        <div className="px-1 pt-1.5">
          <Link
            href="/dashboard/jobs"
            onClick={() => onSelectSection?.("public-jobs")}
            className="group flex h-8 w-full items-center gap-2 rounded-lg border border-border/50 bg-muted/20 px-2.5 text-xs text-muted-foreground transition-all duration-150 hover:bg-sidebar-accent/80 hover:text-foreground hover:border-border cursor-pointer shadow-2xs active:scale-[0.99]"
          >
            <SearchIcon className="size-3.5 opacity-60 group-hover:text-primary group-hover:opacity-100 transition-colors" />
            <span className="flex-1 text-left truncate text-[11.5px] font-normal">
              Quick search or jump...
            </span>
            <kbd className="pointer-events-none inline-flex h-4.5 select-none items-center gap-0.5 rounded border border-border/80 bg-background/80 px-1.5 font-mono text-[9px] font-medium text-muted-foreground/80 shadow-2xs">
              ⌘K
            </kbd>
          </Link>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-1">
        <NavMain
          items={navigationItems}
          role={currentUser.role}
          activeSection={activeSection}
          onSelectSection={onSelectSection}
          onRefreshJobs={onRefreshJobs}
        />
        <NavSecondary
          items={navSecondaryItems}
          activeSection={activeSection}
          onSelectSection={onSelectSection}
          className="mt-auto px-1"
        />
      </SidebarContent>

      <SidebarFooter className="border-t border-border/40 p-2">
        <div className="px-2.5 pb-1 flex items-center justify-between text-[10px] text-muted-foreground/60 select-none">
          <span>Nextkinlife LLC</span>
          <span className="font-mono text-[9px] text-muted-foreground/50">v3.2</span>
        </div>
        <NavUser user={currentUser} />
      </SidebarFooter>
    </Sidebar>
  )
}
