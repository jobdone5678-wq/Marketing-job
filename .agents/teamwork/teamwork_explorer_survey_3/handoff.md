# Handoff Report — Survey Explorer 3: Realtime Dashboard & Testing

**Explorer Role**: Survey Explorer 3 (Realtime Dashboard & Testing)  
**Date**: 2026-11-09T02:42:00Z  
**Parent Orchestrator ID**: `a2dc0c5b-ca3a-482b-bd17-f484e172f706`  
**Working Directory**: `.agents/teamwork/teamwork_explorer_survey_3/`  
**Reference Document**: `.agents/teamwork/ORIGINAL_REQUEST.md`

---

## 1. Observation

### 1.1 Job Submissions Dashboard Page (`src/app/dashboard/submissions/page.tsx`)
- **Data Fetching**:
  - Lines 88–104: Data is loaded via `loadData()` using `Promise.all([getSubmissions(), getCandidates()])`.
  - Lines 106–110: Initial load on mount and upon candidate filter changes in URL (`?candidateId=...`).
  - Lines 151–174: Focus and visibility change listeners trigger a silent background refresh when the user switches tabs back to the dashboard.
- **Real-Time Subscription (`job_submissions_realtime_feed`)**:
  - Lines 113–149: Configured in `React.useEffect`:
    ```typescript
    const supabase = createClient();
    const channel = supabase
      .channel("job_submissions_realtime_feed")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "job_submissions",
        },
        async (payload) => {
          try {
            const latest = await getSubmissions();
            setSubmissions(latest);
            if (payload.eventType === "INSERT") {
              const row = payload.new as Record<string, unknown>;
              const comp = (row?.company_name as string) || "Application";
              const title = (row?.job_title as string) || "Role";
              toast.success(`🎉 New application saved: ${comp} (${title})`);
            } else if (payload.eventType === "UPDATE") {
              const row = payload.new as Record<string, unknown>;
              if (row?.status === "Applied" || row?.capture_status === "submitted") {
                toast.success(`⚡ Application updated: ${(row?.company_name as string) || "Job"}`);
              }
            }
          } catch (e) {
            console.error("[Realtime Submissions Error]", e);
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    ```
- **Display of Portal vs Outside Jobs**:
  - Lines 945–970: Each submission row displays `sub.portal_source` (defaulting to "Not recorded") in a secondary badge.
  - Line 952: If `sub.portal_source?.toLowerCase().includes("outside")`, it explicitly displays a highlighted badge:
    ```tsx
    <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 font-semibold bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30">
      Outside Portal
    </Badge>
    ```
  - Displays external application link: `<a href={sub.job_url} target="_blank">Link <ExternalLinkIcon /></a>`.
  - Lines 242–248: Filter toolbar allows filtering by `portal_source` dropdown (`selectedPortalFilter`), populated dynamically from existing submission portal sources (line 302).
  - Also displays applied resume badge (`AppliedResumeBadge`), application answer snapshot (`ApplicationAnswerSnapshot`), RTR document badge (`RTRBadge`), interview time/mode/meeting links, and recruiter notes.

### 1.2 Database & Endpoint Linkage for Outside Jobs
- **Database Migrations**:
  - `supabase/migrations/20261106000100_realtime_submissions_and_access.sql`:
    - Line 8: `ALTER TABLE public.job_submissions REPLICA IDENTITY FULL;`
    - Line 9: `ALTER TABLE public.outside_jobs REPLICA IDENTITY FULL;`
    - Lines 12–27: Adds `public.job_submissions` and `public.outside_jobs` to the `supabase_realtime` publication.
    - Lines 30–70: `candidate_staff_can_access` and `candidate_actor_can_access` grant full visibility to `super_admin`, `recruiter`, `technical_recruiter`, and own candidate access to `client`/`job_seeker`.
