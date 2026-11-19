'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Building2Icon,
  ExternalLinkIcon,
  SearchIcon,
  UserIcon,
  CalendarIcon,
  RefreshCwIcon,
  Wand2Icon,
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
import { api } from '@/lib/api-client';

export function OutsideJobsTable() {
  const [jobs, setJobs] = useState<OutsideJob[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const latestRequest = useRef(0);

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

  const refreshJobs = useCallback(async (manual = false) => {
    const request = ++latestRequest.current;
    if (manual) setLoading(true);
    try {
      const { outsideJobs } = await api<{ outsideJobs: OutsideJob[] }>('/api/outside-jobs', {
        cache: 'no-store',
      });
      if (request === latestRequest.current) setJobs(outsideJobs);
    } catch {
      if (request === latestRequest.current) toast.error('Failed to refresh outside jobs');
    } finally {
      if (request === latestRequest.current) setLoading(false);
    }
  }, []);
  useOutsideJobsRealtime(refreshJobs);

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-foreground text-[24px] font-medium tracking-tight">Outside Jobs</h1>
            <Badge
              variant="outline"
              className="border-border bg-muted text-[13px] font-medium text-muted-foreground"
            >
              Extension Captured
            </Badge>
          </div>
          <p className="text-muted-foreground mt-1 text-[13px]">
            Jobs discovered and applied outside our portal (LinkedIn, Foxsense/Keka, BambooHR,
            Workday, Ashby, Lever, etc.)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refreshJobs(true)}
            disabled={loading}
            className="h-9 gap-1.5 rounded-[12px] text-[13px]"
          >
            <RefreshCwIcon className={`size-3.5 ${loading ?'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Link href="/dashboard/jobs">
            <Button variant="secondary" size="sm" className="h-9 rounded-[12px] text-[13px]">
              View public portal jobs
            </Button>
          </Link>
        </div>
      </div>

      {/* SEARCH BAR & COUNTERS */}
      <div className="bg-card border-border/70 flex flex-col items-center justify-between gap-3 rounded-[16px] border p-3 sm:flex-row">
        <div className="relative w-full sm:w-80">
          <SearchIcon className="text-muted-foreground absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search company, job title, skills, source..."
            className="bg-background h-9 rounded-[12px] pl-9 text-[13px]"
          />
        </div>
        <div className="text-muted-foreground flex items-center gap-4 text-[13px]">
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
      <div className="border-border/70 bg-card overflow-hidden rounded-[16px] border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/40 border-border/60 border-b">
              <TableRow>
                <TableHead className="text-muted-foreground w-[240px] text-[11px] font-medium">
                  Job & Company
                </TableHead>
                <TableHead className="text-muted-foreground w-[180px] text-[11px] font-medium">
                  Source
                </TableHead>
                <TableHead className="text-muted-foreground min-w-[200px] text-[11px] font-medium">
                  Match
                </TableHead>
                <TableHead className="text-muted-foreground w-[180px] text-[11px] font-medium">
                  Status
                </TableHead>
                <TableHead className="text-muted-foreground w-[130px] text-[11px] font-medium">
                  Captured
                </TableHead>
                <TableHead className="text-muted-foreground w-[90px] text-right text-[11px] font-medium">
                  Action
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-border/50 divide-y">
              {filteredJobs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground h-32 text-center text-[13px]">
                    {loading ? 'Loading outside jobs…' : 'No outside jobs found.'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredJobs.map((job) => (
                  <TableRow key={job.id} className="hover:bg-muted/30 transition-colors">
                    {/* ... cell content from original ... */}
                    <TableCell className="py-3.5 align-top">
                      <div className="text-foreground flex items-center gap-1.5 text-[13px] font-medium">
                        <div className="bg-surface-sunken text-muted-foreground flex size-5 shrink-0 items-center justify-center rounded">
                          <Building2Icon className="size-3" />
                        </div>
                        <span className="font-medium">{job.company}</span>
                      </div>
                      <div className="text-foreground mt-0.5 line-clamp-1 text-[13px] font-medium">
                        {job.title}
                      </div>
                    </TableCell>
                    <TableCell className="py-3.5 align-top">
                      <Badge
                        variant="secondary"
                        className="h-4 max-w-[160px] truncate px-1.5 py-0 text-[11px] font-medium"
                      >
                        {job.portal_source}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3.5 align-top">
                      {job.match_score != null ? (
                        <Badge
                          variant="outline"
                          className="h-4 border-primary/20 bg-primary/10 px-1.5 py-0 text-[11px] font-medium text-primary"
                        >
                          <Wand2Icon className="mr-1 size-2.5" />
                          Match: {job.match_score}%
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-[11px]">N/A</span>
                      )}
                    </TableCell>
                    <TableCell className="py-3.5 align-top">
                      <Badge
                        variant="outline"
                        className="h-4 border-border bg-muted px-1.5 py-0 text-[11px] text-muted-foreground"
                      >
                        {job.status || 'Discovered'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground py-3.5 align-top text-[13px]">
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
                          className="text-primary hover:bg-primary/10 size-7 rounded-[10px] p-0"
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
