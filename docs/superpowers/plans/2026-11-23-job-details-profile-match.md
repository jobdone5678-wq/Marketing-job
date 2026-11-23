# Job Details Profile Match & Skills Breakdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the clean "Profile match" card on the job details view (`/dashboard/jobs/[id]` and `/jobs/[id]`) showing real match percentage, 1 of N skills counter, progress bar, and "You have" (green) / "Missing" (red) pill badges without any "Tailor my CV" button.

**Architecture:** Server-side candidate resume and skills hydration in `src/app/dashboard/jobs/[id]/page.tsx` passed as props to `JobDetailClient`. A deterministic skill-matching helper categorizes required job skills against candidate facts into matched vs missing skills, rendered cleanly in `JobMatchCard.tsx`.

**Tech Stack:** Next.js (App Router, React Server Components), Tailwind CSS, TypeScript, Supabase PostgreSQL, Node.js Test Runner.

**Spec:** `docs/superpowers/specs/2026-11-23-job-details-profile-match-design.md`

## Global Constraints
- Strictly **DO NOT implement "Tailor my CV"** (no button, no action, no UI element).
- Never remove or break existing metadata rows (Location, Region, Grade, Category, Country), source attribution box, or voting buttons in `JobFactsSidebar`.
- Provide client-side fallback to `useJobProfileSkills()` for unauthenticated visitors on `/jobs/[id]`.
- All binary / string operations must remain browser and server compatible without unneeded dependencies.

## Review Focus
1. Single skill match (e.g., job requires `Java` and `Analytics`, candidate has `Java` -> exactly 50% match, 1 of 2 skills, Java in green "You have", Analytics in bordered "Missing").
2. Zero required skills on job -> Graceful fallback displaying 100% or "Skills not specified" without division by zero (`NaN`).
3. 100% match (all skills present) -> Missing section cleanly omitted or empty without layout breakdown.
4. 0% match (no skills present) -> "You have" section cleanly omitted, progress bar at 0%, all skills in "Missing".
5. Case-insensitive and alias matching (e.g., candidate has `React.js` or `REACT`, job requires `React` -> correctly classified as matched).

---

### Task 1: Skill Matching Engine & Unit Test Suite

**Files:**
- Create: `tests/job-details-match.test.mjs`
- Modify: `src/lib/resumes/job-match.ts:1-120`

**Interfaces:**
- Produces: `computeJobDetailsMatch(jobSkills: string[], candidateSkills: string[], resumeText?: string): JobDetailsMatchResult`
- Consumes: canonical skill lists and candidate profile/resume context.

- [x] **Step 1: Write failing unit test for job details skill matching**

Create `tests/job-details-match.test.mjs`:
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeJobDetailsMatch } from '../src/lib/resumes/job-match.ts';

test('calculates exact 50% match when 1 of 2 skills matched', () => {
  const jobSkills = ['Java', 'Analytics'];
  const candidateSkills = ['java', 'spring boot'];
  const result = computeJobDetailsMatch(jobSkills, candidateSkills);

  assert.equal(result.matchPercentage, 50);
  assert.equal(result.matchedSkills.length, 1);
  assert.equal(result.matchedSkills[0], 'Java');
  assert.equal(result.missingSkills.length, 1);
  assert.equal(result.missingSkills[0], 'Analytics');
  assert.equal(result.totalSkillsCount, 2);
});

test('matches skills mentioned in candidate resume text even if not in explicit skill array', () => {
  const jobSkills = ['Java', 'Docker', 'Kubernetes'];
  const candidateSkills = ['Java'];
  const resumeText = 'Extensive experience deploying microservices with Docker and AWS.';
  const result = computeJobDetailsMatch(jobSkills, candidateSkills, resumeText);

  assert.equal(result.matchedSkills.includes('Java'), true);
  assert.equal(result.matchedSkills.includes('Docker'), true);
  assert.equal(result.missingSkills.includes('Kubernetes'), true);
  assert.equal(result.matchPercentage, 67);
  assert.equal(result.totalSkillsCount, 3);
});

