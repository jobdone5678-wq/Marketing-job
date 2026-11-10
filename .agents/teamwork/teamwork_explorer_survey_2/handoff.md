# Survey Report 2: Job Form Autofill, External Job DOM Capture, Backend Endpoints & Database Schemas

**Author**: Survey Explorer 2 (`teamwork_explorer_survey_2`)  
**Target Milestone**: Survey Autofill & DOM Capture Architecture  
**Date**: 2026-11-09T02:45:00Z  
**Reference Document**: `.agents/teamwork/ORIGINAL_REQUEST.md`

---

## 1. Observation

Direct code and database observations across `jobright_extension/`, backend route handlers, and Supabase database schemas:

### 1.1 Job Form Autofill (`jobright_extension/`)
- **Dual Autofill Architecture**:
  1. *Formal Contract Engine*:
     - `form-discovery.js` (lines 7–38): Discovers form fields across `input`, `textarea`, `select`, `[role="combobox"]`, `iframe`. Recursively traverses DOM and shadow roots (`shadowRoot`). Excludes hidden, password, submit, and sensitive fields matching `excluded` regex (`password|secret|token|credential|bank|routing|payment|credit.?card|ssn|social.?security|tax.?id|birth|dob...`).
     - `field-mapping.js` (lines 42–105): Maps candidate profile facts (`confirmed_facts` or raw candidate) to form fields via alias dictionaries (`aliases`, lines 4–40). Strictly checks for unambiguous matches (`matchKeys.length === 1`), otherwise flags as `needs_review`. Handles boolean conversion to "Yes"/"No" for radios/comboboxes/selects.
     - `field-writer.js` (lines 3–32): React Fiber bypass setter `writeNative(el, property, next)`. Modifies `el._valueTracker` to break React cache, invokes prototype setter on `HTMLInputElement`/`HTMLSelectElement`/`HTMLTextAreaElement`, and dispatches synthetic events sequence: `focus` → `InputEvent('input', { inputType: 'insertText', data: val })` → `Event('change')` → `blur`, and strips `aria-invalid`.
     - `fill-session.js` (lines 13–91): Transactional session manager with receipt ledger (`writeReceipts`). Generates deterministic `sessionId` and checks candidate readiness via `getReadiness()`.
     - `candidate-context.js` (lines 4–73): Builds immutable candidate context with `factsHash` and validates that required facts are present.
  2. *Universal Outside Engine & Dynamic Fallback* (`outside-job-engine.js`):
     - Lines 1174–1603 (`executeOutsideAutofill`): Fallback engine used across all external career portals. Collects all controls recursively via `collectControls(doc)` including accessible iframes.
     - 5-step hierarchical ARIA / control descriptor (`getControlDescriptor`, lines 1103–1161): Combines `aria-labelledby`, `aria-label`, `<label for>`, enclosing `fieldset` / Workday automation containers (`[data-automation-id="workExperience"]`), and preceding sibling/container labels.
     - Aliases & Field Priority:
       * Middle Name explicitly checked first (line 1392) to avoid accidental match with full name or first name.
       * Clean 10-digit phone number extraction (line 1373) stripped of formatting.
       * Comprehensive matching for demographics, education, salary, work authorization, sponsorship, radio buttons, and checkboxes.
     - Missing Phone Detection & Prompter (`findPhoneInputElement`, lines 734–759, and `monitorAndPromptMissingPhone`, lines 761–806): Detects missing phone, highlights with red border/boxShadow glow, scrolls to center, and listens for candidate input (`inputVal.length >= 7`) to save back to profile.
     - AI Field Generation: Lines 1533–1557 asynchronously sends message `generate_ai_field_answer` to service worker for `TEXTAREA` or bio/screening fields.
     - Multi-Step Pagination Machine: Lines 1937–1979 (`observeMultiStepPagination`) and lines 2043–2098 (`setupMultiPageStepWatcher`) compute DOM step fingerprint (`pathname#header#count#names`) on `popstate`, `hashchange`, and `MutationObserver` to re-trigger autofill as candidate navigates multi-step ATS flows.
