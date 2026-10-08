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
  BriefcaseIcon,
  Building2Icon,
  GlobeIcon,
  Settings2Icon,
  CircleHelpIcon,
  SearchIcon,
  CommandIcon,
  UsersIcon,
  SendIcon,
  TrendingUpIcon,
  UserCheckIcon,
} from "lucide-react"
import { createClient } from "@/lib/client"
import Link from "next/link"
import { useRouter } from "next/navigation"

// Recruiter & Super Admin Navigation Items
const recruiterNavItems: NavItem[] = [
  {
    id: "dashboard",
    title: "Dashboard",
    url: "/dashboard",
    icon: <LayoutDashboardIcon className="size-4" />,
  },
  {
    id: "candidates",
    title: "Bench Candidates",
    url: "/dashboard/candidates",
    icon: <UsersIcon className="size-4" />,
  },
  {
    id: "submissions",
    title: "Job Submissions",
    url: "/dashboard/submissions",
    icon: <SendIcon className="size-4" />,
  },
  {
    id: "vendors",
    title: "Prime Vendors",
    url: "/dashboard/vendors",
    icon: <Building2Icon className="size-4" />,
  },
  {
    id: "analytics",
    title: "Analytics",
    url: "/dashboard/analytics",
    icon: <TrendingUpIcon className="size-4" />,
  },
  {
    id: "public-jobs",
    title: "Public Jobs",
    url: "/dashboard/jobs",
    icon: <BriefcaseIcon className="size-4" />,
  },
  {
    id: "greenhouse",
    title: "Greenhouse Portals",
    url: "/dashboard/greenhouse",
    icon: <Building2Icon className="size-4" />,
  },
  {
    id: "ashby",
    title: "Ashby Portals",
    url: "/dashboard/ashby",
    icon: <GlobeIcon className="size-4" />,
  },
]

// Candidate Navigation Items (Tailored specifically for Candidates)
const candidateNavItems: NavItem[] = [
  {
    id: "dashboard",
    title: "Dashboard",
    url: "/dashboard",
    icon: <LayoutDashboardIcon className="size-4" />,
  },
  {
    id: "candidates",
    title: "My Profile & Resume",
    url: "/dashboard/candidates",
    icon: <UserCheckIcon className="size-4" />,
  },
  {
    id: "submissions",
    title: "My Applications",
    url: "/dashboard/submissions",
    icon: <SendIcon className="size-4" />,
  },
  {
    id: "public-jobs",
    title: "Browse Jobs",
    url: "/dashboard/jobs",
    icon: <BriefcaseIcon className="size-4" />,
  },
  {
    id: "greenhouse",
    title: "Greenhouse Portals",
    url: "/dashboard/greenhouse",
    icon: <Building2Icon className="size-4" />,
  },
  {
    id: "ashby",
    title: "Ashby Portals",
    url: "/dashboard/ashby",
    icon: <GlobeIcon className="size-4" />,
  },
]

const navSecondaryItems: SecondaryNavItem[] = [
  {
    id: "settings",
    title: "Settings",
    url: "/dashboard/settings",
    icon: <Settings2Icon className="size-4" />,
  },
  {
    id: "help",
    title: "Get Help",
    url: "/dashboard/help",
    icon: <CircleHelpIcon className="size-4" />,
  },
  {
    id: "search",
    title: "Search Jobs",
    url: "/dashboard/jobs",
    icon: <SearchIcon className="size-4" />,
  },
]

export function AppSidebar({
  activeSection = "dashboard",
  onSelectSection,
  onRefreshJobs,
  ...props
}: {
  activeSection?: string
  onSelectSection?: (id: string) => void
  onRefreshJobs?: () => void
} & React.ComponentProps<typeof Sidebar>) {
  const router = useRouter()
  const [currentUser, setCurrentUser] = React.useState<{
    name: string
    email: string
    avatar: string
    role?: string
  }>({
    name: "Marketing Lead",
    email: "lead@marketingportal.com",
    avatar: "/avatars/shadcn.jpg",
    role: "recruiter",
  })

  React.useEffect(() => {
    const supabase = createClient()

    const fetchUserRole = async () => {
      const { data: authData } = await supabase.auth.getUser()
      if (authData?.user) {
        const u = authData.user
        let role = (u.user_metadata?.role as string) || "recruiter"
        try {
          const { data: prof } = await supabase
            .from("profiles")
            .select("role, full_name")
            .eq("id", u.id)
            .single()
          if (prof?.role) {
            role = prof.role
          }
        } catch {
          // Keep metadata role
        }

        setCurrentUser({
          name: u.user_metadata?.full_name || u.email?.split("@")[0] || "Marketing User",
          email: u.email || "user@portal.com",
          avatar: u.user_metadata?.avatar_url || "/avatars/shadcn.jpg",
          role,
        })
      }
    }

    fetchUserRole()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        const u = session.user
        let role = (u.user_metadata?.role as string) || "recruiter"
        try {
          const { data: prof } = await supabase
            .from("profiles")
            .select("role, full_name")
            .eq("id", u.id)
            .single()
          if (prof?.role) {
            role = prof.role
          }
        } catch {
          // Keep metadata role
        }

        setCurrentUser({
          name: u.user_metadata?.full_name || u.email?.split("@")[0] || "Marketing User",
          email: u.email || "user@portal.com",
          avatar: u.user_metadata?.avatar_url || "/avatars/shadcn.jpg",
          role,
        })
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  // Choose the tailored navigation items based on user's active role
  const mainItems =
    currentUser.role === "client" ? candidateNavItems : recruiterNavItems

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <Link
              href="/dashboard"
              onClick={() => onSelectSection?.("dashboard")}
              className="flex items-center gap-2.5 p-2 rounded-md hover:bg-sidebar-accent transition-colors cursor-pointer text-foreground"
            >
              <CommandIcon className="size-5 text-primary" />
              <div className="flex flex-col text-left">
                <span className="text-sm font-bold tracking-tight">Marketing Portal</span>
                <span className="text-[10px] text-muted-foreground capitalize">
                  {currentUser.role === "client" ? "Candidate Workspace" : "Recruiter Workspace"}
                </span>
              </div>
            </Link>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain
          items={mainItems}
          role={currentUser.role}
          activeSection={activeSection}
          onSelectSection={onSelectSection}
          onRefreshJobs={onRefreshJobs}
        />
        <NavSecondary
          items={navSecondaryItems}
          activeSection={activeSection}
          onSelectSection={onSelectSection}
          className="mt-auto"
        />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={currentUser} />
      </SidebarFooter>
    </Sidebar>
  )
}
