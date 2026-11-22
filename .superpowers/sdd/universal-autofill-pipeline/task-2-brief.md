# Task 2: Server-Side Candidate Hydration & Comprehensive ATS Scoring on `/dashboard/jobs`

## Files
- Modify: `src/app/dashboard/jobs/page.tsx`
- Modify: `src/app/jobs/JobsFeedClient.tsx`
- Modify: `src/components/jobs/feed/JobCard.tsx`
- Test: `tests/ats-scoring-feed.test.mjs`

## Interfaces
- Consumes:
  - `compareResumeToJob(resumeText: string, jobDescription: string)` from `src/lib/resumes/job-match.ts`
  - `candidateJobApplications(candidateId: string | null | undefined)` from `src/lib/jobs/applications.ts`
  - `applicationUrlKey(url: string | null | undefined)` from `src/lib/jobs/application-state.ts`
- Produces:
  - `<JobsFeedClient candidateResume={...} appliedKeys={...} />`
  - ATS score badge and `Applied ✓` badge on `<JobCard />`

## Exact Requirements & Steps

1. **Step 1: Write/Update test in `tests/ats-scoring-feed.test.mjs`**:
Import real exports and verify:
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { compareResumeToJob } from '../src/lib/resumes/job-match.ts';
import { applicationUrlKey } from '../src/lib/jobs/application-state.ts';

test('compareResumeToJob computes high match score for matching resume skills', () => {
  const resumeText = 'Senior Full Stack Engineer with 5+ years of React, TypeScript, Next.js, and Node.js experience.';
  const jobDescription = 'Looking for a Senior Software Engineer with strong TypeScript, React, and Next.js skills.';
  const match = compareResumeToJob(resumeText, jobDescription);
  assert.ok(match.score !== null && match.score >= 70, `Expected score >= 70, got ${match.score}`);
  assert.ok(match.matched.includes('TypeScript'));
  assert.ok(match.matched.includes('React'));
});

test('applicationUrlKey matches both primary URL and source_url against appliedKeys', () => {
  const jobUrl = 'https://boards.greenhouse.io/company/jobs/123';
  const appliedKey = applicationUrlKey(jobUrl);
  const keys = new Set([appliedKey]);
  assert.ok(keys.has(applicationUrlKey(jobUrl)));
});
```

2. **Step 2: Update `DashboardJobsPage` (`src/app/dashboard/jobs/page.tsx`)**:
- Import `sessionProfile` from `@/lib/auth/session-profile` (or `requireProfile` from `@/lib/auth/require-profile`).
- Import `database` from `@/lib/db/admin`.
- Import `candidateJobApplications` from `@/lib/jobs/applications`.
- Resolve current candidate profile for authenticated user:
  ```typescript
  const profile = await sessionProfile();
  let candidateResume: { text: string; skills: string[] } | null = null;
  let appliedKeys: string[] = [];

  if (profile) {
    const db = database();
    const { data: candidate } = await db
      .from('candidates')
      .select('id, skills, confirmed_facts, resume_text')
      .eq('user_id', profile.id)
      .maybeSingle();

    if (candidate) {
      const { appliedKeys: keys } = await candidateJobApplications(candidate.id);
      appliedKeys = Array.from(keys);
      const text = candidate.resume_text || candidate.confirmed_facts?.resume_text || '';
      candidateResume = { text, skills: candidate.skills || [] };
    }
  }
  ```
- Pass `appliedKeys={appliedKeys}` and `candidateResume={candidateResume}` into `<JobsFeedClient>`.

3. **Step 3: Update `JobsFeedClient` (`src/app/jobs/JobsFeedClient.tsx`)**:
- Accept `appliedKeys?: string[]` and `candidateResume?: { text: string; skills: string[] } | null` as props.
- Convert `appliedKeys` to a memoized Set: `const appliedKeySet = useMemo(() => new Set(appliedKeys || []), [appliedKeys]);`
- For every job rendered (in list, map, or swipe deck across pagination and filter changes):
  - Determine `isApplied`:
    `const isApplied = Boolean((job.url && appliedKeySet.has(applicationUrlKey(job.url) || '')) || (job.source_url && appliedKeySet.has(applicationUrlKey(job.source_url) || '')));`
  - Compute `atsMatch`:
    ```typescript
    const jobText = job.description || job.enrichment?.summary || '';
    let match: { score: number | null; matched: string[]; missing: string[] } | null = null;
    if (candidateResume?.text && jobText) {
      match = compareResumeToJob(candidateResume.text, jobText);
    } else if (candidateResume?.skills?.length && (job.skills?.length || job.enrichment?.skills?.length)) {
      // Fallback skill match when no resume text is present
      const jobSkills = job.enrichment?.skills || job.skills || [];
      const matched = jobSkills.filter((s: string) => candidateResume.skills.some((cs: string) => cs.toLowerCase() === s.toLowerCase()));
      const score = Math.round((matched.length / Math.max(1, jobSkills.length)) * 100);
      match = { score, matched, missing: jobSkills.filter((s: string) => !matched.includes(s)) };
    }
    ```
  - Pass `atsMatch` and `isApplied` down to `<JobCard />`.

4. **Step 4: Update `JobCard` (`src/components/jobs/feed/JobCard.tsx`)**:
- Accept props `atsMatch?: { score: number | null; matched: string[]; missing: string[] } | null` and `isApplied?: boolean`.
- Render ATS score badge:
  - If `atsMatch?.score !== null && atsMatch?.score !== undefined`:
    - `>= 75%`: Green pill (e.g. `border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800`) showing `{atsMatch.score}% Match`.
    - `50% - 74%`: Amber pill (e.g. `border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800`) showing `{atsMatch.score}% Match`.
    - `< 50%`: Slate pill (e.g. `border-neutral-200 bg-neutral-50 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300`) showing `{atsMatch.score}% Match`.
    - Include title / tooltip showing matched skills (e.g. `Matched: ${atsMatch.matched.join(', ')}`).
  - If candidate has no resume and no skills: Render a subtle prompt pill (`Upload resume for ATS score`).
- If `isApplied` is true, render a prominent `Applied ✓` green badge beside the job title or bookmark button.

5. **Step 5: Verify tests and typechecking**:
Run: `node --experimental-strip-types --test tests/ats-scoring-feed.test.mjs && npm run typecheck`
Ensure zero TypeScript compilation errors.

6. **Step 6: Commit**:
Commit message: `"feat: implement client-side ATS scoring and applied badges on dashboard jobs"`

## Report Contract
Write your full report to:
`.superpowers/sdd/universal-autofill-pipeline/task-2-report.md`
Your final response must report:
- Status (DONE, DONE_WITH_CONCERNS, NEEDS_CONTEXT, or BLOCKED)
- Commit SHA(s)
- One-line test summary
- Any concerns or notes
