# Remove Mock Fallback Datasets & Surface Explicit Errors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completely eliminate all mock/fallback datasets (`FALLBACK_JOBS`, `REDCARE_PHARMACY_JOB`, `FALLBACK_FACETS`) from `freehire-api.ts`, delete `freehire-fallback.ts`, and display clear error states with retry buttons on fetch failures.

**Architecture:** Remove fallback data catches in `src/lib/jobs/freehire-api.ts`. Let failures bubble up to Next.js server components (`DashboardJobsPage` and `DashboardJobDetailPage`), rendering user-facing error states instead of silent fake data.

**Tech Stack:** Next.js (App Router), TypeScript, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-11-23-remove-mock-fallbacks-design.md`

## Global Constraints
- Never return `FALLBACK_JOBS`, `REDCARE_PHARMACY_JOB`, or `FALLBACK_FACETS` under any circumstances.
- If the remote FreeHire API fails or times out, present a clean, clear error UI with a Retry button.
- Zero TypeScript typecheck errors and all 59 existing test suite cases must pass.

## Review Focus
1. Search error handling: When `searchFreehireJobs` fails, verify an error card is rendered with a Retry button, not fake job cards.
2. Detail error handling: When `getFreehireJob` fails, verify `result.unavailable` renders the error page rather than Redcare Pharmacy.
3. 404 handling: When a job does not exist, `notFound()` is invoked.
4. Clean removal: Zero remaining references to `freehire-fallback.ts` in the repository.

---

### Task 1: Remove Mock Fallback Datasets & Delete `freehire-fallback.ts`

**Files:**
- Modify: `src/lib/jobs/freehire-api.ts`
- Modify: `src/lib/jobs/freehire-types.ts`
- Delete: `src/lib/jobs/freehire-fallback.ts`

- [ ] **Step 1: Update `src/lib/jobs/freehire-types.ts` to support optional error in `Slice<T>`**

Add `error?: string;` to `Slice<T>`.

- [ ] **Step 2: Update `src/lib/jobs/freehire-api.ts` to remove all fallback mock data**

1. Remove import from `./freehire-fallback`.
2. In `searchFreehireJobs`:
   - Catch fetch errors and return `{ items: [], total: 0, hasMore: false, error: (error as Error).message }`.
3. In `getFreehireJob`:
   - If `response?.data?.public_slug`, return `response.data`.
   - If response status is 404, return `null`.
   - On error, throw or return `null`. Never return `REDCARE_PHARMACY_JOB`.
4. In `getFreehireFacets`:
   - Return `response.data` if available, or `undefined` on failure.
5. In `getSimilarFreehireJobs`:
   - Return `data` or `[]` on failure.
6. Delete `src/lib/jobs/freehire-fallback.ts`.

- [ ] **Step 3: Run typecheck to verify no compiler errors**

Run: `npm run typecheck`  
Expected: PASS with 0 errors.

- [ ] **Step 4: Commit**

```bash
git rm src/lib/jobs/freehire-fallback.ts
git add src/lib/jobs/freehire-api.ts src/lib/jobs/freehire-types.ts
git commit -m "feat: remove mock fallback datasets from freehire-api and delete freehire-fallback.ts"
```

---

### Task 2: Surface Clean Error States in `DashboardJobsPage` and `JobsFeedClient`

**Files:**
- Modify: `src/app/dashboard/jobs/page.tsx`
- Modify: `src/app/jobs/JobsFeedClient.tsx`

- [ ] **Step 1: Pass error prop in `src/app/dashboard/jobs/page.tsx`**

Extract `initial?.error` and pass `error={initial?.error || null}` to `JobsFeedClient`.

- [ ] **Step 2: Render error UI in `src/app/jobs/JobsFeedClient.tsx`**

Accept `error?: string | null` in `JobsFeedClientProps`.
When `error` is present or `!initial`:
Render clean error container:
```tsx
<div className="flex flex-col items-center justify-center rounded-2xl border border-neutral-200 bg-white p-12 text-center shadow-2xs dark:border-neutral-800 dark:bg-neutral-900">
  <AlertCircle className="size-8 text-rose-500 mb-3" />
  <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
    Unable to load job openings
  </h3>
  <p className="mt-1 max-w-md text-sm text-neutral-500 dark:text-neutral-400">
    We couldn't connect to FreeHire.me. Please check your internet connection or try refreshing the page.
  </p>
  <button
    type="button"
    onClick={refreshFeed}
    className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
  >
    <RotateCcw className="size-3.5" />
    <span>Try again</span>
  </button>
</div>
```

- [ ] **Step 3: Run typecheck and full test suite**

Run: `npm run typecheck; node --experimental-strip-types --test tests/url-canonicalization.test.mjs tests/ats-scoring-feed.test.mjs tests/background-storage-proxy.test.mjs tests/universal-discovery-attachment.test.mjs tests/ai-screening-scoped.test.mjs tests/submission-pipeline-resilience.test.mjs tests/cross-tab-sync.test.mjs tests/application-lifecycle.test.mjs tests/job-details-match.test.mjs`  
Expected: PASS with 59 tests passing, 0 failing.

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/jobs/page.tsx src/app/jobs/JobsFeedClient.tsx
git commit -m "feat: surface clean error state with retry button on jobs feed"
```
