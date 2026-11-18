import * as React from 'react';
import { AppSidebar } from '@/components/app-sidebar';
import { SiteHeader } from '@/components/site-header';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider
      className="h-svh min-h-0 overflow-hidden"
      style={
        {
          '--sidebar-width': '15.5rem',
          '--header-height': 'calc(var(--spacing) * 12)',
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="sidebar" />
      <SidebarInset className="flex h-svh min-h-0 min-w-0 flex-col overflow-hidden">
        <SiteHeader />
        <div
          id="workspace-content"
          tabIndex={-1}
          className="portal-workspace bg-muted/20 min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
        >
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
