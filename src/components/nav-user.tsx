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
import { EllipsisVerticalIcon, CircleUserRoundIcon,  LogOutIcon } from "lucide-react"

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
      ? "Technical recruiter"
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
              <SidebarMenuButton size="lg" className="aria-expanded:bg-muted" />
            }
          >
            <Avatar className="size-8 rounded-lg ring-1 ring-border/50 shadow-xs">
              <AvatarImage src={user.avatar} alt={user.name} />
              <AvatarFallback className="rounded-lg bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5 text-primary font-bold text-xs ring-1 ring-primary/20">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <div className="flex items-center gap-1.5">
                <span className="truncate font-medium">{user.name}</span>
              </div>
              <span className="truncate text-xs text-muted-foreground flex items-center gap-1">
                {roleDisplay && (
                  <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-primary/10 text-primary border border-primary/20">
                    {roleDisplay}
                  </span>
                )}
                <span className="truncate">{user.email}</span>
              </span>
            </div>
            <EllipsisVerticalIcon className="ml-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-56"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <Avatar className="size-8 rounded-lg ring-1 ring-border/50 shadow-xs">
                    <AvatarImage src={user.avatar} alt={user.name} />
                    <AvatarFallback className="rounded-lg bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5 text-primary font-bold text-xs ring-1 ring-primary/20">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-medium">{user.name}</span>
                      {roleDisplay && (
                        <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-primary/10 text-primary border border-primary/20">
                          {roleDisplay}
                        </span>
                      )}
                    </div>
                    <span className="truncate text-xs text-muted-foreground">
                      {user.email}
                    </span>
                  </div>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem render={<Link href="/dashboard/settings" />}>
                <CircleUserRoundIcon
                />
                Account
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
              className="cursor-pointer text-destructive focus:text-destructive"
            >
              <LogOutIcon />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
