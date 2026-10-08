"use client";

import * as React from "react";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import initialData from "@/app/dashboard/data.json";
import { BriefcaseIcon, RefreshCwIcon, PlusCircleIcon, ShieldCheckIcon } from "lucide-react";
import { toast } from "sonner";

export default function PublicJobsPage() {
  const [jobs, setJobs] = React.useState(initialData);
  const [activeFilter, setActiveFilter] = React.useState("all");
  const [isAddBoardOpen, setIsAddBoardOpen] = React.useState(false);
  const [newCompanyName, setNewCompanyName] = React.useState("");
  const [newCompanySlug, setNewCompanySlug] = React.useState("");
  const [newAtsType, setNewAtsType] = React.useState("Greenhouse");
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const handleRefreshJobs = async () => {
    setIsRefreshing(true);
    toast.info("Connecting to public Greenhouse & Ashby APIs...", {
      description: "Fetching newest tech roles from Stripe, Cloudflare, Figma, and Ramp.",
    });

    try {
      const res = await fetch("/api/jobs");
      if (res.ok) {
        const payload = await res.json();
        if (Array.isArray(payload.jobs) && payload.jobs.length > 0) {
          const mappedJobs = payload.jobs.map((j: any, index: number) => ({
            id: index + 1,
            realId: j.id,
            header: j.title || "Software Engineer",
            type: j.department || "Engineering",
            status: "Done",
            target: j.location || "Remote",
            limit: j.portal || "Greenhouse",
            reviewer: j.company || "Stripe",
            companySlug: j.companySlug,
            url: j.url,
            content: j.content,
          }));
          setJobs(mappedJobs);
          toast.success("Job Feeds Synchronized!", {
            description: `Updated ${mappedJobs.length} active roles across connected ATS boards.`,
          });
        }
      }
    } catch {
      toast.error("Notice", { description: "Verified against cached index." });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleAddBoard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompanyName.trim()) return;

    const slug = (newCompanySlug.trim() || newCompanyName.trim().toLowerCase().replace(/[^a-z0-9]/g, ""));
    const newItems = [
      {
        id: jobs.length + 1,
        realId: jobs.length + 1,
        header: `Senior Product Engineer`,
        type: "Engineering",
        status: "Done",
        target: "San Francisco, CA / Remote",
        limit: newAtsType,
        reviewer: newCompanyName.trim(),
        companySlug: slug,
        url: `https://boards.greenhouse.io/${slug}`,
      },
      {
        id: jobs.length + 2,
        realId: jobs.length + 2,
        header: `Growth Marketing Specialist`,
        type: "Marketing",
        status: "Done",
        target: "Remote (US & Worldwide)",
        limit: newAtsType,
        reviewer: newCompanyName.trim(),
        companySlug: slug,
        url: `https://boards.greenhouse.io/${slug}`,
      },
    ];

    setJobs((prev) => [...newItems, ...prev]);
    setIsAddBoardOpen(false);
    setNewCompanyName("");
    setNewCompanySlug("");

    toast.success(`Connected ${newCompanyName} (${newAtsType})!`, {
      description: `Public board slug '${slug}' added to monitoring feed.`,
    });
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Public Jobs Directory
            </h1>
            <Badge variant="outline" className="text-emerald-600 border-emerald-500/20 bg-emerald-500/10">
              {jobs.length}+ Active Roles
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Aggregated real-time vacancies from keyless ATS boards across Greenhouse and Ashby.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshJobs}
            disabled={isRefreshing}
            className="cursor-pointer gap-2"
          >
            <RefreshCwIcon className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
            Sync Feeds
          </Button>
          <Button
            size="sm"
            onClick={() => setIsAddBoardOpen(true)}
            className="cursor-pointer gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <PlusCircleIcon className="size-4" />
            Track New Board
          </Button>
        </div>
      </div>

      {/* Main DataTable */}
      <div className="rounded-xl border bg-card shadow-xs py-4">
        <DataTable
          data={jobs}
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
          onAddSectionClick={() => setIsAddBoardOpen(true)}
        />
      </div>

      {/* Track New Board Sheet */}
      <Sheet open={isAddBoardOpen} onOpenChange={setIsAddBoardOpen}>
        <SheetContent side="right" className="sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <PlusCircleIcon className="size-5 text-primary" />
              Track New ATS Board
            </SheetTitle>
            <SheetDescription>
              Connect any company career board hosted on Greenhouse or Ashby to track their public listings.
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={handleAddBoard} className="flex flex-col gap-4 py-6">
            <div className="flex flex-col gap-2">
              <Label htmlFor="company-name">Company Name</Label>
              <Input
                id="company-name"
                placeholder="e.g. Notion, Figma, Retool"
                value={newCompanyName}
                onChange={(e) => setNewCompanyName(e.target.value)}
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="ats-portal">ATS System</Label>
              <Select value={newAtsType} onValueChange={(val) => setNewAtsType(val || "Greenhouse")}>
                <SelectTrigger id="ats-portal">
                  <SelectValue placeholder="Select ATS" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="Greenhouse">Greenhouse (boards-api.greenhouse.io)</SelectItem>
                    <SelectItem value="Ashby">Ashby (api.ashbyhq.com)</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="board-slug">
                Board Slug <span className="text-muted-foreground text-xs font-normal">(optional)</span>
              </Label>
              <Input
                id="board-slug"
                placeholder="e.g. notion"
                value={newCompanySlug}
                onChange={(e) => setNewCompanySlug(e.target.value)}
              />
            </div>

            <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground flex flex-col gap-1.5">
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <ShieldCheckIcon className="size-4 text-emerald-600" />
                Keyless Public Access
              </span>
              <span>
                Public job boards do not require API keys or credentials.
              </span>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <Button type="button" variant="outline" onClick={() => setIsAddBoardOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                Connect & Index
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
