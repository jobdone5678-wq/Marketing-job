import Link from 'next/link';
import type { AppliedJobsResponse } from '@/lib/jobs/application-state';
import { CompanyLogo } from '@/components/company-logo';
import { Badge } from '@/components/ui/badge';
import { Calendar, MapPin, ExternalLink } from 'lucide-react';

export function AppliedJobsList({
  data,
  loading,
}: {
  data: AppliedJobsResponse | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground border rounded-2xl bg-card">
        <div className="animate-spin inline-block w-6 h-6 border-2 border-primary border-t-transparent rounded-full mb-2"></div>
        <p>Loading applied jobs…</p>
      </div>
    );
  }
  if (!data) return null;
  if (data.requiresCandidate) {
    return (
      <div className="rounded-2xl border border-dashed border-border/80 bg-card p-10 text-center">
        <p className="text-sm font-semibold text-foreground">Candidate selection required</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Select a candidate profile to view their application history.
        </p>
      </div>
    );
  }
  if (!data.applications.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border/80 bg-card p-10 text-center">
        <p className="text-sm font-semibold text-foreground">No applications recorded</p>
        <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
          No applied jobs found for {data.candidateName || 'this candidate'} with the selected filters.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-xs">
      <div className="overflow-x-auto">
        <table className="evidence-table w-full text-left border-collapse">
          <caption className="sr-only">
            Applied jobs for {data.candidateName || 'the selected candidate'}
          </caption>
          <thead>
            <tr className="border-b border-border/70 bg-muted/40">
              <th className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Role & Company
              </th>
              <th className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Portal & Location
              </th>
              <th className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Applied Date
              </th>
              <th className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Stage
              </th>
              <th className="px-4 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground text-right">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {data.applications.map((row) => (
              <tr
                key={row.id}
                className="group transition-colors duration-150 hover:bg-muted/30"
              >
                {/* Role & Company */}
                <td data-label="Role & company" className="px-4 py-3.5 align-top">
                  <div className="flex items-start gap-3">
                    <CompanyLogo company={row.company} size="sm" />
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-foreground leading-snug">
                        {row.title}
                      </p>
                      <p className="font-medium text-xs text-muted-foreground mt-0.5">
                        {row.company}
                      </p>
                      {row.jobState === 'closed' && (
                        <span className="inline-flex items-center text-[10px] font-medium text-amber-600 dark:text-amber-400 mt-1">
                          Posting closed · application retained
                        </span>
                      )}
                    </div>
                  </div>
                </td>

                {/* Portal & Location */}
                <td data-label="Portal & location" className="px-4 py-3.5 align-top">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider bg-muted text-muted-foreground border border-border/50">
                    {row.provider}
                  </span>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1.5">
                    <MapPin className="size-3 shrink-0" />
                    <span>{row.location || 'Location not recorded'}</span>
                  </div>
                </td>

                {/* Applied on */}
                <td data-label="Applied on" className="px-4 py-3.5 align-top">
                  <div className="flex items-center gap-1.5 text-xs text-foreground/90 font-medium">
                    <Calendar className="size-3 text-muted-foreground shrink-0" />
                    <span>{row.appliedAt}</span>
                  </div>
                </td>

                {/* Stage */}
                <td data-label="Stage" className="px-4 py-3.5 align-top">
                  <Badge
                    variant="outline"
                    className="text-[11px] px-2.5 py-0.5 rounded-full capitalize font-semibold border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  >
                    {row.status === 'Draft' ? 'Applied' : row.status.replaceAll('_', ' ')}
                  </Badge>
                </td>

                {/* History */}
                <td data-label="History" className="px-4 py-3.5 align-top text-right">
                  <Link
                    className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg border border-border/80 bg-background text-foreground hover:bg-muted transition-colors shadow-2xs"
                    href={`/dashboard/submissions?candidateId=${encodeURIComponent(
                      row.candidateId
                    )}`}
                  >
                    <span>View history</span>
                    <ExternalLink className="size-3 text-muted-foreground" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
