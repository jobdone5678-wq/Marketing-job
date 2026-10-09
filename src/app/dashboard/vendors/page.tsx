"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  getVendors,
  deleteVendor,
  type Vendor,
} from "@/lib/vendors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Building2Icon,
  PlusIcon,
  SearchIcon,
  RefreshCwIcon,
  DownloadIcon,
  ExternalLinkIcon,
  PhoneIcon,
  MailIcon,
  MapPinIcon,
  ShieldCheckIcon,
  SendIcon,
  StarIcon,
  FilterIcon,
  Trash2Icon,
  CheckCircle2Icon,
  ClockIcon,
  TrendingUpIcon,
} from "lucide-react";

export default function VendorsPage() {
  const router = useRouter();
  const [vendors, setVendors] = React.useState<Vendor[]>([]);
  const [loading, setLoading] = React.useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedTierFilter, setSelectedTierFilter] = React.useState("all");
  const [selectedResponseFilter, setSelectedResponseFilter] = React.useState("all");

  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      const data = await getVendors();
      setVendors(data);
    } catch {
      toast.error("Failed to load vendors directory");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void Promise.resolve().then(loadData);
  }, [loadData]);

  // Statistics
  const stats = React.useMemo(() => {
    const total = vendors.length;
    const tier1 = vendors.filter((v) => v.tier === "Tier 1").length;
    const preferred = vendors.filter((v) => v.tier === "Preferred").length;
    const totalSubs = vendors.reduce((acc, v) => acc + v.total_submissions, 0);
    const totalInterviews = vendors.reduce((acc, v) => acc + v.active_interviews, 0);
    const totalPlacements = vendors.reduce((acc, v) => acc + v.placements_count, 0);

    return { total, tier1, preferred, totalSubs, totalInterviews, totalPlacements };
  }, [vendors]);

  // Filtered vendors
  const filteredVendors = React.useMemo(() => {
    return vendors.filter((v) => {
      if (selectedTierFilter !== "all" && v.tier !== selectedTierFilter) {
        return false;
      }
      if (selectedResponseFilter !== "all" && v.responsiveness !== selectedResponseFilter) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const name = v.name.toLowerCase();
        const hq = v.headquarters.toLowerCase();
        const notes = (v.notes || "").toLowerCase();
        const specs = v.specializations.join(" ").toLowerCase();
        const contacts = v.contacts
          .map((c) => `${c.name} ${c.email} ${c.phone}`)
          .join(" ")
          .toLowerCase();

        return (
          name.includes(q) ||
          hq.includes(q) ||
          notes.includes(q) ||
          specs.includes(q) ||
          contacts.includes(q)
        );
      }

      return true;
    });
  }, [vendors, selectedTierFilter, selectedResponseFilter, searchQuery]);

  // Export CSV
  const handleExportCSV = () => {
    if (filteredVendors.length === 0) {
      toast.error("No vendors to export.");
      return;
    }

    const headers = [
      "Vendor Name",
      "Tier",
      "Headquarters",
      "Payment Terms",
      "Agreement Status",
      "Responsiveness",
      "Rating",
      "Total Submissions",
      "Active Interviews",
      "Placements",
      "Primary Contact Name",
      "Primary Contact Email",
      "Primary Contact Phone",
      "Specializations",
      "Notes",
    ];

    const rows = filteredVendors.map((v) => {
      const c = v.contacts[0];
      return [
        `"${v.name}"`,
        `"${v.tier}"`,
        `"${v.headquarters}"`,
        `"${v.payment_terms}"`,
        `"${v.agreement_status}"`,
        `"${v.responsiveness}"`,
        `"${v.rating}"`,
        `"${v.total_submissions}"`,
        `"${v.active_interviews}"`,
        `"${v.placements_count}"`,
        `"${c?.name || ""}"`,
        `"${c?.email || ""}"`,
        `"${c?.phone || ""}"`,
        `"${v.specializations.join(", ")}"`,
        `"${(v.notes || "").replace(/"/g, '""')}"`,
      ];
    });

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const dateStr = new Date().toISOString().split("T")[0];
    link.setAttribute("download", `prime_vendors_directory_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success("Vendor Directory Exported!", {
      description: `Downloaded ${filteredVendors.length} staffing partner records.`,
    });
  };

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`Are you sure you want to remove ${name} from your CRM directory?`)) {
      const { success, error } = await deleteVendor(id);
      if (success) {
        toast.success(`Removed ${name}`);
        setVendors((prev) => prev.filter((v) => v.id !== id));
      } else {
        toast.error("Failed to delete", { description: error });
      }
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6 max-w-[1600px] w-full mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                Prime Vendors Directory
              </h1>
              <Badge
                variant="outline"
                className="bg-primary/10 text-primary border-primary/20 gap-1 text-xs"
              >
                <Building2Icon className="size-3" />
                Staffing Partner CRM
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Centralized USA implementation partners, Tier-1 staffing firms, recruiter contacts, and payment terms for bench marketing.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              className="text-xs gap-1.5 cursor-pointer hover:border-primary/50"
            >
              <DownloadIcon className="size-3.5" />
              Export Directory (CSV)
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              disabled={loading}
              className="text-xs gap-1.5 cursor-pointer"
            >
              <RefreshCwIcon className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>

            <Link href="/dashboard/vendors/new">
              <Button
                size="sm"
                className="text-xs gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer shadow-xs"
              >
                <PlusIcon className="size-3.5" />
                Add Prime Vendor
              </Button>
            </Link>
          </div>
        </div>

        {/* METRICS CARDS */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 pt-2">
          <Card className="p-3.5">
            <div className="text-xs text-muted-foreground font-medium flex items-center justify-between">
              <span>Prime Vendors</span>
              <Building2Icon className="size-3.5 text-primary" />
            </div>
            <div className="text-2xl font-bold mt-1 text-foreground">{stats.total}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Active partners</div>
          </Card>

          <Card className="p-3.5 border-emerald-500/20 bg-emerald-500/5">
            <div className="text-xs text-emerald-700 dark:text-emerald-300 font-medium flex items-center justify-between">
              <span>Tier 1 Partners</span>
              <ShieldCheckIcon className="size-3.5 text-emerald-600" />
            </div>
            <div className="text-2xl font-bold mt-1 text-emerald-700 dark:text-emerald-300">
              {stats.tier1}
            </div>
            <div className="text-[11px] text-emerald-600/80 mt-0.5">Direct prime accounts</div>
          </Card>

          <Card className="p-3.5 border-blue-500/20 bg-blue-500/5">
            <div className="text-xs text-blue-700 dark:text-blue-300 font-medium flex items-center justify-between">
              <span>Preferred Partners</span>
              <StarIcon className="size-3.5 text-blue-600" />
            </div>
            <div className="text-2xl font-bold mt-1 text-blue-700 dark:text-blue-300">
              {stats.preferred}
            </div>
            <div className="text-[11px] text-blue-600/80 mt-0.5">High volume accounts</div>
          </Card>

          <Card className="p-3.5">
            <div className="text-xs text-muted-foreground font-medium flex items-center justify-between">
              <span>Total Submissions</span>
              <SendIcon className="size-3.5 text-muted-foreground" />
            </div>
            <div className="text-2xl font-bold mt-1 text-foreground">{stats.totalSubs}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Across all roles</div>
          </Card>

          <Card className="p-3.5 border-purple-500/20 bg-purple-500/5">
            <div className="text-xs text-purple-700 dark:text-purple-300 font-medium flex items-center justify-between">
              <span>Active Interviews</span>
              <ClockIcon className="size-3.5 text-purple-600" />
            </div>
            <div className="text-2xl font-bold mt-1 text-purple-700 dark:text-purple-300">
              {stats.totalInterviews}
            </div>
            <div className="text-[11px] text-purple-600/80 mt-0.5">In vendor pipeline</div>
          </Card>

          <Card className="p-3.5 border-emerald-500/20 bg-emerald-500/5">
            <div className="text-xs text-emerald-700 dark:text-emerald-300 font-medium flex items-center justify-between">
              <span>Total Placements</span>
              <CheckCircle2Icon className="size-3.5 text-emerald-600" />
            </div>
            <div className="text-2xl font-bold mt-1 text-emerald-700 dark:text-emerald-300">
              {stats.totalPlacements}
            </div>
            <div className="text-[11px] text-emerald-600/80 mt-0.5">Successful closures</div>
          </Card>
        </div>
      </div>

      {/* FILTER TOOLBAR */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <SearchIcon className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search vendor name, recruiter contact, headquarters, MSP accounts, or tech stack..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-xs bg-background"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* Tier Filter */}
          <Select
            value={selectedTierFilter}
            onValueChange={(val) => setSelectedTierFilter(val ?? "all")}
          >
            <SelectTrigger className="h-8 text-xs w-[140px] bg-background">
              <SelectValue placeholder="All Tiers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">
                All Tiers
              </SelectItem>
              <SelectItem value="Tier 1" className="text-xs">
                Tier 1
              </SelectItem>
              <SelectItem value="Preferred" className="text-xs">
                Preferred
              </SelectItem>
              <SelectItem value="Tier 2" className="text-xs">
                Tier 2
              </SelectItem>
              <SelectItem value="Tier 3" className="text-xs">
                Tier 3
              </SelectItem>
            </SelectContent>
          </Select>

          {/* Responsiveness */}
          <Select
            value={selectedResponseFilter}
            onValueChange={(val) => setSelectedResponseFilter(val ?? "all")}
          >
            <SelectTrigger className="h-8 text-xs w-[140px] bg-background">
              <SelectValue placeholder="Responsiveness" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">
                All Velocity
              </SelectItem>
              <SelectItem value="High" className="text-xs">
                High Velocity
              </SelectItem>
              <SelectItem value="Medium" className="text-xs">
                Medium
              </SelectItem>
              <SelectItem value="Low" className="text-xs">
                Low
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* VENDOR CARDS GRID */}
      {loading ? (
        <div className="h-48 flex flex-col items-center justify-center gap-2 border rounded-xl bg-card">
          <RefreshCwIcon className="size-6 animate-spin text-primary" />
          <span className="text-xs text-muted-foreground">Loading vendor partners...</span>
        </div>
      ) : filteredVendors.length === 0 ? (
        <div className="h-48 flex flex-col items-center justify-center gap-2 border rounded-xl bg-card text-center p-6">
          <Building2Icon className="size-8 text-muted-foreground/60" />
          <h3 className="text-sm font-semibold">No staffing partners match your criteria</h3>
          <p className="text-xs text-muted-foreground">
            Try adjusting your search terms or filters.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setSearchQuery("");
              setSelectedTierFilter("all");
              setSelectedResponseFilter("all");
            }}
            className="text-xs mt-1"
          >
            Reset Filters
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredVendors.map((vendor) => {
            const primaryContact = vendor.contacts[0];

            return (
              <Card
                key={vendor.id}
                className="hover:border-primary/40 hover:shadow-sm transition-all flex flex-col justify-between"
              >
                <CardHeader className="pb-3 border-b">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base font-bold text-foreground">
                          {vendor.name}
                        </CardTitle>
                        {vendor.website && (
                          <a
                            href={vendor.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-primary transition-colors"
                            title="Visit website"
                          >
                            <ExternalLinkIcon className="size-3" />
                          </a>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                        <MapPinIcon className="size-3" />
                        <span>{vendor.headquarters}</span>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <Badge
                        variant="outline"
                        className={
                          vendor.tier === "Tier 1"
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px]"
                            : vendor.tier === "Preferred"
                            ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 text-[10px]"
                            : "bg-muted text-muted-foreground text-[10px]"
                        }
                      >
                        {vendor.tier}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground font-medium">
                        ⭐ {vendor.rating} / 5.0
                      </span>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-3.5 pb-2 space-y-3.5 flex-1">
                  {/* Recruiter Contact Box */}
                  {primaryContact && (
                    <div className="p-3 rounded-lg border bg-muted/20 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-foreground">
                          {primaryContact.name}
                        </span>
                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4">
                          Recruiter
                        </Badge>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {primaryContact.title}
                      </div>

                      <div className="pt-1 flex flex-col gap-1 text-[11px] text-muted-foreground">
                        <a
                          href={`mailto:${primaryContact.email}`}
                          className="flex items-center gap-1.5 hover:text-primary transition-colors truncate"
                        >
                          <MailIcon className="size-3 text-primary shrink-0" />
                          <span className="truncate">{primaryContact.email}</span>
                        </a>
                        <a
                          href={`tel:${primaryContact.phone}`}
                          className="flex items-center gap-1.5 hover:text-primary transition-colors"
                        >
                          <PhoneIcon className="size-3 text-primary shrink-0" />
                          <span>{primaryContact.phone}</span>
                        </a>
                      </div>
                    </div>
                  )}

                  {/* Commercial Terms */}
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="p-2 rounded border bg-card">
                      <div className="text-muted-foreground">Terms:</div>
                      <div className="font-semibold text-foreground mt-0.5">
                        {vendor.payment_terms}
                      </div>
                    </div>
                    <div className="p-2 rounded border bg-card">
                      <div className="text-muted-foreground">Agreement:</div>
                      <div className="font-semibold text-foreground mt-0.5">
                        {vendor.agreement_status}
                      </div>
                    </div>
                  </div>

                  {/* Specializations Pills */}
                  <div className="flex flex-wrap gap-1">
                    {vendor.specializations.map((spec) => (
                      <Badge
                        key={spec}
                        variant="secondary"
                        className="text-[10px] font-normal px-1.5 py-0"
                      >
                        {spec}
                      </Badge>
                    ))}
                  </div>

                  {vendor.notes && (
                    <p className="text-[11px] text-muted-foreground italic line-clamp-2">
                      &quot;{vendor.notes}&quot;
                    </p>
                  )}
                </CardContent>

                <CardFooter className="pt-2 pb-3.5 border-t flex items-center justify-between gap-2">
                  <div className="text-[11px] text-muted-foreground">
                    <strong className="text-foreground">{vendor.total_submissions}</strong>{" "}
                    subs •{" "}
                    <strong className="text-purple-600 dark:text-purple-400">
                      {vendor.active_interviews}
                    </strong>{" "}
                    interviews
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Link
                      href={`/dashboard/submissions/new?vendor=${encodeURIComponent(
                        vendor.name
                      )}`}
                    >
                      <Button
                        size="sm"
                        className="h-7 text-[11px] gap-1 bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer shadow-xs"
                      >
                        <SendIcon className="size-3" />
                        Submit
                      </Button>
                    </Link>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(vendor.id, vendor.name)}
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive cursor-pointer"
                      title="Remove Vendor"
                    >
                      <Trash2Icon className="size-3.5" />
                    </Button>
                  </div>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