- **Autofill Triggers**:
  - `window.addEventListener('message')` for `NEXTKIN_TRIGGER_AUTOFILL` (lines 1879–1889).
  - `document.addEventListener('NextkinTriggerAutofill')` (lines 1891–1899).
  - Service worker runtime message `NEXTKIN_TRIGGER_AUTOFILL` (lines 1903–1914).
  - In-page click on `.auto-fill-button, [class*="auto-fill-button"], .go-to-next-button` (lines 1916–1930).
  - Step progression in `setupMultiPageStepWatcher` (line 2087).
- **Adapters Missing from `manifest.json`**:
  - `jobright_extension/manifest.json` lines 358–368 only declares `adapters/generic.js`.
  - `adapters/greenhouse.js`, `adapters/lever.js`, `adapters/ashby.js`, and `adapters/workday.js` exist in the directory but are NOT included in `manifest.json` content scripts.
- **Stale References to `browser-extension`**:
  - `tests/extension-fill-session.test.mjs` (lines 8, 13–15) and `tests/extension-form-adapters.test.mjs` (line 11) import from `browser-extension/` instead of `jobright_extension/`.

### 1.2 External Job DOM Capture (`jobright_extension/`)
- **Domain Gate & Classification** (`outside-job-engine.js`, lines 89–247):
  - `isJobOrCareerPage()` rejects non-job domains (`chatgpt.com`, `github.com`, `gitlab.com`, `google.com`, `reddit.com`, etc.) and non-job LinkedIn routes (`/in`, `/feed`, `/messaging`).
  - Recognizes known ATS domains (Greenhouse, Lever, Ashby, Workday, SmartRecruiters, Breezy, BambooHR, Keka, etc.) and careers subdomains.
- **Job Extraction Flow**:
  - `scrapeJobFromDOM()` (lines 531–708):
    1. Schema.org JSON-LD extraction (`script[type="application/ld+json"]`) parses `JobPosting` objects.
    2. Platform-specific extractors (LinkedIn top-card `.jobs-unified-top-card`, Keka/Foxsense `.company-name`/`.job-title`).
    3. Heuristic CSS selectors for Job Title validated against `isValidJobTitle()` blacklist.
    4. Heuristic CSS selectors for Company and Description (min 80 chars, or 50 char fallback on form pages).
    5. Fallback via `parsePageTitle()` on `og:title` / `document.title`.
  - `scraping-rules.json`: Provides 641 lines of XPath extraction rules across 35+ ATS and job boards (Greenhouse, Lever, LinkedIn, Workday, Ashby, Indeed, etc.).
- **Proactive & Submission Capture Triggers**:
  - `bindApplyButtonWatcher()` (lines 1608–1630): Intercepts clicks on "Apply now" / "Apply for this job" buttons and calls `syncOutsideJobToPortal(currentExtractedJob)` to forward job details to `/api/extension/save-external-job`.
  - `bindSubmissionListeners()` (lines 1743–1804): Intercepts form `submit` events, clicks on submit buttons, and `MutationObserver` watching for confirmation text ("Thank you for applying", "Application received").
  - `handleApplicationSubmission()` (lines 1655–1741): Gathers answers via `captureFormAnswers()`, calculates ATS skill match via `computeATSAnalysis()`, builds resume snapshot, and dispatches message `type: 'auto_submit'` to background worker.

### 1.3 Backend API Endpoints
- **`/api/extension/save-external-job` (`src/app/api/extension/save-external-job/route.ts`)**:
  - Wrapped in `extensionRoute` and calls `await extensionProfile(request);` (line 33).
  - Validates payload with `saveExternalJobSchema` (lines 11–29): `title`, `company`, `jobUrl`, `description`, optional `location`, `department`, `employmentType`, `matchScore`, `matchedSkills`, etc.
  - Normalizes URL via `applicationUrlKey(body.jobUrl)`.
  - Checks if job already exists in `public.outside_jobs` by `job_url` (line 41) or by `(company, title)` (line 70).
  - Inserts into `public.outside_jobs` with `status: 'Discovered'` (lines 99–123).
  - Mirrors insert into `public.jobs` with `is_external: true` (lines 130–146).
  - Clears `outsideJobsCache.clear()` (line 149).
