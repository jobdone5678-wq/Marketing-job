# Task 1 Brief: Shared Helper & Word-Boundary Robustness

**Base Commit:** 122957c2a71bf54d2417e4719058b761dc13988f
**Spec:** `docs/superpowers/specs/2026-11-23-unified-job-match-parity-design.md`
**Plan:** `docs/superpowers/plans/2026-11-23-unified-job-match-parity.md`

## Deliverables
1. In `src/lib/resumes/job-match.ts`:
   - Harden `containsTerm` regex to prevent false positive substring matching:
     - Short tokens (`api`, `go`, `c`) must not match within longer words (`rapid`, `google`, etc.).
     - Java lookahead assertion `term.toLowerCase() === 'java' ? '(?![ -]*(?:script|Script)\\b)' : ...` to prevent `Java` matching `JavaScript`.
   - Implement and export `extractJobSkills(job: Partial<Job>): string[]`.
   - Implement and export `computeUnifiedJobMatch(job: Partial<Job>, candidateResume?: { text?: string; skills?: string[] } | null, fallbackProfileSkills?: string[]): JobDetailsMatchResult`.
2. In `tests/ats-scoring-feed.test.mjs`:
   - Add unit test proving `computeUnifiedJobMatch` produces identical score and matched skills on 50% match.
   - Add unit test proving word-boundary matching prevents false substring matches (`JavaScript` does not match `Java`, `rapid` does not match `API`, `Google` does not match `Go`).

## Verification
- Run: `node --experimental-strip-types --test tests/ats-scoring-feed.test.mjs tests/job-details-match.test.mjs`
- Run: `npm run typecheck`
- Commit:
  `git add src/lib/resumes/job-match.ts tests/ats-scoring-feed.test.mjs`
  `git commit -m "feat: implement computeUnifiedJobMatch with hardened word-boundary matching"`
