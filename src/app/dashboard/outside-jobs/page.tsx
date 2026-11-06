"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/client";
import { toast } from "sonner";
import {
  Building2Icon,
  ExternalLinkIcon,
  SearchIcon,
  BriefcaseIcon,
  CheckCircle2Icon,
  AlertCircleIcon,
  UserIcon,
  CalendarIcon,
  RefreshCwIcon,
  SparklesIcon
} from "lucide-react";
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

interface OutsideJob {
  id: string;
  candidate_id?: string | null;
  submission_id?: string | null;
  title: string;
  company: string;
  job_url: string;
  portal_source: string;
  location?: string | null;
  department?: string | null;
  employment_type?: string | null;
  description?: string | null;
  match_score?: number | null;
  matched_skills?: string[] | null;
  missing_skills?: string[] | null;
  status?: string | null;
  applied_at?: string | null;
  created_at: string;
  candidate?: {
    id: string;
    full_name: string;
    email: string;
  } | null;
}

export default function OutsideJobsPage() {
  const [jobs, setJobs] = useState<OutsideJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchJobs = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/outside-jobs");
      const json = await res.json();
      if (json.success) {
        setJobs(json.outsideJobs || []);
      }
    } catch (err) {
      console.error("Failed to fetch outside jobs", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();

    const supabase = createClient();
    const channel = supabase
      .channel("outside_jobs_realtime_feed")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "outside_jobs",
        },
        (payload) => {
          fetchJobs();
          if (payload.eventType === "INSERT") {
            const row = payload.new as Record<string, unknown>;
            toast.success(`⚡ New outside job captured: ${(row?.company as string) || "Company"}`);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filteredJobs = jobs.filter((j) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      j.title.toLowerCase().includes(q) ||
      j.company.toLowerCase().includes(q) ||
      (j.portal_source && j.portal_source.toLowerCase().includes(q)) ||
      (j.candidate?.full_name && j.candidate.full_name.toLowerCase().includes(q)) ||
      (j.matched_skills && j.matched_skills.some((s) => s.toLowerCase().includes(q)))
    );
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Outside Jobs
            </h1>
            <Badge
              variant="outline"
              className="text-xs bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30 font-medium"
            >
              Extension Captured
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Jobs discovered and applied outside our portal (LinkedIn, Foxsense/Keka, BambooHR, Workday, Ashby, Lever, etc.)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchJobs}
            disabled={loading}
            className="h-9 gap-1.5 text-xs rounded-xl"
          >
            <RefreshCwIcon className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Link href="/dashboard/jobs">
            <Button variant="secondary" size="sm" className="h-9 text-xs rounded-xl">
              View Public Portal Jobs →
            </Button>
          </Link>
        </div>
      </div>

      {/* SEARCH BAR & COUNTERS */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-card p-3 rounded-2xl border border-border/70 shadow-xs">
        <div className="relative w-full sm:w-80">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search company, job title, skills, source..."
            className="pl-9 h-9 text-xs rounded-xl bg-background"
          />
        </div>
        <div className="text-xs text-muted-foreground flex items-center gap-4">
          <span>
            Total Outside Jobs: <strong className="text-foreground">{jobs.length}</strong>
          </span>
          {searchQuery && (
            <span>
              Filtered: <strong className="text-primary">{filteredJobs.length}</strong>
            </span>
          )}
        </div>
      </div>

      {/* TABLE */}
      <div className="rounded-2xl border border-border/70 bg-card shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/40 border-b border-border/60">
              <TableRow>
                <TableHead className="w-[240px] text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                  Job & Company
                </TableHead>
                <TableHead className="w-[180px] text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                  Outside Source & URL
                </TableHead>
                <TableHead className="min-w-[200px] text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                  ATS Match & Skills
                </TableHead>
                <TableHead className="w-[180px] text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                  Candidate & Status
                </TableHead>
                <TableHead className="w-[130px] text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                  Captured Date
                </TableHead>
                <TableHead className="w-[90px] text-right text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
                  Action
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-border/50">
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-xs text-muted-foreground">
                    <RefreshCwIcon className="size-5 animate-spin mx-auto mb-2 text-primary/60" />
                    Loading outside jobs...
                  </TableCell>
                </TableRow>
              ) : filteredJobs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-xs text-muted-foreground">
                    No outside jobs found matching your criteria.
                  </TableCell>
                </TableRow>
              ) : (
                filteredJobs.map((job) => (
                  <TableRow key={job.id} className="hover:bg-muted/30 transition-colors">
                    {/* Job & Company */}
                    <TableCell className="align-top py-3.5">
                      <div className="flex items-center gap-1.5 font-medium text-foreground text-xs">
                        <div className="size-5 rounded flex items-center justify-center bg-primary/10 text-primary shrink-0">
                          <Building2Icon className="size-3" />
                        </div>
                        <span className="font-semibold">{job.company}</span>
                      </div>
                      <div className="text-[12px] font-medium text-foreground mt-0.5 line-clamp-1">
                        {job.title}
                      </div>
                      {job.location && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {job.location} • {job.employment_type || "Full-time"}
                        </div>
                      )}
                    </TableCell>

                    {/* Source & URL */}
                    <TableCell className="align-top py-3.5">
                      <Badge
                        variant="secondary"
                        className="text-[9px] px-1.5 py-0 h-4 font-medium max-w-[160px] truncate"
                      >
                        {job.portal_source}
                      </Badge>
                      <div className="mt-1.5">
                        <a
                          href={job.job_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline font-medium"
                        >
                          View Posting <ExternalLinkIcon className="size-2.5" />
                        </a>
                      </div>
                    </TableCell>

                    {/* ATS Match & Skills */}
                    <TableCell className="align-top py-3.5">
                      {job.match_score !== null && job.match_score !== undefined ? (
                        <div className="space-y-1">
                          <Badge
                            variant="outline"
                            className="text-[10px] font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 px-1.5 py-0 h-4"
                          >
                            <SparklesIcon className="size-2.5 mr-1" />
                            ATS Match: {job.match_score}%
                          </Badge>
                          {job.matched_skills && job.matched_skills.length > 0 && (
                            <div className="text-[10px] text-muted-foreground line-clamp-1" title={job.matched_skills.join(", ")}>
                              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">✓ </span>
                              {job.matched_skills.slice(0, 4).join(", ")}
                            </div>
                          )}
                          {job.missing_skills && job.missing_skills.length > 0 && (
                            <div className="text-[10px] text-muted-foreground line-clamp-1" title={job.missing_skills.join(", ")}>
                              <span className="text-amber-600 dark:text-amber-400 font-semibold">✗ Missing: </span>
                              {job.missing_skills.slice(0, 3).join(", ")}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">Not evaluated</span>
                      )}
                    </TableCell>

                    {/* Candidate & Status */}
                    <TableCell className="align-top py-3.5">
                      <div className="text-xs font-medium text-foreground flex items-center gap-1">
                        <UserIcon className="size-3 text-muted-foreground" />
                        {job.candidate?.full_name || "Applicant"}
                      </div>
                      <Badge
                        variant="outline"
                        className="text-[9px] mt-1 bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20 px-1.5 py-0 h-4"
                      >
                        {job.status || "Applied"}
                      </Badge>
                    </TableCell>

                    {/* Captured Date */}
                    <TableCell className="align-top py-3.5 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <CalendarIcon className="size-3" />
                        {job.applied_at
                          ? new Date(job.applied_at).toLocaleDateString()
                          : new Date(job.created_at).toLocaleDateString()}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {new Date(job.applied_at || job.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </TableCell>

                    {/* Action */}
                    <TableCell className="align-top py-3.5 text-right">
                      <a
                        href={job.job_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Button
                          variant="ghost"
                          size="sm"
                          className="size-7 p-0 rounded-lg text-primary hover:bg-primary/10 cursor-pointer"
                          title="Open original job posting"
                        >
                          <ExternalLinkIcon className="size-3.5" />
                        </Button>
                      </a>
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
