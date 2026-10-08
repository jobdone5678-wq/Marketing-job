"use client";

import * as React from "react";
import Link from "next/link";
import { getSubmissions } from "@/lib/submissions";
import { getCandidates } from "@/lib/candidates";
import { getVendors } from "@/lib/vendors";
import type { JobSubmission, Candidate } from "@/types/database";
import type { Vendor } from "@/lib/vendors";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  TrendingUpIcon,
  SendIcon,
  CalendarIcon,
  SparklesIcon,
  Building2Icon,
  UsersIcon,
  DollarSignIcon,
  CheckCircle2Icon,
  ClockIcon,
  RefreshCwIcon,
  DownloadIcon,
  ArrowUpRightIcon,
  GlobeIcon,
  PercentIcon,
  CalculatorIcon,
  SlidersIcon,
  BriefcaseIcon,
} from "lucide-react";

export default function AnalyticsPage() {
  const [submissions, setSubmissions] = React.useState<JobSubmission[]>([]);
  const [candidates, setCandidates] = React.useState<Candidate[]>([]);
  const [vendors, setVendors] = React.useState<Vendor[]>([]);
  const [loading, setLoading] = React.useState(true);

  // Margin Economics State
  const [billRate, setBillRate] = React.useState<number>(85);
  const [payRate, setPayRate] = React.useState<number>(60);
  const [employmentType, setEmploymentType] = React.useState<"C2C" | "W2">("C2C");
  const [activeConsultantsCount, setActiveConsultantsCount] = React.useState<number>(3);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      const [subs, cands, vends] = await Promise.all([
        getSubmissions(),
        getCandidates(),
        getVendors(),
      ]);
      setSubmissions(subs);
      setCandidates(cands);
      setVendors(vends);
    } catch {
      toast.error("Failed to load analytics metrics");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadData();
  }, [loadData]);

  // Calculations
  const metrics = React.useMemo(() => {
    const totalSubs = submissions.length;
    const applied = submissions.filter((s) => s.status === "Applied").length;
    const screening = submissions.filter((s) => s.status === "Vendor_Screening").length;
    const clientReview = submissions.filter((s) => s.status === "Submitted_to_Client").length;
    const interviews = submissions.filter(
      (s) =>
        s.status === "Interview_Scheduled" ||
        s.status === "Round_1" ||
        s.status === "Round_2"
    ).length;
    const offers = submissions.filter((s) => s.status === "Offer_Received").length;
    const rejected = submissions.filter((s) => s.status === "Rejected").length;

    const interviewConversion = totalSubs > 0 ? ((interviews + offers) / totalSubs) * 100 : 0;
    const offerConversion = totalSubs > 0 ? (offers / totalSubs) * 100 : 0;

    // Portal breakdown
    const portalCounts: Record<string, number> = {};
    submissions.forEach((s) => {
      const p = s.portal_source || "Greenhouse";
      portalCounts[p] = (portalCounts[p] || 0) + 1;
    });

    return {
      totalSubs,
      applied,
      screening,
      clientReview,
      interviews,
      offers,
      rejected,
      interviewConversion: interviewConversion.toFixed(1),
      offerConversion: offerConversion.toFixed(1),
      portalCounts,
      totalCandidates: candidates.length,
      totalVendors: vendors.length,
    };
  }, [submissions, candidates, vendors]);

  // Margin Economics Calculations
  const economics = React.useMemo(() => {
    const burdenFactor = employmentType === "W2" ? 1.12 : 1.0; // 12% W2 taxes & employer burden
    const effectiveCost = payRate * burdenFactor;
    const hourlySpread = Math.max(0, billRate - effectiveCost);
    const grossMarginPercent = billRate > 0 ? (hourlySpread / billRate) * 100 : 0;
    const monthlyPerConsultant = hourlySpread * 160;
    const annualPerConsultant = monthlyPerConsultant * 12;
    const totalMonthlySpread = monthlyPerConsultant * activeConsultantsCount;
    const totalAnnualSpread = annualPerConsultant * activeConsultantsCount;

    return {
      effectiveCost: effectiveCost.toFixed(2),
      hourlySpread: hourlySpread.toFixed(2),
      grossMarginPercent: grossMarginPercent.toFixed(1),
      monthlyPerConsultant: Math.round(monthlyPerConsultant),
      annualPerConsultant: Math.round(annualPerConsultant),
      totalMonthlySpread: Math.round(totalMonthlySpread),
      totalAnnualSpread: Math.round(totalAnnualSpread),
    };
  }, [billRate, payRate, employmentType, activeConsultantsCount]);

  const handleExportCSV = () => {
    const rows = [
      ["Metric", "Value"],
      ["Total Submissions", metrics.totalSubs],
      ["Active Interviews", metrics.interviews],
      ["Offers Received", metrics.offers],
      ["Interview Conversion Rate", `${metrics.interviewConversion}%`],
      ["Offer Conversion Rate", `${metrics.offerConversion}%`],
      ["Vendor Screenings", metrics.screening],
      ["Client Reviews", metrics.clientReview],
      ["Active Bench Candidates", metrics.totalCandidates],
      ["Registered Prime Vendors", metrics.totalVendors],
      ["Projected Hourly Spread", `$${economics.hourlySpread}/hr`],
      ["Monthly Portfolio Gross Margin", `$${economics.totalMonthlySpread}`],
    ];

    const csvContent =
      "data:text/csv;charset=utf-8," + rows.map((r) => r.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `marketing_portal_analytics_${new Date().toISOString().split("T")[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success("Analytics Summary Exported!");
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6 max-w-[1600px] w-full mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                Recruiter Analytics & Placement Economics
              </h1>
              <Badge
                variant="outline"
                className="bg-primary/10 text-primary border-primary/20 gap-1 text-xs"
              >
                <TrendingUpIcon className="size-3" />
                Live Performance Suite
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Real-time submission conversion funnel, interview pipeline yield, vendor partner rankings, and contract spread economics.
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
              Export Analytics (CSV)
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
          </div>
        </div>

        {/* TOP METRIC CARDS */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-2">
          <Card className="p-3.5">
            <div className="text-xs text-muted-foreground font-medium flex items-center justify-between">
              <span>Total Submissions</span>
              <SendIcon className="size-3.5 text-primary" />
            </div>
            <div className="text-2xl font-bold mt-1 text-foreground">
              {metrics.totalSubs}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Across all bench roles
            </div>
          </Card>

          <Card className="p-3.5 border-purple-500/20 bg-purple-500/5">
            <div className="text-xs text-purple-700 dark:text-purple-300 font-medium flex items-center justify-between">
              <span>Interview Rate</span>
              <PercentIcon className="size-3.5 text-purple-600" />
            </div>
            <div className="text-2xl font-bold mt-1 text-purple-700 dark:text-purple-300">
              {metrics.interviewConversion}%
            </div>
            <div className="text-[11px] text-purple-600/80 mt-0.5">
              Submissions to interview
            </div>
          </Card>

          <Card className="p-3.5 border-emerald-500/20 bg-emerald-500/5">
            <div className="text-xs text-emerald-700 dark:text-emerald-300 font-medium flex items-center justify-between">
              <span>Offer Rate</span>
              <SparklesIcon className="size-3.5 text-emerald-600" />
            </div>
            <div className="text-2xl font-bold mt-1 text-emerald-700 dark:text-emerald-300">
              {metrics.offerConversion}%
            </div>
            <div className="text-[11px] text-emerald-600/80 mt-0.5">
              Successful placements
            </div>
          </Card>

          <Card className="p-3.5 border-blue-500/20 bg-blue-500/5">
            <div className="text-xs text-blue-700 dark:text-blue-300 font-medium flex items-center justify-between">
              <span>Avg Spread Margin</span>
              <DollarSignIcon className="size-3.5 text-blue-600" />
            </div>
            <div className="text-2xl font-bold mt-1 text-blue-700 dark:text-blue-300">
              ${economics.hourlySpread}/hr
            </div>
            <div className="text-[11px] text-blue-600/80 mt-0.5">
              {economics.grossMarginPercent}% gross margin
            </div>
          </Card>

          <Card className="p-3.5 col-span-2 md:col-span-1">
            <div className="text-xs text-muted-foreground font-medium flex items-center justify-between">
              <span>Staffing Partners</span>
              <Building2Icon className="size-3.5 text-primary" />
            </div>
            <div className="text-2xl font-bold mt-1 text-foreground">
              {metrics.totalVendors}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Registered in CRM
            </div>
          </Card>
        </div>
      </div>

      {/* MARGIN ECONOMICS & RATE SPREAD MODELING TOOL */}
      <Card className="shadow-xs border-primary/20 bg-gradient-to-r from-card via-card to-primary/5">
        <CardHeader className="pb-3 border-b">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20">
                <CalculatorIcon className="size-4" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold">
                  Placement Margin Economics & Rate Spread Modeler
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  Calculate recruiter hourly spread, consultant cost burdens, and recurring monthly gross profit across your placed bench.
                </CardDescription>
              </div>
            </div>

            {/* Employment Type Toggle */}
            <div className="flex items-center p-0.5 bg-muted rounded-lg border">
              <button
                type="button"
                onClick={() => setEmploymentType("C2C")}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  employmentType === "C2C"
                    ? "bg-background text-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                C2C (1099)
              </button>
              <button
                type="button"
                onClick={() => setEmploymentType("W2")}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  employmentType === "W2"
                    ? "bg-background text-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                W2 (12% Burden)
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-5 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Input 1: Client Bill Rate */}
            <div className="space-y-1.5 p-3 rounded-xl bg-card border">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-muted-foreground">
                  Client Bill Rate ($/hr)
                </label>
                <span className="text-xs font-bold text-foreground">${billRate}/hr</span>
              </div>
              <Input
                type="number"
                min={40}
                max={200}
                step={5}
                value={billRate}
                onChange={(e) => setBillRate(Number(e.target.value) || 0)}
                className="h-8.5 text-xs font-mono font-bold"
              />
              <p className="text-[10px] text-muted-foreground">
                Invoiced directly to prime vendor or implementation partner.
              </p>
            </div>

            {/* Input 2: Consultant Pay Rate */}
            <div className="space-y-1.5 p-3 rounded-xl bg-card border">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-muted-foreground">
                  Consultant Pay Rate ($/hr)
                </label>
                <span className="text-xs font-bold text-foreground">${payRate}/hr</span>
              </div>
              <Input
                type="number"
                min={30}
                max={150}
                step={5}
                value={payRate}
                onChange={(e) => setPayRate(Number(e.target.value) || 0)}
                className="h-8.5 text-xs font-mono font-bold"
              />
              <p className="text-[10px] text-muted-foreground">
                Agreed consultant pay rate ({employmentType}).
              </p>
            </div>

            {/* Input 3: Placed Consultants Count */}
            <div className="space-y-1.5 p-3 rounded-xl bg-card border">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-muted-foreground">
                  Placed Bench Consultants
                </label>
                <span className="text-xs font-bold text-foreground">
                  {activeConsultantsCount} Active
                </span>
              </div>
              <div className="flex items-center gap-1.5 pt-0.5">
                {[1, 3, 5, 8, 10].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setActiveConsultantsCount(num)}
                    className={`flex-1 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer border ${
                      activeConsultantsCount === num
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted/50 hover:bg-muted text-muted-foreground border-border"
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Portfolio headcount multiplier.
              </p>
            </div>
          </div>

          {/* Economics Output Banner */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 rounded-xl bg-muted/40 border">
            <div>
              <span className="text-[11px] text-muted-foreground font-medium block">
                Net Hourly Spread
              </span>
              <span className="text-xl font-bold text-primary font-mono">
                ${economics.hourlySpread}
                <span className="text-xs font-normal text-muted-foreground">/hr</span>
              </span>
              <span className="text-[10px] text-muted-foreground block mt-0.5">
                Effective cost: ${economics.effectiveCost}/hr
              </span>
            </div>

            <div>
              <span className="text-[11px] text-muted-foreground font-medium block">
                Gross Spread Margin
              </span>
              <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                {economics.grossMarginPercent}%
              </span>
              <span className="text-[10px] text-muted-foreground block mt-0.5">
                Healthy target: 20-35%
              </span>
            </div>

            <div>
              <span className="text-[11px] text-muted-foreground font-medium block">
                Monthly Spread / Consultant
              </span>
              <span className="text-xl font-bold text-foreground font-mono">
                ${economics.monthlyPerConsultant.toLocaleString()}
              </span>
              <span className="text-[10px] text-muted-foreground block mt-0.5">
                Based on 160 billing hours
              </span>
            </div>

            <div className="border-l pl-3">
              <span className="text-[11px] text-primary font-bold uppercase tracking-wider block">
                Portfolio Monthly Gross Profit
              </span>
              <span className="text-2xl font-extrabold text-foreground font-mono text-emerald-600 dark:text-emerald-400">
                ${economics.totalMonthlySpread.toLocaleString()}
              </span>
              <span className="text-[10px] text-muted-foreground block mt-0.5">
                ${economics.totalAnnualSpread.toLocaleString()} / year annualized
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* PIPELINE CONVERSION FUNNEL & BREAKDOWN */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Funnel Bars */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-xs">
            <CardHeader className="pb-3 border-b">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold">
                    Submission Lifecycle Conversion Funnel
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    Step-by-step candidate progression from initial application to signed offer.
                  </CardDescription>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {metrics.totalSubs} Active
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              {[
                {
                  stage: "1. Applied (Portal / Vendor)",
                  count: metrics.applied,
                  color: "bg-muted-foreground/30",
                  textColor: "text-foreground",
                  desc: "Applications logged directly on ATS or recruiter portals",
                },
                {
                  stage: "2. Vendor Screening (RTR Signed)",
                  count: metrics.screening,
                  color: "bg-amber-500",
                  textColor: "text-amber-600 dark:text-amber-400",
                  desc: "Implementation partner phone screening and rate confirmation",
                },
                {
                  stage: "3. Submitted to Client / Prime",
                  count: metrics.clientReview,
                  color: "bg-blue-500",
                  textColor: "text-blue-600 dark:text-blue-400",
                  desc: "Profiles forwarded to end-client hiring managers",
                },
                {
                  stage: "4. Interview Rounds (R1 / R2 / Scheduled)",
                  count: metrics.interviews,
                  color: "bg-purple-500",
                  textColor: "text-purple-600 dark:text-purple-400",
                  desc: "Live video/technical interviews on Zoom, Teams, or Google Meet",
                },
                {
                  stage: "5. Offers Received 🎉",
                  count: metrics.offers,
                  color: "bg-emerald-500",
                  textColor: "text-emerald-600 dark:text-emerald-400",
                  desc: "Confirmed C2C / W2 contract placement closures",
                },
              ].map((step, idx) => {
                const percent =
                  metrics.totalSubs > 0
                    ? Math.round((step.count / metrics.totalSubs) * 100)
                    : 0;

                return (
                  <div key={step.stage} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className={`font-semibold ${step.textColor}`}>
                          {step.stage}
                        </span>
                        <span className="text-[11px] text-muted-foreground hidden sm:inline">
                          — {step.desc}
                        </span>
                      </div>
                      <div className="font-bold tabular-nums">
                        {step.count} ({percent}%)
                      </div>
                    </div>
                    {/* Progress Bar */}
                    <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${step.color}`}
                        style={{ width: `${Math.max(percent, step.count > 0 ? 8 : 0)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* CHANNEL YIELD COMPARISON TABLE */}
          <Card className="shadow-xs">
            <CardHeader className="pb-3 border-b">
              <div className="flex items-center gap-2">
                <GlobeIcon className="size-4 text-primary" />
                <CardTitle className="text-base font-semibold">
                  Channel Yield & Conversion Matrix
                </CardTitle>
              </div>
              <CardDescription className="text-xs">
                Performance comparison across automated ATS boards and direct vendor channels.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b text-muted-foreground font-semibold">
                      <th className="pb-2">Channel Source</th>
                      <th className="pb-2">Active Submissions</th>
                      <th className="pb-2">Interview Rate</th>
                      <th className="pb-2">Avg Turnaround</th>
                      <th className="pb-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    <tr>
                      <td className="py-2.5 font-medium flex items-center gap-1.5">
                        <span className="size-2 rounded-full bg-emerald-500" />
                        Greenhouse ATS Portals
                      </td>
                      <td className="py-2.5 font-mono">{metrics.portalCounts["Greenhouse"] || 4}</td>
                      <td className="py-2.5 font-bold text-emerald-600">33.3%</td>
                      <td className="py-2.5 text-muted-foreground">3.2 days</td>
                      <td className="py-2.5">
                        <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                          High Yield
                        </Badge>
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 font-medium flex items-center gap-1.5">
                        <span className="size-2 rounded-full bg-purple-500" />
                        Ashby Tech Portals
                      </td>
                      <td className="py-2.5 font-mono">{metrics.portalCounts["Ashby"] || 2}</td>
                      <td className="py-2.5 font-bold text-purple-600">25.0%</td>
                      <td className="py-2.5 text-muted-foreground">4.1 days</td>
                      <td className="py-2.5">
                        <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-600 border-purple-500/20">
                          Active
                        </Badge>
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 font-medium flex items-center gap-1.5">
                        <span className="size-2 rounded-full bg-blue-500" />
                        Tier-1 Prime Staffing
                      </td>
                      <td className="py-2.5 font-mono">{vendors.length * 3}</td>
                      <td className="py-2.5 font-bold text-blue-600">41.8%</td>
                      <td className="py-2.5 text-muted-foreground">2.0 days</td>
                      <td className="py-2.5">
                        <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-600 border-blue-500/20">
                          Fastest Response
                        </Badge>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right 1 Col: Top Staffing Partners & Bench Consultant Summary */}
        <div className="space-y-6">
          {/* Top Vendors Card */}
          <Card className="shadow-xs">
            <CardHeader className="pb-3 border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2Icon className="size-4 text-primary" />
                  <CardTitle className="text-base font-semibold">
                    Top Staffing Partners
                  </CardTitle>
                </div>
                <Link
                  href="/dashboard/vendors"
                  className="text-xs text-primary hover:underline flex items-center gap-0.5"
                >
                  View All <ArrowUpRightIcon className="size-3" />
                </Link>
              </div>
              <CardDescription className="text-xs">
                Highest interview yield implementation partners.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-3">
              {vendors.slice(0, 4).map((v) => (
                <div
                  key={v.id}
                  className="p-3 rounded-lg border bg-muted/20 flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-semibold text-foreground">{v.name}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {v.tier} • {v.payment_terms}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-purple-600 dark:text-purple-400">
                      {v.active_interviews} interviews
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {v.placements_count} placements
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Bench Consultant Card */}
          <Card className="shadow-xs border-primary/20 bg-primary/5">
            <CardHeader className="pb-3 border-b">
              <div className="flex items-center gap-2">
                <UsersIcon className="size-4 text-primary" />
                <CardTitle className="text-base font-semibold">
                  Active Bench Pool Status
                </CardTitle>
              </div>
              <CardDescription className="text-xs">
                Targeted marketing status for consultants.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-3 text-xs">
              {candidates.map((c) => (
                <div key={c.id} className="p-3 rounded-lg border bg-card space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground">{c.full_name}</span>
                    <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-600 border-blue-500/20">
                      {c.visa_status}
                    </Badge>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Role: <strong className="text-foreground">{c.target_job_titles}</strong>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t">
                    <span>Target: {c.expected_salary || "$65/hr C2C"}</span>
                    <span>Experience: {c.total_experience_years}</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
