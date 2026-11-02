"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  Eye,
  MapPin,
  Briefcase,
  Calendar,
  ShieldCheck,
  AlertCircle,
  Coins,
  BadgeCheck,
} from "lucide-react";
import type { Candidate } from "@/types/database";
import { Button } from "@/components/ui/button";

export function CandidateRoster({
  candidates,
  onView,
}: {
  candidates: Candidate[];
  onView: (candidate: Candidate) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-xs">
      <div className="overflow-x-auto">
        <table className="evidence-table w-full text-left border-collapse">
          <caption className="sr-only">Candidate bench roster</caption>
          <thead>
            <tr className="border-b border-border/70 bg-muted/40">
              {[
                "Candidate",
                "Skills",
                "Location & rate",
                "Availability",
                "Profile status",
                "Actions",
              ].map((title) => (
                <th
                  key={title}
                  className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap"
                >
                  {title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {candidates.map((candidate) => {
              const initials = (candidate.full_name || "C")
                .split(" ")
                .filter(Boolean)
                .slice(0, 2)
                .map((n) => n[0].toUpperCase())
                .join("");

              const primarySkillsList = candidate.primary_skills
                ? candidate.primary_skills
                    .split(/[,;\n]/)
                    .map((s) => s.trim())
                    .filter(Boolean)
                : [];

              const locationText =
                candidate.preferred_locations ||
                [candidate.current_city, candidate.current_state].filter(Boolean).join(", ") ||
                "Location not recorded";

              const isConfirmed = candidate.provenance_status === "confirmed";

              return (
                <tr
                  key={candidate.id}
                  className="group transition-colors duration-150 hover:bg-muted/30"
                >
                  {/* Candidate Column */}
                  <td data-label="Candidate" className="px-4 py-3.5 align-top">
                    <div className="flex items-start gap-3">
                      <div className="size-9 rounded-xl bg-gradient-to-br from-primary/15 via-primary/5 to-transparent text-primary font-bold text-xs flex items-center justify-center border border-primary/20 shadow-2xs shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <Link
                          className="font-semibold text-sm text-foreground hover:text-primary transition-colors block leading-snug"
                          href={`/dashboard/candidates/${candidate.id}`}
                        >
                          {candidate.full_name}
                        </Link>
                        <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1.5 leading-tight">
                          <Briefcase className="size-3 text-muted-foreground/70 shrink-0" />
                          <span className="truncate max-w-[200px]">
                            {candidate.target_job_titles ||
                              candidate.current_job_title ||
                              "Target role not recorded"}
                          </span>
                        </p>
                        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md bg-muted/60 text-muted-foreground border border-border/50">
                            <BadgeCheck className="size-2.5 text-muted-foreground" />
                            {candidate.visa_status || "Visa unknown"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Skills Column */}
                  <td data-label="Skills" className="px-4 py-3.5 align-top max-w-72">
                    {primarySkillsList.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {primarySkillsList.slice(0, 3).map((skill) => (
                          <span
                            key={skill}
                            className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-primary/8 text-primary border border-primary/20"
                          >
                            {skill}
                          </span>
                        ))}
                        {primarySkillsList.length > 3 && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-muted text-muted-foreground border border-border/60">
                            +{primarySkillsList.length - 3} more
                          </span>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Primary skills not recorded</p>
                    )}
                    {candidate.secondary_skills && (
                      <p className="mt-1.5 text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                        Additional · {candidate.secondary_skills}
                      </p>
                    )}
                  </td>

                  {/* Location & Rate Column */}
                  <td data-label="Location & rate" className="px-4 py-3.5 align-top">
                    <div className="flex items-center gap-1.5 text-xs text-foreground/90 font-medium">
                      <MapPin className="size-3.5 text-muted-foreground/80 shrink-0" />
                      <span>{locationText}</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground">
                      <Coins className="size-3 text-muted-foreground/70 shrink-0" />
                      <span>{candidate.expected_salary || "Rate not recorded"}</span>
                    </div>
                  </td>

                  {/* Availability Column */}
                  <td data-label="Availability" className="px-4 py-3.5 align-top">
                    <div>
                      {candidate.is_active_bench ? (
                        <span className="status-chip status-positive inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25">
                          <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          On bench
                        </span>
                      ) : (
                        <span className="status-chip status-neutral inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border/60">
                          <span className="size-1.5 rounded-full bg-muted-foreground/60" />
                          Inactive
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Calendar className="size-3 text-muted-foreground/70 shrink-0" />
                      <span>
                        {candidate.available_to_join ||
                          candidate.notice_period ||
                          "Start date unknown"}
                      </span>
                    </div>
                  </td>

                  {/* Profile Status Column */}
                  <td data-label="Profile status" className="px-4 py-3.5 align-top">
                    {isConfirmed ? (
                      <span className="status-chip status-neutral inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/25">
                        <ShieldCheck className="size-3.5 text-blue-600 dark:text-blue-400" />
                        Reviewed profile
                      </span>
                    ) : (
                      <span className="status-chip status-warning inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/25">
                        <AlertCircle className="size-3.5 text-amber-600 dark:text-amber-400" />
                        Unconfirmed import
                      </span>
                    )}
                  </td>

                  {/* Actions Column */}
                  <td data-label="Actions" className="px-4 py-3.5 align-top">
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={`View ${candidate.full_name}`}
                        onClick={() => onView(candidate)}
                        className="h-8 px-2.5 text-xs font-medium border-border/70 hover:border-primary/40 hover:bg-primary/5 hover:text-primary transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                      >
                        <Eye className="size-3.5 text-muted-foreground group-hover:text-primary" />
                        <span>Quick view</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        render={<Link href={`/dashboard/candidates/${candidate.id}`} />}
                        aria-label={`Open ${candidate.full_name} profile`}
                        className="size-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                      >
                        <ArrowUpRight className="size-4" />
                      </Button>
                    </div>
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
