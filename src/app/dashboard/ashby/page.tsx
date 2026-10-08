"use client";

import * as React from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  GlobeIcon,
  SearchIcon,
  RefreshCwIcon,
  ExternalLinkIcon,
  CheckCircle2Icon,
  LayersIcon,
} from "lucide-react";
import { toast } from "sonner";

const ASHBY_BOARDS = [
  { name: "Ramp", slug: "ramp" },
  { name: "Linear", slug: "linear" },
  { name: "Vercel", slug: "vercel" },
  { name: "Loom", slug: "loom" },
  { name: "Retool", slug: "retool" },
];

export default function AshbyPage() {
  const [selectedBoard, setSelectedBoard] = React.useState("ramp");
  const [jobs, setJobs] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [customSlug, setCustomSlug] = React.useState("");

  const fetchAshbyJobs = React.useCallback(async (slug: string) => {
    setLoading(true);
    try {
      const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${slug}`, {
        cache: "no-store",
      });

      if (!res.ok) {
        toast.error("Ashby Board Notice", {
          description: `Unable to query ${slug} from Ashby public API (Status ${res.status}).`,
        });
        setJobs([]);
        return;
      }

      const data = await res.json();
      const rawJobs = Array.isArray(data.jobs) ? data.jobs : [];

      const formatted = rawJobs.map((j: any) => ({
        id: j.id,
        title: j.title || "Software Engineer",
        department: j.departmentName || "Engineering",
        location: j.locationName || "Remote / Unspecified",
        type: j.employmentType || "Full-time",
        url: j.jobUrl || `https://jobs.ashbyhq.com/${slug}/${j.id}`,
        content: j.descriptionHtml || j.descriptionPlain,
      }));

      setJobs(formatted);
      toast.success(`Loaded ${formatted.length} jobs from ${slug}!`, {
        description: "Indexed via Ashby Posting API.",
      });
    } catch {
      toast.error("Ashby query error", {
        description: "Failed to connect to Ashby API endpoint.",
      });
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchAshbyJobs(selectedBoard);
  }, [selectedBoard, fetchAshbyJobs]);

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customSlug.trim()) return;
    const clean = customSlug.trim().toLowerCase().replace(/[^a-z0-9-_]/g, "");
    setSelectedBoard(clean);
    setCustomSlug("");
  };

  const filtered = React.useMemo(() => {
    if (!searchQuery.trim()) return jobs;
    const q = searchQuery.toLowerCase();
    return jobs.filter(
      (j) =>
        j.title.toLowerCase().includes(q) ||
        j.department.toLowerCase().includes(q) ||
        j.location.toLowerCase().includes(q)
    );
  }, [jobs, searchQuery]);


  return (
    <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Ashby Portals Explorer
              </h1>
              <Badge variant="outline" className="text-purple-600 border-purple-500/20 bg-purple-500/10 gap-1">
                <GlobeIcon className="size-3" />
                Ashby HQ REST API
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Direct connection to Ashby's posting API (<code>https://api.ashbyhq.com/posting-api/job-board/{`{company}`}</code>).
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchAshbyJobs(selectedBoard)}
            disabled={loading}
            className="cursor-pointer gap-2"
          >
            <RefreshCwIcon className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh Feed
          </Button>
        </div>

        {/* Company Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2">
          <span className="text-xs font-medium text-muted-foreground mr-1">Ashby Boards:</span>
          {ASHBY_BOARDS.map((company) => {
            const isSelected = selectedBoard === company.slug;
            return (
              <button
                key={company.slug}
                type="button"
                onClick={() => setSelectedBoard(company.slug)}
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

          <form onSubmit={handleCustomSubmit} className="flex items-center gap-1 ml-auto">
            <Input
              placeholder="Custom slug (e.g. linear)..."
              value={customSlug}
              onChange={(e) => setCustomSlug(e.target.value)}
              className="h-7 text-xs w-44 bg-background"
            />
            <Button type="submit" size="sm" variant="secondary" className="h-7 text-xs px-2.5">
              Load
            </Button>
          </form>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card shadow-xs overflow-hidden">
        <div className="p-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative w-full max-w-sm">
            <SearchIcon className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder={`Search ${selectedBoard} jobs...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs bg-background"
            />
          </div>

          <div className="text-xs text-muted-foreground">
            Showing <strong className="text-foreground">{filtered.length}</strong> jobs from <strong>{selectedBoard}</strong>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead>Job Title</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCwIcon className="size-5 animate-spin text-primary" />
                      <span className="text-xs">Querying Ashby API ({selectedBoard})...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground text-xs">
                    No roles found on {selectedBoard} board.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((j) => (
                  <TableRow key={j.id} className="hover:bg-muted/30">
                    <TableCell>
                      <Link
                        href={`/dashboard/jobs/${j.id}?board=${encodeURIComponent(selectedBoard)}&portal=Ashby&title=${encodeURIComponent(j.title)}&location=${encodeURIComponent(j.location || "")}`}
                        className="font-medium text-foreground hover:text-primary hover:underline text-left cursor-pointer transition-colors block"
                      >
                        {j.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs font-normal">
                        {j.department}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {j.location}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {j.type}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          render={<Link href={`/dashboard/jobs/${j.id}?board=${encodeURIComponent(selectedBoard)}&portal=Ashby&title=${encodeURIComponent(j.title)}&location=${encodeURIComponent(j.location || "")}`} />}
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs px-2 cursor-pointer"
                        >
                          Details
                        </Button>
                        <Button
                          render={<a href={j.url} target="_blank" rel="noopener noreferrer" />}
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs px-2 cursor-pointer"
                        >
                          <ExternalLinkIcon className="size-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
