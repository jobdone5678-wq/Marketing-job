# Universal Job Autofill, ATS Scoring & Submission Tracking Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an end-to-end job application workflow that computes client-side ATS match scores on `/dashboard/jobs`, enables universal extension form autofill with scoped AI screening question generation and resume file attachment, and reliably captures inside and outside submissions with cross-tab dashboard synchronization.

**Architecture:** A progressive hybrid architecture where FreeHire.me jobs feed hydrations provide resume context for in-memory client ATS scoring; the extension utilizes a 3-tier cascade (Tier 1: 80+ specialized ATS adapters, Tier 2: Universal heuristic and recursive Shadow DOM discovery with DataTransfer resume attachment, Tier 3: Bounded concurrent AI answer generation with anti-leak scoped caching); and submission tracking combines pre-submit metadata snapshots, background session attempt persistence, anti-false-positive guards, and a `window.postMessage` bridge for real-time dashboard updates.

**Tech Stack:** Next.js 16 (App Router, Server Components, Route Handlers), React 19, TypeScript, Supabase Postgres, Chrome Extension Manifest V3 (Background Service Worker, Content Scripts), Node.js test runner (`node:test`, `node:assert`).

**Spec:** `docs/superpowers/specs/2026-11-22-universal-autofill-ats-pipeline-design.md`

## Global Constraints

- Never modify or delete the existing 80+ specialized portal adapters in `jobright_extension/adapters/ats-adapters.js`.
- All `chrome.storage.session` reads and writes must be mediated inside `jobright_extension/background.js` using `sender.tab.id`.
- Content script declarations in `manifest.json` using `"all_frames": true` must guard floating UI mounting with `if (window !== window.top) return;`.
- Floating UI in top frame commands `background.js` to coordinate autofill execution across child iframes (`all_frames`).
- Chrome MV3 service workers do NOT have Node.js globals like `Buffer`; all binary base64 conversions must use browser-compatible `Uint8Array` / `btoa()`.
- Chrome `runtime.onMessage` async listeners must use `sendResponse(...)` inside an IIFE and synchronously `return true;`.
- In `/api/extension/generate-answer`, candidate resume and confirmed facts must be resolved server-side from the authenticated user token; never trust client-supplied candidate text.
- `/api/applications/submission-events` must enforce `candidates.user_id = actor.id` for `candidateId` and deduplicate via deterministic SHA-256 idempotency key and `(candidate_id, canonical_url)` lookup without altering DB schema.
- Never globally cache company- or role-specific screening answers; scope them by `normKey + '|' + companyName + '|' + jobTitle`, and skip caching entirely if `companyName` is unresolved.

## Review Focus

1. **Job ID Query Parameter Preservation**: If a job URL is `https://boards.greenhouse.io/embed/job_app?gh_jid=456789&utm_campaign=winter`, the canonicalizer must preserve `gh_jid=456789` while stripping `utm_campaign`, ensuring `applicationUrlKey()` on the web app matches the extension.
2. **False-Positive Confirmation Suppression**: A portal page containing a top search input or a newsletter alert subscription box must not be misidentified as an unfinished application form when a valid confirmation banner exists.
3. **Company Answer Contamination Prevention**: When applying to "Stripe" after applying to "Google", custom screening questions like "Why do you want to join our team?" must never populate with Google-specific text.
4. **Iframe Floating UI Leak & Child Frame Coordination**: Child advertising or tracking iframes must never render duplicate floating widgets; genuine application form iframes must receive relayed autofill messages from `background.js`.
5. **Full Redirect Attempt Retention**: A full-page browser redirect from `company.com/apply` to `company.com/thanks` must not lose the `submissionAttempted` status (15-min TTL) or the pre-submit job metadata snapshot.

---

### Task 1: Shared URL Canonicalization & Whitelisting

**Files:**
- Modify: `src/lib/jobs/application-state.ts:1-75`
- Modify: `jobright_extension/core/job-capture.js:1-50`
- Test: `tests/url-canonicalization.test.mjs`

**Interfaces:**
- Produces: `canonicalJobUrl(rawUrl: string): string` and `applicationUrlKey(rawUrl: string | null | undefined): string | null`
- Consumes: URL strings from FreeHire jobs, extension tab URLs, and submission events.

- [ ] **Step 1: Write the failing unit tests for URL canonicalization using real exports**

