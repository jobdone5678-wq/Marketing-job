# Job Application Sync & Database Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure external ATS and internal portal job applications are reliably captured, persisted to Supabase (`job_submissions` and `outside_jobs`), and displayed in the **My Applications** dashboard without entering an infinite retry loop or silently dropping confirmation receipts.

**Architecture:** 
1. Fix the PostgreSQL RPC function `record_extension_submission` to resolve the ambiguous column reference error causing HTTP 500.
2. In `application-confirmation.js`, broaden submission triggers (supporting multi-step buttons like "Continue"/"Next"/"Review") and propagate attempt events (`NEXTKIN_SET_SUBMISSION_ATTEMPT`) to `background.js` so `chrome.storage.session` attempt state is maintained.
3. In `background.js`, route manual attestations to `/api/extension/auto-submit` and ensure clean queue recovery upon HTTP 200.
4. Verify dual-table persistence (`job_submissions` + `outside_jobs`) and package the extension.

**Tech Stack:** Next.js 16, TypeScript, Supabase PostgreSQL, Chrome Extension Manifest V3, Node test runner (`node:test`).

**Spec:** [docs/superpowers/specs/2026-11-24-job-application-sync-and-db-save-design.md](file:///C:/Users/bharg/Downloads/marketing-job/docs/superpowers/specs/2026-11-24-job-application-sync-and-db-save-design.md)

## Global Constraints

- Never drop a valid ATS confirmation receipt on verified ATS platforms (Lever, Greenhouse, Ashby, Workday, SmartRecruiters).
- Maintain dual-write atomicity between `job_submissions` and `outside_jobs` for external applications.
- Never crash on duplicate submissions; return idempotent 200 responses.
- Respect candidate ownership and access control (`candidate_actor_can_access`).

## Review Focus

1. **Ambiguous column references in PL/pgSQL**: When querying `public.jobs`, column names `company` and `title` must not collide with PL/pgSQL variable names.
2. **Multi-step form buttons**: Buttons labeled "Next", "Review", "Continue", or icons without standard "Submit" text must set `submissionAttempted` and dispatch `NEXTKIN_SET_SUBMISSION_ATTEMPT`.
3. **Missing attempt state rejection**: External ATS receipts must not be rejected by `background.js:recordConfirmation` due to missing session attempt markers.
4. **Manual attestation routing**: Items queued from "Mark as applied" have `manualAttestation: true` and must route to `/api/extension/auto-submit`, not `/api/webhooks/application-submitted` (which requires receipt evidence and rejects manual attestations with 422).
5. **Queue drain on recovery**: Successful delivery must cleanly remove items from `pending_submission_queue` and clear the retry badge.

---

### Task 1: Disambiguate and Deploy PostgreSQL RPC Function `record_extension_submission`

**Files:**
- Modify: `supabase/migrations/20261123000100_atomic_application_receipt.sql`
- Test: `tests/application-receipt-atomicity.test.mjs`

**Interfaces:**
- Consumes: Supabase database connection and `public.record_extension_submission(p_actor uuid, p_candidate uuid, p_event_key uuid, p_attempt integer, p_fields jsonb)`
- Produces: Disambiguated function executing without error 42702 and returning `{ submission, duplicate, code, replayed, job_id }`

- [ ] **Step 1: Write/verify test exercising `record_extension_submission` with `companyName` and `jobTitle`**

Verify `tests/application-receipt-atomicity.test.mjs` has test cases for outside job submissions where `public.jobs` must be queried or inserted without variable collision.

- [ ] **Step 2: Run test to observe baseline**

Run: `node --test tests/application-receipt-atomicity.test.mjs`
Expected: Passes locally against mock or rejects with clear reason.

- [ ] **Step 3: Update and deploy `record_extension_submission` on the live Supabase database**

Ensure `supabase/migrations/20261123000100_atomic_application_receipt.sql` declares variables prefixed with `v_` (`v_company`, `v_title`, `v_location`, etc.) and does not query `company = company`.
Apply the SQL function to the live Supabase project `yzworkrtgbcrsewjsfsg` via `supabase_mcp:execute_sql`.

- [ ] **Step 4: Verify direct execution on live Supabase database**

Execute SQL DO block on live DB:
```sql
DO $$
DECLARE
  v_res jsonb;
BEGIN
  v_res := public.record_extension_submission(
    '83c19ce8-b2ac-483f-97fb-bb8e1c15c5c7'::uuid,
    'ebcbee30-b259-4c55-b40f-97d9006914e9'::uuid,
    gen_random_uuid(),
    1,
    jsonb_build_object(
      'companyName', 'Employ Test',
      'jobTitle', 'Test Role',
      'jobUrl', 'https://jobs.lever.co/employ/test-role-verification',
      'portalSource', 'jobs.lever.co',
      'manualAttestation', true,
      'evidence', 'Test verification'
    )
  );
  ASSERT v_res->'submission'->>'id' IS NOT NULL;
  RAISE EXCEPTION 'ROLLBACK_VERIFIED';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM NOT LIKE '%ROLLBACK_VERIFIED%' THEN RAISE; END IF;
END $$;
```
Expected: Query executes cleanly without `42702: column reference "company" is ambiguous`.

- [ ] **Step 5: Commit migration file**

```bash
git add supabase/migrations/20261123000100_atomic_application_receipt.sql
git commit -m "fix(db): disambiguate variables in record_extension_submission RPC"
```

---

### Task 2: Expand Submission Triggers and Attempt Propagation in `application-confirmation.js`

**Files:**
- Modify: `jobright_extension/application-confirmation.js:76-92,458-472`
- Test: `tests/ats-confirmation.test.mjs`

**Interfaces:**
- Consumes: DOM events (`submit`, `click`)
- Produces: `chrome.runtime.sendMessage({ type: 'NEXTKIN_SET_SUBMISSION_ATTEMPT' })` and receipt reporting `{ type: 'application-confirmation', status: 'SUBMITTED', ... }`

- [ ] **Step 1: Write the failing test in `tests/ats-confirmation.test.mjs`**

Add tests covering:
1. Form submit event and multi-step button clicks ("Continue", "Next", "Review") dispatch `NEXTKIN_SET_SUBMISSION_ATTEMPT`.
2. Lever terminal confirmation with heading "Application submitted!" is recognized on `jobs.lever.co` without requiring explicit `/thanks` URL path or dropping receipt.

```javascript
test('ATS Confirmation: Lever confirmation heading is detected and reported even without URL-only trigger', async () => {
  const sandbox = createSandbox({
    url: 'https://jobs.lever.co/employ/a4ec1fd5-d606-4995-a745-5a8b7848937c',
    domElements: [
      new MockElement('DIV', { class: 'application-submitted' }, 'Application submitted!'),
    ],
  });
  // Execute and verify receipt is dispatched
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/ats-confirmation.test.mjs`
Expected: FAIL on missing attempt message or dropped receipt.

- [ ] **Step 3: Implement submit listener, background propagation, and receipt filter updates**

In `jobright_extension/application-confirmation.js`:
1. Broaden button click regex to include `review|continue|finish|next`:
   `/\b(?:submit|apply|send application|complete application|review application|continue|finish|next)\b/i`
2. When `submit` or click matches, send `NEXTKIN_SET_SUBMISSION_ATTEMPT`:
   ```javascript
   if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
     chrome.runtime.sendMessage({ type: 'NEXTKIN_SET_SUBMISSION_ATTEMPT' }).catch(() => {});
   }
   ```
3. Update `check()`:
   If `isVerifiedAts` is true and deterministic/heading evidence is present (such as Lever terminal heading), do not return early.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/ats-confirmation.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add jobright_extension/application-confirmation.js tests/ats-confirmation.test.mjs
git commit -m "fix(extension): propagate submission attempt and broaden ATS confirmation triggers"
```

---

### Task 3: Harden Queue Worker and Manual Attestation Delivery in `background.js` and `panel.js`

**Files:**
- Modify: `jobright_extension/background.js:359-408,1210-1237`
- Modify: `jobright_extension/panel.js:1411-1435`
- Test: `tests/background-queue.test.mjs`

**Interfaces:**
- Consumes: Queued submission items from `chrome.storage.local`
- Produces: HTTP POST to `/api/extension/auto-submit` for manual attestations, updates queue on HTTP 200, broadcasts `NEXTKIN_SYNC_SUCCESS` and `NEXTKIN_OUTSIDE_APPLICATION_SAVED`

- [ ] **Step 1: Write failing test in `tests/background-queue.test.mjs`**

Add test: When queued item has `manualAttestation: true`, `deliverReceipt` posts to `/api/extension/auto-submit` rather than `/api/webhooks/application-submitted`.

```javascript
test('Queue Delivery: Manual attestation routes to /api/extension/auto-submit', async () => {
  let requestedUrl = '';
  const worker = createMockWorker(async (url) => {
    requestedUrl = url;
    return new Response(JSON.stringify({ success: true, submission: { id: 'sub-1' } }), { status: 200 });
  });
  // Enqueue item with manualAttestation: true and deliver
  assert.match(requestedUrl, /\/api\/extension\/auto-submit$/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/background-queue.test.mjs`
Expected: FAIL (currently routes to `/api/webhooks/application-submitted`).

- [ ] **Step 3: Update `deliverReceipt` in `jobright_extension/background.js`**

In `deliverReceipt(item)`:
```javascript
const intentId = item.body.intentId;
const isManual = Boolean(item.body.manualAttestation);
const route = intentId ? '/api/extension/events' : (isManual ? '/api/extension/auto-submit' : '/api/webhooks/application-submitted');
```
Ensure successful delivery cleanly calls `updateQueueItem(item, () => null)`, clears badge, and broadcasts `NEXTKIN_SYNC_SUCCESS` and `NEXTKIN_OUTSIDE_APPLICATION_SAVED`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/background-queue.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add jobright_extension/background.js jobright_extension/panel.js tests/background-queue.test.mjs
git commit -m "fix(extension): route manual attestations to auto-submit and cleanly recover queue"
```

---

### Task 4: Drain Stuck Retry Queue and Sync the Employ Application

**Files:**
- Database verification on project `yzworkrtgbcrsewjsfsg`

**Interfaces:**
- Consumes: Fixed `public.record_extension_submission` RPC
- Produces: `outside_jobs` and `job_submissions` with `Mid-Market Account Executive` at Employ marked `status = 'Applied'`

- [ ] **Step 1: Execute submission sync for candidate's Employ application**

Call `public.record_extension_submission` for candidate `ebcbee30-b259-4c55-b40f-97d9006914e9` with the Employ job details:
```json
{
  "companyName": "Employ",
  "jobTitle": "Mid-Market Account Executive",
  "jobUrl": "https://jobs.lever.co/employ/a4ec1fd5-d606-4995-a745-5a8b7848937c",
  "confirmationUrl": "https://jobs.lever.co/employ/a4ec1fd5-d606-4995-a745-5a8b7848937c",
  "portalSource": "jobs.lever.co",
  "jobLocation": "Los Angeles, CA",
  "manualAttestation": true,
  "evidence": "Candidate confirmed submission in NextKinHR"
}
```

- [ ] **Step 2: Verify database records**

Query:
1. `SELECT id, status, applied_at FROM outside_jobs WHERE job_url = 'https://jobs.lever.co/employ/a4ec1fd5-d606-4995-a745-5a8b7848937c';`
   Expected: `status = 'Applied'`, `applied_at` is populated.
2. `SELECT id, company_name, job_title, status FROM job_submissions WHERE job_url = 'https://jobs.lever.co/employ/a4ec1fd5-d606-4995-a745-5a8b7848937c';`
   Expected: `status = 'Applied'`.

---

### Task 5: End-to-End Suite Verification and Extension Packaging

**Files:**
- Output: `dist/` packaged extension

- [ ] **Step 1: Run complete test suite**

Run: `npm test`
Expected: All suites pass without errors.

- [ ] **Step 2: Re-pack the extension**

Run: `npm run pack:extension`
Expected: Packaging succeeds with code 0 and updates extension artifacts.

- [ ] **Step 3: Final commit**

```bash
git add .
git commit -m "chore(release): package updated extension with hardened application sync"
```