- **API Endpoints**:
  - `src/app/api/extension/auto-submit/route.ts` (lines 184–226 & 250–288):
    - Calls RPC `record_extension_submission` (or fallback insert) which inserts a record into `public.job_submissions` with `status: 'Applied'` and `capture_status: 'submitted'`.
    - Also saves or updates `public.outside_jobs`.
  - `src/app/api/extension/save-external-job/route.ts` (lines 31–153):
    - Validates input with `saveExternalJobSchema`.
    - Inserts/updates `public.outside_jobs` and mirrors to `public.jobs`.
    - **CRITICAL GAP**: It does **NOT** insert or link a record in `public.job_submissions`.
    - Schema does not accept `candidateId` (lines 11–29).
  - `src/app/api/submissions/route.ts`:
    - Queries `public.job_submissions` with joins to `candidates` and `profiles`. Only returns rows from `public.job_submissions`. External jobs that only exist in `public.outside_jobs` are not returned.

### 1.3 Extension Packaging Script (`scripts/package-extension.mjs`)
- **Implementation**:
  - Uses `fflate` (`zipSync`, `unzipSync`, `strFromU8`) — zero external binary CLI dependencies.
  - Reads `jobright_extension/manifest.json`, validates semantic version (`/^\d+\.\d+\.\d+$/`).
  - Recursively packs all files in `jobright_extension/` (excluding `.d.ts` files).
  - Verifies zip contents by unzipping in memory and checking:
    - `manifest.json` matches input version.
    - Presence of 6 core runtime assets: `outside-job-engine.js`, `form-discovery.js`, `field-mapping.js`, `field-writer.js`, `embedded-support.js`, `frame-agent.js`.
  - Writes archive to `jobright_extension.zip` in the project root.
- **Execution Test**:
  - Command: `node scripts/package-extension.mjs`
  - Result: `Packaged 45 files, 3790540 bytes: C:\Users\bharg\OneDrive\Desktop\marketing portal\jobright_extension.zip` (Exit code 0).
- **Observations / Gaps**:
  - `jobright_extension.zip` is not added to `.gitignore`.
  - The runtime asset validation checklist in line 21 does not check for `resume-engine.js` (explicitly mentioned in requirement R1) or `scraping-rules.json`.

### 1.4 Local Mock Job Application Test Pages and Automated Test Scripts
- **Existing Mock Fixtures**:
  - `tests/fixtures/extension-forms/`: Contains HTML contract fixtures for major ATS platforms:
    - `ashby.html`
    - `greenhouse.html`
    - `lever.html`
    - `workday.html`
  - `scratch/mock_foxsense.html`: Standalone mock application form for Foxsense Innovations (Keka ATS clone) with First Name, Last Name, Email, Mobile Phone, Gender, Experience, Salary.
- **Existing Test Scripts**:
  - `tests/test-autofill-browser.mjs`:
    - Uses Playwright headless Chromium (`@playwright/test`).
    - Uses `page.route` to mock career URLs for Keka (`https://foxsense.keka.com/**`), Greenhouse (`https://boards.greenhouse.io/**`), and Ashby (`https://jobs.ashbyhq.com/**`).
    - Evaluates `outside-job-engine.js` into the page, emits `NEXTKIN_TRIGGER_AUTOFILL`, and checks input values.
    - **Observed Test Failure**: Currently fails on all 3 tests due to phone number assertion:
      `Expected '+91 9876543210', Actual '9876543210'`.
      Reason: `outside-job-engine.js` (lines 1373–1374) cleans phone numbers to 10 raw digits: `cleanPhoneDigits.slice(-10)`.
  - `tests/test-outside-jobs-persistence.test.mjs`:
    - Uses `node:test` and in-memory `fixtureDatabase`.
    - Tests `save-external-job` and `auto-submit` routes.
    - **Observed Result**: 2/2 tests pass (495ms and 99ms).
  - `tests/autofill-submit-validation.test.mjs`:
    - **Observed Test Failure**: Fails with `Error: ENOENT: no such file or directory, open '.../browser-extension/content.js'`.
    - Multiple test files across `tests/` still reference the old deleted `browser-extension/` directory instead of `jobright_extension/`.

---

## 2. Logic Chain

