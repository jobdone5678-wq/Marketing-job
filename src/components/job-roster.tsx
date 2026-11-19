'use client';

import { useState } from 'react';
import Link from 'next/link';
import { JobDates } from '@/components/job-dates';
import type { StoredJob } from '@/lib/jobs/types';
import { Badge } from '@/components/ui/badge';
import { CompanyLogo } from '@/components/company-logo';
import { SkillBadge } from '@/components/skill-badge';
import { extractJobSkills } from '@/lib/jobs/skills-extractor';
import {
  MapPin,
  Wand2,
  ArrowUpRight,
  LayoutGrid,
  List,
  Building,
  CheckCircle2,
  Bookmark,
} from 'lucide-react';

export function JobRoster({
  jobs,
  candidateId,
  selectedJobId,
  onSelectJob,
}: {
  jobs: (StoredJob & { match_reasons?: string[] })[];
  candidateId: string;
  selectedJobId?: string | null;
  onSelectJob?: (job: StoredJob & { match_reasons?: string[] }) => void;
}) {
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  if (!jobs.length) {
    return (
      <div className="border-border/80 bg-card rounded-[16px] border border-dashed p-12 text-center">
        <Building className="text-muted-foreground/60 mx-auto mb-3 size-10" />
        <h3 className="text-foreground text-[15px] font-medium">No roles found</h3>
        <p className="text-muted-foreground mx-auto mt-1 max-w-sm text-[13px]">
          Try clearing search filters or adjusting your date range.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* View Switcher Header */}
      <div className="flex items-center justify-between px-1">
        <span className="text-muted-foreground text-[13px] font-medium">
          Showing <strong className="text-foreground">{jobs.length}</strong> opportunities
        </span>
        <div className="bg-muted/60 border-border/60 inline-flex items-center rounded-[10px] border p-0.5">
          <button
            type="button"
            onClick={() => setViewMode('cards')}
            className={`flex cursor-pointer items-center gap-1.5 rounded-[8px] px-2.5 py-1 text-[13px] font-medium transition-colors ${
 viewMode ==='cards'
                ? 'bg-background text-foreground font-medium '
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Card Feed View"
          >
            <LayoutGrid className="size-3.5" />
            <span className="hidden sm:inline">Cards</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('table')}
            className={`flex cursor-pointer items-center gap-1.5 rounded-[8px] px-2.5 py-1 text-[13px] font-medium transition-colors ${
 viewMode ==='table'
                ? 'bg-background text-foreground font-medium '
                : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Compact Table View"
          >
            <List className="size-3.5" />
            <span className="hidden sm:inline">Table</span>
          </button>
        </div>
      </div>

      {/* ======================= COMPACT CARDS VIEW (Jobright Style) ======================= */}
      {viewMode === 'cards' && (
        <div className="space-y-2.5">
          {jobs.map((job) => {
            const extractedSkills = extractJobSkills(job.description || '', job.title);
            const visibleSkills = extractedSkills.slice(0, 4);
            const extraSkillsCount = Math.max(0, extractedSkills.length - 4);
            const hasMatch = job.match_reasons && job.match_reasons.length > 0;
            const isSelected = selectedJobId === job.id;
            const jobDetailUrl = `/dashboard/jobs/${job.id}${
              candidateId ? '?candidateId=' + encodeURIComponent(candidateId) : ''
            }`;

            return (
              <article
                key={job.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectJob?.(job)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectJob?.(job);
                  }
                }}
                className={`group relative w-full cursor-pointer rounded-[16px] p-4 text-left transition-colors duration-150 ${
 isSelected
 ?'bg-card border-primary ring-primary/20 border-2 shadow-sm ring-1'
                    : 'bg-card border-border hover:border-input hover:bg-accent/30 border'
                }`}
              >
                {/* Top Row: Logo, Title, Company, Match Tag */}
                <div className="flex items-start gap-3.5">
                  <CompanyLogo company={job.company} size="md" className="mt-0.5 shrink-0" />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-foreground group-hover:text-primary line-clamp-1 text-[13px] font-medium tracking-tight transition-colors">
                          {job.title}
                        </h3>
                        <p className="text-muted-foreground mt-0.5 text-[13px] font-medium">
                          {job.company}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        {hasMatch ? (
                          <span className="inline-flex items-center gap-1 rounded-[6px] border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                            <Wand2 className="size-3 shrink-0 text-primary" />
                            <span>Matched</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground/80 bg-muted/60 border-border/50 rounded border px-2 py-0.5 text-[11px] font-medium">
                            {job.source?.provider || 'portal'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Location & Tags */}
                    <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-1.5 text-[13px]">
                      <span className="text-foreground/85 inline-flex items-center gap-1 text-[11px] font-medium">
                        <MapPin className="text-muted-foreground size-3 shrink-0" />
                        <span className="max-w-[170px] truncate">
                          {job.location || 'Remote / Unknown'}
                        </span>
                      </span>
                      <span>·</span>
                      <Badge
                        variant="outline"
                        className="border-border/60 bg-muted/30 px-1.5 py-0 text-[11px] font-medium capitalize"
                      >
                        {job.employment_type.replace('_', ' ')}
                      </Badge>
                      {job.arrangements && job.arrangements[0] && (
                        <Badge
                          variant="secondary"
                          className="px-1.5 py-0 text-[11px] font-medium capitalize"
                        >
                          {job.arrangements[0]}
                        </Badge>
                      )}
                    </div>

                    {/* Skills Chips */}
                    {visibleSkills.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                        {visibleSkills.map((s) => (
                          <SkillBadge key={s.name} name={s.name} category={s.category} size="xs" />
                        ))}
                        {extraSkillsCount > 0 && (
                          <span className="bg-muted text-muted-foreground inline-flex items-center rounded-[8px] px-1.5 py-0.5 text-[11px] font-medium">
                            +{extraSkillsCount}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Match reason snippet */}
                    {hasMatch && job.match_reasons && (
                      <p className="mt-2 line-clamp-1 flex items-center gap-1 text-[11px] font-medium text-primary">
                        <CheckCircle2 className="size-3 shrink-0" />
                        <span>{job.match_reasons[0]}</span>
                      </p>
                    )}

                    {/* Footer Row: Dates & Link */}
                    <div className="border-border/40 text-muted-foreground mt-3 flex items-center justify-between border-t pt-2 text-[13px]">
                      <div className="text-[11px]">
                        <JobDates
                          posted_at={job.posted_at}
                          closes_at={job.closes_at}
                          provider={job.source?.provider}
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <Link
                          href={jobDetailUrl}
                          onClick={(e) => e.stopPropagation()}
                          className="text-primary inline-flex items-center gap-0.5 text-[13px] font-medium hover:underline"
                        >
                          <span>Full view</span>
                          <ArrowUpRight className="size-3" />
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* ======================= TABLE VIEW ======================= */}
      {viewMode === 'table' && (
        <div className="border-border/70 bg-card overflow-hidden rounded-[16px] border">
          <div className="overflow-x-auto">
            <table className="evidence-table w-full border-collapse text-left">
              <caption className="sr-only">Saved job opportunities</caption>
              <thead>
                <tr className="border-border/70 bg-muted/40 border-b">
                  <th className="text-muted-foreground px-4 py-3.5 text-[11px] font-medium">
                    Role & Company
                  </th>
                  <th className="text-muted-foreground px-4 py-3.5 text-[11px] font-medium">
                    Location & Type
                  </th>
                  <th className="text-muted-foreground px-4 py-3.5 text-[11px] font-medium">
                    Key Skills
                  </th>
                  <th className="text-muted-foreground px-4 py-3.5 text-[11px] font-medium">
                    Source & Dates
                  </th>
                  <th className="text-muted-foreground px-4 py-3.5 text-right text-[11px] font-medium">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-border/60 divide-y">
                {jobs.map((job) => {
                  const extractedSkills = extractJobSkills(job.description || '', job.title).slice(
                    0,
                    3
                  );
                  const isSelected = selectedJobId === job.id;
                  const jobDetailUrl = `/dashboard/jobs/${job.id}${
                    candidateId ? '?candidateId=' + encodeURIComponent(candidateId) : ''
                  }`;

                  return (
                    <tr
                      key={job.id}
                      onClick={() => onSelectJob?.(job)}
                      className={`group cursor-pointer transition-colors duration-150 ${
 isSelected ?'bg-primary/5' : 'hover:bg-muted/30'
                      }`}
                    >
                      {/* Role & Company */}
                      <td data-label="Role & company" className="px-4 py-3.5 align-top">
                        <div className="flex items-start gap-3">
                          <CompanyLogo company={job.company} size="sm" />
                          <div className="min-w-0">
                            <span className="text-foreground group-hover:text-primary block text-[13px] leading-snug font-medium transition-colors">
                              {job.title}
                            </span>
                            <span className="text-muted-foreground text-[13px] font-medium">
                              {job.company}
                            </span>
                            {job.match_reasons && job.match_reasons.length > 0 && (
                              <div className="mt-1 flex items-center gap-1 text-[11px] font-medium text-primary">
                                <Wand2 className="size-2.5 text-primary" />
                                <span>{job.match_reasons[0]}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Location & Type */}
                      <td data-label="Location & arrangement" className="px-4 py-3.5 align-top">
                        <div className="text-foreground/90 flex items-center gap-1.5 text-[13px] font-medium">
                          <MapPin className="text-muted-foreground size-3 shrink-0" />
                          <span>{job.location || 'Location unknown'}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          <Badge
                            variant="outline"
                            className="border-border/60 px-1.5 py-0 text-[11px] font-normal capitalize"
                          >
                            {job.employment_type.replace('_', ' ')}
                          </Badge>
                          {job.arrangements?.[0] && (
                            <Badge variant="secondary" className="px-1.5 py-0 text-[11px]">
                              {job.arrangements[0]}
                            </Badge>
                          )}
                        </div>
                      </td>

                      {/* Key Skills */}
                      <td data-label="Key skills" className="px-4 py-3.5 align-top">
                        <div className="flex max-w-xs flex-wrap gap-1">
                          {extractedSkills.map((skill) => (
                            <SkillBadge
                              key={skill.name}
                              name={skill.name}
                              category={skill.category}
                              size="xs"
                            />
                          ))}
                        </div>
                      </td>

                      {/* Source & Dates */}
                      <td data-label="Source & dates" className="px-4 py-3.5 align-top">
                        <div className="text-foreground/90 mb-1 text-[13px] font-medium">
                          {job.source?.provider || 'Direct'}
                        </div>
                        <div className="text-muted-foreground text-[13px]">
                          <JobDates
                            posted_at={job.posted_at}
                            closes_at={job.closes_at}
                            provider={job.source?.provider}
                          />
                        </div>
                      </td>

                      {/* Action */}
                      <td data-label="Action" className="px-4 py-3.5 text-right align-top">
                        <Link
                          className="border-primary/25 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground inline-flex cursor-pointer items-center gap-1 rounded-[10px] border px-3 py-1.5 text-[13px] font-medium transition-colors duration-150 hover:shadow"
                          href={jobDetailUrl}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span>Review</span>
                          <ArrowUpRight className="size-3.5" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
