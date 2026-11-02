"use client"
import Link from "next/link"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { EllipsisVerticalIcon, CircleUserRoundIcon, LogOutIcon } from "lucide-react"

export function NavUser({
  user,
}: {
  user: {
    name: string
    email: string
    avatar: string
    role?: string
  }
}) {
  const { isMobile } = useSidebar()
  const roleDisplay =
    user.role === "super_admin"
      ? "Super Admin"
      : user.role === "recruiter"
      ? "Recruiter"
      : user.role === "technical_recruiter"
      ? "Tech Recruiter"
      : user.role === "client"
      ? "Candidate"
      : undefined

  const initials = (() => {
    if (!user.name || user.name === "Loading account" || user.name === "Account") {
      return user.email ? user.email.slice(0, 2).toUpperCase() : "U";
    }
    const words = user.name.trim().split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      return (words[0][0] + words[words.length - 1][0]).toUpperCase();
    }
    return user.name.slice(0, 2).toUpperCase();
  })();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="group relative flex items-center gap-2.5 rounded-lg border border-border/40 bg-card/40 p-2 text-left transition-all duration-150 hover:border-border hover:bg-sidebar-accent/70 aria-expanded:bg-sidebar-accent/80 shadow-2xs cursor-pointer"
              />
            }
          >
            <Avatar className="size-8 rounded-lg ring-1 ring-border/60 shadow-xs group-hover:ring-primary/40 transition-all duration-150">
              {user.avatar ? <AvatarImage src={user.avatar} alt={user.name} /> : null}
              <AvatarFallback className="rounded-lg bg-primary/10 text-primary font-semibold text-xs ring-1 ring-primary/20">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-xs leading-tight min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate font-semibold text-foreground text-[12.5px]">{user.name}</span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                {roleDisplay && (
                  <span className="text-[9.5px] font-semibold px-1.5 py-0.2 rounded bg-primary/10 text-primary border border-primary/25 shrink-0">
                    {roleDisplay}
                  </span>
                )}
                <span className="truncate text-[11px] text-muted-foreground">{user.email}</span>
              </div>
            </div>
            <EllipsisVerticalIcon className="ml-auto size-4 text-muted-foreground/60 group-hover:text-foreground transition-colors" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-56 rounded-lg shadow-lg border border-border/60"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={6}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2.5 px-2.5 py-2 text-left text-xs">
                  <Avatar className="size-8 rounded-lg ring-1 ring-border/50 shadow-xs">
                    {user.avatar ? <AvatarImage src={user.avatar} alt={user.name} /> : null}
                    <AvatarFallback className="rounded-lg bg-primary/10 text-primary font-semibold text-xs ring-1 ring-primary/20">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-xs leading-tight min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-semibold text-foreground">{user.name}</span>
                    </div>
                    <span className="truncate text-[11px] text-muted-foreground mt-0.5">
                      {user.email}
                    </span>
                  </div>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                render={<Link href="/dashboard/settings" />}
                className="cursor-pointer gap-2 text-xs py-1.5"
              >
                <CircleUserRoundIcon className="size-4 opacity-75" />
                <span>Account settings</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={async () => {
                const { createClient } = await import("@/lib/client")
                const supabase = createClient()
                await supabase.auth.signOut()
                window.location.href = "/"
              }}
              className="cursor-pointer gap-2 text-xs py-1.5 text-destructive focus:text-destructive focus:bg-destructive/10"
            >
              <LogOutIcon className="size-4" />
              <span>Sign out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
