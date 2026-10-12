"use client"
import Link from "next/link"
import {usePathname} from "next/navigation"
import {SidebarTrigger} from "@/components/ui/sidebar"
const titles:Record<string,string>={'/dashboard':'Dashboard','/dashboard/candidates':'Candidates','/dashboard/candidates/new':'New candidate','/dashboard/submissions':'Applications','/dashboard/submissions/new':'Log application','/dashboard/vendors':'Vendors','/dashboard/analytics':'Analytics','/dashboard/jobs':'Public jobs','/dashboard/greenhouse':'Greenhouse portals','/dashboard/ashby':'Ashby portals','/dashboard/settings':'Settings','/dashboard/help':'Help','/dashboard/team':'Team & assignments','/dashboard/placements':'Placements & compensation','/dashboard/payroll':'Payroll','/dashboard/commissions':'Commissions','/dashboard/application-capture':'Application capture','/dashboard/email-confirmations':'Email confirmations'};
export function SiteHeader({title}:{title?:string;subtitle?:string}){
 const path=usePathname();return <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-background px-4 sm:px-6"><div className="flex min-w-0 items-center gap-3"><SidebarTrigger/><span className="hidden text-sm text-muted-foreground sm:block">NextKinHR</span><span className="hidden text-muted-foreground/50 sm:block">/</span><span className="truncate text-sm font-medium">{title||titles[path]||'Details'}</span></div><Link href="/dashboard/help" className="shrink-0 text-xs text-muted-foreground hover:text-primary">Help & guidance</Link></header>;
}
