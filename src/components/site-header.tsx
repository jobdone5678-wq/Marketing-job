"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

const routeTitles: Record<string, { title: string; subtitle: string }> = {
  "/dashboard": { title: "Dashboard Overview", subtitle: "Public Jobs" },
  "/dashboard/candidates": { title: "Bench Candidates", subtitle: "USA IT Consultants" },
  "/dashboard/candidates/new": { title: "New Candidate Form", subtitle: "Bench Profile Intake" },
  "/dashboard/submissions": { title: "Job Submissions Tracker", subtitle: "Recruiting Pipeline & Tracking" },
  "/dashboard/submissions/new": { title: "Log New Job Submission", subtitle: "New Submission Intake" },
  "/dashboard/vendors": { title: "Prime Vendors Directory", subtitle: "Staffing Partners & Recruiter Contacts" },
  "/dashboard/vendors/new": { title: "Add Prime Vendor", subtitle: "Staffing Partner Registration" },
  "/dashboard/analytics": { title: "Performance Analytics", subtitle: "Pipeline Yield & Conversion Rates" },
  "/dashboard/jobs": { title: "Public Jobs Directory", subtitle: "Live Roles" },
  "/dashboard/greenhouse": { title: "Greenhouse Portals", subtitle: "Keyless REST API" },
  "/dashboard/ashby": { title: "Ashby Portals", subtitle: "High-Growth Startups" },
  "/dashboard/settings": { title: "Portal Settings", subtitle: "Preferences" },
  "/dashboard/help": { title: "API Documentation", subtitle: "Greenhouse & Ashby" },
}

export function SiteHeader({
  title,
  subtitle,
}: {
  title?: string
  subtitle?: string
}) {
  const pathname = usePathname()
  const matched =
    routeTitles[pathname] ||
    (pathname.startsWith("/dashboard/jobs/")
      ? { title: "Job Details", subtitle: "Public Opening" }
      : pathname.includes("/submissions/") && pathname.endsWith("/edit")
      ? { title: "Edit Job Submission", subtitle: "Update Pipeline Stage" }
      : {
          title: title || "Dashboard Overview",
          subtitle: subtitle || "Public Jobs",
        })
  const displayTitle = title || matched.title

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height) bg-background">
      <div className="flex w-full items-center justify-between px-4 lg:gap-3 lg:px-6">
        <div className="flex items-center gap-2">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mx-1 h-4 data-vertical:self-auto"
          />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="hidden sm:block">
                <BreadcrumbLink
                  render={<Link href="/dashboard" />}
                  className="text-muted-foreground hover:text-foreground"
                >
                  Marketing Portal
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden sm:block" />
              <BreadcrumbItem>
                <BreadcrumbPage className="font-semibold text-foreground">
                  {displayTitle}
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        {/* Real-time sync badge */}
        <div className="flex items-center gap-2 text-xs">
          <span className="flex size-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-muted-foreground hidden sm:inline">Greenhouse & Ashby live sync active</span>
        </div>
      </div>
    </header>
  )
}