1. **User Requirement R2 & R3 Flow**:
   - The user requires that:
     1. When a candidate applies to a job outside the portal using the extension, the job details are captured from the DOM and stored in `public.outside_jobs` AND automatically recorded into `public.job_submissions` via `/api/extension/save-external-job` and `/api/extension/auto-submit`.
     2. All applied jobs (internal or DOM-captured) appear immediately in real time on the Job Submissions dashboard (`src/app/dashboard/submissions/page.tsx`) via Supabase Realtime (`job_submissions_realtime_feed`) without page refresh.
2. **Current State Gap Analysis**:
   - In `auto-submit`, both `public.outside_jobs` and `public.job_submissions` are written. The Realtime feed fires on `job_submissions` and the new application appears on `/dashboard/submissions`.
   - In `save-external-job`, only `public.outside_jobs` and `public.jobs` are written. `public.job_submissions` is **NOT** written.
   - Therefore, if external jobs are captured via `save-external-job` without an immediate `auto-submit` completion, they exist only in `outside_jobs` and do not appear on `/dashboard/submissions`, nor does `job_submissions_realtime_feed` fire.
3. **Resolution Logic**:
   - Updating `/api/extension/save-external-job` to accept candidate identity (or resolve from authenticated extension session) and record or link a corresponding `public.job_submissions` entry (e.g., status `'Draft'` or `'Applied'` with `portal_source = body.portalSource`) satisfies Requirement R2 and ensures that `job_submissions_realtime_feed` fires in real time.
   - On the frontend (`src/app/dashboard/submissions/page.tsx`), the Realtime hookup is already listening to `public.job_submissions` on channel `job_submissions_realtime_feed`. Once the database row is created, Realtime delivers the event, `loadData()` re-fetches, and the UI displays the outside application with the "Outside Portal" badge.
4. **Testing Logic**:
   - Fixing the phone number expectation in `tests/test-autofill-browser.mjs` (or adjusting phone formatting in `outside-job-engine.js` to preserve country code when present) resolves the test failures.
   - Updating stale `browser-extension` paths in `tests/` to `jobright_extension/` unblocks the test suite.
   - Providing local mock job application HTML pages in a persistent fixture location (e.g., `tests/fixtures/mock-job-pages/`) enables end-to-end testing of DOM capture, autofill, and database persistence in local CI/test environments without internet access.

---

## 3. Caveats

1. **Supabase Realtime RLS & WebSocket Authentication**:
   - Supabase Realtime postgres_changes filters events according to PostgreSQL RLS policies for authenticated subscribers.
   - Migration `20261106000100` properly enabled `REPLICA IDENTITY FULL` and granted `candidate_staff_can_access` to active staff (`super_admin`, `recruiter`, `technical_recruiter`) and candidates (`client`/`job_seeker`).
   - If an unauthenticated user or an invalid token connects, Realtime will silently drop events due to RLS filtering.
2. **Channel Re-subscription & Re-fetching Overhead**:
   - In `src/app/dashboard/submissions/page.tsx`, when any Realtime event occurs, it calls `latest = await getSubmissions()`. For high submission frequencies (e.g. bulk automated batch submits), multiple simultaneous `getSubmissions()` fetches may occur. Debouncing or optimistic state splicing can be considered if high throughput is expected.
3. **Packaging Artifact in Git Tree**:
   - `jobright_extension.zip` is generated in the workspace root. If not added to `.gitignore`, packaging the extension marks the git workspace as dirty.
4. **Browser Testing Environment**:
   - `tests/test-autofill-browser.mjs` launches Playwright Chromium (`chromium.launch({ headless: true })`). In CI or non-desktop environments, ensure Playwright Chromium binary is installed (`npx playwright install chromium`).

---

## 4. Feature Inventory Items

