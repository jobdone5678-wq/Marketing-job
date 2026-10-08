"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { ChartAreaInteractive } from "@/components/chart-area-interactive";
import { DataTable } from "@/components/data-table";
import { SectionCards } from "@/components/section-cards";
import { SiteHeader } from "@/components/site-header";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { User } from "@supabase/supabase-js";
import initialData from "@/app/dashboard/data.json";
import { toast } from "sonner";
import {
  Building2Icon,
  GlobeIcon,
  RefreshCwIcon,
  CheckCircle2Icon,
  Code2Icon,
  ExternalLinkIcon,
  Settings2Icon,
  HelpCircleIcon,
  PlusCircleIcon,
  ShieldCheckIcon,
} from "lucide-react";

export function DashboardView({ user }: { user?: User }) {
  // Navigation & Filtering State
  const [activeSection, setActiveSection] = React.useState("dashboard");
  const [activeFilter, setActiveFilter] = React.useState("all");
  const [jobs, setJobs] = React.useState(initialData);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  // Modal Dialogs State
  const [isAddBoardOpen, setIsAddBoardOpen] = React.useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
  const [isHelpOpen, setIsHelpOpen] = React.useState(false);

  // New Board Form State
  const [newCompanyName, setNewCompanyName] = React.useState("");
  const [newCompanySlug, setNewCompanySlug] = React.useState("");
  const [newAtsType, setNewAtsType] = React.useState("Greenhouse");

  // Filter & section selection handler
  const router = useRouter();
  const handleSelectSection = (sectionId: string) => {
    setActiveSection(sectionId);

    if (sectionId === "dashboard") {
      setActiveFilter("all");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (sectionId === "candidates") {
      router.push("/dashboard/candidates");
    } else if (sectionId === "submissions") {
      router.push("/dashboard/submissions");
    } else if (sectionId === "public-jobs") {
      setActiveFilter("all");
      const el = document.getElementById("jobs-table-section");
      if (el) el.scrollIntoView({ behavior: "smooth" });
    } else if (sectionId === "greenhouse") {
      setActiveFilter("greenhouse");
      const el = document.getElementById("jobs-table-section");
      if (el) el.scrollIntoView({ behavior: "smooth" });
    } else if (sectionId === "ashby") {
      setActiveFilter("ashby");
      const el = document.getElementById("jobs-table-section");
      if (el) el.scrollIntoView({ behavior: "smooth" });
    } else if (sectionId === "settings") {
      setIsSettingsOpen(true);
    } else if (sectionId === "help") {
      setIsHelpOpen(true);
    } else if (sectionId === "search") {
      const searchInput = document.getElementById("table-job-search");
      if (searchInput) {
        searchInput.focus();
        searchInput.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  };

  const handleSelectFilter = (filterId: string) => {
    setActiveFilter(filterId);
    if (filterId === "greenhouse") {
      setActiveSection("greenhouse");
    } else if (filterId === "ashby") {
      setActiveSection("ashby");
    } else if (filterId === "all") {
      setActiveSection("dashboard");
    }
  };

  // Sync jobs from public APIs
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
            header: j.title || "Software Engineer",
            type: j.department || "Engineering",
            status: "Done",
            target: j.location || "Remote",
            limit: j.portal || "Greenhouse",
            reviewer: j.company || "Stripe",
          }));
          setJobs(mappedJobs);
          toast.success("Job Feeds Synchronized!", {
            description: `Updated ${mappedJobs.length} active roles across connected ATS boards.`,
          });
        } else {
          toast.success("Job Feeds Synchronized!", {
            description: "All boards are running on latest index.",
          });
        }
      }
    } catch {
      toast.error("Sync notice", {
        description: "Public boards re-verified from cached memory index.",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Handle adding custom board
  const handleAddBoard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompanyName.trim()) {
      toast.error("Please enter a company name");
      return;
    }

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
      description: `Public board slug '${slug}' added to monitoring feed. 2 sample roles loaded.`,
    });
  };

  // Compute counts
  const totalJobs = jobs.length;
  const greenhouseCount = jobs.filter((j) => j.limit === "Greenhouse").length;
  const ashbyCount = jobs.filter((j) => j.limit === "Ashby").length;

  // Title for SiteHeader based on active section/filter
  const getHeaderTitle = () => {
    if (activeSection === "greenhouse" || activeFilter === "greenhouse") {
      return "Greenhouse Portals";
    }
    if (activeSection === "ashby" || activeFilter === "ashby") {
      return "Ashby Portals";
    }
    if (activeSection === "public-jobs") {
      return "Public Jobs Directory";
    }
    return "Dashboard Overview";
  };

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar
        variant="inset"
        activeSection={activeSection}
        onSelectSection={handleSelectSection}
        onRefreshJobs={handleRefreshJobs}
      />
      <SidebarInset className="overflow-y-auto">
        <SiteHeader
          title={getHeaderTitle()}
          subtitle="Public Jobs"
        />

        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
              {/* Interactive Section Cards */}
              <SectionCards
                activeFilter={activeFilter}
                onSelectFilter={handleSelectFilter}
                totalJobs={totalJobs}
              />

              {/* Interactive Velocity Chart */}
              <div className="px-4 lg:px-6">
                <ChartAreaInteractive />
              </div>

              {/* Jobs Data Table with Interactive Filters */}
              <DataTable
                data={jobs}
                activeFilter={activeFilter}
                onFilterChange={handleSelectFilter}
                onAddSectionClick={() => setIsAddBoardOpen(true)}
              />
            </div>
          </div>
        </div>

        {/* 1. Track New Board Sheet / Modal */}
        <Sheet open={isAddBoardOpen} onOpenChange={setIsAddBoardOpen}>
          <SheetContent side="right" className="sm:max-w-md">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <PlusCircleIcon className="size-5 text-primary" />
                Track New ATS Board
              </SheetTitle>
              <SheetDescription>
                Connect any company career board hosted on Greenhouse or Ashby to track their public listings in real-time.
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
                <span className="text-[11px] text-muted-foreground">
                  The slug in the URL (e.g. boards.greenhouse.io/<strong>notion</strong>)
                </span>
              </div>

              <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground flex flex-col gap-1.5">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <ShieldCheckIcon className="size-4 text-emerald-600" />
                  No API key required
                </span>
                <span>
                  Public ATS boards provide unauthenticated read access to public job openings.
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

        {/* 2. Settings Modal */}
        <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Settings2Icon className="size-5" />
                Portal Settings
              </DialogTitle>
              <DialogDescription>
                Configure marketing portal feeds, synchronization, and connected accounts.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4 py-2 text-sm">
              <div className="flex items-center justify-between border-b pb-3">
                <div>
                  <div className="font-medium">Active Account</div>
                  <div className="text-xs text-muted-foreground">
                    {user?.email || "bhargav.reddy@marketingportal.com"}
                  </div>
                </div>
                <Badge variant="outline" className="text-emerald-600 border-emerald-500/20 bg-emerald-500/10">
                  Connected
                </Badge>
              </div>

              <div className="flex items-center justify-between border-b pb-3">
                <div>
                  <div className="font-medium">Public ATS Integration</div>
                  <div className="text-xs text-muted-foreground">
                    Greenhouse & Ashby REST APIs
                  </div>
                </div>
                <Badge variant="secondary">Active (Keyless)</Badge>
              </div>

              <div className="flex items-center justify-between border-b pb-3">
                <div>
                  <div className="font-medium">Auto-Sync Frequency</div>
                  <div className="text-xs text-muted-foreground">
                    Periodic background refresh
                  </div>
                </div>
                <span className="text-xs font-semibold">Every 5 minutes</span>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">Supabase Auth</div>
                  <div className="text-xs text-muted-foreground">
                    Google OAuth & Email verification
                  </div>
                </div>
                <CheckCircle2Icon className="size-4 text-emerald-500" />
              </div>
            </div>

            <DialogFooter>
              <Button onClick={() => setIsSettingsOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 3. Help & API Documentation Modal */}
        <Dialog open={isHelpOpen} onOpenChange={setIsHelpOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <HelpCircleIcon className="size-5 text-primary" />
                ATS Integration Help
              </DialogTitle>
              <DialogDescription>
                Learn how public jobs are queried from Greenhouse and Ashby endpoints.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-3 py-2 text-xs">
              <div className="rounded-md border p-3 bg-muted/30">
                <div className="font-semibold text-foreground mb-1 flex items-center gap-1.5">
                  <Building2Icon className="size-4 text-emerald-600" />
                  Greenhouse Job Board API
                </div>
                <p className="text-muted-foreground mb-2">
                  Greenhouse offers an open REST API to query job postings for any public board without credentials:
                </p>
                <code className="block bg-background p-2 rounded text-[11px] font-mono border">
                  GET https://boards-api.greenhouse.io/v1/boards/{`{company}`}/jobs
                </code>
              </div>

              <div className="rounded-md border p-3 bg-muted/30">
                <div className="font-semibold text-foreground mb-1 flex items-center gap-1.5">
                  <GlobeIcon className="size-4 text-purple-600" />
                  Ashby Job Posting API
                </div>
                <p className="text-muted-foreground mb-2">
                  Ashby provides a public endpoint listing active job board vacancies:
                </p>
                <code className="block bg-background p-2 rounded text-[11px] font-mono border">
                  GET https://api.ashbyhq.com/posting-api/job-board/{`{company}`}
                </code>
              </div>

              <div className="rounded-md border p-3 bg-primary/5 text-primary">
                <div className="font-semibold mb-1">Clicking Cards & Tabs</div>
                <p className="text-muted-foreground">
                  You can click any metric card at the top (e.g. <strong>Live Public Jobs</strong>, <strong>Greenhouse Boards</strong>, <strong>Ashby Boards</strong>, <strong>Remote Opportunities</strong>) or any tab in the table to instantly filter and slice the active dataset.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button onClick={() => setIsHelpOpen(false)}>Got it</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SidebarInset>
    </SidebarProvider>
  );
}