test('handles empty job skills without NaN or crashing', () => {
  const result = computeJobDetailsMatch([], ['Java']);
  assert.equal(result.matchPercentage, 100);
  assert.equal(result.totalSkillsCount, 0);
  assert.equal(result.matchedSkills.length, 0);
  assert.equal(result.missingSkills.length, 0);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/job-details-match.test.mjs`  
Expected: FAIL (`computeJobDetailsMatch is not a function`)

- [x] **Step 3: Implement `computeJobDetailsMatch` in `src/lib/resumes/job-match.ts`**

Export `computeJobDetailsMatch` supporting skill normalization, alias matching, and optional resume text token lookup.

- [x] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/job-details-match.test.mjs`  
Expected: PASS (3/3 tests)

- [x] **Step 5: Commit**

```bash
git add src/lib/resumes/job-match.ts tests/job-details-match.test.mjs
git commit -m "feat: implement computeJobDetailsMatch helper with comprehensive test suite"
```

---

### Task 2: Server-Side Candidate Hydration in Dashboard Job Details Page

**Files:**
- Modify: `src/app/dashboard/jobs/[id]/page.tsx:1-60`

**Interfaces:**
- Produces: `candidateResume = { text: string; skills: string[] }` passed to `JobDetailClient`.
- Consumes: Supabase server client `createClient()` and tables `candidates`, `resumes`.

- [x] **Step 1: Update `src/app/dashboard/jobs/[id]/page.tsx` to query candidate data**

1. Import `createClient` from `@/lib/supabase/server`.
2. Retrieve current user via `supabase.auth.getUser()`.
3. If user exists:
   - Query `candidates` for `skills, primary_skills, confirmed_facts, raw_text` where `user_id = user.id`.
   - Query `resumes` for `skills, raw_text` where `user_id = user.id` and `status = 'confirmed'`.
   - Collate all unique skills and full resume text.
4. Pass `candidateResume` prop to `<JobDetailClient />`.

- [x] **Step 2: Verify typecheck passes**

Run: `npm run typecheck`  
Expected: PASS with 0 errors.

- [x] **Step 3: Commit**

```bash
git add src/app/dashboard/jobs/[id]/page.tsx
git commit -m "feat: hydrate candidate profile and resume server-side on dashboard job detail page"
```

---

### Task 3: Redesign `JobMatchCard` & Wire Match Logic in `JobDetailClient`

**Files:**
- Modify: `src/components/jobs/detail/JobMatchCard.tsx:1-200`
- Modify: `src/components/jobs/detail/JobFactsSidebar.tsx:1-120`
- Modify: `src/app/jobs/[id]/JobDetailClient.tsx:1-380`

**Interfaces:**
- Produces: Clean Profile Match card matching reference layout with "• You have" and "• Missing" skill chips.
- Consumes: `computeJobDetailsMatch` with server hydrated or client fallback skills.

- [x] **Step 1: Redesign `JobMatchCard.tsx`**

1. Remove:
   - "Upload CV" box.
   - "Close — you have a related skill" section.
   - Interactive popover actions (claim/avoid buttons).
2. Render:
   - Header: `<p className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">Profile match</p>`
   - Score & counter: `<span className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">{matchPercentage}%</span>` with `<span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{matchedSkills.length} of {totalSkillsCount} skills</span>`.
   - Progress bar: `<div className="h-2 w-full overflow-hidden rounded bg-neutral-100 dark:bg-neutral-800"><div className="h-full bg-[#5B891A] transition-all duration-300" style={{ width: `${matchPercentage}%` }} /></div>`.
   - `• You have` group: Green dot `size-2 rounded-full bg-[#5B891A]` + label `You have`, rendering matched pills (`bg-[#EBF5D5] text-[#3B660E] border border-[#CCE8A2] rounded-full px-3 py-1 text-xs font-medium`).
   - `• Missing` group: Red dot `size-2 rounded-full bg-rose-500` + label `Missing`, rendering missing pills (`bg-neutral-50 text-neutral-700 border border-neutral-200 rounded-full px-3 py-1 text-xs font-medium dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-300`).
   - Enforce: NO "Tailor my CV" button.

- [x] **Step 2: Update `JobFactsSidebar.tsx`**

Streamline props passed to `JobMatchCard`: pass `matchPercentage`, `matchedSkills`, `missingSkills`, `totalSkillsCount`.

- [x] **Step 3: Update `JobDetailClient.tsx`**

1. Accept optional prop `candidateResume?: { text?: string; skills?: string[] } | null`.
2. Compute `matchedSkills`, `missingSkills`, and `matchPercentage` using `computeJobDetailsMatch` combining `candidateResume?.skills`, `candidateResume?.text`, and fallback `baseProfileSkills`.
3. Pass values to `JobFactsSidebar`.

- [x] **Step 4: Run unit tests and typecheck**

Run: `node --experimental-strip-types --test tests/job-details-match.test.mjs; npm run typecheck`  
Expected: PASS with 0 errors.

- [x] **Step 5: Run full test suite to guarantee zero regression**

Run: `node --experimental-strip-types --test tests/url-canonicalization.test.mjs tests/ats-scoring-feed.test.mjs tests/background-storage-proxy.test.mjs tests/universal-discovery-attachment.test.mjs tests/ai-screening-scoped.test.mjs tests/submission-pipeline-resilience.test.mjs tests/cross-tab-sync.test.mjs tests/application-lifecycle.test.mjs tests/job-details-match.test.mjs`  
Expected: 57 tests pass, 0 fail.

- [x] **Step 6: Commit**

```bash
git add src/components/jobs/detail/JobMatchCard.tsx src/components/jobs/detail/JobFactsSidebar.tsx src/app/jobs/[id]/JobDetailClient.tsx
git commit -m "feat: redesign JobMatchCard to match reference profile match layout"
```
