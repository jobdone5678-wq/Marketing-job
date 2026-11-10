"use client";

import Link from "next/link";
import { JobDates } from "@/components/job-dates";
import type { StoredJob } from "@/lib/jobs/types";
import { Badge } from "@/components/ui/badge";
import { extractJobSkills } from "@/lib/jobs/skills-extractor";

function MapPinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    </svg>
  );
}

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </svg>
  );
}

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

export function JobRoster({
  jobs,
  candidateId,
}: {
  jobs: (StoredJob & { match_reasons?: string[] })[];
  candidateId: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-xs">
      <div className="overflow-x-auto">
        <table className="evidence-table w-full text-left border-collapse">
          <caption className="sr-only">Saved job opportunities</caption>
          <thead>
            <tr className="border-b border-border/70 bg-muted/40">
              {[
                "Role & company",
                "Location & arrangement",
                "Source & dates",
                "Job status",
                "Action",
              ].map((label) => (
                <th
                  key={label}
                  className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {jobs.map((job) => {
              const companyInitial = (job.company || "C").charAt(0).toUpperCase();
              const extractedSkills = extractJobSkills(job.description || '', job.title).slice(0, 4);

              return (
                <tr
                  key={job.id}
                  className="group transition-colors duration-150 hover:bg-muted/30"
                >
                  {/* Role & Company */}
                  <td data-label="Role & company" className="px-4 py-3.5 align-top">
                    <div className="flex items-start gap-3">
                      <div className="size-9 rounded-xl bg-gradient-to-br from-primary/15 via-primary/5 to-transparent text-primary font-bold text-xs flex items-center justify-center border border-primary/20 shadow-2xs shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                        {companyInitial}
                      </div>
                      <div className="min-w-0">
                        <Link
                          className="font-semibold text-sm text-foreground hover:text-primary transition-colors block leading-snug"
                          href={`/dashboard/jobs/${job.id}${
                            candidateId ? "?candidateId=" + encodeURIComponent(candidateId) : ""
                          }`}
                        >
                          {job.title}
                        </Link>
                        <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground/80">{job.company}</span>
                        </div>
                        {extractedSkills.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {extractedSkills.map((skill) => (
                              <span
                                key={skill.name}
                                className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20"
                              >
                                {skill.name}
                              </span>
                            ))}
                          </div>
                        )}
                        {job.match_reasons && job.match_reasons.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {job.match_reasons.map((reason) => (
                              <span
                                key={reason}
                                className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20"
                              >
                                <SparklesIcon className="size-2.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                {reason}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Location & Arrangement */}
                  <td data-label="Location & arrangement" className="px-4 py-3.5 align-top">
                    <div className="flex items-center gap-1.5 text-xs text-foreground/90 font-medium">
                      <MapPinIcon className="size-3.5 text-muted-foreground/80 shrink-0" />
                      <span>{job.location || "Location unknown"}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 bg-muted/60 text-muted-foreground capitalize font-normal border-border/60"
                      >
                        {job.employment_type.replaceAll("_", " ")}
                      </Badge>
                      {job.arrangements && job.arrangements.length > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          · {job.arrangements.join(", ")}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Source & Dates */}
                  <td data-label="Source & dates" className="px-4 py-3.5 align-top">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-foreground/90 mb-1.5">
                      <GlobeIcon className="size-3 text-primary shrink-0" />
                      <span>Portal: <span className="capitalize">{job.source?.provider || "Unknown"}</span></span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <JobDates
                        posted_at={job.posted_at}
                        closes_at={job.closes_at}
                        provider={job.source?.provider}
                      />
                    </div>
                  </td>

                  {/* Job Status */}
                  <td data-label="Job status" className="px-4 py-3.5 align-top">
                    {job.state === "stale" ? (
                      <span className="status-chip status-warning inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/25">
                        <span className="size-1.5 rounded-full bg-amber-500" />
                        {job.state}
                      </span>
                    ) : (
                      <span className="status-chip status-neutral inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
                        <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        {job.state}
                      </span>
                    )}
                  </td>

                  {/* Action */}
                  <td data-label="Action" className="px-4 py-3.5 align-top">
                    <Link
                      className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-primary/20 bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground shadow-2xs hover:shadow transition-all duration-150 cursor-pointer"
                      href={`/dashboard/jobs/${job.id}${
                        candidateId ? "?candidateId=" + encodeURIComponent(candidateId) : ""
                      }`}
                    >
                      <span>Review and apply</span>
                      <ArrowRightIcon className="size-3" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
