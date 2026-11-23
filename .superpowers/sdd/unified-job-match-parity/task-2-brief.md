# Task 2 Brief: Wire `computeUnifiedJobMatch` in `JobsFeedClient` and `JobDetailClient`

**Base Commit:** 5b90b82
**Spec:** `docs/superpowers/specs/2026-11-23-unified-job-match-parity-design.md`
**Plan:** `docs/superpowers/plans/2026-11-23-unified-job-match-parity.md`

## Deliverables
1. In `src/app/jobs/JobsFeedClient.tsx`:
   - Import `computeUnifiedJobMatch` from `@/lib/resumes/job-match`.
   - Replace legacy `getAtsMatch` implementation to call `computeUnifiedJobMatch(job, candidateResume)`.
2. In `src/app/jobs/[id]/JobDetailClient.tsx`:
   - Import `computeUnifiedJobMatch` from `@/lib/resumes/job-match`.
   - Call `computeUnifiedJobMatch(job, candidateResume, [...baseProfileSkills, ...Array.from(claimedSkills)])`.
3. In `src/components/jobs/feed/JobCard.tsx`:
   - Verify green pill highlight checks `atsMatch.matched` with case-insensitive matching.

## Verification
- Run: `npm run typecheck`
- Run: Full test suite (59 tests)
- Commit:
  `git add src/app/jobs/JobsFeedClient.tsx src/app/jobs/[id]/JobDetailClient.tsx src/components/jobs/feed/JobCard.tsx`
  `git commit -m "feat: wire computeUnifiedJobMatch across feed and detail views for score parity"`
