# Unified Job Match Parity & Score Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify job match score calculation between the feed cards (`/dashboard/jobs`) and the job detail view (`/dashboard/jobs/[id]`) using a single shared helper, ensuring identical percentages, matched skill highlights, and zero drift.

**Architecture:** Implement `computeUnifiedJobMatch(job, candidateResume, fallbackProfileSkills)` in `src/lib/resumes/job-match.ts` with strict word-boundary token matching. Consume this helper in both `JobsFeedClient.tsx` and `JobDetailClient.tsx`, driving `JobCard.tsx` chip highlights directly from the matched skills array.

**Tech Stack:** Next.js (App Router), TypeScript, Tailwind CSS, Node.js Test Runner.

**Spec:** `docs/superpowers/specs/2026-11-23-unified-job-match-parity-design.md`

## Global Constraints
- Feed card score and job detail card score must be 100% identical for the same job and candidate facts.
- Word-boundary matching must strictly prevent false substring matches (e.g., `java` must not match `javascript`, `go` must not match `google`, `api` must not match `rapid`).
- Never truncate or slice the skills array passed into match calculation; only slice for UI rendering (`displaySkills.slice(0, 5)`).
- Preserve all existing tests and zero TypeScript compiler warnings or errors.

## Review Focus
1. Parity: Feed card `atsMatch.score` matches `JobMatchCard` percentage exactly (e.g., both 50% for 3 of 6 skills).
2. Word boundaries: Resume with "JavaScript" does not match job requiring "Java". Resume with "Rapid development" does not match job requiring "API".
3. Empty structured skills: When `job.skills` and `job.enrichment.skills` are empty, both views fall back identically to text matching or 0%.
4. Highlight parity: Feed card pills (`JobCard.tsx`) reflect matched skills identically to the "You have" section on the detail card.
5. No resume profile: Gracefully returns `null` or 0% match without throwing errors.

---

### Task 1: Shared Helper & Word-Boundary Robustness

**Files:**
- Modify: `src/lib/resumes/job-match.ts`
- Modify: `tests/ats-scoring-feed.test.mjs`

**Interfaces:**
- Produces:
  - `extractJobSkills(job: Partial<Job>): string[]`
  - `computeUnifiedJobMatch(job: Partial<Job>, candidateResume?: { text?: string; skills?: string[] } | null, fallbackProfileSkills?: string[]): JobDetailsMatchResult`
- Consumes: `computeJobDetailsMatch`, `compareResumeToJob`.

- [ ] **Step 1: Write unit tests in `tests/ats-scoring-feed.test.mjs` for word-boundary matching and unified match parity**

Add tests to `tests/ats-scoring-feed.test.mjs`:
```javascript
test('computeUnifiedJobMatch produces identical score and matched skills as computeJobDetailsMatch', () => {
  const job = {
    title: 'Salesforce Developer',
    description: 'Looking for a Salesforce and Java developer with Spring Boot and API experience.',
    skills: ['api', 'developer-experience', 'java', 'kotlin', 'salesforce', 'spring'],
  };
  const candidateResume = {
    text: 'Experienced Java engineer working with Spring Boot and REST APIs.',
    skills: ['java', 'spring', 'api'],
  };

  const result = computeUnifiedJobMatch(job, candidateResume);
  assert.equal(result.matchPercentage, 50);
  assert.equal(result.matchedSkills.length, 3);
  assert.deepEqual(result.matchedSkills.sort(), ['api', 'java', 'spring'].sort());
  assert.deepEqual(result.missingSkills.sort(), ['developer-experience', 'kotlin', 'salesforce'].sort());
});

test('word-boundary prevents false positive substring matching', () => {
  const job = {
    title: 'Backend Engineer',
    skills: ['Java', 'Go', 'API'],
  };
  const candidateResume = {
    text: 'Proficient in JavaScript development, rapid prototyping, and Google Cloud Platform.',
    skills: ['JavaScript'],
  };

  const result = computeUnifiedJobMatch(job, candidateResume);
  assert.equal(result.matchPercentage, 0);
  assert.equal(result.matchedSkills.length, 0);
  assert.equal(result.missingSkills.length, 3);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/ats-scoring-feed.test.mjs`  
