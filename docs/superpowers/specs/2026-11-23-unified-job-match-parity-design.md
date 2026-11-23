# Design Specification: Unified Job Match Parity & Score Consistency

**Date:** 2026-11-23  
**Status:** Approved by User  
**Target Files:**
- `src/lib/resumes/job-match.ts`
- `src/app/jobs/JobsFeedClient.tsx`
- `src/app/jobs/[id]/JobDetailClient.tsx`
- `src/components/jobs/feed/JobCard.tsx`
- `tests/ats-scoring-feed.test.mjs`

---

## 1. Intent & Problem Statement

Users noticed a score divergence between the job feed list and the job detail page:
- On the feed card (`Current Jobs`), a job (e.g., Salesforce Developer) displayed **100% Match** while only highlighting a single skill (Java).
- On opening the job detail page, the Profile Match sidebar displayed **50% (3 of 6 skills)** with `api`, `java`, `spring` matched and `developer-experience`, `kotlin`, `salesforce` missing.

### Root Cause
`JobsFeedClient.tsx` was calling `compareResumeToJob(candidateResume.text, jobText)` whenever resume text was present. This legacy text parser matches against a hardcoded list of 50 keywords, ignoring the job's defined skills (`job.enrichment.skills` and `job.skills`). For jobs where only 1 of the 50 keywords appeared in the description, it calculated an inflated 100% score (1/1) while ignoring the remaining required skills.

---

## 2. Solution & 3 Guardrails

### 2.1 Single Shared Helper (`computeUnifiedJobMatch`)
Implement `computeUnifiedJobMatch(job, candidateResume, fallbackProfileSkills)` in `src/lib/resumes/job-match.ts`:
1. Canonical skill extraction:
   ```typescript
   export function extractJobSkills(job: Partial<Job>): string[] {
     if (job.skills && job.skills.length > 0) return job.skills;
     if (job.enrichment?.skills && job.enrichment.skills.length > 0) return job.enrichment.skills;
     return [];
   }
   ```
2. Unification logic:
   - If structured skills exist on the job, calculate deterministic match using `computeJobDetailsMatch(skillsList, candidateSkills, resumeText)`.
   - If no structured skills exist on the job, fall back to `compareResumeToJob(resumeText, jobText)` when description and resume text are present.
   - Return `{ matchPercentage, matchedSkills, missingSkills, totalSkillsCount }`.
3. Call `computeUnifiedJobMatch` from both `JobsFeedClient.tsx` and `JobDetailClient.tsx`.

### 2.2 Feed vs Detail Payload Parity
Confirm that both `/api/search` (`searchFreehireJobs`) and `/jobs/[id]` (`getFreehireJob`) transmit the complete, untruncated `skills` and `enrichment.skills` array.
- In `JobCard.tsx`, only the visual display slices to 5 chips (`displaySkills = skills.slice(0, 5)`).
- The match computation itself is supplied the full untruncated `skillsList`.

### 2.3 Word-Boundary Matching & Pill Highlights
1. In `src/lib/resumes/job-match.ts`:
   - Enforce strict word-boundary matching in `containsTerm`:
     - Short token regex ensures tokens like `api`, `go`, or `java` do not false-match inside words like `rapid`, `google`, or `javascript`.
     - Explicit lookahead negation for Java (`(?![ -]*(?:script|Script)\b)`) prevents `Java` from matching `JavaScript`.
2. In `JobCard.tsx`:
   - Drive green pill highlighting directly from `atsMatch.matched` with case-insensitive matching (`m.toLowerCase() === skill.toLowerCase()`).
3. In `tests/ats-scoring-feed.test.mjs`:
   - Add unit test proving that feed and detail scoring produce identical match percentages, matched skills, and missing skills for the exact same job and candidate facts.

---

## 3. Verification Plan
1. Unit Tests:
   - Run `node --experimental-strip-types --test tests/ats-scoring-feed.test.mjs`
   - Run `node --experimental-strip-types --test tests/job-details-match.test.mjs`
2. Full Test Suite:
   - Run all 9 test suites (57 tests) to ensure zero regression.
3. Typecheck:
   - Run `npm run typecheck` to verify 0 errors.