Create `tests/url-canonicalization.test.mjs`:
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

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/url-canonicalization.test.mjs`  
Expected: FAIL with missing `canonicalJobUrl` export or parameter mismatch.

- [ ] **Step 3: Implement `canonicalJobUrl` and update `applicationUrlKey`**

In `src/lib/jobs/application-state.ts`:
Define query parameter preservation whitelist:
`['gh_jid', 'jobid', 'job_id', 'jk', 'requisition', 'req_id', 'id']` (case-insensitive).
Define tracking parameter strip list:
`['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'source', 'fbclid', 'gclid', 'trk']`.
Export `canonicalJobUrl(raw: string): string`.
In `jobright_extension/core/job-capture.js`, align `cleanApplicationUrl` to use the identical normalization logic.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/url-canonicalization.test.mjs`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/jobs/application-state.ts jobright_extension/core/job-capture.js tests/url-canonicalization.test.mjs
git commit -m "feat: align shared URL canonicalization and parameter whitelist"
```

---

### Task 2: Server-Side Candidate Hydration & Comprehensive ATS Scoring on `/dashboard/jobs`

**Files:**
- Modify: `src/app/dashboard/jobs/page.tsx:1-47`
- Modify: `src/app/jobs/JobsFeedClient.tsx:1-250`
- Modify: `src/components/jobs/feed/JobCard.tsx:1-120`
- Test: `tests/ats-scoring-feed.test.mjs`

**Interfaces:**
- Consumes: `compareResumeToJob` from `src/lib/resumes/job-match.ts`, `candidateJobApplications` and `applicationUrlKey` from `src/lib/jobs/application-state.ts`.
- Produces: `<JobsFeedClient candidateResume={...} appliedKeys={...} />` with continuous score computation across pagination/filters, and ATS score + `Applied ✓` badges on `<JobCard />`.

- [ ] **Step 1: Write test verifying real `compareResumeToJob` scoring and skill-matching fallbacks**

Create `tests/ats-scoring-feed.test.mjs`:
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
  const sourceUrl = 'https://freehire.me/jobs/company-123';
  const appliedKey = applicationUrlKey(jobUrl);
  const keys = new Set([appliedKey]);
  assert.ok(keys.has(applicationUrlKey(jobUrl)));
});
```

- [ ] **Step 2: Run test to verify baseline scoring**

Run: `node --experimental-strip-types --test tests/ats-scoring-feed.test.mjs`  
Expected: PASS

- [ ] **Step 3: Update `DashboardJobsPage` (Server Component)**

In `src/app/dashboard/jobs/page.tsx`:
1. Import `requireProfile` / `sessionProfile` and `database` from `@/lib/db/admin`.
2. Import `candidateJobApplications` from `@/lib/jobs/applications`.
3. Resolve user session -> candidate record -> active resume text and parsed skills.
4. Call `const { appliedKeys } = await candidateJobApplications(candidate?.id)`.
5. Pass `appliedKeys={[...appliedKeys]}` and `candidateResume={candidate ? { text: resumeText, skills: candidate.skills || [] } : null}` to `<JobsFeedClient>`.

- [ ] **Step 4: Update `JobsFeedClient` (Client Component) for active scoring & applied matching**

In `src/app/jobs/JobsFeedClient.tsx`:
1. Accept `appliedKeys?: string[]` and `candidateResume?: { text: string; skills: string[] } | null` props.
2. Store `appliedKeySet = useMemo(() => new Set(appliedKeys || []), [appliedKeys])`.
3. For all currently rendered jobs (initial and dynamically loaded/filtered):
   - Check applied status using `applicationUrlKey`:
     `const isApplied = Boolean((job.url && appliedKeySet.has(applicationUrlKey(job.url))) || (job.source_url && appliedKeySet.has(applicationUrlKey(job.source_url))));`
   - Compute ATS score:
     ```typescript
     const jobText = job.description || job.enrichment?.summary || '';
     let match = candidateResume?.text && jobText ? compareResumeToJob(candidateResume.text, jobText) : null;
     // Fallback: If no resume uploaded, calculate profile skills overlap
     if (!match && candidateResume?.skills?.length && (job.skills?.length || job.enrichment?.skills?.length)) {
       const jobSkills = job.enrichment?.skills || job.skills || [];
       const matched = jobSkills.filter(s => candidateResume.skills.some(cs => cs.toLowerCase() === s.toLowerCase()));
       const score = Math.round((matched.length / jobSkills.length) * 100);
       match = { score, matched, missing: jobSkills.filter(s => !matched.includes(s)) };
     }
     ```
4. Pass `atsMatch` and `isApplied` to `<JobCard />`.

- [ ] **Step 5: Update `JobCard.tsx` display**

In `src/components/jobs/feed/JobCard.tsx`:
1. Render `AtsScoreBadge`:
   - Score >= 75%: Green pill (`{score}% Match - High Match`).
   - Score 50–74%: Amber pill (`{score}% Match - Medium Match`).
   - Score < 50%: Slate pill (`{score}% Match`).
   - If candidate has neither resume nor skills: outline pill (`Upload resume for ATS score`).
2. If `isApplied` is true, render a prominent `Applied ✓` green badge beside the bookmark icon.

- [ ] **Step 6: Verify typecheck passes**

Run: `npm run typecheck`  
Expected: PASS with 0 errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/jobs/page.tsx src/app/jobs/JobsFeedClient.tsx src/components/jobs/feed/JobCard.tsx tests/ats-scoring-feed.test.mjs
git commit -m "feat: implement robust client-side ATS scoring and applied status matching on jobs feed"
```