- **`/api/extension/auto-submit` (`src/app/api/extension/auto-submit/route.ts`)**:
  - Authentication fallback (lines 47–51):
    `try { actor = await extensionProfile(request); } catch { actor = { id: '892442fa-8b99-4ecd-865c-c5dbed1f39a6', status: 'active', role: 'client' }; }`
  - Validates payload with `autoSubmitSchema` (lines 11–38).
  - Resolves candidate (lines 81–105) matching actor's candidate records.
  - Checks for matching intent (`application_intents`) or existing submission by `safeJobUrl`.
  - Calls `record_extension_submission` RPC (lines 184–206) or fallback direct insert to `public.job_submissions` with `status: 'Applied'`, `capture_status: 'submitted'`.
  - Saves `applied_resume` via `saveAppliedResume(result.submission.id, candidateId, finalAppliedResume)` (line 230).
  - Saves answer snapshot via `save_application_answer_snapshot` RPC (lines 239–244).
  - Inserts/updates `public.outside_jobs` with `candidate_id`, `submission_id: result.submission.id`, `status: 'Applied'`, `answers`, `applied_resume` (lines 251–287).
- **Service Worker Messaging Bridge (`jobright_extension/static/background/index.js`)**:
  - `save_external_job` (lines 155–168): Fetches `origin + '/api/extension/save-external-job'`. `origin` defaults to `'http://localhost:3000'`. Headers: `Authorization: 'Bearer ' + storage.token`.
  - `auto_submit` (lines 170–313): Fetches `origin + '/api/extension/auto-submit'`. Line 266: `let origin = storage.origin || 'https://www.nextkinhr.com'`. Headers: `Authorization: 'Bearer ' + tok` (`tok = storage.token || storage.nextkin_auth_token || ''`).

### 1.4 Database Tables (`public.outside_jobs` and `public.job_submissions`)
- **`public.outside_jobs` (Verified via Supabase MCP `execute_sql` on live DB `yzworkrtgbcrsewjsfsg`)**:
  ```
  id                uuid (PK, gen_random_uuid())
  candidate_id      uuid (FK -> candidates.id, nullable)
  submission_id     uuid (FK -> job_submissions.id, nullable)
  title             text (NOT NULL)
  company           text (NOT NULL)
  job_url           text (NOT NULL)
  portal_source     text (NOT NULL, default 'Outside Job')
  location          text (nullable)
  department        text (nullable)
  employment_type   text (default 'Full-time')
  description       text (nullable)
  description_html  text (nullable)
  match_score       integer (nullable)
  matched_skills    text[] (default '{}')
  missing_skills    text[] (default '{}')
  extracted_skills  text[] (default '{}')
  ats_analysis      jsonb (nullable)
  answers           jsonb (nullable)
  applied_resume    jsonb (nullable)
  status            text (default 'Applied')
  applied_at        timestamptz (default now())
  created_at        timestamptz (default now())
  updated_at        timestamptz (default now())
  ```
  - Remote migration record: `20261105021852_create_outside_jobs_table` exists in `supabase_migrations.schema_migrations`.
  - Local repository migration status: The SQL file `20261105021852_create_outside_jobs_table.sql` is **missing** from `supabase/migrations/`!
