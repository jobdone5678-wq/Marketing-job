# Task 1 Brief: Skill Matching Engine & Unit Test Suite

**Base Commit:** 4bb791c35adfcfd1d594283a803384132844cb30

## Deliverable
Implement `computeJobDetailsMatch(jobSkills: string[], candidateSkills: string[], resumeText?: string): JobDetailsMatchResult` in `src/lib/resumes/job-match.ts` and test suite `tests/job-details-match.test.mjs`.

## Steps
1. Create `tests/job-details-match.test.mjs` verifying:
   - 50% match when 1 of 2 skills matched (e.g., job has Java & Analytics, candidate has Java).
   - Skills mentioned in resumeText match even if omitted from explicit candidateSkills array.
   - Empty job skills array returns 100% match without NaN or crash.
2. Run test to confirm it fails before implementation.
3. Implement `computeJobDetailsMatch` in `src/lib/resumes/job-match.ts`.
4. Run test to verify it passes.
5. Commit: `git add src/lib/resumes/job-match.ts tests/job-details-match.test.mjs; git commit -m "feat: implement computeJobDetailsMatch helper with comprehensive test suite"`.
