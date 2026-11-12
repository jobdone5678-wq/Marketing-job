"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Search,
  Plus,
  ShieldCheck,
  Clock,
  Users,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { api } from "@/lib/api-client";
import type { Candidate } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CandidateRoster } from "@/components/candidate-roster";
import { CandidateDetailDialog } from "@/components/candidate-detail-dialog";
import {
  WorkspaceHeading,
  WorkspaceSkeleton,
  WorkspaceEmpty,
  WorkspaceError,
} from "@/components/workspace-ui";

export default function CandidatesPage() {
  const [items, setItems] = useState<Candidate[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [hasMore, setMore] = useState(false);
  const [role, setRole] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
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
          setError("");
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
          .join(" ")
          .toLowerCase();

        return (
          haystack.includes(query.trim().toLowerCase()) &&
          (filter === "all" ||
            (filter === "active" && candidate.is_active_bench) ||
            (filter === "review" && candidate.provenance_status !== "confirmed"))
        );
      }),
    [items, query, filter]
  );

  const active = items.filter((c) => c.is_active_bench).length;
  const verified = items.filter((c) => c.provenance_status === "confirmed").length;

  return (
    <main className="portal-page space-y-6">
      {/* Workspace Header */}
      <WorkspaceHeading
        eyebrow="Talent workspace"
        title={role === "client" ? "My profile & resume" : "Bench candidates"}
        description="Reviewed talent, ready for the right opportunity. Keep candidate facts and documents together."
        actions={
          (role !== "client" || !total) && (
            <Button
              render={<Link href="/dashboard/candidates/new" />}
              className="h-9 px-3.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-xs hover:shadow active:scale-[0.99] transition-all flex items-center gap-1.5 cursor-pointer text-xs"
            >
              <Plus className="size-4" />
              <span>Add candidate</span>
            </Button>
          )
        }
      />

      {/* Metrics Section */}
      <section
        aria-label="Candidate metrics"
        className="grid grid-cols-1 sm:grid-cols-3 gap-3.5"
      >
        <div className="p-4 sm:p-5 rounded-2xl border border-border/70 bg-card shadow-xs hover:border-border transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Saved profiles
            </span>
            <div className="size-8 rounded-lg bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shadow-2xs">
              <Users className="size-4" />
            </div>
          </div>
          <p className="mt-2 text-3xl font-bold tracking-tight text-foreground font-mono tabular-nums">
            {loading ? "—" : total}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">Total candidates in talent database</p>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl border border-border/70 bg-card shadow-xs hover:border-border transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Active on this page
            </span>
            <div className="size-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center shadow-2xs">
              <Clock className="size-4" />
            </div>
          </div>
          <p className="mt-2 text-3xl font-bold tracking-tight text-foreground font-mono tabular-nums flex items-center gap-2">
            {loading ? "—" : active}
            <span className="inline-flex size-2 rounded-full bg-emerald-500 animate-pulse" />
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">Ready for placement interviews</p>
        </div>

        <div className="p-4 sm:p-5 rounded-2xl border border-border/70 bg-card shadow-xs hover:border-border transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Reviewed on this page
            </span>
            <div className="size-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center justify-center shadow-2xs">
              <ShieldCheck className="size-4" />
            </div>
          </div>
          <p className="mt-2 text-3xl font-bold tracking-tight text-foreground font-mono tabular-nums">
            {loading ? "—" : verified}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">Confirmed work history & facts</p>
        </div>
      </section>

      {/* Candidate Filters & Search */}
      <section aria-label="Candidate filters" className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Segmented Filter Pills */}
          <div
            className="inline-flex items-center p-1 rounded-xl bg-muted/50 border border-border/60 gap-1"
            aria-label="Candidate availability"
          >
            {[
              { id: "all", label: "All candidates" },
              { id: "active", label: "Active bench" },
              { id: "review", label: "Needs review" },
            ].map((tab) => {
              const isSelected = filter === tab.id;
              return (
                <button
                  type="button"
                  key={tab.id}
                  aria-pressed={isSelected}
                  onClick={() => setFilter(tab.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-150 cursor-pointer ${
                    isSelected
                      ? "bg-background text-foreground shadow-xs font-semibold ring-1 ring-border/60"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Search Input with Clear Button */}
          <div className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute top-1/2 -translate-y-1/2 left-3 size-4 text-muted-foreground/70" />
            <Input
              type="search"
              aria-label="Search candidates"
              placeholder="Name, skill, location or visa…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-9.5 bg-background pl-9 pr-8 text-xs rounded-xl border-border/70 shadow-2xs focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute top-1/2 -translate-y-1/2 right-2.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">
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
          title={items.length ? "No matching candidates" : "Build your talent bench"}
          description={
            items.length
              ? "Try another skill, name or availability filter."
              : "Upload a resume, review the extracted facts, and confirm the candidate profile."
          }
          action={
            items.length ? (
              <Button
                variant="outline"
                className="text-xs"
                onClick={() => {
                  setQuery("");
                  setFilter("all");
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
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
        <p className="text-xs text-muted-foreground font-medium">
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
            className="h-8 rounded-lg text-xs font-medium cursor-pointer"
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
            className="h-8 rounded-lg text-xs font-medium cursor-pointer"
          >
            Next
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Detail Dialog */}
      <CandidateDetailDialog
        key={selected?.id || "none"}
        candidate={selected}
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </main>
  );
}