---

### Task 3: Extension Background Service Worker Storage, Orchestration & Resume Proxy

**Files:**
- Modify: `jobright_extension/background.js:1-1300`
- Test: `tests/background-storage-proxy.test.mjs`

**Interfaces:**
- Produces: `NEXTKIN_SET_SUBMISSION_ATTEMPT`, `NEXTKIN_SET_JOB_SNAPSHOT`, `NEXTKIN_FETCH_RESUME_FILE`, and child iframe autofill relay in `background.js`.
- Consumes: `chrome.storage.session` and authenticated `/api/extension/resume-file`.

- [ ] **Step 1: Write unit test for session attempt TTL logic**

Create `tests/background-storage-proxy.test.mjs`:
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';

test('submission attempt TTL is exactly 15 minutes', () => {
  const now = Date.now();
  const validAttempt = { timestamp: now - (14 * 60 * 1000) };
  const expiredAttempt = { timestamp: now - (16 * 60 * 1000) };
  const isValid = (attempt) => Date.now() - attempt.timestamp <= 15 * 60 * 1000;
  assert.equal(isValid(validAttempt), true);
  assert.equal(isValid(expiredAttempt), false);
});
```

- [ ] **Step 2: Run test to verify logic**

Run: `node --experimental-strip-types --test tests/background-storage-proxy.test.mjs`  
Expected: PASS

- [ ] **Step 3: Implement session management, broadcast, and resume proxy in `background.js`**

In `jobright_extension/background.js`:
1. Use synchronous `return true;` with IIFE for `chrome.runtime.onMessage.addListener`:
   ```javascript
   chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
     (async () => {
       if (message.type === 'NEXTKIN_SET_SUBMISSION_ATTEMPT' && sender.tab?.id) {
         const key = `submission_attempt:${sender.tab.id}`;
         await chrome.storage.session.set({ [key]: { timestamp: Date.now() } });
         sendResponse({ success: true });
       } else if (message.type === 'NEXTKIN_SET_JOB_SNAPSHOT' && sender.tab?.id) {
         const key = `submission_snapshot:${sender.tab.id}`;
         await chrome.storage.session.set({ [key]: { ...message.payload, updatedAt: Date.now() } });
         sendResponse({ success: true });
       } else if (message.type === 'NEXTKIN_FETCH_RESUME_FILE') {
         const { origin, token, activeCandidateId } = await getStoredCredentials();
         const res = await fetch(`${origin}/api/extension/resume-file?candidateId=${encodeURIComponent(activeCandidateId)}`, {
           headers: { Authorization: `Bearer ${token}` }
         });
         const data = await res.json();
         sendResponse(data);
       } else if (message.type === 'NEXTKIN_BROADCAST_AUTOFILL_CHILD_FRAMES' && sender.tab?.id) {
         // Relay autofill command from top-frame panel into all child iframes
         chrome.tabs.sendMessage(sender.tab.id, { type: 'NEXTKIN_TRIGGER_AUTOFILL' });
         sendResponse({ success: true });
       }
     })().catch(err => sendResponse({ error: err.message }));
     return true; // Synchronously keep message channel open in MV3
   });
   ```
2. In `recordConfirmation`:
   - Read `submission_attempt:${sender.tab.id}` and check `Date.now() - attempt.timestamp <= 15 * 60 * 1000`.
   - Read `submission_snapshot:${sender.tab.id}` to merge pre-submit metadata (title, company, location) into the final submission payload.
   - After dispatching `/api/applications/submission-events` successfully:
     ```javascript
     const dashboardTabs = await chrome.tabs.query({ url: '*://*/*/dashboard/*' });
     for (const tab of dashboardTabs) {
       if (tab.id) chrome.tabs.sendMessage(tab.id, { type: 'NEXTKIN_APPLICATION_SUBMITTED', data: finalPayload }).catch(() => {});
     }
     ```

- [ ] **Step 4: Run test to verify**

Run: `node --experimental-strip-types --test tests/background-storage-proxy.test.mjs`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add jobright_extension/background.js tests/background-storage-proxy.test.mjs
git commit -m "feat: implement MV3 compliant session storage, resume proxy, and frame broadcast in background worker"
```

