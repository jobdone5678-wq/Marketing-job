"use client"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  TrendingUpIcon,
  GlobeIcon,
  Building2Icon,
  BriefcaseIcon,
  SendIcon,
} from "lucide-react"

export function SectionCards({
  activeFilter = "all",
  onSelectFilter,
  totalJobs = 105,
}: {
  activeFilter?: string
  onSelectFilter?: (filter: string) => void
  totalJobs?: number
}) {
  return (
    <div className="grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @4xl/main:grid-cols-3 @6xl/main:grid-cols-5 dark:*:data-[slot=card]:bg-card">
      {/* 1. All Jobs */}
      <Card
        onClick={() => onSelectFilter?.("all")}
        className={`@container/card cursor-pointer transition-all hover:border-primary/40 hover:shadow-md ${
          activeFilter === "all" ? "ring-2 ring-primary border-primary shadow-sm" : ""
        }`}
      >
        <CardHeader>
          <CardDescription>Live Public Jobs</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {totalJobs}+
          </CardTitle>
          <CardAction>
            <Badge variant="outline" className="text-emerald-600 border-emerald-500/20 bg-emerald-500/10">
              <TrendingUpIcon />
              Real-time
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Active roles indexed{" "}
            <BriefcaseIcon className="size-4 text-primary" />
          </div>
          <div className="text-muted-foreground text-xs">
            Click to view Public Jobs directory
          </div>
        </CardFooter>
      </Card>

      {/* 2. Job Submissions Tracker */}
      <Card
        onClick={() => onSelectFilter?.("submissions")}
        className={`@container/card cursor-pointer transition-all hover:border-primary/40 hover:shadow-md ${
          activeFilter === "submissions" ? "ring-2 ring-primary border-primary shadow-sm" : ""
        }`}
      >
        <CardHeader>
          <CardDescription>Job Submissions</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl text-primary">
            Tracker
          </CardTitle>
          <CardAction>
            <Badge variant="outline" className="text-emerald-600 border-emerald-500/20 bg-emerald-500/10">
              <SendIcon className="size-3 mr-1" />
              Live
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Candidate submissions & vendors{" "}
            <SendIcon className="size-4 text-primary" />
          </div>
          <div className="text-muted-foreground text-xs">
            Click to manage Submissions & Interviews
          </div>
        </CardFooter>
      </Card>

      {/* 3. Bench Candidates */}
      <Card
        onClick={() => onSelectFilter?.("candidates")}
        className={`@container/card cursor-pointer transition-all hover:border-primary/40 hover:shadow-md ${
          activeFilter === "candidates" ? "ring-2 ring-primary border-primary shadow-sm" : ""
        }`}
      >
        <CardHeader>
          <CardDescription>Bench Candidates</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            USA Bench
          </CardTitle>
          <CardAction>
            <Badge variant="outline" className="text-blue-600 border-blue-500/20 bg-blue-500/10">
              <BriefcaseIcon />
              Active
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Profiles ready to market{" "}
            <BriefcaseIcon className="size-4 text-primary" />
          </div>
          <div className="text-muted-foreground text-xs">Click to view Bench Candidates</div>
        </CardFooter>
      </Card>

      {/* 4. Greenhouse */}
      <Card
        onClick={() => onSelectFilter?.("greenhouse")}
        className={`@container/card cursor-pointer transition-all hover:border-primary/40 hover:shadow-md ${
          activeFilter === "greenhouse" ? "ring-2 ring-primary border-primary shadow-sm" : ""
        }`}
      >
        <CardHeader>
          <CardDescription>Greenhouse Boards</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            6 Connected
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <Building2Icon />
              Public REST
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Keyless API sync{" "}
            <Building2Icon className="size-4" />
          </div>
          <div className="text-muted-foreground text-xs">
            Click to open Greenhouse Portals
          </div>
        </CardFooter>
      </Card>

      {/* 5. Ashby */}
      <Card
        onClick={() => onSelectFilter?.("ashby")}
        className={`@container/card cursor-pointer transition-all hover:border-primary/40 hover:shadow-md ${
          activeFilter === "ashby" ? "ring-2 ring-primary border-primary shadow-sm" : ""
        }`}
      >
        <CardHeader>
          <CardDescription>Ashby Boards</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            Active Sync
          </CardTitle>
          <CardAction>
            <Badge variant="outline">
              <GlobeIcon />
              Ashby HQ
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            High-growth startups{" "}
            <GlobeIcon className="size-4" />
          </div>
          <div className="text-muted-foreground text-xs">Click to open Ashby Portals</div>
        </CardFooter>
      </Card>
    </div>
  )
}
