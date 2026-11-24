# Job Application Sync & Database Persistence Design

**Goal:** Ensure that job applications submitted on external ATS platforms (e.g. Lever, Greenhouse, Ashby, Workday) and internal portal applications are reliably captured, saved to the database (`job_submissions` and `outside_jobs`), and immediately displayed in the **My Applications** dashboard without entering an infinite retry loop or silently dropping confirmation receipts.

---

## 1. Context & Root Cause Analysis

### A. Database RPC Ambiguity (HTTP 500 Failure)
When the user clicks "Mark as applied" in the extension or when an outside application is synced, the Next.js API endpoint `/api/extension/auto-submit` invokes the PostgreSQL RPC function `public.record_extension_submission`.

On the live Supabase database, this function was declared with variables:
```sql
company text;
title text;
```
Inside the body, it queries:
```sql
SELECT id INTO v_job_id FROM public.jobs
WHERE lower(trim(public.jobs.company)) = lower(trim(company))
  AND lower(trim(public.jobs.title)) = lower(trim(title)) LIMIT 1;
```
Because `public.jobs` has columns named `company` and `title`, PostgreSQL throws:
`ERROR: 42702: column reference "company" is ambiguous`.

This unhandled exception caused the Next.js API route to return HTTP 500.

### B. Extension Retry Loop
When `api('auto-submit')` fails with HTTP 500:
1. `panel.js` sends `{ type: 'queue-submission' }` to `background.js`.
2. `background.js` enqueues the item in Chrome storage and attempts background delivery up to 8 times with exponential backoff.
3. Every retry also hits the broken RPC and returns HTTP 500, keeping the UI locked on:
   `Application Status: RETRYING - Sync retry in progress (attempt X of 8)...`

### C. Extension Detection & Attempt State Drop
In `jobright_extension/application-confirmation.js`:
- Submitting an application previously only set `sessionStorage.setItem('nextkin_submission_attempted', 'true')` inside the webpage's DOM session storage.
- It never sent the `NEXTKIN_SET_SUBMISSION_ATTEMPT` message to `background.js`.
- In `background.js:recordConfirmation`, unlinked outside jobs require `submission_attempt:${tabId}` in `chrome.storage.session`. Because it was missing, `recordConfirmation` returned `false`, silently dropping the confirmation receipt.
- Additionally, `application-confirmation.js` contained a filter:
  `if (!isVerifiedAts && !submissionAttempted && !hasTerminalSelector) return;`
  which aborted without reporting when button labels deviated from standard `"Submit"` / `"Apply"` text (e.g., multi-step forms using `"Continue"`, `"Next"`, or icon buttons).

---

## 2. Goals, Non-Goals & Anti-Goals