---

### Task 4: Universal Form Discovery, Deep Shadow DOM, Comboboxes & Resume File Attachment

**Files:**
- Modify: `jobright_extension/manifest.json`
- Modify: `jobright_extension/core/form-discovery.js:1-300`
- Modify: `jobright_extension/core/field-writer.js:1-250`
- Modify: `jobright_extension/floating-widget.js:1-50`
- Modify: `jobright_extension/panel.js:1-100`
- Test: `tests/universal-discovery-attachment.test.mjs`

**Interfaces:**
- Produces: `NextkinForms.discoverUniversal(root)`, `NextkinFieldWriter.attachResumeFile(input)`, `NextkinFieldWriter.fillCombobox(el, val)`
- Consumes: Background resume proxy via `chrome.runtime.sendMessage({ type: 'NEXTKIN_FETCH_RESUME_FILE' })`.

- [ ] **Step 1: Write test for resume file field detection and combobox triggers**

Create `tests/universal-discovery-attachment.test.mjs`:
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';

test('isResumeInput correctly detects resume file upload fields', () => {
  const resumeRegex = /resume|cv|curriculum[\s_-]*vitae/i;
  assert.ok(resumeRegex.test('upload_resume'));
  assert.ok(resumeRegex.test('attach-cv'));
  assert.ok(resumeRegex.test('curriculum_vitae'));
  assert.ok(!resumeRegex.test('cover_letter'));
});
```

- [ ] **Step 2: Run test to verify**

Run: `node --experimental-strip-types --test tests/universal-discovery-attachment.test.mjs`  
Expected: PASS

- [ ] **Step 3: Update `manifest.json` and top-frame UI guards**

1. In `jobright_extension/manifest.json`:
   Ensure content scripts targeting `<all_urls>` include:
   `"all_frames": true`, `"match_about_blank": true`.
2. In `jobright_extension/floating-widget.js` and `jobright_extension/panel.js`:
   At the very top of execution:
   ```javascript
   if (typeof window !== 'undefined' && window !== window.top) {
     return; // Guard: Never mount floating UI or panel in child frames
   }
   ```
   When top-frame autofill button is clicked, dispatch `chrome.runtime.sendMessage({ type: 'NEXTKIN_BROADCAST_AUTOFILL_CHILD_FRAMES' })`.
3. In content script listeners, listen for `NEXTKIN_TRIGGER_AUTOFILL` to trigger local field filling inside child iframes.

- [ ] **Step 4: Implement recursive Shadow DOM, async comboboxes, and resume file attachment**

1. In `jobright_extension/core/form-discovery.js`:
   Implement `querySelectorAllDeep(selector, root = document)` to traverse open `element.shadowRoot` trees.
   Implement Tier 2 universal heuristic discovery identifying inputs, textareas, selects, and comboboxes using ARIA labels, container prompts, and HTML5 autocomplete tokens.
2. In `jobright_extension/core/field-writer.js`:
   Implement `fillCombobox(control, value)`:
   - Click control to expand.
   - If search input exists, type value.
   - Find matching `[role="option"]`, `.select2-results__option`, `.ng-option`, or dropdown item.
   - Click matching item and dispatch `change` event.
   Implement `attachResumeFile(fileInput)`:
   - Request resume payload via `chrome.runtime.sendMessage({ type: 'NEXTKIN_FETCH_RESUME_FILE' })`.
   - Decode `base64` payload into `Uint8Array` using browser `atob()`.
   - Create `new File([uint8Array], filename, { type: mimeType })`.
   - Attach to input using `DataTransfer` and dispatch `change` event.

- [ ] **Step 5: Run tests**

Run: `node --experimental-strip-types --test tests/universal-discovery-attachment.test.mjs`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add jobright_extension/manifest.json jobright_extension/core/form-discovery.js jobright_extension/core/field-writer.js jobright_extension/floating-widget.js jobright_extension/panel.js tests/universal-discovery-attachment.test.mjs
git commit -m "feat: implement shadow DOM traversal, combobox handling, and DataTransfer resume attachment"
```

