"use client";

import * as React from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Building2Icon,
  SearchIcon,
  RefreshCwIcon,
  ExternalLinkIcon,
  Code2Icon,
  CheckCircle2Icon,
  GlobeIcon,
  FileCodeIcon,
  ArrowRightIcon,
  LayersIcon,
} from "lucide-react";
import { toast } from "sonner";

const POPULAR_BOARDS = [
  { name: "Stripe", slug: "stripe" },
  { name: "Anthropic", slug: "anthropic" },
  { name: "GitLab", slug: "gitlab" },
  { name: "Airbnb", slug: "airbnb" },
  { name: "Figma", slug: "figma" },
  { name: "Cloudflare", slug: "cloudflare" },
  { name: "Reddit", slug: "reddit" },
  { name: "Datadog", slug: "datadog" },
  { name: "Coinbase", slug: "coinbase" },
  { name: "Discord", slug: "discord" },
  { name: "Dropbox", slug: "dropbox" },
  { name: "Twitch", slug: "twitch" },
];

export default function GreenhousePage() {
  const [selectedBoard, setSelectedBoard] = React.useState("stripe");
  const [customInput, setCustomInput] = React.useState("");
  const [withContent, setWithContent] = React.useState(false); // false = GET /jobs, true = GET /jobs?content=true
  const [jobs, setJobs] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [endpointCalled, setEndpointCalled] = React.useState("");
  const [responseTime, setResponseTime] = React.useState<number | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [showRawJson, setShowRawJson] = React.useState(false);

  // Fetch jobs from /api/greenhouse
  const fetchGreenhouseJobs = React.useCallback(
    async (boardSlug: string, includeContent: boolean) => {
      setLoading(true);
      const startTime = performance.now();

      try {
        const queryUrl = `/api/greenhouse?board=${encodeURIComponent(
          boardSlug
        )}&content=${includeContent ? "true" : "false"}`;
        const res = await fetch(queryUrl);
        const elapsed = Math.round(performance.now() - startTime);
        setResponseTime(elapsed);

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          toast.error("Greenhouse API Error", {
            description: errData.error || `Status code ${res.status}`,
          });
          setJobs([]);
          return;
        }

        const data = await res.json();
        setJobs(data.jobs || []);
        setEndpointCalled(data.endpoint_called || "");

        toast.success(`Loaded ${data.jobs?.length || 0} jobs from ${boardSlug}!`, {
          description: `Endpoint: ${includeContent ? "GET /jobs?content=true" : "GET /jobs"} (${elapsed}ms)`,
        });
      } catch (err: any) {
        toast.error("Failed to query Greenhouse API", {
          description: err?.message || String(err),
        });
        setJobs([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  React.useEffect(() => {
    fetchGreenhouseJobs(selectedBoard, withContent);
  }, [selectedBoard, withContent, fetchGreenhouseJobs]);

  const handleSelectBoard = (slug: string) => {
    setSelectedBoard(slug);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customInput.trim()) return;
    const cleanSlug = customInput.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "");
    setSelectedBoard(cleanSlug);
    setCustomInput("");
  };

  const filteredJobs = React.useMemo(() => {
    if (!searchQuery.trim()) return jobs;
    const q = searchQuery.toLowerCase();
    return jobs.filter(
      (j) =>
        j.title?.toLowerCase().includes(q) ||
        j.departments?.[0]?.name?.toLowerCase().includes(q) ||
        j.location?.name?.toLowerCase().includes(q) ||
        j.id?.toString().includes(q)
    );
  }, [jobs, searchQuery]);


  return (
    <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
      {/* 1. Header & Context */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Greenhouse Public Boards Explorer
              </h1>
              <Badge variant="outline" className="text-emerald-600 border-emerald-500/20 bg-emerald-500/10 gap-1">
                <CheckCircle2Icon className="size-3" />
                Live Keyless REST API
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Query official Greenhouse job boards in real-time. Test both standard index and full description endpoints.
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchGreenhouseJobs(selectedBoard, withContent)}
            disabled={loading}
            className="cursor-pointer gap-2"
          >
            <RefreshCwIcon className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh Feed
          </Button>
        </div>

        {/* Company Quick-Pill Switcher */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2">
          <span className="text-xs font-medium text-muted-foreground mr-1">Popular Boards:</span>
          {POPULAR_BOARDS.map((company) => {
            const isSelected = selectedBoard === company.slug;
            return (
              <button
                key={company.slug}
                type="button"
                onClick={() => handleSelectBoard(company.slug)}
                className={`px-2.5 py-1 text-xs rounded-full border transition-all cursor-pointer ${
                  isSelected
                    ? "bg-primary text-primary-foreground border-primary font-medium shadow-xs"
                    : "bg-muted/50 hover:bg-muted text-foreground border-transparent"
                }`}
              >
                {company.name}
              </button>
            );
          })}

          {/* Custom Slug Input */}
          <form onSubmit={handleCustomSubmit} className="flex items-center gap-1 ml-auto">
            <Input
              placeholder="Custom slug (e.g. notion)..."
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              className="h-7 text-xs w-44 bg-background"
            />
            <Button type="submit" size="sm" variant="secondary" className="h-7 text-xs px-2.5">
              Load
            </Button>
          </form>
        </div>
      </div>

      {/* 2. Endpoint Selector & Mode Switcher */}
      <div className="rounded-xl border bg-card p-4 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b pb-4">
          <div className="space-y-1">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Endpoint Selection
            </div>
            <div className="text-sm font-medium text-foreground">
              Select Greenhouse REST API mode to query
            </div>
          </div>

          <div className="flex items-center rounded-lg border bg-muted p-1 text-xs">
            <button
              type="button"
              onClick={() => setWithContent(false)}
              className={`px-3 py-1.5 rounded-md font-medium transition-all cursor-pointer ${
                !withContent
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <code>GET /jobs</code> (Standard List)
            </button>
            <button
              type="button"
              onClick={() => setWithContent(true)}
              className={`px-3 py-1.5 rounded-md font-medium transition-all cursor-pointer ${
                withContent
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <code>GET /jobs?content=true</code> (Full Details)
            </button>
          </div>
        </div>

        {/* Live URL Callout */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-lg bg-muted/40 p-3 border">
          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-500/20">
                GET
              </span>
              <code className="text-xs font-mono text-foreground break-all">
                {endpointCalled || `https://boards-api.greenhouse.io/v1/boards/${selectedBoard}/jobs${withContent ? "?content=true" : ""}`}
              </code>
            </div>
            <span className="text-[11px] text-muted-foreground">
              {withContent
                ? "Returns complete job descriptions including rendered HTML content, requirements & responsibilities."
                : "Returns compact array of open positions (id, title, department, location, apply link)."}
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {responseTime !== null && (
              <span className="text-xs text-muted-foreground tabular-nums">
                Latency: <strong className="text-foreground">{responseTime}ms</strong>
              </span>
            )}
            <Badge variant="secondary" className="font-mono">
              {jobs.length} Positions
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowRawJson(!showRawJson)}
              className="text-xs h-7 gap-1"
            >
              <Code2Icon className="size-3" />
              {showRawJson ? "Hide JSON" : "Raw JSON"}
            </Button>
          </div>
        </div>

        {/* Raw JSON Accordion */}
        {showRawJson && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Live Greenhouse JSON Payload (First 3 Items Preview)</span>
              <span className="font-mono">application/json</span>
            </div>
            <pre className="p-4 rounded-lg bg-muted text-xs font-mono overflow-x-auto max-h-[300px] border">
              {JSON.stringify(jobs.slice(0, 3), null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* 3. Filter & Table of Results */}
      <div className="rounded-xl border bg-card shadow-xs overflow-hidden">
        {/* Table Search Toolbar */}
        <div className="p-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative w-full max-w-sm">
            <SearchIcon className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder={`Search ${selectedBoard} jobs by title, department, location...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs bg-background"
            />
          </div>

          <div className="text-xs text-muted-foreground">
            Showing <strong className="text-foreground">{filteredJobs.length}</strong> of {jobs.length} jobs from <strong>{selectedBoard}</strong>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="w-[80px]">ID</TableHead>
                <TableHead>Job Title</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="w-[120px]">Content Loaded</TableHead>
                <TableHead className="text-right w-[150px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCwIcon className="size-5 animate-spin text-primary" />
                      <span className="text-xs">Querying Greenhouse API ({selectedBoard})...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredJobs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground text-xs">
                    No roles found matching "{searchQuery}".
                  </TableCell>
                </TableRow>
              ) : (
                filteredJobs.slice(0, 50).map((j) => {
                  const department = j.departments?.[0]?.name || "General";
                  const location = j.location?.name || "Remote / Unspecified";
                  const hasHtml = Boolean(j.content);

                  return (
                    <TableRow key={j.id} className="hover:bg-muted/30">
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {j.id}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/dashboard/jobs/${j.id}?board=${encodeURIComponent(selectedBoard)}&portal=Greenhouse&title=${encodeURIComponent(j.title)}&location=${encodeURIComponent(location)}`}
                          className="font-medium text-foreground hover:text-primary hover:underline text-left cursor-pointer transition-colors block"
                        >
                          {j.title}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs font-normal">
                          {department}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={location}>
                        {location}
                      </TableCell>
                      <TableCell>
                        {hasHtml ? (
                          <Badge variant="secondary" className="text-[11px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            HTML Ready
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[11px] text-muted-foreground">
                            Indexed
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            render={<Link href={`/dashboard/jobs/${j.id}?board=${encodeURIComponent(selectedBoard)}&portal=Greenhouse&title=${encodeURIComponent(j.title)}&location=${encodeURIComponent(location)}`} />}
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs px-2 cursor-pointer"
                          >
                            Details
                          </Button>
                          <Button
                            render={<a href={j.absolute_url} target="_blank" rel="noopener noreferrer" />}
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs px-2 cursor-pointer"
                          >
                            <ExternalLinkIcon className="size-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* 4. Technical Reference & Documentation */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border bg-card p-4 space-y-2">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <Building2Icon className="size-4 text-emerald-600" />
            1. Standard List Endpoint
          </div>
          <code className="block bg-muted p-2 rounded text-xs font-mono break-all border">
            GET https://boards-api.greenhouse.io/v1/boards/{`{board_token}`}/jobs
          </code>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Fastest method to retrieve all open jobs for an organization without authorization. Ideal for caching boards, counting openings, and building filterable lists.
          </p>
        </div>

        <div className="rounded-xl border bg-card p-4 space-y-2">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <LayersIcon className="size-4 text-purple-600" />
            2. Detailed Content Endpoint
          </div>
          <code className="block bg-muted p-2 rounded text-xs font-mono break-all border">
            GET https://boards-api.greenhouse.io/v1/boards/{`{board_token}`}/jobs?content=true
          </code>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Appends the complete job description in the <code>content</code> field as escaped HTML. Enables displaying the full job posting without scraping or external redirects.
          </p>
        </div>
      </div>
    </div>
  );
}
