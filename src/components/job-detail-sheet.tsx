"use client";

import * as React from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  ExternalLinkIcon,
  Building2Icon,
  MapPinIcon,
  BriefcaseIcon,
  CalendarIcon,
  Code2Icon,
  FileTextIcon,
  Loader2Icon,
  CheckCircle2Icon,
} from "lucide-react";

export interface JobDetailData {
  id: string | number;
  title: string;
  company: string;
  companySlug?: string;
  portal?: string;
  location?: string;
  department?: string;
  type?: string;
  url?: string;
  updatedAt?: string;
  content?: string;
  requisitionId?: string;
  internalId?: string | number;
}

export function JobDetailSheet({
  job,
  open,
  onOpenChange,
}: {
  job: JobDetailData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [activeTab, setActiveTab] = React.useState<"description" | "meta" | "raw">("description");
  const [detailedContent, setDetailedContent] = React.useState<string | null>(null);
  const [rawJobPayload, setRawJobPayload] = React.useState<any>(null);
  const [loadingContent, setLoadingContent] = React.useState(false);

  React.useEffect(() => {
    if (!open || !job) {
      setDetailedContent(null);
      setRawJobPayload(null);
      return;
    }

    if (job.content) {
      setDetailedContent(job.content);
      return;
    }

    // Fetch full details via Greenhouse/Ashby API proxy
    const boardSlug = job.companySlug || job.company?.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (boardSlug) {
      setLoadingContent(true);
      const params = new URLSearchParams({
        board: boardSlug,
        jobId: String(job.id || ""),
        title: job.title || "",
        location: job.location || "",
        portal: job.portal?.toLowerCase() || "greenhouse",
      });

      fetch(`/api/greenhouse?${params.toString()}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.job?.content) {
            setDetailedContent(data.job.content);
          }
          setRawJobPayload(data.job || data);
        })
        .catch(() => {
          // Keep fallback
        })
        .finally(() => {
          setLoadingContent(false);
        });
    }
  }, [open, job]);

  if (!job) return null;

  const isGreenhouse = job.portal === "Greenhouse" || !job.portal;
  const externalApplyUrl =
    rawJobPayload?.absolute_url ||
    rawJobPayload?.jobUrl ||
    job.url ||
    (isGreenhouse
      ? `https://boards.greenhouse.io/${job.companySlug || "jobs"}/jobs/${rawJobPayload?.id || job.id}`
      : `https://jobs.ashbyhq.com/${job.companySlug || "jobs"}/${rawJobPayload?.id || job.id}`);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col p-0 overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b bg-card">
          <div className="flex items-center gap-2 mb-2">
            <Badge
              variant="secondary"
              className={
                isGreenhouse
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                  : "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20"
              }
            >
              {job.portal || "Greenhouse"}
            </Badge>
            <Badge variant="outline" className="text-muted-foreground gap-1">
              <CheckCircle2Icon className="size-3 text-emerald-500" />
              Live Public Opening
            </Badge>
          </div>

          <SheetTitle className="text-xl font-semibold leading-snug text-foreground">
            {job.title}
          </SheetTitle>

          <SheetDescription className="flex flex-wrap items-center gap-y-1 gap-x-3 text-xs text-muted-foreground mt-2">
            <span className="flex items-center gap-1 font-medium text-foreground">
              <Building2Icon className="size-3.5 text-primary" />
              {job.company}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <MapPinIcon className="size-3.5" />
              {job.location || "Remote / Unspecified"}
            </span>
            {job.department && (
              <>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <BriefcaseIcon className="size-3.5" />
                  {job.department}
                </span>
              </>
            )}
          </SheetDescription>

          <div className="flex items-center gap-3 mt-4">
            <Button
              render={<a href={externalApplyUrl} target="_blank" rel="noopener noreferrer" />}
              className="gap-2 cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90"
              size="sm"
            >
              Apply on {job.portal || "Greenhouse"}
              <ExternalLinkIcon className="size-3.5" />
            </Button>
            <div className="flex items-center rounded-lg border bg-muted p-1 text-xs">
              <button
                type="button"
                onClick={() => setActiveTab("description")}
                className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                  activeTab === "description" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <FileTextIcon className="size-3 inline mr-1" />
                Description
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("meta")}
                className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                  activeTab === "meta" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Metadata
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("raw")}
                className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                  activeTab === "raw" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Code2Icon className="size-3 inline mr-1" />
                API JSON
              </button>
            </div>
          </div>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeTab === "description" && (
            <div>
              {loadingContent ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                  <Loader2Icon className="size-6 animate-spin text-primary" />
                  <span className="text-xs">
                    Fetching full job content from Greenhouse API (<code>content=true</code>)...
                  </span>
                </div>
              ) : detailedContent ? (
                <div
                  className="text-sm leading-relaxed text-foreground/90 space-y-4
                    [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mt-6 [&_h1]:mb-2 [&_h1]:text-foreground
                    [&_h2]:text-base [&_h2]:font-bold [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-foreground
                    [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-1.5 [&_h3]:text-foreground
                    [&_h4]:text-xs [&_h4]:font-semibold [&_h4]:mt-3 [&_h4]:mb-1 [&_h4]:text-foreground
                    [&_p]:mb-3 [&_p]:leading-relaxed
                    [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_ul]:my-2
                    [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1.5 [&_ol]:my-2
                    [&_li]:text-sm [&_li]:leading-normal
                    [&_strong]:font-semibold [&_strong]:text-foreground
                    [&_b]:font-semibold [&_b]:text-foreground
                    [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-primary/80
                    [&_blockquote]:border-l-2 [&_blockquote]:border-muted-foreground/30 [&_blockquote]:pl-4 [&_blockquote]:italic
                    [&_hr]:border-border [&_hr]:my-4"
                  dangerouslySetInnerHTML={{ __html: detailedContent }}
                />
              ) : (
                <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground space-y-3">
                  <p>
                    This is an active job listing from <strong>{job.company}</strong> indexed via public REST endpoints.
                  </p>
                  <p className="text-xs">
                    Location: <strong>{job.location}</strong>
                    <br />
                    Department: <strong>{job.department}</strong>
                    <br />
                    Posting Portal: <strong>{job.portal || "Greenhouse"}</strong>
                  </p>
                  <Button
                    render={<a href={externalApplyUrl} target="_blank" rel="noopener noreferrer" className="gap-1.5" />}
                    variant="outline"
                    size="sm"
                  >
                    Open Full Listing on {job.portal || "Greenhouse"}
                    <ExternalLinkIcon className="size-3.5" />
                  </Button>
                </div>
              )}
            </div>
          )}

          {activeTab === "meta" && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border p-3 bg-muted/20">
                  <div className="text-xs text-muted-foreground">Job ID</div>
                  <div className="font-mono text-sm font-semibold">{job.id}</div>
                </div>
                <div className="rounded-lg border p-3 bg-muted/20">
                  <div className="text-xs text-muted-foreground">ATS Platform</div>
                  <div className="text-sm font-semibold">{job.portal || "Greenhouse"}</div>
                </div>
                <div className="rounded-lg border p-3 bg-muted/20">
                  <div className="text-xs text-muted-foreground">Company Board</div>
                  <div className="text-sm font-semibold">{job.company}</div>
                </div>
                <div className="rounded-lg border p-3 bg-muted/20">
                  <div className="text-xs text-muted-foreground">Department</div>
                  <div className="text-sm font-semibold">{job.department || "General"}</div>
                </div>
              </div>

              <div className="rounded-lg border p-3 bg-muted/20 space-y-1">
                <div className="text-xs text-muted-foreground">Greenhouse Direct REST Endpoint</div>
                <code className="block bg-background p-2 rounded text-xs font-mono break-all border">
                  GET https://boards-api.greenhouse.io/v1/boards/{job.companySlug || "stripe"}/jobs/{job.id}
                </code>
              </div>
            </div>
          )}

          {activeTab === "raw" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Greenhouse API Response</span>
                <span className="font-mono">application/json</span>
              </div>
              <pre className="p-4 rounded-lg bg-muted text-xs font-mono overflow-x-auto max-h-[450px] border">
                {JSON.stringify(rawJobPayload || job, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