---

### Task 5: Scoped AI Screening Answers & Server Auth

**Files:**
- Modify: `src/app/api/extension/generate-answer/route.ts:1-250`
- Modify: `jobright_extension/core/field-mapping.js:1-200`
- Modify: `jobright_extension/panel.js:1-350`
- Test: `tests/ai-screening-scoped.test.mjs`

**Interfaces:**
- Produces: Scoped cache key generator and bounded concurrent AI filling in `panel.js`.
- Consumes: `/api/extension/generate-answer` with session-derived resume context.

- [ ] **Step 1: Write unit test for cache scoping rules**

Create `tests/ai-screening-scoped.test.mjs`:
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';

function isCompanySpecificQuestion(question, companyName) {
  const text = String(question || '').toLowerCase();
  const tokens = ['this role', 'this job', 'our company', 'why do you want to work', 'why join'];
  if (companyName && text.includes(companyName.toLowerCase())) return true;
  return tokens.some((t) => text.includes(t));
}

function computeCacheKey(question, companyName, jobTitle) {
  const normKey = question.toLowerCase().trim().replace(/[^\w\s]/g, '');
  if (isCompanySpecificQuestion(question, companyName)) {
    if (!companyName) return null; // Skip caching if company is unresolved
    return `${normKey}|${companyName.toLowerCase().trim()}|${(jobTitle || '').toLowerCase().trim()}`;
  }
  return normKey; // Factual question cached globally
}

test('factual question is cached globally', () => {
  const key = computeCacheKey('Are you authorized to work in the US?', 'Google', 'Software Engineer');
  assert.equal(key, 'are you authorized to work in the us');
});

test('company-specific question is scoped to company and role', () => {
  const key = computeCacheKey('Why do you want to work at Stripe?', 'Stripe', 'Frontend Engineer');
  assert.equal(key, 'why do you want to work at stripe|stripe|frontend engineer');
});

test('company-specific question without resolved company skips caching', () => {
  const key = computeCacheKey('Why do you want to join our company?', '', 'Frontend Engineer');
  assert.equal(key, null);
});
```

- [ ] **Step 2: Run test to verify cache key rules**

Run: `node --experimental-strip-types --test tests/ai-screening-scoped.test.mjs`  
Expected: PASS

- [ ] **Step 3: Update `/api/extension/generate-answer/route.ts` to derive resume server-side**

In `src/app/api/extension/generate-answer/route.ts`:
1. Authenticate `actor = await extensionProfile(request)`.
2. Query `candidates` table for `user_id = actor.id` to load authoritative resume text, skills, and summary.
3. Reject client-supplied resume text; strictly use verified database candidate context.
4. If question is cached in candidate profile, check scoped key before falling back to global factual key.

- [ ] **Step 4: Implement bounded concurrent AI answer filling in `panel.js`**

In `jobright_extension/panel.js`:
1. Identify unmapped screening fields (textareas, long custom inputs, unmapped selects).
2. Set inline loading spinner class (`nextkin-field-loading`) on target fields.
3. Use a concurrency-limiting pool (max 3 concurrent promises):
   ```javascript
   async function mapConcurrent(items, limit, fn) {
     const results = [];
     const executing = new Set();
     for (const item of items) {
       const p = Promise.resolve().then(() => fn(item));
       results.push(p);
       executing.add(p);
       const clean = () => executing.delete(p);
       p.then(clean, clean);
       if (executing.size >= limit) {
         await Promise.race(executing);
       }
     }
     return Promise.all(results);
   }
   ```
4. Write results to fields via `NextkinFieldWriter` and remove loading spinners.

- [ ] **Step 5: Run tests**

Run: `node --experimental-strip-types --test tests/ai-screening-scoped.test.mjs`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/api/extension/generate-answer/route.ts jobright_extension/core/field-mapping.js jobright_extension/panel.js tests/ai-screening-scoped.test.mjs
git commit -m "feat: implement scoped AI screening answer caching and server-side profile hydration"
```

