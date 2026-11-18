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
      <div className="text-muted-foreground bg-card rounded-2xl border py-16 text-center text-sm">
        <div className="border-primary mb-2 inline-block h-6 w-6 animate-spin rounded-full border-2 border-t-transparent"></div>
        <p>Loading applied jobs…</p>
      </div>
    );
  }
  if (!data) return null;
  if (data.requiresCandidate) {
    return (
      <div className="border-border/80 bg-card rounded-2xl border border-dashed p-10 text-center">
        <p className="text-foreground text-sm font-semibold">Candidate selection required</p>
        <p className="text-muted-foreground mt-1 text-xs">
          Select a candidate profile to view their application history.
        </p>
      </div>
    );
  }
  if (!data.applications.length) {
    return (
      <div className="border-border/80 bg-card rounded-2xl border border-dashed p-10 text-center">
        <p className="text-foreground text-sm font-semibold">No applications recorded</p>
        <p className="text-muted-foreground mx-auto mt-1 max-w-sm text-xs">
          No applied jobs found for {data.candidateName || 'this candidate'} with the selected
          filters.
        </p>
      </div>
    );
  }

  return (
    <div className="border-border/70 bg-card overflow-hidden rounded-2xl border shadow-xs">
      <div className="overflow-x-auto">
        <table className="evidence-table w-full border-collapse text-left">
          <caption className="sr-only">
            Applied jobs for {data.candidateName || 'the selected candidate'}
          </caption>
          <thead>
            <tr className="border-border/70 bg-muted/40 border-b">
              <th className="text-muted-foreground px-4 py-3.5 text-[11px] font-semibold tracking-wider uppercase">
                Role & Company
              </th>
              <th className="text-muted-foreground px-4 py-3.5 text-[11px] font-semibold tracking-wider uppercase">
                Portal & Location
              </th>
              <th className="text-muted-foreground px-4 py-3.5 text-[11px] font-semibold tracking-wider uppercase">
                Applied Date
              </th>
              <th className="text-muted-foreground px-4 py-3.5 text-[11px] font-semibold tracking-wider uppercase">
                Stage
              </th>
              <th className="text-muted-foreground px-4 py-3.5 text-right text-[11px] font-semibold tracking-wider uppercase">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-border/60 divide-y">
            {data.applications.map((row) => (
              <tr key={row.id} className="group hover:bg-muted/30 transition-colors duration-150">
                {/* Role & Company */}
                <td data-label="Role & company" className="px-4 py-3.5 align-top">
                  <div className="flex items-start gap-3">
                    <CompanyLogo company={row.company} size="sm" />
                    <div className="min-w-0">
                      <p className="text-foreground text-sm leading-snug font-bold">{row.title}</p>
                      <p className="text-muted-foreground mt-0.5 text-xs font-medium">
                        {row.company}
                      </p>
                      {row.jobState === 'closed' && (
                        <span className="mt-1 inline-flex items-center text-[10px] font-medium text-amber-600 dark:text-amber-400">
                          Posting closed · application retained
                        </span>
                      )}
                    </div>
                  </div>
                </td>

                {/* Portal & Location */}
                <td data-label="Portal & location" className="px-4 py-3.5 align-top">
                  <span className="bg-muted text-muted-foreground border-border/50 inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase">
                    {row.provider}
                  </span>
                  <div className="text-muted-foreground mt-1.5 flex items-center gap-1 text-xs">
                    <MapPin className="size-3 shrink-0" />
                    <span>{row.location || 'Location not recorded'}</span>
                  </div>
                </td>

                {/* Applied on */}
                <td data-label="Applied on" className="px-4 py-3.5 align-top">
                  <div className="text-foreground/90 flex items-center gap-1.5 text-xs font-medium">
                    <Calendar className="text-muted-foreground size-3 shrink-0" />
                    <span>{row.appliedAt}</span>
                  </div>
                </td>

                {/* Stage */}
                <td data-label="Stage" className="px-4 py-3.5 align-top">
                  <Badge
                    variant="outline"
                    className="rounded-full border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 capitalize dark:text-emerald-300"
                  >
                    {row.status === 'Draft' ? 'Applied' : row.status.replaceAll('_', ' ')}
                  </Badge>
                </td>

                {/* History */}
                <td data-label="History" className="px-4 py-3.5 text-right align-top">
                  <Link
                    className="border-border/80 bg-background text-foreground hover:bg-muted inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold shadow-2xs transition-colors"
                    href={`/dashboard/submissions?candidateId=${encodeURIComponent(
                      row.candidateId
                    )}`}
                  >
                    <span>View history</span>
                    <ExternalLink className="text-muted-foreground size-3" />
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
