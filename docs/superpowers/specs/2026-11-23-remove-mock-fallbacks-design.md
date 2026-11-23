# Design Specification: Remove Mock Fallback Datasets & Surface Explicit Errors

**Date:** 2026-11-23  
**Status:** Approved by User  
**Target Files:**
- `src/lib/jobs/freehire-api.ts`
- `src/lib/jobs/freehire-fallback.ts` (remove)
- `src/app/dashboard/jobs/page.tsx`
- `src/app/jobs/JobsFeedClient.tsx`
- `src/app/dashboard/jobs/[id]/page.tsx`

---

## 1. Intent & Purpose

Previously, when requests to the remote FreeHire API (`https://freehire.me/api/v1/jobs/...`) failed or timed out, `freehire-api.ts` silently caught the error and served static mock fallback data (`FALLBACK_JOBS`, `REDCARE_PHARMACY_JOB`, `FALLBACK_FACETS`). This caused stale, fake, or unexpected jobs to appear in the dashboard instead of alerting the user to real network or API issues.

The goal is to strictly remove all mock/fallback datasets. When API calls fail, the system must bubble up the failure and surface an explicit, helpful error state with a retry option.

---

## 2. API Layer Changes (`src/lib/jobs/freehire-api.ts`)

1. **`searchFreehireJobs`**:
   - Remove the `catch` block returning `FALLBACK_JOBS`.
   - If `fetchJobList` fails or throws, return `{ items: [], total: 0, hasMore: false, error: err.message }` or rethrow so the calling server component can display an explicit error state.
2. **`getFreehireJob`**:
   - If HTTP 404 is received, return `null` (triggering Next.js `notFound()`).
   - If network/fetch fails, rethrow the error so `loadJob` in `DashboardJobDetailPage` returns `{ unavailable: true }`.
   - Delete all references to `REDCARE_PHARMACY_JOB` and `FALLBACK_JOBS`.
3. **`getFreehireFacets`**:
   - If the remote facets request fails, return empty facets data (`undefined` or `{ total: 0, facets: { category: [], work_mode: [], countries: [], skills: [] } }`), never `FALLBACK_FACETS`.
4. **`getSimilarFreehireJobs`**:
   - If the request fails, return an empty array `[]`, never `FALLBACK_JOBS`.
5. **Delete `src/lib/jobs/freehire-fallback.ts`**:
   - Remove file completely from the codebase.

---

## 3. UI Error Presentation

1. **Job Feed (`src/app/dashboard/jobs/page.tsx` & `JobsFeedClient.tsx`)**:
   - In `DashboardJobsPage`: Catch any fetch errors from `searchFreehireJobs` and pass `error` string to `JobsFeedClient`.
   - In `JobsFeedClient`: If `error` is present, render a clean error card:
     - Message: `"Unable to load job openings from FreeHire.me. Please check your connection or try again."`
     - Action: `"Retry"` button triggering `refreshFeed()`.
2. **Job Details (`src/app/dashboard/jobs/[id]/page.tsx`)**:
   - When `loadJob` catches an error, it returns `{ unavailable: true }`.
   - Renders the existing clean error state:
     - Message: `"This job opening could not be loaded from FreeHire.me. Try refreshing the page."`
   - If `!result.job`, calls `notFound()`.

---

## 4. Verification Plan

1. **Typecheck**:
   - Run `npm run typecheck` (`tsc --noEmit --incremental false`) with 0 errors.
2. **Unit Tests**:
   - Run `node --experimental-strip-types --test tests/url-canonicalization.test.mjs tests/ats-scoring-feed.test.mjs tests/background-storage-proxy.test.mjs tests/universal-discovery-attachment.test.mjs tests/ai-screening-scoped.test.mjs tests/submission-pipeline-resilience.test.mjs tests/cross-tab-sync.test.mjs tests/application-lifecycle.test.mjs tests/job-details-match.test.mjs`
   - Ensure all 59 tests pass.
