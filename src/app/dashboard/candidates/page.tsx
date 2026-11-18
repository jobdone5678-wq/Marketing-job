'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Search,
  Plus,
  ShieldCheck,
  Clock,
  Users,
  ChevronLeft,
  ChevronRight,
  Pencil,
  MapPin,
  Globe,
  Sparkles,
  FileText,
  Briefcase,
  ExternalLink,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import type { Candidate } from '@/types/database';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CandidateRoster } from '@/components/candidate-roster';
import { CandidateDetailDialog } from '@/components/candidate-detail-dialog';
import {
  WorkspaceHeading,
  WorkspaceSkeleton,
  WorkspaceEmpty,
  WorkspaceError,
} from '@/components/workspace-ui';

export default function CandidatesPage() {
  const [items, setItems] = useState<Candidate[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [hasMore, setMore] = useState(false);
  const [role, setRole] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    void api<{
      candidates: Candidate[];
      total: number;
      hasMore: boolean;
      role: string;
    }>(`/api/candidates?page=${page}`)
      .then((r) => {
        if (active) {
          setItems(r.candidates);
          setTotal(r.total);
          setMore(r.hasMore);
          setRole(r.role);
          setError('');
        }
      })
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [page, revision]);

  const visible = useMemo(
    () =>
      items.filter((candidate) => {
        const haystack = [
          candidate.full_name,
          candidate.target_job_titles,
          candidate.current_job_title,
          candidate.primary_skills,
          candidate.secondary_skills,
          candidate.visa_status,
          candidate.preferred_locations,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return (
          haystack.includes(query.trim().toLowerCase()) &&
          (filter === 'all' ||
            (filter === 'active' && candidate.is_active_bench) ||
            (filter === 'review' && candidate.provenance_status !== 'confirmed'))
        );
      }),
    [items, query, filter]
  );

  const active = items.filter((c) => c.is_active_bench).length;
  const verified = items.filter((c) => c.provenance_status === 'confirmed').length;

  return (
    <main className="portal-page space-y-6">
      {/* Workspace Header */}
      <WorkspaceHeading
        eyebrow="Talent workspace"
        title={role === 'candidate' ? 'My Applications and Resume' : 'Bench candidates'}
        description={
          role === 'candidate'
            ? 'Manage your resume, manual profile details, and job portal autofill information.'
            : 'Reviewed talent, ready for the right opportunity. Keep candidate facts and documents together.'
        }
        actions={
          role === 'candidate' ? (
            items.length > 0 ? (
              <div className="flex items-center gap-2">
                <Button
                  render={<Link href={`/dashboard/candidates/${items[0].id}/edit`} />}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold shadow-xs transition-all hover:shadow active:scale-[0.99]"
                >
                  <Pencil className="size-3.5" />
                  <span>Edit Profile & Resume</span>
                </Button>
                <Button
                  variant="outline"
                  render={<Link href={`/dashboard/candidates/${items[0].id}`} />}
                  className="h-9 cursor-pointer rounded-lg px-3 text-xs font-medium"
                >
                  <span>View 360 Profile</span>
                </Button>
              </div>
            ) : (
              <Button
                render={<Link href="/dashboard/candidates/new" />}
                className="bg-primary hover:bg-primary/90 text-primary-foreground flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold shadow-xs transition-all hover:shadow active:scale-[0.99]"
              >
                <Plus className="size-4" />
                <span>Upload Resume & Fill Details</span>
              </Button>
            )
          ) : (
            <Button
              render={<Link href="/dashboard/candidates/new" />}
              className="bg-primary hover:bg-primary/90 text-primary-foreground flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold shadow-xs transition-all hover:shadow active:scale-[0.99]"
            >
              <Plus className="size-4" />
              <span>Add candidate</span>
            </Button>
          )
        }
      />

      {/* Candidate Profile Quick Edit Banner for Job Seekers */}
      {role === 'candidate' && items[0] && (
        <section
          aria-label="Candidate Profile Summary"
          className="border-primary/30 from-card via-primary/5 to-card space-y-4 rounded-2xl border bg-gradient-to-r p-5 shadow-xs sm:p-6"
        >
          <div className="border-border/60 flex flex-col justify-between gap-4 border-b pb-4 sm:flex-row sm:items-center">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-foreground text-xl font-bold tracking-tight">
                  {items[0].full_name}
                </h2>
                <span className="status-chip status-positive inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck className="size-3" />
                  Active Profile & Autofill Ready
                </span>
              </div>
              <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <Briefcase className="text-muted-foreground/70 size-3.5" />
                <span>
                  {items[0].target_job_titles ||
                    items[0].current_job_title ||
                    'Target role not specified'}
                </span>
              </p>
            </div>
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <Button
                render={<Link href={`/dashboard/candidates/${items[0].id}/edit`} />}
                className="bg-primary hover:bg-primary/90 text-primary-foreground flex h-9 cursor-pointer items-center gap-1.5 rounded-xl px-4 text-xs font-semibold shadow-xs hover:shadow"
              >
                <Pencil className="size-3.5" />
                <span>Edit Profile Details</span>
              </Button>
            </div>
          </div>

          {/* Key Facts Grid */}
          <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-3 lg:grid-cols-6">
            <div className="bg-background/80 border-border/60 space-y-0.5 rounded-xl border p-3">
              <span className="text-muted-foreground block text-[10px] font-semibold tracking-wider uppercase">
                Location (Mandatory)
              </span>
              <p className="text-foreground flex items-center gap-1 truncate font-medium">
                <MapPin className="text-primary size-3 shrink-0" />
                <span>
                  {[items[0].current_city, items[0].current_state].filter(Boolean).join(', ') ||
                    items[0].full_address ||
                    'Location not set'}
                </span>
              </p>
            </div>

            <div className="bg-background/80 border-border/60 space-y-0.5 rounded-xl border p-3">
              <span className="text-muted-foreground block text-[10px] font-semibold tracking-wider uppercase">
                LinkedIn (Mandatory)
              </span>
              <p className="text-foreground truncate font-medium">
                {items[0].linkedin_url ? (
                  <a
                    href={
                      items[0].linkedin_url.startsWith('http')
                        ? items[0].linkedin_url
                        : `https://${items[0].linkedin_url}`
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary inline-flex items-center gap-1 hover:underline"
                  >
                    <span>View Profile</span>
                    <ExternalLink className="size-2.5" />
                  </a>
                ) : (
                  <span className="font-medium text-amber-600 dark:text-amber-400">Missing</span>
                )}
              </p>
            </div>

            <div className="bg-background/80 border-border/60 space-y-0.5 rounded-xl border p-3">
              <span className="text-muted-foreground block text-[10px] font-semibold tracking-wider uppercase">
                Work Authorization
              </span>
              <p className="text-foreground truncate font-medium">
                {items[0].work_authorization ||
                  items[0].visa_status ||
                  (items[0].authorized_in_usa ? 'Authorized (USA)' : 'Requires Sponsorship')}
              </p>
            </div>

            <div className="bg-background/80 border-border/60 space-y-0.5 rounded-xl border p-3">
              <span className="text-muted-foreground block text-[10px] font-semibold tracking-wider uppercase">
                Gender
              </span>
              <p className="text-foreground truncate font-medium">
                {items[0].gender || (items[0].confirmed_facts as any)?.gender || 'Not specified'}
              </p>
            </div>

            <div className="bg-background/80 border-border/60 space-y-0.5 rounded-xl border p-3">
              <span className="text-muted-foreground block text-[10px] font-semibold tracking-wider uppercase">
                Veteran Status
              </span>
              <p className="text-foreground truncate font-medium">
                {items[0].veteran ||
                  items[0].veteran_status ||
                  (items[0].confirmed_facts as any)?.veteran ||
                  (items[0].confirmed_facts as any)?.veteran_status ||
                  'Not specified'}
              </p>
            </div>

            <div className="bg-background/80 border-border/60 space-y-0.5 rounded-xl border p-3">
              <span className="text-muted-foreground block text-[10px] font-semibold tracking-wider uppercase">
                Disability Status
              </span>
              <p className="text-foreground truncate font-medium">
                {items[0].disability ||
                  items[0].disability_status ||
                  (items[0].confirmed_facts as any)?.disability ||
                  (items[0].confirmed_facts as any)?.disability_status ||
                  'Not specified'}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Metrics Section */}
      <section aria-label="Candidate metrics" className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        <div className="border-border/70 bg-card hover:border-border rounded-2xl border p-4 shadow-xs transition-all sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
              Saved profiles
            </span>
            <div className="bg-primary/10 text-primary border-primary/20 flex size-8 items-center justify-center rounded-lg border shadow-2xs">
              <Users className="size-4" />
            </div>
          </div>
          <p className="text-foreground mt-2 font-mono text-3xl font-bold tracking-tight tabular-nums">
            {loading ? '—' : total}
          </p>
          <p className="text-muted-foreground mt-1 text-[11px]">
            Total candidates in talent database
          </p>
        </div>

        <div className="border-border/70 bg-card hover:border-border rounded-2xl border p-4 shadow-xs transition-all sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
              Active on this page
            </span>
            <div className="flex size-8 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-600 shadow-2xs dark:text-emerald-400">
              <Clock className="size-4" />
            </div>
          </div>
          <p className="text-foreground mt-2 flex items-center gap-2 font-mono text-3xl font-bold tracking-tight tabular-nums">
            {loading ? '—' : active}
            <span className="inline-flex size-2 animate-pulse rounded-full bg-emerald-500" />
          </p>
          <p className="text-muted-foreground mt-1 text-[11px]">Ready for placement interviews</p>
        </div>

        <div className="border-border/70 bg-card hover:border-border rounded-2xl border p-4 shadow-xs transition-all sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-[11px] font-semibold tracking-wider uppercase">
              Reviewed on this page
            </span>
            <div className="flex size-8 items-center justify-center rounded-lg border border-blue-500/20 bg-blue-500/10 text-blue-600 shadow-2xs dark:text-blue-400">
              <ShieldCheck className="size-4" />
            </div>
          </div>
          <p className="text-foreground mt-2 font-mono text-3xl font-bold tracking-tight tabular-nums">
            {loading ? '—' : verified}
          </p>
          <p className="text-muted-foreground mt-1 text-[11px]">Confirmed work history & facts</p>
        </div>
      </section>

      {/* Candidate Filters & Search */}
      <section aria-label="Candidate filters" className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Segmented Filter Pills */}
          <div
            className="bg-muted/50 border-border/60 inline-flex items-center gap-1 rounded-xl border p-1"
            aria-label="Candidate availability"
          >
            {[
              { id: 'all', label: 'All candidates' },
              { id: 'active', label: 'Active bench' },
              { id: 'review', label: 'Needs review' },
            ].map((tab) => {
              const isSelected = filter === tab.id;
              return (
                <button
                  type="button"
                  key={tab.id}
                  aria-pressed={isSelected}
                  onClick={() => setFilter(tab.id)}
                  className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
                    isSelected
                      ? 'bg-background text-foreground ring-border/60 font-semibold shadow-xs ring-1'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Search Input with Clear Button */}
          <div className="relative w-full sm:w-80">
            <Search className="text-muted-foreground/70 pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              type="search"
              aria-label="Search candidates"
              placeholder="Name, skill, location or visa…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="bg-background border-border/70 focus-visible:ring-primary/20 focus-visible:border-primary h-9.5 rounded-xl pr-8 pl-9 text-xs shadow-2xs focus-visible:ring-2"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2.5 -translate-y-1/2 cursor-pointer text-xs"
              >
                ✕
              </button>
            )}
          </div>
        </div>
        <p className="text-muted-foreground text-[11px]">
          Search and availability filters apply to this page of saved profiles.
        </p>
      </section>

      {/* Error state */}
      {error && (
        <WorkspaceError message={error}>
          <Button
            variant="outline"
            className="mt-2 text-xs"
            onClick={() => {
              setLoading(true);
              setRevision((v) => v + 1);
            }}
          >
            Try again
          </Button>
        </WorkspaceError>
      )}

      {/* Main Roster or Skeleton or Empty */}
      {loading ? (
        <WorkspaceSkeleton />
      ) : !visible.length ? (
        <WorkspaceEmpty
          title={items.length ? 'No matching candidates' : 'Build your talent bench'}
          description={
            items.length
              ? 'Try another skill, name or availability filter.'
              : 'Upload a resume, review the extracted facts, and confirm the candidate profile.'
          }
          action={
            items.length ? (
              <Button
                variant="outline"
                className="text-xs"
                onClick={() => {
                  setQuery('');
                  setFilter('all');
                }}
              >
                Clear filters
              </Button>
            ) : (
              <Button render={<Link href="/dashboard/candidates/new" />} className="text-xs">
                Add your first candidate
              </Button>
            )
          }
        />
      ) : (
        <CandidateRoster candidates={visible} onView={setSelected} />
      )}

      {/* Pagination Footer */}
      <div className="border-border/60 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <p className="text-muted-foreground text-xs font-medium">
          {visible.length} shown · {total} saved profiles · Page {page + 1}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!page || loading}
            onClick={() => {
              setLoading(true);
              setPage((v) => v - 1);
            }}
            className="h-8 cursor-pointer rounded-lg text-xs font-medium"
          >
            <ChevronLeft className="size-3.5" />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!hasMore || loading}
            onClick={() => {
              setLoading(true);
              setPage((v) => v + 1);
            }}
            className="h-8 cursor-pointer rounded-lg text-xs font-medium"
          >
            Next
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Detail Dialog */}
      <CandidateDetailDialog
        key={selected?.id || 'none'}
        candidate={selected}
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </main>
  );
}
