import * as React from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { RoleNotificationHandler } from "@/components/role-notification-handler"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SidebarProvider
      className="h-svh min-h-0 overflow-hidden"
      style={
        {
          "--sidebar-width": "15.5rem",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="sidebar" />
      <SidebarInset className="h-svh min-h-0 min-w-0 overflow-hidden flex flex-col">
        <SiteHeader />
        <RoleNotificationHandler />
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-muted/20">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