- **`public.job_submissions` (Verified via Supabase MCP `execute_sql` on live DB `yzworkrtgbcrsewjsfsg`)**:
  ```
  id                      uuid (PK, gen_random_uuid())
  candidate_id            uuid (NOT NULL, FK -> candidates.id)
  recruiter_id            uuid (nullable, FK -> profiles.id)
  technical_recruiter_id  uuid (nullable, FK -> profiles.id)
  submission_date         date (NOT NULL, default CURRENT_DATE)
  company_name            text (NOT NULL)
  job_title               text (NOT NULL)
  job_url                 text (nullable)
  portal_source           text (nullable)
  job_location            text (nullable)
  vendor_company          text (nullable)
  vendor_contact_name     text (nullable)
  vendor_contact_email    text (nullable)
  vendor_contact_phone    text (nullable)
  submitted_rate          text (nullable)
  client_pay_rate         text (nullable)
  status                  submission_status (NOT NULL, default 'Draft')
  interview_time          timestamptz (nullable)
  interview_mode          text (nullable)
  interview_meeting_link  text (nullable)
  notes                   text (nullable)
  duplicate_flag          boolean (NOT NULL, default false)
  created_at              timestamptz (NOT NULL, default now())
  updated_at              timestamptz (NOT NULL, default now())
  capture_status          text (nullable)
  email_confirmed_at      timestamptz (nullable)
  vendor_id               uuid (nullable, FK -> vendors.id)
  job_id                  uuid (nullable, FK -> jobs.id)
  ```
  - **Column discrepancy**: `applied_resume` is declared in TypeScript interface `JobSubmission` (`src/types/database.ts`:128), targeted in `saveAppliedResume` (`src/lib/capture/applied-resume.ts`:18), and written in migration `supabase/migrations/20261019000200_job_submission_applied_resumes.sql`. However, querying `information_schema.columns` on the live database confirms `applied_resume` is **not present** on `public.job_submissions`.
- **Supabase Realtime Verification**:
  - `SELECT pubname, tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime'` confirms **both** `job_submissions` and `outside_jobs` are active in publication.
  - `relreplident` = `'f'` (FULL) on both tables.
  - `src/app/dashboard/submissions/page.tsx` (lines 113–149) subscribes to `supabase.channel("job_submissions_realtime_feed")` on table `job_submissions`.
  - `src/app/dashboard/outside-jobs/page.tsx` (lines 79–97) subscribes to `supabase.channel("outside_jobs_realtime_feed")` on table `outside_jobs`.

---

## 2. Logic Chain

From these direct observations, we trace the logical causes and systemic implications:

```
[Observation: outside_jobs migration 20261105021852 in DB, but not in repo]
       │
       ▼
If a clean environment (or CI/CD or local test container) runs migrations from repo:
`20261106000100_realtime_submissions_and_access.sql` executes:
`ALTER TABLE public.outside_jobs REPLICA IDENTITY FULL;`
       │
       ▼
[Failure]: Postgres throws "relation 'public.outside_jobs' does not exist"
       │
       ▼
Resolution required: Export migration 20261105021852_create_outside_jobs_table.sql to supabase/migrations/.
```

```
[Observation: applied_resume column missing from public.job_submissions on remote DB]
       │
       ▼
When candidate submits external application via extension auto_submit:
`/api/extension/auto-submit/route.ts` line 230 executes:
`await saveAppliedResume(result.submission.id, candidateId, finalAppliedResume)`
       │
       ▼
`src/lib/capture/applied-resume.ts` line 18 runs:
`database().from('job_submissions').update({ applied_resume: resume })`
       │
       ▼
[Failure]: Postgres throws "column 'applied_resume' of relation 'job_submissions' does not exist"
CaptureError is caught by outer block, returning 500 error to extension!
       │
       ▼
Resolution required: Run `ALTER TABLE public.job_submissions ADD COLUMN IF NOT EXISTS applied_resume jsonb DEFAULT NULL;` on database.
```

```
[Observation: Background index.js origin mismatch & token handling]
       │
       ├─ In save_external_job: origin defaults to 'http://localhost:3000' and token checks ONLY storage.token
       │
       └─ In auto_submit: origin defaults to 'https://www.nextkinhr.com' and token checks storage.token || storage.nextkin_auth_token
       │
       ▼
[Impact]: In local dev or test environments without storage.origin set:
- Job discovery hits localhost:3000
- Auto-submit hits production https://www.nextkinhr.com
- If auth token is stored in nextkin_auth_token, save_external_job completely skips sending the fetch!
       │
       ▼
Resolution required: Standardize background worker endpoints to inspect localhost vs production origin consistently, and check both `token` and `nextkin_auth_token`.
```

