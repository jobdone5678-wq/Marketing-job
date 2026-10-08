"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { SectionCards } from "@/components/section-cards";
import { ChartAreaInteractive } from "@/components/chart-area-interactive";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import initialData from "@/app/dashboard/data.json";
import { getSubmissions } from "@/lib/submissions";
import type { JobSubmission } from "@/types/database";
import {
  SendIcon,
  ArrowRightIcon,
  CalendarIcon,
  Building2Icon,
  SparklesIcon,
  CheckCircle2Icon,
  UsersIcon,
  BriefcaseIcon,
} from "lucide-react";

export function DashboardOverview() {
  const router = useRouter();
  const [recentSubmissions, setRecentSubmissions] = React.useState<JobSubmission[]>([]);

  React.useEffect(() => {
    getSubmissions().then((data) => {
      setRecentSubmissions(data.slice(0, 4));
    });
  }, []);

  const handleCardClick = (filter: string) => {
    if (filter === "submissions") {
      router.push("/dashboard/submissions");
    } else if (filter === "greenhouse") {
      router.push("/dashboard/greenhouse");
    } else if (filter === "ashby") {
      router.push("/dashboard/ashby");
    } else if (filter === "candidates") {
      router.push("/dashboard/candidates");
    } else {
      router.push("/dashboard/jobs");
    }
  };

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <SectionCards
          activeFilter="all"
          onSelectFilter={handleCardClick}
          totalJobs={initialData.length}
        />

        {/* Live Submissions Strip */}
        <div className="px-4 lg:px-6">
          <div className="rounded-xl border bg-card p-5 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-base text-foreground">
                    Active Job Submissions & Interview Pipeline
                  </h3>
                  <Badge variant="outline" className="text-emerald-600 border-emerald-500/20 bg-emerald-500/10 text-xs">
                    Live
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Latest client marketing submissions with real-time status and duplicate safeguards.
                </p>
              </div>

              <Button
                size="sm"
                variant="outline"
                render={<Link href="/dashboard/submissions" />}
                className="text-xs gap-1.5 cursor-pointer hover:border-primary/50"
              >
                <span>Open Full Tracker</span>
                <ArrowRightIcon className="size-3.5" />
              </Button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-3">
              {recentSubmissions.map((sub) => {
                const isInterview =
                  sub.status === "Interview_Scheduled" ||
                  sub.status === "Round_1" ||
                  sub.status === "Round_2";
                const isOffer = sub.status === "Offer_Received";

                return (
                  <div
                    key={sub.id}
                    onClick={() => router.push("/dashboard/submissions")}
                    className="p-3 rounded-lg border bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-semibold text-xs text-foreground truncate">
                        {sub.company_name}
                      </span>
                      <Badge
                        variant="secondary"
                        className={`text-[10px] px-1.5 py-0 ${
                          isOffer
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                            : isInterview
                            ? "bg-purple-500/15 text-purple-700 dark:text-purple-300"
                            : ""
                        }`}
                      >
                        {sub.status.replace(/_/g, " ")}
                      </Badge>
                    </div>

                    <div className="text-[11px] text-muted-foreground font-medium truncate">
                      {sub.job_title}
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t">
                      <span>{sub.candidate?.full_name || "Tarun Pothukuri"}</span>
                      <span className="font-semibold text-foreground">{sub.submitted_rate || "$65/hr"}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="px-4 lg:px-6">
          <ChartAreaInteractive />
        </div>
      </div>
    </div>
  );
}
