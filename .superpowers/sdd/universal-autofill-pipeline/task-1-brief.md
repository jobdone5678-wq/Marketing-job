# Task 1: Shared URL Canonicalization & Whitelisting

## Files
- Modify: `src/lib/jobs/application-state.ts`
- Modify: `jobright_extension/core/job-capture.js`
- Test: `tests/url-canonicalization.test.mjs`

## Interfaces
- Produces: `canonicalJobUrl(rawUrl: string): string` and `applicationUrlKey(rawUrl: string | null | undefined): string | null`
- Consumes: URL strings from FreeHire jobs, extension tab URLs, and submission events.

## Exact Requirements & Steps

1. **Step 1: Write unit tests in `tests/url-canonicalization.test.mjs`**:
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { applicationUrlKey, canonicalJobUrl } from '../src/lib/jobs/application-state.ts';

test('canonicalJobUrl preserves whitelisted job ID params and strips tracking params', () => {
  const input = 'https://boards.greenhouse.io/embed/job_app?gh_jid=12345&utm_source=linkedin&ref=board#section';
  const expected = 'https://boards.greenhouse.io/embed/job_app?gh_jid=12345';
  assert.equal(canonicalJobUrl(input), expected);
});

test('canonicalJobUrl preserves Workday, Taleo, and generic job id params', () => {
  const input = 'https://company.wd1.myworkdayjobs.com/Careers/job/1?jobId=R-9876&source=referral';
  const expected = 'https://company.wd1.myworkdayjobs.com/Careers/job/1?jobId=R-9876';
  assert.equal(canonicalJobUrl(input), expected);
});

test('applicationUrlKey returns identical key for matching URLs with different tracking params', () => {
  const url1 = 'https://jobs.lever.co/example/abc-123?utm_medium=feed';
  const url2 = 'https://jobs.lever.co/example/abc-123?utm_source=email&ref=campaign';
  assert.equal(applicationUrlKey(url1), applicationUrlKey(url2));
});
```

2. **Step 2: Run test to verify failure**:
`node --experimental-strip-types --test tests/url-canonicalization.test.mjs`

3. **Step 3: Implement in `src/lib/jobs/application-state.ts` & `jobright_extension/core/job-capture.js`**:
In `src/lib/jobs/application-state.ts`:
- Define `PRESERVED_JOB_PARAMS = new Set(['gh_jid', 'jobid', 'job_id', 'jk', 'requisition', 'req_id', 'id'])`.
- In `canonicalJobUrl(raw: string): string`:
  - Parse URL safely. Return `raw` if URL is invalid.
  - Lowercase protocol and hostname. Remove trailing slash from pathname (except root `/`).
  - Filter searchParams: keep only search parameters whose lowercase key is in `PRESERVED_JOB_PARAMS`. Sort search parameters alphabetically for deterministic output.
  - Remove hash fragment.
  - Return normalized URL string.
- Update `applicationUrlKey(raw: string | null | undefined): string | null`:
  - Use `canonicalJobUrl` and return normalized key string (or null if empty/invalid).
- In `jobright_extension/core/job-capture.js`:
  - Update `cleanApplicationUrl(url)` to use the exact same preservation whitelist (`gh_jid`, `jobid`, `job_id`, `jk`, `requisition`, `req_id`, `id`) and strip marketing/tracking parameters (`utm_*`, `ref`, `source`, `fbclid`, `gclid`, `trk`).

4. **Step 4: Run test to verify it passes**:
`node --experimental-strip-types --test tests/url-canonicalization.test.mjs`

5. **Step 5: Run typecheck**:
`npm run typecheck`

6. **Step 6: Commit**:
Commit with message `"feat: align shared URL canonicalization and parameter whitelist"`

## Report Contract
Write your full report to:
`.superpowers/sdd/universal-autofill-pipeline/task-1-report.md`
Your final response must report:
- Status (DONE, DONE_WITH_CONCERNS, NEEDS_CONTEXT, or BLOCKED)
- Commit SHA(s)
- One-line test summary
- Any concerns or notes
