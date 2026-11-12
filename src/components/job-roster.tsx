"use client";

import { useState } from "react";
import Link from "next/link";
import { JobDates } from "@/components/job-dates";
import type { StoredJob } from "@/lib/jobs/types";
import { Badge } from "@/components/ui/badge";
import { CompanyLogo } from "@/components/company-logo";
import { SkillBadge } from "@/components/skill-badge";
import { extractJobSkills } from "@/lib/jobs/skills-extractor";
import {
  MapPin,
  Sparkles,
  ArrowUpRight,
  LayoutGrid,
  List,
  Building,
  CheckCircle2,
  Bookmark,
} from "lucide-react";

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
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");

  if (!jobs.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border/80 bg-card p-12 text-center">
        <Building className="size-10 text-muted-foreground/60 mx-auto mb-3" />
        <h3 className="text-base font-semibold text-foreground">No roles found</h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
          Try clearing search filters or adjusting your date range.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* View Switcher Header */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-medium text-muted-foreground">
          Showing <strong className="text-foreground">{jobs.length}</strong> opportunities
        </span>
        <div className="inline-flex items-center p-0.5 rounded-lg bg-muted/60 border border-border/60">
          <button
            type="button"
            onClick={() => setViewMode("cards")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
              viewMode === "cards"
                ? "bg-background text-foreground shadow-2xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title="Card Feed View"
          >
            <LayoutGrid className="size-3.5" />
            <span className="hidden sm:inline">Cards</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode("table")}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
              viewMode === "table"
                ? "bg-background text-foreground shadow-2xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title="Compact Table View"
          >
            <List className="size-3.5" />
            <span className="hidden sm:inline">Table</span>
          </button>
        </div>
      </div>

      {/* ======================= COMPACT CARDS VIEW (Jobright Style) ======================= */}
      {viewMode === "cards" && (
        <div className="space-y-2.5">
          {jobs.map((job) => {
            const extractedSkills = extractJobSkills(job.description || "", job.title);
            const visibleSkills = extractedSkills.slice(0, 4);
            const extraSkillsCount = Math.max(0, extractedSkills.length - 4);
            const hasMatch = job.match_reasons && job.match_reasons.length > 0;
            const isSelected = selectedJobId === job.id;
            const jobDetailUrl = `/dashboard/jobs/${job.id}${
              candidateId ? "?candidateId=" + encodeURIComponent(candidateId) : ""
            }`;

            return (
              <article
                key={job.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectJob?.(job)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectJob?.(job);
                  }
                }}
                className={`group relative text-left w-full rounded-2xl p-4 transition-all duration-200 cursor-pointer ${
                  isSelected
                    ? "bg-card border-2 border-primary shadow-sm ring-1 ring-primary/20"
                    : "bg-card border border-border/70 hover:border-border hover:shadow-xs hover:bg-card/95"
                }`}
              >
                {/* Top Row: Logo, Title, Company, Match Tag */}
                <div className="flex items-start gap-3.5">
                  <CompanyLogo company={job.company} size="md" className="shrink-0 mt-0.5" />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-foreground tracking-tight group-hover:text-primary transition-colors line-clamp-1">
                          {job.title}
                        </h3>
                        <p className="text-xs font-semibold text-muted-foreground mt-0.5">
                          {job.company}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {hasMatch ? (
                          <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
                            <Sparkles className="size-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <span>Matched</span>
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80 px-2 py-0.5 rounded bg-muted/60 border border-border/50">
                            {job.source?.provider || "portal"}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Location & Tags */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-foreground/85">
                        <MapPin className="size-3 text-muted-foreground shrink-0" />
                        <span className="truncate max-w-[170px]">{job.location || "Remote / Unknown"}</span>
                      </span>
                      <span>·</span>
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 capitalize font-medium border-border/60 bg-muted/30"
                      >
                        {job.employment_type.replace("_", " ")}
                      </Badge>
                      {job.arrangements && job.arrangements[0] && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] px-1.5 py-0 capitalize font-medium"
                        >
                          {job.arrangements[0]}
                        </Badge>
                      )}
                    </div>

                    {/* Skills Chips */}
                    {visibleSkills.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                        {visibleSkills.map((s) => (
                          <SkillBadge
                            key={s.name}
                            name={s.name}
                            category={s.category}
                            size="xs"
                          />
                        ))}
                        {extraSkillsCount > 0 && (
                          <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground">
                            +{extraSkillsCount}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Match reason snippet */}
                    {hasMatch && job.match_reasons && (
                      <p className="mt-2 text-[11px] text-emerald-700 dark:text-emerald-400 font-medium line-clamp-1 flex items-center gap-1">
                        <CheckCircle2 className="size-3 shrink-0" />
                        <span>{job.match_reasons[0]}</span>
                      </p>
                    )}

                    {/* Footer Row: Dates & Link */}
                    <div className="mt-3 pt-2 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground">
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
                          className="inline-flex items-center gap-0.5 text-xs font-semibold text-primary hover:underline"
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
      {viewMode === "table" && (
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-xs">
          <div className="overflow-x-auto">
            <table className="evidence-table w-full text-left border-collapse">
              <caption className="sr-only">Saved job opportunities</caption>
              <thead>
                <tr className="border-b border-border/70 bg-muted/40">
                  <th className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Role & Company
                  </th>
                  <th className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Location & Type
                  </th>
                  <th className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Key Skills
                  </th>
                  <th className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Source & Dates
                  </th>
                  <th className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {jobs.map((job) => {
                  const extractedSkills = extractJobSkills(job.description || "", job.title).slice(0, 3);
                  const isSelected = selectedJobId === job.id;
                  const jobDetailUrl = `/dashboard/jobs/${job.id}${
                    candidateId ? "?candidateId=" + encodeURIComponent(candidateId) : ""
                  }`;

                  return (
                    <tr
                      key={job.id}
                      onClick={() => onSelectJob?.(job)}
                      className={`group cursor-pointer transition-colors duration-150 ${
                        isSelected ? "bg-primary/5" : "hover:bg-muted/30"
                      }`}
                    >
                      {/* Role & Company */}
                      <td data-label="Role & company" className="px-4 py-3.5 align-top">
                        <div className="flex items-start gap-3">
                          <CompanyLogo company={job.company} size="sm" />
                          <div className="min-w-0">
                            <span className="font-bold text-sm text-foreground group-hover:text-primary transition-colors block leading-snug">
                              {job.title}
                            </span>
                            <span className="font-medium text-xs text-muted-foreground">
                              {job.company}
                            </span>
                            {job.match_reasons && job.match_reasons.length > 0 && (
                              <div className="mt-1 flex items-center gap-1 text-[10.5px] font-semibold text-emerald-700 dark:text-emerald-300">
                                <Sparkles className="size-2.5 text-emerald-600 dark:text-emerald-400" />
                                <span>{job.match_reasons[0]}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Location & Type */}
                      <td data-label="Location & arrangement" className="px-4 py-3.5 align-top">
                        <div className="flex items-center gap-1.5 text-xs text-foreground/90 font-medium">
                          <MapPin className="size-3 text-muted-foreground shrink-0" />
                          <span>{job.location || "Location unknown"}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 capitalize font-normal border-border/60"
                          >
                            {job.employment_type.replace("_", " ")}
                          </Badge>
                          {job.arrangements?.[0] && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              {job.arrangements[0]}
                            </Badge>
                          )}
                        </div>
                      </td>

                      {/* Key Skills */}
                      <td data-label="Key skills" className="px-4 py-3.5 align-top">
                        <div className="flex flex-wrap gap-1 max-w-xs">
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
                        <div className="text-xs font-semibold text-foreground/90 uppercase tracking-wide mb-1">
                          {job.source?.provider || "Direct"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          <JobDates
                            posted_at={job.posted_at}
                            closes_at={job.closes_at}
                            provider={job.source?.provider}
                          />
                        </div>
                      </td>

                      {/* Action */}
                      <td data-label="Action" className="px-4 py-3.5 align-top text-right">
                        <Link
                          className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg border border-primary/25 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground shadow-2xs hover:shadow transition-all duration-150 cursor-pointer"
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
