# Task 2 Brief: Server-Side Candidate Hydration in Dashboard Job Details Page

**Base Commit:** 860f7b69f6473e845e94f332227c2d05a312052d

## Deliverable
Hydrate candidate profile facts and resume server-side on the dashboard job detail page:
1. In `src/app/jobs/[id]/JobDetailClient.tsx`:
   - Add `candidateResume?: { text?: string; skills?: string[] } | null;` to `JobDetailClientProps`.
2. In `src/app/dashboard/jobs/[id]/page.tsx`:
   - Import `requireProfile` from `@/lib/auth/server` and `database` from `@/lib/db/admin`.
   - Before returning `<JobDetailClient />`, query candidate for authenticated user (`profile.id`), extract skills and raw resume text into `candidateResume: { text, skills }`.
   - Pass `candidateResume={candidateResume}` into `<JobDetailClient />`.

## Verification
- Run `npm run typecheck` (`tsc --noEmit --incremental false`) and verify 0 errors.
- Commit:
  `git add src/app/dashboard/jobs/[id]/page.tsx src/app/jobs/[id]/JobDetailClient.tsx`
  `git commit -m "feat: hydrate candidate profile and resume server-side on dashboard job detail page"`
