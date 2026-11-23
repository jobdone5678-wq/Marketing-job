'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Building2Icon,
  ExternalLinkIcon,
  SearchIcon,
  CalendarIcon,
  RefreshCwIcon,
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
          <h1 className="text-foreground text-2xl font-medium tracking-tight sm:text-3xl">Outside Jobs</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            Jobs discovered and captured outside the internal portal
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refreshJobs(true)}
            disabled={loading}
            className="border-border/60 hover:bg-muted/50 h-8 gap-1.5 rounded-md text-xs font-normal"
          >
            <RefreshCwIcon className={`size-3.5 stroke-[1.5] ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Link href="/dashboard/jobs">
            <Button variant="outline" size="sm" className="border-border/60 hover:bg-muted/50 h-8 rounded-md text-xs font-normal">
              View portal jobs
            </Button>
          </Link>
        </div>
      </div>

      {/* SEARCH BAR & COUNTERS */}
      <div className="bg-card border-border/60 flex flex-col items-center justify-between gap-3 rounded-xl border p-3 sm:flex-row">
        <div className="relative w-full sm:w-80">
          <SearchIcon className="text-muted-foreground absolute top-1/2 left-3 size-3.5 -translate-y-1/2 stroke-[1.5]" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by company, title, or skills"
            className="bg-background border-border/60 h-9 rounded-md pl-8.5 text-xs"
          />
        </div>
        <div className="text-muted-foreground flex items-center gap-4 text-xs font-mono tabular-nums">
          <span>
            Total: <strong className="text-foreground font-medium">{jobs.length}</strong>
          </span>
          {searchQuery && (
            <span>
              Filtered: <strong className="text-primary font-medium">{filteredJobs.length}</strong>
            </span>
          )}
        </div>
      </div>

      {/* TABLE */}
      <div className="border-border/60 bg-card overflow-hidden rounded-xl border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30 border-border/60 border-b">
              <TableRow>
                <TableHead className="text-muted-foreground w-[240px] text-xs font-medium normal-case">
                  Job &amp; company
                </TableHead>
                <TableHead className="text-muted-foreground w-[180px] text-xs font-medium normal-case">
                  Source
                </TableHead>
                <TableHead className="text-muted-foreground min-w-[200px] text-xs font-medium normal-case">
                  Match
                </TableHead>
                <TableHead className="text-muted-foreground w-[180px] text-xs font-medium normal-case">
                  Status
                </TableHead>
                <TableHead className="text-muted-foreground w-[130px] text-xs font-medium normal-case">
                  Captured
                </TableHead>
                <TableHead className="text-muted-foreground w-[90px] text-right text-xs font-medium normal-case">
                  Action
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-border/50 divide-y">
              {filteredJobs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground h-32 text-center text-xs">
                    {loading ? 'Loading outside jobs…' : 'No outside jobs match your criteria.'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredJobs.map((job) => (
                  <TableRow key={job.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="py-3.5 align-top">
                      <div className="text-foreground flex items-center gap-1.5 text-xs font-medium">
                        <div className="bg-muted text-foreground border-border/60 flex size-5 shrink-0 items-center justify-center rounded border">
                          <Building2Icon className="size-3 stroke-[1.5]" />
                        </div>
                        <span className="font-medium">{job.company}</span>
                      </div>
                      <div className="text-muted-foreground mt-0.5 line-clamp-1 text-xs">
                        {job.title}
                      </div>
                    </TableCell>
                    <TableCell className="py-3.5 align-top">
                      <Badge
                        variant="secondary"
                        className="border-border/60 bg-muted/60 text-muted-foreground h-4 max-w-[160px] truncate rounded px-1.5 py-0 text-[10px] font-normal"
                      >
                        {job.portal_source}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3.5 align-top">
                      {job.match_score != null ? (
                        <Badge
                          variant="outline"
                          className="border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 h-4 rounded px-1.5 py-0 text-[10px] font-medium"
                        >
                          {job.match_score}% match
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-[11px]">N/A</span>
                      )}
                    </TableCell>
                    <TableCell className="py-3.5 align-top">
                      <Badge
                        variant="outline"
                        className="border-border/60 bg-muted/40 text-muted-foreground h-4 rounded px-1.5 py-0 text-[10px] font-normal"
                      >
                        {job.status || 'Discovered'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground py-3.5 align-top font-mono text-xs tabular-nums">
                      <div className="flex items-center gap-1">
                        <CalendarIcon className="size-3 stroke-[1.5]" />
                        {new Date(job.created_at).toLocaleDateString()}
                      </div>
                    </TableCell>
                    <TableCell className="py-3.5 text-right align-top">
                      <a
                        href={`/dashboard/outside-jobs/${encodeURIComponent(job.id)}/apply`}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open application for ${job.title}`}
                      >
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-foreground size-7 rounded-md p-0"
                        >
                          <ExternalLinkIcon className="size-3.5 stroke-[1.5]" />
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
