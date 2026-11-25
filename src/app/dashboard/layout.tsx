import * as React from 'react';
import { AppSidebar } from '@/components/app-sidebar';
import { SiteHeader } from '@/components/site-header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider
      className="bg-background h-svh min-h-0 overflow-hidden"
      style={
        {
          '--sidebar-width': '16rem',
          '--header-height': 'calc(var(--spacing) * 14)',
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="floating" />
      <SidebarInset className="bg-background flex h-svh min-h-0 min-w-0 flex-col overflow-hidden">
        <div className="shrink-0 px-3 pt-3">
          <SiteHeader />
        </div>
        <div
          id="workspace-content"
          tabIndex={-1}
          className="portal-workspace min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
        >
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
