# Task 1 Brief: Remove Mock Fallback Datasets & Delete `freehire-fallback.ts`

**Base Commit:** c0fc268

## Deliverables
1. In `src/lib/jobs/freehire-types.ts`:
   - Add `error?: string;` to `Slice<T>` interface.
2. In `src/lib/jobs/freehire-api.ts`:
   - Remove import from `./freehire-fallback`.
   - `searchFreehireJobs`: Catch fetch errors and return `{ items: [], total: 0, hasMore: false, error: (error as Error).message }`.
   - `getFreehireJob`: When fetch fails or response is not found, return `null` or rethrow on fatal errors. Never return `REDCARE_PHARMACY_JOB` or `FALLBACK_JOBS`.
   - `getFreehireFacets`: Return `response.data` or `undefined` on failure.
   - `getSimilarFreehireJobs`: Return `data` or `[]` on failure.
3. Delete `src/lib/jobs/freehire-fallback.ts` via `git rm`.

## Verification
- Run `npm run typecheck` (`tsc --noEmit --incremental false`)
- Run unit tests: `node --experimental-strip-types --test tests/ats-scoring-feed.test.mjs tests/job-details-match.test.mjs`
- Commit changes.
