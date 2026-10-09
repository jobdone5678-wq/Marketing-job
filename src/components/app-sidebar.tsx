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
  MailIcon,
} from "lucide-react"
import { createClient } from "@/lib/client"
import Link from "next/link"


// Recruiter & Super Admin Navigation Items
const recruiterNavItems: NavItem[] = [
  {id:"application-capture",title:"Application Capture",url:"/dashboard/application-capture",icon:<SendIcon className="size-4"/>},
  {
    id: "email-confirmations",
    title: "Email Confirmations",
    url: "/dashboard/email-confirmations",
    icon: <MailIcon className="size-4" />,
  },
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
  const [currentUser, setCurrentUser] = React.useState({name: "Loading account", email: "", avatar: "", role: ""})
  React.useEffect(() => {
    const client = createClient()
    let cancelled = false
    async function load() {
      const {data: {user}} = await client.auth.getUser()
      const {data: profile} = user ? await client.from("profiles").select("role,status,full_name").eq("id",user.id).single() : {data:null}
      if (!cancelled) setCurrentUser({name: profile?.full_name || user?.email || "Account",email: user?.email || "",avatar:"",role:profile?.status === "active" ? profile.role : ""})
    }
    void load()
    const {data:{subscription}} = client.auth.onAuthStateChange(() => {setTimeout(() => void load(),0)})
    return () => {cancelled=true;subscription.unsubscribe()}
  }, [])
  const mainItems = ["recruiter","super_admin"].includes(currentUser.role) ? recruiterNavItems : currentUser.role === "client" ? candidateNavItems : []
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
