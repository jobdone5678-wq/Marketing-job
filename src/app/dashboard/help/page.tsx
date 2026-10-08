"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Building2Icon, GlobeIcon, Code2Icon, CheckCircle2Icon, BookOpenIcon, ExternalLinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function HelpPage() {
  return (
    <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              API Documentation & Help
            </h1>
            <Badge variant="outline" className="text-emerald-600 border-emerald-500/20 bg-emerald-500/10 gap-1">
              <CheckCircle2Icon className="size-3" />
              Public REST APIs
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Complete technical guide on querying Greenhouse and Ashby job boards without API keys.
          </p>
        </div>

        <Button render={<Link href="/dashboard/greenhouse" />} size="sm" className="gap-2">
          Open Greenhouse Explorer
          <ExternalLinkIcon className="size-3.5" />
        </Button>
      </div>

      {/* 1. Greenhouse Endpoints Section */}
      <div className="rounded-xl border bg-card p-6 shadow-xs space-y-6">
        <div className="flex items-center gap-2 font-semibold text-base text-foreground">
          <Building2Icon className="size-5 text-emerald-600" />
          Greenhouse Public Job Board API
        </div>
        <Separator />

        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-1">
              1. Standard Job List (Summary)
            </h3>
            <p className="text-xs text-muted-foreground mb-2">
              Returns all active jobs for an organization. Fast payload, ideal for table listing.
            </p>
            <div className="rounded-lg bg-muted p-3 border font-mono text-xs overflow-x-auto">
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">GET</span> https://boards-api.greenhouse.io/v1/boards/<strong>{`{board_token}`}</strong>/jobs
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-foreground mb-1">
              2. Detailed Jobs List with Content (Full HTML)
            </h3>
            <p className="text-xs text-muted-foreground mb-2">
              Appends the full HTML description in the <code>content</code> attribute of each job item.
            </p>
            <div className="rounded-lg bg-muted p-3 border font-mono text-xs overflow-x-auto">
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">GET</span> https://boards-api.greenhouse.io/v1/boards/<strong>{`{board_token}`}</strong>/jobs?content=true
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-foreground mb-1">
              3. Single Job Details Endpoint
            </h3>
            <p className="text-xs text-muted-foreground mb-2">
              Fetches full metadata and HTML description for a specific job ID.
            </p>
            <div className="rounded-lg bg-muted p-3 border font-mono text-xs overflow-x-auto">
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">GET</span> https://boards-api.greenhouse.io/v1/boards/<strong>{`{board_token}`}</strong>/jobs/<strong>{`{job_id}`}</strong>
            </div>
          </div>
        </div>

        {/* Code Snippets */}
        <div className="space-y-3 pt-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Code Example (JavaScript / TypeScript Fetch)
          </div>
          <pre className="p-4 rounded-lg bg-muted text-xs font-mono overflow-x-auto border">
{`// 1. Fetch compact jobs
const res = await fetch("https://boards-api.greenhouse.io/v1/boards/stripe/jobs");
const { jobs } = await res.json();

// 2. Fetch jobs with complete HTML descriptions
const resWithContent = await fetch("https://boards-api.greenhouse.io/v1/boards/stripe/jobs?content=true");
const data = await resWithContent.json();
console.log(data.jobs[0].content); // Decoded HTML description`}
          </pre>
        </div>
      </div>

      {/* 2. Ashby Endpoints Section */}
      <div className="rounded-xl border bg-card p-6 shadow-xs space-y-6">
        <div className="flex items-center gap-2 font-semibold text-base text-foreground">
          <GlobeIcon className="size-5 text-purple-600" />
          Ashby Public Posting API
        </div>
        <Separator />

        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-1">
              Ashby Job Board Postings
            </h3>
            <p className="text-xs text-muted-foreground mb-2">
              Ashby provides an unauthenticated endpoint returning all active roles for companies using Ashby ATS.
            </p>
            <div className="rounded-lg bg-muted p-3 border font-mono text-xs overflow-x-auto">
              <span className="text-purple-600 dark:text-purple-400 font-bold">GET</span> https://api.ashbyhq.com/posting-api/job-board/<strong>{`{company_slug}`}</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
