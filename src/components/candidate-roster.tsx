'use client';

import Link from 'next/link';
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
  Pencil,
} from 'lucide-react';
import type { Candidate } from '@/types/database';
import { Button } from '@/components/ui/button';

export function CandidateRoster({
  candidates,
  onView,
}: {
  candidates: Candidate[];
  onView: (candidate: Candidate) => void;
}) {
  return (
    <div className="border-border/70 bg-card overflow-hidden rounded-[16px] border">
      <div className="overflow-x-auto">
        <table className="evidence-table w-full border-collapse text-left">
          <caption className="sr-only">Candidate bench roster</caption>
          <thead>
            <tr className="border-border/70 bg-muted/40 border-b">
              {[
                'Candidate',
                'Skills',
                'Location & rate',
                'Availability',
                'Profile status',
                'Actions',
              ].map((title) => (
                <th
                  key={title}
                  className="text-muted-foreground px-4 py-3.5 text-[11px] font-medium whitespace-nowrap"
                >
                  {title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-border/60 divide-y">
            {candidates.map((candidate) => {
              const initials = (candidate.full_name || 'C')
                .split(' ')
                .filter(Boolean)
                .slice(0, 2)
                .map((n) => n[0].toUpperCase())
                .join('');

              const primarySkillsList = candidate.primary_skills
                ? candidate.primary_skills
                    .split(/[,;\n]/)
                    .map((s) => s.trim())
                    .filter(Boolean)
                : [];

              const locationText =
                candidate.preferred_locations ||
                [candidate.current_city, candidate.current_state].filter(Boolean).join(', ') ||
                'Location not recorded';

              const isConfirmed = candidate.provenance_status === 'confirmed';

              return (
                <tr
                  key={candidate.id}
                  className="group hover:bg-muted/30 transition-colors duration-150"
                >
                  {/* Candidate Column */}
                  <td data-label="Candidate" className="px-4 py-3.5 align-top">
                    <div className="flex items-start gap-3">
                      <div className="bg-surface-sunken text-muted-foreground border-border mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-[10px] border text-[11px] font-medium">
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <Link
                          className="text-foreground hover:text-primary block text-[13px] leading-snug font-medium transition-colors"
                          href={`/dashboard/candidates/${candidate.id}`}
                        >
                          {candidate.full_name}
                        </Link>
                        <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-[13px] leading-tight">
                          <Briefcase className="text-muted-foreground/70 size-3 shrink-0" />
                          <span className="max-w-[200px] truncate">
                            {candidate.target_job_titles ||
                              candidate.current_job_title ||
                              'Target role not recorded'}
                          </span>
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <span className="bg-muted/60 text-muted-foreground border-border/50 inline-flex items-center gap-1 rounded-[8px] border px-2 py-0.5 text-[11px] font-medium">
                            <BadgeCheck className="text-muted-foreground size-2.5" />
                            {candidate.visa_status || 'Visa unknown'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Skills Column */}
                  <td data-label="Skills" className="max-w-72 px-4 py-3.5 align-top">
                    {primarySkillsList.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {primarySkillsList.slice(0, 3).map((skill) => (
                          <span
                            key={skill}
                            className="bg-primary/8 text-primary border-primary/20 inline-flex items-center rounded-[8px] border px-2 py-0.5 text-[11px] font-medium"
                          >
                            {skill}
                          </span>
                        ))}
                        {primarySkillsList.length > 3 && (
                          <span className="bg-muted text-muted-foreground border-border/60 inline-flex items-center rounded-[8px] border px-1.5 py-0.5 text-[11px] font-medium">
                            +{primarySkillsList.length - 3} more
                          </span>
                        )}
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-[13px]">Primary skills not recorded</p>
                    )}
                    {candidate.secondary_skills && (
                      <p className="text-muted-foreground mt-1.5 line-clamp-2 text-[11px] leading-relaxed">
                        Additional · {candidate.secondary_skills}
                      </p>
                    )}
                  </td>

                  {/* Location & Rate Column */}
                  <td data-label="Location & rate" className="px-4 py-3.5 align-top">
                    <div className="text-foreground/90 flex items-center gap-1.5 text-[13px] font-medium">
                      <MapPin className="text-muted-foreground/80 size-3.5 shrink-0" />
                      <span>{locationText}</span>
                    </div>
                    <div className="text-muted-foreground mt-1.5 flex items-center gap-1.5 font-mono text-[11px]">
                      <Coins className="text-muted-foreground/70 size-3 shrink-0" />
                      <span>{candidate.expected_salary || 'Rate not recorded'}</span>
                    </div>
                  </td>

                  {/* Availability Column */}
                  <td data-label="Availability" className="px-4 py-3.5 align-top">
                    <div>
                      {candidate.is_active_bench ? (
                        <span className="status-chip status-positive inline-flex items-center gap-1.5 rounded-[6px] border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[13px] font-medium text-primary">
                          <span className="size-1.5 rounded-full bg-primary" />
                          On bench
                        </span>
                      ) : (
                        <span className="status-chip status-neutral bg-muted text-muted-foreground border-border/60 inline-flex items-center gap-1.5 rounded-[6px] border px-2.5 py-0.5 text-[13px] font-medium">
                          <span className="bg-muted-foreground/60 size-1.5 rounded-full" />
                          Inactive
                        </span>
                      )}
                    </div>
                    <div className="text-muted-foreground mt-1.5 flex items-center gap-1.5 text-[13px]">
                      <Calendar className="text-muted-foreground/70 size-3 shrink-0" />
                      <span>
                        {candidate.available_to_join ||
                          candidate.notice_period ||
                          'Start date unknown'}
                      </span>
                    </div>
                  </td>

                  {/* Profile Status Column */}
                  <td data-label="Profile status" className="px-4 py-3.5 align-top">
                    {isConfirmed ? (
                      <span className="status-chip status-neutral inline-flex items-center gap-1.5 rounded-[6px] border border-border bg-muted px-2.5 py-0.5 text-[13px] font-medium text-muted-foreground">
                        <ShieldCheck className="size-3.5 text-muted-foreground" />
                        Reviewed profile
                      </span>
                    ) : (
                      <span className="status-chip status-warning inline-flex items-center gap-1.5 rounded-[6px] border border-amber-500/20 bg-amber-500/10 px-2.5 py-0.5 text-[13px] font-medium text-amber-700 dark:text-amber-400">
                        <AlertCircle className="size-3.5 text-amber-700 dark:text-amber-400" />
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
                        aria-label={`Edit ${candidate.full_name}`}
                        render={<Link href={`/dashboard/candidates/${candidate.id}/edit`} />}
                        className="border-primary/30 text-primary hover:bg-primary/10 flex h-8 cursor-pointer items-center gap-1.5 px-2.5 text-[13px] font-medium transition-colors"
                      >
                        <Pencil className="size-3.5" />
                        <span>Edit</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={`View ${candidate.full_name}`}
                        onClick={() => onView(candidate)}
                        className="border-border/70 hover:border-primary/40 hover:bg-primary/5 hover:text-primary flex h-8 cursor-pointer items-center gap-1.5 px-2.5 text-[13px] font-medium transition-colors"
                      >
                        <Eye className="text-muted-foreground group-hover:text-primary size-3.5" />
                        <span>Quick view</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        render={<Link href={`/dashboard/candidates/${candidate.id}`} />}
                        aria-label={`Open ${candidate.full_name} profile`}
                        className="text-muted-foreground hover:text-foreground hover:bg-muted size-8 cursor-pointer rounded-[10px] transition-colors"
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
