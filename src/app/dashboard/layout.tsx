import * as React from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { SiteHeader } from "@/components/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { RoleNotificationHandler } from "@/components/role-notification-handler"
import { MandatoryPhoneDialog } from "@/components/mandatory-phone-dialog"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" />
      <SidebarInset className="h-svh max-h-svh overflow-y-auto overflow-x-hidden flex flex-col">
        <SiteHeader />
        <RoleNotificationHandler />
        <MandatoryPhoneDialog />
        <div className="flex flex-1 flex-col pb-16">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