```
[Observation: Authentication strictness mismatch between endpoints]
       │
       ├─ /api/extension/save-external-job: calls await extensionProfile(request); directly (throws 401 if unpaired)
       │
       └─ /api/extension/auto-submit: wraps extensionProfile in try-catch and falls back to active client actor
       │
       ▼
[Impact]: Un-paired extension users can trigger auto-submit, but save-external-job rejects with 401 Unauthorized!
       │
       ▼
Resolution required: Add fallback actor handling in save-external-job matching auto-submit, or ensure paired token is always present.
```

```
[Observation: manifest.json omits ATS adapter scripts]
       │
       ▼
`manifest.json` only loads `adapters/generic.js`.
`adapters/greenhouse.js`, `lever.js`, `ashby.js`, `workday.js` are never injected in content scripts.
       │
       ▼
`NextkinAdapters` array in browser contains only generic adapter, so platform-specific hints (`el.getAttribute('name')`) are not registered through the formal adapter layer.
(Note: outside-job-engine.js compensates with its direct fallback, but formal NextkinForms adapter layer is bypassed).
```

---

## 3. Caveats

1. **CORS Restrictions**:
   - `src/lib/capture/server.ts` line 44 (`cors` function) validates origins: accepts `chrome-extension://<32-hex-or-base16-chars>`, `http://localhost:*`, `http://127.0.0.1:*`, and `https://*.nextkinhr.com`.
   - When test scripts or external fetch clients invoke endpoints with synthetic origins (e.g. `https://portal.test`), `cors()` does not set CORS response headers, which is safe for server-to-server or node tests, but browser-based extension background fetches must use standard extension origin or localhost.
2. **Dual Database Recording (`outside_jobs` vs `job_submissions`)**:
   - `outside_jobs` stores every discovered external job posting (status: `'Discovered'`) as well as completed external submissions (status: `'Applied'`).
   - `job_submissions` stores ONLY completed/attempted applications (status: `'Applied'`).
   - When an application is submitted, it is written to `job_submissions` AND updated in `outside_jobs` with `outside_jobs.submission_id = job_submissions.id`.
   - The unified dashboard (`/dashboard/submissions`) displays `job_submissions`. The dedicated outside jobs explorer (`/dashboard/outside-jobs`) displays `outside_jobs`. Both receive real-time updates.
3. **Session & Candidate Resolution**:
   - When `auto-submit` runs without an active candidate UUID, it resolves the actor's most recent candidate from `public.candidates`. If the actor has no candidates in the database, it throws a 404 error (`'Candidate not found. Please upload or select a valid candidate.'`).

---

## 4. Conclusion

1. **Job Form Autofill** is functionally implemented with sophisticated mechanisms: React Fiber `_valueTracker` bypass, ARIA hierarchical extraction, telephone formatting/monitoring, and multi-step pagination state tracking. However, `manifest.json` omits specific ATS adapters (`adapters/greenhouse.js`, `lever.js`, `ashby.js`, `workday.js`), and test files still contain stale `browser-extension` paths.
2. **External Job DOM Capture** reliably extracts job postings across Schema.org JSON-LD, specific selectors (LinkedIn, Keka/Foxsense), and heuristic selectors, backed by `scraping-rules.json`. Capturing form submissions is intercepted via form submit, apply buttons, and confirmation text mutations.
3. **Backend API Endpoints** (`save-external-job` and `auto-submit`) successfully link external jobs to `public.outside_jobs` and `public.job_submissions`. However, two critical defects exist:
   - `save-external-job` lacks fallback actor authentication (returns 401 if unpaired), whereas `auto-submit` has fallback authentication.
   - Background service worker has conflicting origin defaults (`localhost:3000` vs `https://www.nextkinhr.com`) and token keys (`token` vs `nextkin_auth_token`).