| Item ID | Name | Description | Dependencies |
|---|---|---|---|
| **FEAT-SUB-01** | `SUBMISSIONS_REALTIME_FEED` | Verified and active Supabase Realtime channel `job_submissions_realtime_feed` on `public.job_submissions` in `src/app/dashboard/submissions/page.tsx` with automatic re-fetch and toast notification. | `20261106000100_realtime_submissions_and_access.sql`, `@supabase/ssr` |
| **FEAT-SUB-02** | `OUTSIDE_JOBS_SUBMISSION_LINK` | Backend linkage ensuring external jobs captured via `/api/extension/save-external-job` automatically record into `public.job_submissions` (with candidate attribution and `portal_source`) alongside `public.outside_jobs`. | `save-external-job/route.ts`, `outside_jobs_support.sql` |
| **FEAT-SUB-03** | `SUBMISSIONS_OUTSIDE_DISPLAY` | Display of outside DOM-captured applications on `/dashboard/submissions` with "Outside Portal" badge, portal source filter, applied resume badge, answer snapshot, and job link. | `src/app/dashboard/submissions/page.tsx`, `getSubmissions()` |
| **FEAT-PKG-01** | `EXTENSION_PACKAGING_SCRIPT` | Extension packaging via `node scripts/package-extension.mjs` using `fflate`, validating manifest version, verifying runtime assets, and outputting `jobright_extension.zip`. | `fflate`, `jobright_extension/manifest.json` |
| **FEAT-TST-01** | `LOCAL_MOCK_JOB_PAGES` | Standalone local HTML mock job application pages representing major ATS platforms (Keka, Greenhouse, Ashby, Workday, Lever) for testing field discovery, autofill, and DOM capture. | `tests/fixtures/extension-forms/` |
| **FEAT-TST-02** | `AUTOFILL_DOM_CAPTURE_E2E_TESTS` | Automated test suite verifying DOM extraction, autofill populating candidate facts, and end-to-end API/database persistence into `outside_jobs` and `job_submissions`. | `@playwright/test`, `node:test`, `tests/test-autofill-browser.mjs`, `tests/test-outside-jobs-persistence.test.mjs` |

---

## 5. Conclusion

1. **Realtime Dashboard**:
   - `src/app/dashboard/submissions/page.tsx` already has the Supabase Realtime channel `job_submissions_realtime_feed` implemented.
   - Database migrations `20261106000100` and `20261104000300` have already enabled `REPLICA IDENTITY FULL` and added `job_submissions` and `outside_jobs` to `supabase_realtime`.
   - The critical missing piece is that `/api/extension/save-external-job` does not record into `public.job_submissions`. Once `save-external-job` writes to `job_submissions`, external DOM captures will immediately trigger the Realtime feed and appear on the dashboard.
2. **Packaging**:
   - `scripts/package-extension.mjs` runs and successfully generates `jobright_extension.zip` containing 45 files.
   - Recommendations: add `resume-engine.js` and `scraping-rules.json` to the runtime assets check, and add `jobright_extension.zip` to `.gitignore`.
3. **Testing Infrastructure**:
   - Mock form fixtures exist in `tests/fixtures/extension-forms/` and `scratch/mock_foxsense.html`.
   - `tests/test-outside-jobs-persistence.test.mjs` passes.
   - `tests/test-autofill-browser.mjs` has a phone number formatting expectation mismatch (`+91 9876543210` vs `9876543210`).
   - Multiple older tests have stale references to `browser-extension/` instead of `jobright_extension/`. Updating these references will restore the full test suite.

---

## 6. Verification Method

To independently verify these findings, run the following commands:

1. **Verify Realtime Submissions Component and Schema**:
   - Inspect `src/app/dashboard/submissions/page.tsx` lines 113–149.
   - Inspect `supabase/migrations/20261106000100_realtime_submissions_and_access.sql` lines 8–27.
2. **Verify Extension Packaging**:
   - Run: `node scripts/package-extension.mjs`
   - Confirm exit code 0 and output `jobright_extension.zip` in root.
3. **Verify Outside Jobs Persistence Tests**:
   - Run: `node --test tests/test-outside-jobs-persistence.test.mjs`
   - Confirm 2/2 tests pass.
4. **Verify Typecheck and Next.js Build**:
   - Run: `npm run typecheck` (verifies zero TypeScript errors).
   - Run: `npm run build` (Next.js webpack production build).