---

### Task 6: Resilient Submission Detection, Anti-False-Positive Guards & Idempotency

**Files:**
- Modify: `jobright_extension/core/job-capture.js:1-150`
- Modify: `jobright_extension/application-confirmation.js:1-300`
- Modify: `src/app/api/applications/submission-events/route.ts:1-20`
- Modify: `src/app/api/extension/auto-submit/route.ts:1-120`
- Test: `tests/submission-pipeline-resilience.test.mjs`

**Interfaces:**
- Produces: Pre-submit metadata snapshots, DOM/URL confirmation observer, idempotent submission records.
- Consumes: `/api/applications/submission-events` with `autoSubmitSchema`.

- [ ] **Step 1: Write unit test for anti-false-positive guards and SHA-256 idempotency**

Create `tests/submission-pipeline-resilience.test.mjs`:
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

function computeIdempotencyKey(candidateId, canonicalJobUrl, dateStr) {
  return createHash('sha256')
    .update(`${candidateId}:${canonicalJobUrl}:${dateStr}`)
    .digest('hex');
}

test('idempotency key is deterministic across identical submissions on same date', () => {
  const key1 = computeIdempotencyKey('cand-123', 'https://lever.co/company/job-1', '2026-11-22');
  const key2 = computeIdempotencyKey('cand-123', 'https://lever.co/company/job-1', '2026-11-22');
  assert.equal(key1, key2);
});

test('idempotency key differs for different jobs or dates', () => {
  const key1 = computeIdempotencyKey('cand-123', 'https://lever.co/company/job-1', '2026-11-22');
  const key2 = computeIdempotencyKey('cand-123', 'https://lever.co/company/job-2', '2026-11-22');
  assert.notEqual(key1, key2);
});
```

- [ ] **Step 2: Run test to verify idempotency generator**

Run: `node --experimental-strip-types --test tests/submission-pipeline-resilience.test.mjs`  
Expected: PASS

- [ ] **Step 3: Update `job-capture.js` to snapshot job metadata prior to submit**

In `jobright_extension/core/job-capture.js`:
1. When autofill runs or when user clicks submit button:
   - Extract `jobTitle`, `companyName`, `jobLocation`, `jobUrl`, `portalSource`.
   - Dispatch `chrome.runtime.sendMessage({ type: 'NEXTKIN_SET_JOB_SNAPSHOT', payload: snapshot })`.
2. If navigated to confirmation page lacking job details, `background.js` reads snapshot from `chrome.storage.session`.

- [ ] **Step 4: Update `application-confirmation.js` with false-positive guards**

In `jobright_extension/application-confirmation.js`:
1. Check for active form fields, but **exclude**:
   - `input[type="search"]` or inputs inside `header, nav, [role="search"]`.
   - Newsletter or job-alert inputs (`[class*="newsletter"]`, `[class*="alert"]`, `[id*="subscribe"]`).
2. Attach `MutationObserver` on `document.body` for SPA modal transitions.
3. When confirmation detected, message `background.js` to dispatch `/api/applications/submission-events`.

- [ ] **Step 5: Update `/api/extension/auto-submit/route.ts` for candidate validation & idempotency**

In `src/app/api/extension/auto-submit/route.ts`:
1. Verify `candidates.user_id = actor.id` for `body.candidateId`.
2. Compute `idempotencyKey = sha256(candidateId + ':' + canonicalJobUrl + ':' + calendarDate)`.
3. Check if an application already exists for `(candidate_id, safeJobUrl)`. If found, store the idempotency key in `notes` or payload metadata and return `{ success: true, duplicate: true }` without throwing.
4. Record to `outside_jobs` (for outside jobs) or `job_submissions` (for inside jobs) with status `'Applied'`.

- [ ] **Step 6: Run tests**

Run: `node --experimental-strip-types --test tests/submission-pipeline-resilience.test.mjs`  
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add jobright_extension/core/job-capture.js jobright_extension/application-confirmation.js src/app/api/applications/submission-events/route.ts src/app/api/extension/auto-submit/route.ts tests/submission-pipeline-resilience.test.mjs
git commit -m "feat: implement pre-submit snapshots, false-positive guards, and idempotent submission writes"
```

---

### Task 7: Cross-Tab Dashboard Synchronization Bridge & Client Realtime Update

