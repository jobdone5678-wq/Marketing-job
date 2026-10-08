"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeftIcon,
  Building2Icon,
  MapPinIcon,
  BriefcaseIcon,
  CalendarIcon,
  ExternalLinkIcon,
  Share2Icon,
  CheckCircle2Icon,
  Loader2Icon,
  FileTextIcon,
  Code2Icon,
  SparklesIcon,
  ShieldCheckIcon,
  GlobeIcon,
  CopyIcon,
  CheckIcon,
  SendIcon,
} from "lucide-react";
import { toast } from "sonner";
import { SkillMatcherDialog } from "@/components/skill-matcher-dialog";

export default function JobDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const rawId = params?.id as string;
  const board = searchParams.get("board") || "stripe";
  const portal = searchParams.get("portal") || "Greenhouse";
  const titleHint = searchParams.get("title") || "";
  const locationHint = searchParams.get("location") || "";

  const [job, setJob] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [showJson, setShowJson] = React.useState(false);
  const [copiedLink, setCopiedLink] = React.useState(false);
  const [matcherOpen, setMatcherOpen] = React.useState(false);

  React.useEffect(() => {
    if (!rawId) return;

    setLoading(true);
    setError(null);

    const queryParams = new URLSearchParams({
      board: board,
      jobId: rawId,
      title: titleHint,
      location: locationHint,
      portal: portal.toLowerCase(),
    });

    fetch(`/api/greenhouse?${queryParams.toString()}`)
      .then(async (res) => {
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Job could not be retrieved (${res.status})`);
        }
        return res.json();
      })
      .then((data) => {
        if (data.job) {
          setJob(data.job);
        } else {
          throw new Error("Job details not found in API response");
        }
      })
      .catch((err: any) => {
        setError(err.message || "Failed to load job details");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [rawId, board, portal, titleHint, locationHint]);

  const handleCopyLink = () => {
    if (typeof window !== "undefined") {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      toast.success("Job link copied to clipboard!");
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const isGreenhouse = portal.toLowerCase().includes("greenhouse") || !portal;
  const companyName = job?.company_name || board.charAt(0).toUpperCase() + board.slice(1);
  const jobTitle = job?.title || titleHint || "Job Details";
  const department =
    job?.departments?.[0]?.name ||
    (typeof job?.departments === "string" ? job.departments : "Engineering & Technology");
  const location =
    job?.location?.name ||
    job?.location ||
    locationHint ||
    "Remote / Unspecified";
  const externalApplyUrl =
    job?.absolute_url ||
    job?.jobUrl ||
    (isGreenhouse
      ? `https://boards.greenhouse.io/${board}/jobs/${job?.id || rawId}`
      : `https://jobs.ashbyhq.com/${board}/${job?.id || rawId}`);

  return (
    <div className="flex-1 w-full max-w-6xl mx-auto px-4 py-6 md:px-6 md:py-8 space-y-6">
      {/* Top Navigation Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push("/dashboard/jobs")}
            className="gap-2 cursor-pointer hover:bg-muted"
          >
            <ArrowLeftIcon className="size-4" />
            Back to Jobs
          </Button>
          <div className="hidden sm:flex items-center text-xs text-muted-foreground gap-1.5">
            <Link href="/dashboard/jobs" className="hover:text-foreground transition-colors">
              Public Jobs Directory
            </Link>
            <span>/</span>
            <span className="text-foreground font-medium">{companyName}</span>
            <span>/</span>
            <span className="truncate max-w-[200px]">{jobTitle}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMatcherOpen(true)}
            className="gap-1.5 cursor-pointer text-xs border-primary/40 text-primary hover:bg-primary/5 shadow-2xs font-medium"
          >
            <SparklesIcon className="size-3.5" />
            Match Candidate & Pitch
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyLink}
            className="gap-1.5 cursor-pointer text-xs"
          >
            {copiedLink ? (
              <CheckIcon className="size-3.5 text-emerald-500" />
            ) : (
              <Share2Icon className="size-3.5" />
            )}
            {copiedLink ? "Copied" : "Share"}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowJson(!showJson)}
            className="gap-1.5 cursor-pointer text-xs"
          >
            <Code2Icon className="size-3.5" />
            {showJson ? "Hide API JSON" : "View API JSON"}
          </Button>

          <Button
            render={<a href={externalApplyUrl} target="_blank" rel="noopener noreferrer" />}
            className="gap-2 cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90"
            size="sm"
          >
            Apply Now
            <ExternalLinkIcon className="size-3.5" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-muted-foreground">
          <Loader2Icon className="size-8 animate-spin text-primary" />
          <div className="text-center space-y-1">
            <p className="text-sm font-medium text-foreground">Fetching complete job description...</p>
            <p className="text-xs text-muted-foreground">
              Calling {isGreenhouse ? "Greenhouse" : "Ashby"} public API (<code>content=true</code>)
            </p>
          </div>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-8 text-center space-y-4 max-w-lg mx-auto">
          <div className="size-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
            <BriefcaseIcon className="size-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-foreground">Opening Not Found</h3>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
          <div className="pt-2 flex justify-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/dashboard/jobs")}
              className="cursor-pointer"
            >
              Return to Directory
            </Button>
            <Button
              render={<a href={externalApplyUrl} target="_blank" rel="noopener noreferrer" />}
              size="sm"
              className="gap-1.5 cursor-pointer"
            >
              Check Company Careers
              <ExternalLinkIcon className="size-3.5" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Hero Job Header */}
          <div className="rounded-xl border bg-card p-6 md:p-8 shadow-xs space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="secondary"
                className={
                  isGreenhouse
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5"
                    : "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 px-2.5 py-0.5"
                }
              >
                {portal} ATS Board
              </Badge>
              <Badge variant="outline" className="text-muted-foreground gap-1.5 px-2.5 py-0.5">
                <CheckCircle2Icon className="size-3 text-emerald-500" />
                Live Active Opening
              </Badge>
              <Badge variant="outline" className="text-muted-foreground text-xs">
                ID: {job?.id || rawId}
              </Badge>
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-foreground">
                {jobTitle}
              </h1>

              <div className="flex flex-wrap items-center gap-y-2 gap-x-4 text-sm text-muted-foreground pt-1">
                <span className="flex items-center gap-1.5 font-medium text-foreground">
                  <Building2Icon className="size-4 text-primary" />
                  {companyName}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1.5">
                  <MapPinIcon className="size-4" />
                  {location}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1.5">
                  <BriefcaseIcon className="size-4" />
                  {department}
                </span>
                {job?.updated_at && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-1.5">
                      <CalendarIcon className="size-4" />
                      Updated {new Date(job.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button
                size="lg"
                onClick={() => {
                  router.push(
                    `/dashboard/submissions/new?company=${encodeURIComponent(companyName)}&title=${encodeURIComponent(jobTitle)}&url=${encodeURIComponent(externalApplyUrl)}&portal=${encodeURIComponent(portal)}&location=${encodeURIComponent(location)}`
                  );
                }}
                className="gap-2 cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
              >
                <SendIcon className="size-4" />
                Submit Bench Candidate
              </Button>

              <Button
                render={<a href={externalApplyUrl} target="_blank" rel="noopener noreferrer" />}
                variant="outline"
                size="lg"
                className="gap-2 cursor-pointer"
              >
                Open on {portal}
                <ExternalLinkIcon className="size-4" />
              </Button>

              <Button
                variant="outline"
                size="lg"
                onClick={handleCopyLink}
                className="gap-2 cursor-pointer"
              >
                {copiedLink ? <CheckIcon className="size-4 text-emerald-500" /> : <CopyIcon className="size-4" />}
                {copiedLink ? "Link Copied!" : "Copy Job Link"}
              </Button>
            </div>
          </div>

          {/* Raw JSON Developer View */}
          {showJson && (
            <div className="rounded-xl border bg-muted/40 p-4 space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground font-mono">
                <span>Direct ATS Payload: application/json</span>
                <span>Endpoint: {job?.endpoint_called || `/api/greenhouse?board=${board}&jobId=${rawId}`}</span>
              </div>
              <pre className="p-4 rounded-lg bg-card text-xs font-mono overflow-x-auto max-h-[400px] border">
                {JSON.stringify(job, null, 2)}
              </pre>
            </div>
          )}

          {/* Main Content & Sidebar Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            {/* Left 2 Columns: Full Job Description */}
            <div className="lg:col-span-2 rounded-xl border bg-card p-6 sm:p-8 shadow-xs space-y-6">
              <div className="flex items-center gap-2 pb-4 border-b">
                <FileTextIcon className="size-5 text-primary" />
                <h2 className="text-lg font-semibold text-foreground">
                  Job Description & Qualifications
                </h2>
              </div>

              {job?.content ? (
                <div
                  className="job-description-body text-sm leading-relaxed text-foreground/90 space-y-4
                    [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mt-6 [&_h1]:mb-3 [&_h1]:text-foreground
                    [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mt-6 [&_h2]:mb-3 [&_h2]:text-foreground
                    [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:text-foreground
                    [&_h4]:text-sm [&_h4]:font-semibold [&_h4]:mt-3 [&_h4]:mb-1 [&_h4]:text-foreground
                    [&_p]:mb-3 [&_p]:leading-relaxed
                    [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-2 [&_ul]:my-3
                    [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-2 [&_ol]:my-3
                    [&_li]:text-sm [&_li]:leading-normal
                    [&_strong]:font-semibold [&_strong]:text-foreground
                    [&_b]:font-semibold [&_b]:text-foreground
                    [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-primary/80
                    [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-4 [&_blockquote]:italic
                    [&_hr]:border-border [&_hr]:my-6"
                  dangerouslySetInnerHTML={{ __html: job.content }}
                />
              ) : (
                <div className="rounded-lg border bg-muted/30 p-6 text-center space-y-3">
                  <p className="text-sm text-foreground">
                    This role from <strong>{companyName}</strong> is actively recruiting.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Location: <strong>{location}</strong> • Department: <strong>{department}</strong>
                  </p>
                  <Button
                    render={<a href={externalApplyUrl} target="_blank" rel="noopener noreferrer" />}
                    variant="outline"
                    size="sm"
                    className="gap-2 cursor-pointer"
                  >
                    Open Official Application Page
                    <ExternalLinkIcon className="size-3.5" />
                  </Button>
                </div>
              )}

              <Separator className="my-6" />

              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-lg bg-muted/30 border">
                <div>
                  <h4 className="text-sm font-semibold text-foreground">Ready to take the next step?</h4>
                  <p className="text-xs text-muted-foreground">Submit your application directly through {companyName}&apos;s verified portal.</p>
                </div>
                <Button
                  render={<a href={externalApplyUrl} target="_blank" rel="noopener noreferrer" />}
                  className="gap-1.5 cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
                  size="sm"
                >
                  Apply Now
                  <ExternalLinkIcon className="size-3.5" />
                </Button>
              </div>
            </div>

            {/* Right Column: Sidebar Meta Cards */}
            <div className="space-y-6">
              {/* Job Summary Card */}
              <div className="rounded-xl border bg-card p-5 shadow-xs space-y-4">
                <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
                  <ShieldCheckIcon className="size-4 text-emerald-500" />
                  Job Overview
                </h3>

                <div className="space-y-3 text-xs">
                  <div className="flex justify-between items-center py-1.5 border-b">
                    <span className="text-muted-foreground">Company</span>
                    <span className="font-medium text-foreground">{companyName}</span>
                  </div>
                  <div className="flex justify-between items-center py-1.5 border-b">
                    <span className="text-muted-foreground">ATS Platform</span>
                    <Badge variant="outline" className="text-[11px] font-normal">
                      {portal}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center py-1.5 border-b">
                    <span className="text-muted-foreground">Location</span>
                    <span className="font-medium text-foreground text-right max-w-[160px] truncate" title={location}>
                      {location}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1.5 border-b">
                    <span className="text-muted-foreground">Department</span>
                    <span className="font-medium text-foreground text-right max-w-[160px] truncate" title={department}>
                      {department}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1.5 border-b">
                    <span className="text-muted-foreground">Job ID</span>
                    <span className="font-mono text-foreground">{job?.id || rawId}</span>
                  </div>
                  <div className="flex justify-between items-center py-1.5">
                    <span className="text-muted-foreground">Public Status</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                      <span className="size-1.5 rounded-full bg-emerald-500" />
                      Active / Open
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Button
                    onClick={() => {
                      router.push(
                        `/dashboard/submissions/new?company=${encodeURIComponent(companyName)}&title=${encodeURIComponent(jobTitle)}&url=${encodeURIComponent(externalApplyUrl)}&portal=${encodeURIComponent(portal)}&location=${encodeURIComponent(location)}`
                      );
                    }}
                    className="w-full gap-2 cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90"
                    size="sm"
                  >
                    <SendIcon className="size-3.5" />
                    Submit Bench Candidate
                  </Button>

                  <Button
                    render={<a href={externalApplyUrl} target="_blank" rel="noopener noreferrer" />}
                    variant="outline"
                    className="w-full gap-2 cursor-pointer"
                    size="sm"
                  >
                    Apply Directly
                    <ExternalLinkIcon className="size-3.5" />
                  </Button>
                </div>
              </div>

              {/* API Integration Endpoint Card */}
              <div className="rounded-xl border bg-card p-5 shadow-xs space-y-3 text-xs">
                <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
                  <GlobeIcon className="size-4 text-primary" />
                  REST API Endpoint
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  Indexed directly from {portal}&apos;s public REST API without authentication or scraping.
                </p>
                <div className="bg-muted p-2 rounded font-mono text-[11px] break-all border">
                  GET https://boards-api.greenhouse.io/v1/boards/{board}/jobs/{job?.id || rawId}
                </div>
              </div>

              {/* Quick Navigation Card */}
              <div className="rounded-xl border bg-card p-5 shadow-xs space-y-3 text-xs">
                <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
                  <SparklesIcon className="size-4 text-primary" />
                  Explore More Portals
                </h3>
                <div className="space-y-2 pt-1">
                  <Link
                    href="/dashboard/jobs"
                    className="block p-2 rounded-md hover:bg-muted font-medium text-foreground transition-colors"
                  >
                    ← All Public Tech Jobs
                  </Link>
                  <Link
                    href="/dashboard/greenhouse"
                    className="block p-2 rounded-md hover:bg-muted font-medium text-foreground transition-colors"
                  >
                    🏢 Greenhouse ATS Explorer
                  </Link>
                  <Link
                    href="/dashboard/ashby"
                    className="block p-2 rounded-md hover:bg-muted font-medium text-foreground transition-colors"
                  >
                    ⚡ Ashby High-Growth Startups
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bench Candidate Matcher & Pitch Generator Dialog */}
      <SkillMatcherDialog
        open={matcherOpen}
        onOpenChange={setMatcherOpen}
        job={{
          id: rawId,
          title: jobTitle,
          company: companyName,
          description: job?.content || job?.description || "",
          location: location,
          portal: portal,
          url: job?.absolute_url || job?.url || "",
        }}
      />
    </div>
  );
}