### Goals
- **G1 (Database Fix)**: Update `public.record_extension_submission` on the live Supabase PostgreSQL database to eliminate variable name collision (`v_company`, `v_title`) and ensure atomic upserts into `job_submissions` and `outside_jobs`.
- **G2 (Extension Submit Tracking)**: Broaden submission trigger detection in `application-confirmation.js` and immediately propagate `NEXTKIN_SET_SUBMISSION_ATTEMPT` to `background.js`.
- **G3 (Receipt Preservation)**: Ensure verified ATS platforms with terminal success indicators (such as Lever's `"Application submitted!"`) are never aborted or dropped.
- **G4 (Resilient Delivery & Queue Recovery)**: Allow the background sync worker to deliver receipts via `/api/extension/auto-submit` or `/api/webhooks/application-submitted` and cleanly dequeue upon HTTP 200/201.
- **G5 (Dashboard Visibility)**: Ensure both internal portal and external ATS jobs display in **My Applications** (`/dashboard/submissions`) with accurate status (`Applied`), application dates, and source badges.

### Non-Goals
- Changing the dashboard UI layout or redesigning the filter pills.
- Altering the resume parsing or auto-fill field mapping algorithms.

### Anti-Goals
- Never allow a duplicate submission to create multiple identical records in `outside_jobs` for the same user and job URL.
- Never lose a candidate's submission receipt if the network is temporarily offline or the tab is closed immediately after submission.

---

## 3. Approaches Considered

### Approach 1: End-to-End Pipeline Fix (Selected)
- Update the live Supabase RPC `record_extension_submission` with disambiguated variables.
- Update `application-confirmation.js` to dispatch attempt events and broaden button detection.
- Clean up queue retry handling in `background.js`.
- Verify dual-table persistence (`job_submissions` and `outside_jobs`) and UI rendering.
- **Why chosen**: Completely resolves the underlying database crash, fixes the DOM detection gap, and ensures end-to-end reliability.

### Approach 2: Database RPC Fix Only
- Only fix the SQL function on Supabase.
- **Why rejected**: Fails to fix the automatic detection issue in the browser extension; users would still have to manually click "Mark as applied" for many jobs.

### Approach 3: Client-Side Bypass
- Modify extension to ignore server errors or fake local success.
- **Why rejected**: Data would never actually be committed to Supabase, breaking dashboard visibility and cross-device syncing.

---

## 4. Detailed Component Design

### 4.1 Database Layer (PostgreSQL RPC Fix)
Apply the authoritative migration matching `supabase/migrations/20261123000100_atomic_application_receipt.sql` to the live Supabase project:
1. Declare variables with prefix: `v_company`, `v_title`, `v_location`, `v_department`, `v_description`.
2. Disambiguate queries:
   ```sql
   SELECT id INTO v_job_id FROM public.jobs
   WHERE lower(trim(public.jobs.company)) = lower(trim(v_company))
     AND lower(trim(public.jobs.title)) = lower(trim(v_title)) LIMIT 1;
   ```
3. Ensure atomic dual-write:
   - `job_submissions`: Sets status to `'Applied'`, capture_status to `'submitted'`, source_type to `'extension'`.
   - `outside_jobs`: Upserts on `(capture_owner_id, job_url)` with status `'Applied'` and `applied_at = now()`.

### 4.2 Browser Extension Content Script (`application-confirmation.js`)
1. **Submit Event & Button Listeners**:
   - Intercept both `submit` events on forms and `click` events on buttons/inputs.
   - Match regex for submit actions: `/\b(?:submit|apply|send application|complete application|review application|continue|finish|next)\b/i`.
   - Dispatch `NEXTKIN_SET_SUBMISSION_ATTEMPT` to `chrome.runtime.sendMessage` so `background.js` records the attempt in `chrome.storage.session`.
2. **Terminal Confirmation Detection**:
   - Support Lever/Employ confirmation pages containing `"Application submitted!"` and `"RETURN TO THE MAIN PAGE"`.
   - If ATS is recognized (`lever`, `greenhouse`, `ashby`, `workday`, `smartrecruiters`) and terminal evidence is present, do NOT drop the receipt.

### 4.3 Background Queue Worker (`background.js` & `panel.js`)
1. In `deliverReceipt()`:
   - For items with `manualAttestation: true` or outside applications, route to `/api/extension/auto-submit` (which supports manual attestations without requiring a strict receipt token).
2. Drain retry queue:
   - On successful HTTP 200 response, clear the retry state, notify connected panels (`NEXTKIN_SYNC_SUCCESS`), and broadcast `NEXTKIN_OUTSIDE_APPLICATION_SAVED`.

### 4.4 Next.js Dashboard UI (`/dashboard/submissions`)
1. The route `/api/submissions` queries:
   - `job_submissions` for user candidates.
   - `outside_jobs` where `status = 'Applied'`.
   - Unions and sorts by `applied_at` / `submission_date` DESC.
2. Verified that both sources render with corresponding badges (`Internal portal` vs `Extension captured`).

---

## 5. Verification Plan
1. **SQL RPC Direct Verification**: Execute test RPC call against candidate `ebcbee30-b259-4c55-b40f-97d9006914e9` to confirm successful write without 42702 ambiguity errors.
2. **Pending Queue Drain**: Trigger retry for the stuck Employ job to verify it moves from `RETRYING` to `SYNCED`.
3. **Database Assertion**: Confirm `outside_jobs` and `job_submissions` contain `Mid-Market Account Executive` at Employ with `status = 'Applied'`.
4. **Dashboard Assertion**: Verify `GET /api/submissions` returns the application and the UI displays it under **My Applications**.
5. **Pack Extension**: Rebuild and pack `jobright_extension/` with `npm run pack:extension`.