Expected: FAIL (`computeUnifiedJobMatch is not a function`)

- [ ] **Step 3: Implement `extractJobSkills`, `computeUnifiedJobMatch`, and harden `containsTerm` in `src/lib/resumes/job-match.ts`**

1. In `containsTerm`:
   - Add lookahead negative assertion for Java: `term.toLowerCase() === 'java' ? '(?![ -]*(?:script|Script)\\b)' : ...`
   - Ensure word-boundary regex correctly excludes leading and trailing alphanumeric characters for all terms.
2. Implement and export `extractJobSkills`:
   - Returns `job.skills` (if non-empty) or `job.enrichment?.skills` (if non-empty) or `[]`.
3. Implement and export `computeUnifiedJobMatch`:
   - Extracts job skills with `extractJobSkills`.
   - Collates candidate skills from `candidateResume.skills` and `fallbackProfileSkills`.
   - If job has skills, calls `computeJobDetailsMatch`.
   - If job has no skills, falls back to `compareResumeToJob` if resume text and job description/summary exist.
   - Returns `JobDetailsMatchResult`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --experimental-strip-types --test tests/ats-scoring-feed.test.mjs`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/resumes/job-match.ts tests/ats-scoring-feed.test.mjs
git commit -m "feat: implement computeUnifiedJobMatch with hardened word-boundary matching"
```

---

### Task 2: Wire `computeUnifiedJobMatch` in `JobsFeedClient` and `JobDetailClient`

**Files:**
- Modify: `src/app/jobs/JobsFeedClient.tsx`
- Modify: `src/app/jobs/[id]/JobDetailClient.tsx`
- Modify: `src/components/jobs/feed/JobCard.tsx`

- [ ] **Step 1: Update `JobsFeedClient.tsx` to use `computeUnifiedJobMatch`**

Replace `getAtsMatch` callback in `JobsFeedClient.tsx`:
```typescript
const getAtsMatch = useCallback(
  (job: Job) => {
    if (!hasResumeProfile) return null;
    const result = computeUnifiedJobMatch(job, candidateResume);
    return {
      score: result.matchPercentage,
      matched: result.matchedSkills,
      missing: result.missingSkills,
    };
  },
  [candidateResume, hasResumeProfile]
);
```

- [ ] **Step 2: Update `JobDetailClient.tsx` to use `computeUnifiedJobMatch`**

In `JobDetailClient.tsx`:
```typescript
const { matchedSkills, missingSkills, matchPercentage, totalSkillsCount } = useMemo(() => {
  return computeUnifiedJobMatch(job, candidateResume, [
    ...baseProfileSkills,
    ...Array.from(claimedSkills),
  ]);
}, [job, candidateResume, baseProfileSkills, claimedSkills]);
```

- [ ] **Step 3: Update `JobCard.tsx` to ensure normalized case-insensitive matched skill highlighting**

In `JobCard.tsx`:
Ensure `isMatchedSkill`:
```typescript
const isMatchedSkill = atsMatch?.matched?.some(
  (m) => m.toLowerCase() === skill.toLowerCase()
);
```
Matches correctly against `atsMatch.matched` output from `computeUnifiedJobMatch`.

- [ ] **Step 4: Run typecheck and unit tests**

Run: `npm run typecheck; node --experimental-strip-types --test tests/ats-scoring-feed.test.mjs tests/job-details-match.test.mjs`  
Expected: PASS with 0 errors.

- [ ] **Step 5: Run full test suite for zero regression**

Run: `node --experimental-strip-types --test tests/url-canonicalization.test.mjs tests/ats-scoring-feed.test.mjs tests/background-storage-proxy.test.mjs tests/universal-discovery-attachment.test.mjs tests/ai-screening-scoped.test.mjs tests/submission-pipeline-resilience.test.mjs tests/cross-tab-sync.test.mjs tests/application-lifecycle.test.mjs tests/job-details-match.test.mjs`  
Expected: 59 tests pass, 0 fail.

- [ ] **Step 6: Commit**

```bash
git add src/app/jobs/JobsFeedClient.tsx src/app/jobs/[id]/JobDetailClient.tsx src/components/jobs/feed/JobCard.tsx
git commit -m "feat: wire computeUnifiedJobMatch across feed and detail views for score parity"
```