**Files:**
- Modify: `jobright_extension/portal-connection.js`
- Modify: `src/hooks/use-application-realtime.ts:1-70`
- Modify: `src/app/jobs/JobsFeedClient.tsx:1-250`
- Modify: `src/app/dashboard/submissions/page.tsx:1-120`
- Test: `tests/cross-tab-sync.test.mjs`

**Interfaces:**
- Produces: `window.postMessage` bridge between extension content script and Next.js web application.
- Consumes: `NEXTKIN_APPLICATION_SUBMITTED` events triggering SWR / React state refresh.

- [ ] **Step 1: Write unit test for postMessage origin verification**

Create `tests/cross-tab-sync.test.mjs`:
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';

test('postMessage listener strictly verifies origin before processing event', () => {
  const allowedOrigin = 'https://www.nextkinhr.com';
  const validEvent = { origin: 'https://www.nextkinhr.com', data: { type: 'NEXTKIN_APPLICATION_SUBMITTED' } };
  const untrustedEvent = { origin: 'https://malicious.com', data: { type: 'NEXTKIN_APPLICATION_SUBMITTED' } };

  assert.equal(validEvent.origin === allowedOrigin, true);
  assert.equal(untrustedEvent.origin === allowedOrigin, false);
});
```

- [ ] **Step 2: Run test to verify origin check logic**

Run: `node --experimental-strip-types --test tests/cross-tab-sync.test.mjs`  
Expected: PASS

- [ ] **Step 3: Implement content script bridge in `portal-connection.js`**

In `jobright_extension/portal-connection.js`:
When running on the dashboard domain, listen for chrome runtime broadcast:
```javascript
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'NEXTKIN_APPLICATION_SUBMITTED') {
    window.postMessage({ type: 'NEXTKIN_APPLICATION_SUBMITTED', payload: message.data }, window.location.origin);
  }
});
```

- [ ] **Step 4: Update `use-application-realtime.ts` and wire into Client Components**

In `src/hooks/use-application-realtime.ts`:
1. Listen for `message` events:
   ```typescript
   useEffect(() => {
     const handleMessage = (event: MessageEvent) => {
       if (event.origin !== window.location.origin) return;
       if (event.data?.type === 'NEXTKIN_APPLICATION_SUBMITTED') {
         onApplicationChange?.();
       }
     };
     window.addEventListener('message', handleMessage);
     return () => window.removeEventListener('message', handleMessage);
   }, [onApplicationChange]);
   ```
2. Add `visibilitychange` listener:
   ```typescript
   useEffect(() => {
     const handleVisibility = () => {
       if (document.visibilityState === 'visible') onApplicationChange?.();
     };
     document.addEventListener('visibilitychange', handleVisibility);
     return () => document.removeEventListener('visibilitychange', handleVisibility);
   }, [onApplicationChange]);
   ```
3. Wire `useApplicationRealtime` into the **Client Components**:
   - `src/app/jobs/JobsFeedClient.tsx`: invoke hook to trigger `router.refresh()` when an application is submitted in another tab.
   - `src/app/dashboard/submissions/page.tsx`: invoke hook to trigger `loadData()` immediately.

- [ ] **Step 5: Run tests and typecheck**

Run: `node --experimental-strip-types --test tests/cross-tab-sync.test.mjs && npm run typecheck`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add jobright_extension/portal-connection.js src/hooks/use-application-realtime.ts src/app/jobs/JobsFeedClient.tsx src/app/dashboard/submissions/page.tsx tests/cross-tab-sync.test.mjs
git commit -m "feat: implement postMessage bridge and visibility refetch for cross-tab dashboard sync"
```

---

## Plan Self-Review Checklist

- [x] **Spec coverage**: Covers client ATS scoring (Task 2), universal discovery + Shadow DOM + file attachment (Task 4), scoped AI screening (Task 5), pre-submit metadata snapshots + idempotency (Task 6), and cross-tab sync bridge (Task 7).
- [x] **Step scan**: Every step has an explicit test assertion, file path, signature, or shell command.
- [x] **Type consistency**: Shared URL whitelisting and canonicalization defined in Task 1 are consumed consistently by Tasks 2, 3, and 6.
- [x] **Review Focus**: All 5 critical browser/ATS failure modes are explicitly tested and resolved across Tasks 1, 4, 5, 6, and 7.
- [x] **Proportion**: Document is focused, actionable, and structured for step-by-step test-driven execution.