4. **Database Schemas** are properly configured for Supabase Realtime (`REPLICA IDENTITY FULL`, `supabase_realtime` publication active for both `job_submissions` and `outside_jobs`). Two critical schema discrepancies exist:
   - Migration file `20261105021852_create_outside_jobs_table.sql` is missing from `supabase/migrations/`.
   - Column `applied_resume` is missing from `public.job_submissions` in the remote database, causing `saveAppliedResume` update failure during `auto-submit`.

---

## 5. Verification Method

### 5.1 Verification Commands
1. **Verify Database Schemas and Columns**:
   ```sql
   -- Check applied_resume in job_submissions
   SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'job_submissions' AND column_name = 'applied_resume';

   -- Check outside_jobs table existence and columns
   SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'outside_jobs' ORDER BY ordinal_position;

   -- Check Realtime publication
   SELECT pubname, tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename IN ('job_submissions', 'outside_jobs');
   ```
2. **Run Existing Pipeline Tests**:
   ```powershell
   node --test tests/test-outside-jobs-persistence.test.mjs
   ```
3. **Verify Stale Import Paths in Tests**:
   ```powershell
   rg "browser-extension" tests/
   ```

---

## 6. Feature Inventory: Survey Explorer 2

| Feature / Component | Description | Files Involved | Dependencies / Notes |
|---|---|---|---|
| **F1: Universal Form Autofill & React Setter Bypass** | Discovers input/select/combobox controls, bypasses React Fiber value trackers, and writes profile values | `jobright_extension/outside-job-engine.js`, `field-writer.js`, `form-discovery.js`, `field-mapping.js` | Depends on active candidate in `chrome.storage.local` |
| **F2: Missing Phone Detection & Interactive Prompt** | Detects empty phone field, autofills if present in profile, otherwise highlights field and prompts user | `jobright_extension/outside-job-engine.js` (lines 734–806) | Intercepts candidate input to update profile |
| **F3: Multi-Step ATS Pagination State Machine** | Computes DOM step fingerprints to detect page progression and re-trigger autofill across steps | `jobright_extension/outside-job-engine.js` (lines 1937–2098) | Listens to `popstate`, `hashchange`, mutations |
| **F4: Universal Outside Job DOM Scraper** | Scrapes job title, company, JD, and location via JSON-LD, platform selectors, and heuristic CSS | `jobright_extension/outside-job-engine.js` (lines 531–708), `scraping-rules.json` | Gated by `isJobOrCareerPage()` domain whitelist |
| **F5: External Application Submission Interceptor** | Captures form answers, computes ATS match, builds resume snapshot, and sends `auto_submit` message | `jobright_extension/outside-job-engine.js` (lines 1637–1804) | Triggers on form submit, submit buttons, success mutations |
| **F6: External Job Ingestion API (`/api/extension/save-external-job`)** | Deduplicates by URL or company/title, upserts into `public.outside_jobs`, and mirrors to `public.jobs` | `src/app/api/extension/save-external-job/route.ts` | Needs auth fallback and background worker token fix |
| **F7: Application Auto-Submit API (`/api/extension/auto-submit`)** | Records external submission in `job_submissions` (status: Applied) and links to `outside_jobs.submission_id` | `src/app/api/extension/auto-submit/route.ts` | Requires `applied_resume` column in `job_submissions` |
| **F8: Real-Time Submissions Synchronization** | Supabase Realtime channel `job_submissions_realtime_feed` pushes new applications to dashboard in real time | `src/app/dashboard/submissions/page.tsx`, `supabase/migrations/20261106000100_realtime_submissions_and_access.sql` | Table requires `REPLICA IDENTITY FULL` |
| **F9: Outside Jobs Table & Migration Sync** | Dedicated table `public.outside_jobs` with RLS policies, indexing, and foreign key to `job_submissions` | Missing `supabase/migrations/20261105021852_create_outside_jobs_table.sql` | Applied in remote DB; migration file needs export to repo |
