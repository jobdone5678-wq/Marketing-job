'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Building2Icon,
  ExternalLinkIcon,
  SearchIcon,
  UserIcon,
  CalendarIcon,
  RefreshCwIcon,
  SparklesIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { OutsideJob } from '../types';
import { useOutsideJobsRealtime } from '../_hooks/use-outside-jobs-realtime';

export function OutsideJobsTable({ initialJobs }: { initialJobs: OutsideJob[] }) {
  const [jobs, setJobs] = useState<OutsideJob[]>(initialJobs);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);

  useOutsideJobsRealtime(setJobs);

  const filteredJobs = useMemo(() => {
    if (!searchQuery.trim()) return jobs;
    const q = searchQuery.toLowerCase();
    return jobs.filter(
      (j) =>
        j.title.toLowerCase().includes(q) ||
        j.company.toLowerCase().includes(q) ||
        (j.portal_source && j.portal_source.toLowerCase().includes(q)) ||
        (j.candidate?.full_name && j.candidate.full_name.toLowerCase().includes(q)) ||
        (j.matched_skills && j.matched_skills.some((s) => s.toLowerCase().includes(q)))
    );
  }, [jobs, searchQuery]);

  const refreshJobs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/outside-jobs');
      const json = await res.json();
      if (json.success) {
        setJobs(json.outsideJobs || []);
      }
    } catch (err) {
      toast.error('Failed to refresh jobs');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-foreground text-2xl font-bold tracking-tight">Outside Jobs</h1>
            <Badge
              variant="outline"
              className="border-blue-500/30 bg-blue-500/10 text-xs font-medium text-blue-700 dark:text-blue-400"
            >
              Extension Captured
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            Jobs discovered and applied outside our portal (LinkedIn, Foxsense/Keka, BambooHR,
            Workday, Ashby, Lever, etc.)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={refreshJobs}
            disabled={loading}
            className="h-9 gap-1.5 rounded-xl text-xs"
          >
            <RefreshCwIcon className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Link href="/dashboard/jobs">
            <Button variant="secondary" size="sm" className="h-9 rounded-xl text-xs">
              View Public Portal Jobs →
            </Button>
          </Link>
        </div>
      </div>

      {/* SEARCH BAR & COUNTERS */}
      <div className="bg-card border-border/70 flex flex-col items-center justify-between gap-3 rounded-2xl border p-3 shadow-xs sm:flex-row">
        <div className="relative w-full sm:w-80">
          <SearchIcon className="text-muted-foreground absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search company, job title, skills, source..."
            className="bg-background h-9 rounded-xl pl-9 text-xs"
          />
        </div>
        <div className="text-muted-foreground flex items-center gap-4 text-xs">
          <span>
            Total: <strong className="text-foreground">{jobs.length}</strong>
          </span>
          {searchQuery && (
            <span>
              Filtered: <strong className="text-primary">{filteredJobs.length}</strong>
            </span>
          )}
        </div>
      </div>

      {/* TABLE */}
      <div className="border-border/70 bg-card overflow-hidden rounded-2xl border shadow-xs">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/40 border-border/60 border-b">
              <TableRow>
                <TableHead className="text-muted-foreground w-[240px] text-[11px] font-semibold tracking-wider uppercase">
                  Job & Company
                </TableHead>
                <TableHead className="text-muted-foreground w-[180px] text-[11px] font-semibold tracking-wider uppercase">
                  Source
                </TableHead>
                <TableHead className="text-muted-foreground min-w-[200px] text-[11px] font-semibold tracking-wider uppercase">
                  Match
                </TableHead>
                <TableHead className="text-muted-foreground w-[180px] text-[11px] font-semibold tracking-wider uppercase">
                  Status
                </TableHead>
                <TableHead className="text-muted-foreground w-[130px] text-[11px] font-semibold tracking-wider uppercase">
                  Captured
                </TableHead>
                <TableHead className="text-muted-foreground w-[90px] text-right text-[11px] font-semibold tracking-wider uppercase">
                  Action
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-border/50 divide-y">
              {filteredJobs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground h-32 text-center text-xs">
                    No outside jobs found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredJobs.map((job) => (
                  <TableRow key={job.id} className="hover:bg-muted/30 transition-colors">
                    {/* ... cell content from original ... */}
                    <TableCell className="py-3.5 align-top">
                      <div className="text-foreground flex items-center gap-1.5 text-xs font-medium">
                        <div className="bg-primary/10 text-primary flex size-5 shrink-0 items-center justify-center rounded">
                          <Building2Icon className="size-3" />
                        </div>
                        <span className="font-semibold">{job.company}</span>
                      </div>
                      <div className="text-foreground mt-0.5 line-clamp-1 text-[12px] font-medium">
                        {job.title}
                      </div>
                    </TableCell>
                    <TableCell className="py-3.5 align-top">
                      <Badge
                        variant="secondary"
                        className="h-4 max-w-[160px] truncate px-1.5 py-0 text-[9px] font-medium"
                      >
                        {job.portal_source}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3.5 align-top">
                      {job.match_score != null ? (
                        <Badge
                          variant="outline"
                          className="h-4 border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0 text-[10px] font-bold text-emerald-700"
                        >
                          <SparklesIcon className="mr-1 size-2.5" />
                          Match: {job.match_score}%
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-[11px]">N/A</span>
                      )}
                    </TableCell>
                    <TableCell className="py-3.5 align-top">
                      <Badge
                        variant="outline"
                        className="h-4 border-blue-500/20 bg-blue-500/10 px-1.5 py-0 text-[9px] text-blue-700"
                      >
                        {job.status || 'Applied'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground py-3.5 align-top text-xs">
                      <div className="flex items-center gap-1">
                        <CalendarIcon className="size-3" />
                        {new Date(job.created_at).toLocaleDateString()}
                      </div>
                    </TableCell>
                    <TableCell className="py-3.5 text-right align-top">
                      <a href={job.job_url} target="_blank" rel="noopener noreferrer">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-primary hover:bg-primary/10 size-7 rounded-lg p-0"
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
