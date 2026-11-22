# Universal Job Autofill, ATS Scoring & Submission Tracking Engine

**Date:** 2026-11-22  
**Status:** Approved  
**Topic:** End-to-end candidate workflow encompassing ATS job match scoring, universal extension autofill with scoped AI screening fallback, resilient inside/outside submission capture, and cross-tab dashboard synchronization.

---

## 1. Intent & The Why

Job seekers spend hours manually re-entering profile details into fragmented applicant tracking systems (Greenhouse, Lever, Ashby, Workday, Taleo, iCIMS, custom company portals, etc.) and drafting repetitive answers to open-ended screening questions. Furthermore, candidates struggle to gauge how well their resume matches a role before applying, and lack a unified dashboard tracking both internal platform applications and independently discovered external applications.

This project delivers a seamless, end-to-end application workflow:
1. **Informed Applying**: Every job card displayed from FreeHire.me on `/dashboard/jobs` shows an immediate, transparent ATS match score calculated against the candidate's active saved resume and profile details, while visibly badging previously applied jobs.
2. **Universal One-Click Autofill**: The `jobright_extension` autofills candidate details and uploads resumes on any job portal—maintaining 80+ existing specialized ATS adapters while providing an autonomous universal heuristic engine, recursive Shadow DOM / iframe traversal, and bounded concurrent AI screening answer generation.
3. **Reliable End-to-End Tracking**: Every completed application—whether launched from FreeHire.me ("inside jobs") or discovered independently on third-party sites ("outside jobs")—is reliably captured via pre-submit metadata snapshots, redirect-resistant attempt persistence, and idempotency guarantees, instantly syncing to the candidate's dashboard with an "Applied" badge.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- **Client-Side ATS Scoring on Job Cards**: For candidates with a saved profile/resume, calculate and display an ATS match percentage badge (e.g., `88% Match`, green/amber indicators) on every job card in `/dashboard/jobs`. When a candidate lacks an uploaded resume, fall back gracefully to profile skills or prompt for a resume upload.
- **Applied Status in Jobs Feed**: Retain applied jobs in the FreeHire feed, clearly badging them with an "Applied" status indicator so candidates retain full application history in context.
- **Universal Field Discovery & File Attachment**: Enhance `core/form-discovery.js`, `core/field-mapping.js`, and `core/field-writer.js` to traverse open Shadow DOMs, handle `all_frames: true` iframes (with floating UI strictly isolated to `window === window.top`), and automatically attach the candidate's active resume file to `<input type="file">` elements using the `DataTransfer` API with genuine MIME types.
- **Scoped AI Screening Answer Fallback**: Integrate `/api/extension/generate-answer` for non-standard screening questions with bounded concurrency (2–3 parallel calls) and per-field loading indicators. Scope AI caching so factual questions are reusable, while company/role-specific answers are never globally leaked across different employers (and skipped if company is unresolved).
- **Resilient Inside & Outside Submission Capture**:
  - Persist `submissionAttempted` in `chrome.storage.session` via `background.js` (15-min TTL) to survive full-page redirects (`/apply` -> `/thanks`).
  - Snapshot job metadata (title, company, URL, location) at autofill/submit click time so that post-redirect confirmation pages that wipe job details still transmit complete metadata.
  - Employ `MutationObserver` to catch SPA / inline confirmation states with strict false-positive guards (ignoring header searches and newsletter inputs).
  - Apply query-param-aware URL canonicalization (preserving job IDs like `gh_jid`, `jobId`, while stripping `utm_*`, `ref`) and deduplicate via deterministic idempotency keys shared across extension and web app.
- **Active Cross-Tab Dashboard Sync**: Relay submission events to the Next.js React app via a `window.postMessage` content-script bridge with strict origin validation, alongside `visibilitychange` refetches.
- **Strict Server-Side Auth**: Authenticate candidate identity and fetch authoritative resume text on the server; verify candidate ownership against the authenticated user session.

### Non-Goals
- Modifying or removing the 80+ existing specialized adapters in `jobright_extension/adapters/ats-adapters.js`.
- Bypassing portal CAPTCHAs, OTPs, or submitting applications without explicit user initiation and review.
- Automated bulk job application blasting.

### Anti-Goals
- Global caching of company-tailored screening answers (e.g., pasting "Why I want to work at Google" into a Stripe application).
- UI freezing caused by sequential synchronous AI calls on multi-question forms.
- Dropping outside application submissions due to lost tab context or full-page redirects.

---

## 3. Constraints

- **Manifest V3 Extension Rules**: Chrome extensions must operate within background service-worker constraints; in-memory variables in content scripts do not survive page reloads, and `chrome.storage.session` must be mediated by `background.js`.
- **ATS Adapter Backward Compatibility**: The existing 80+ portal adapters in `jobright_extension/adapters/ats-adapters.js` are curated and must remain Tier 1.
- **Responsive Performance**: Job cards in `/dashboard/jobs` must render without jank; ATS matching calculations must be performant (<5ms for 20 jobs).

---

## 4. Approaches Considered

### Approach A: Progressive Hybrid Architecture (Approved)
- **ATS Scoring**: Compute match scores client-side in `JobsFeedClient.tsx` using `compareResumeToJob` from `src/lib/resumes/job-match.ts`, hydrated with server-provided resume text and applied URL keys from `DashboardJobsPage`.
- **Autofill Pipeline**: A 3-tier cascade:
  1. *Tier 1: Specialized Adapter* (if portal hostname matches existing adapters in `ats-adapters.js`).
  2. *Tier 2: Universal Heuristic Mapper* (semantic label parsing, ARIA attributes, autocomplete tags, fuzzy canon rules, Shadow DOM + iframe traversal, and `<input type="file">` resume attachment).
  3. *Tier 3: Scoped AI Screening Fallback* (unmapped questions run with bounded concurrency against `/api/extension/generate-answer`, authenticated server-side, with scoped caching).
- **Submission & Dashboard**: `application-confirmation.js` captures pre-submit snapshots and listens for confirmation via URL patterns and DOM mutations. Relies on `chrome.storage.session` managed in `background.js` across redirects. Dispatches to `/api/applications/submission-events` (conforming to `autoSubmitSchema`). Broadcasts updates to open dashboard tabs via content script `postMessage` relay.

---

## 5. Detailed Technical Specifications

### 5.1 ATS Match Scoring & Jobs Feed Integration
- **Components**: `src/app/dashboard/jobs/page.tsx`, `src/app/jobs/JobsFeedClient.tsx`, and `src/components/jobs/feed/JobCard.tsx`.
- **Feed Authority**: The authoritative jobs feed is FreeHire.me (`searchFreehireJobs`).
- **Server Hydration (`DashboardJobsPage`)**:
  1. Loads the authenticated user's active candidate profile and parsed resume text via `database().from('candidates').select('id, skills, confirmed_facts').eq('user_id', user.id).maybeSingle()`.
  2. Queries `candidateJobApplications(candidate.id)` to obtain `appliedKeys` (a Set of normalized application and posting URLs).
  3. Passes `appliedKeys` (array of strings) and `candidateResume` (`{ text: string, skills: string[] } | null`) as props into `<JobsFeedClient>`.
- **Client-Side Scoring (`JobsFeedClient.tsx`)**:
  1. For each job in the current page slice:
     - Normalizes `job.url` and `job.source_url` via `applicationUrlKey()`. If present in `appliedKeys`, sets `isApplied = true`.
     - If `candidateResume?.text` is available: runs `compareResumeToJob(candidateResume.text, job.description || job.enrichment?.summary || '')` in memory.
     - If no resume file is uploaded, falls back to calculating skill match against candidate's profile `skills`:
       `matchedCount / totalRequiredSkills`. If neither exists, flags `needsResume = true`.
- **Card Display (`JobCard.tsx`)**:
  - **ATS Match Badge**:
    - `>= 75%`: Green pill (`88% Match - High Match`).
    - `50% - 74%`: Amber pill (`64% Match - Moderate Match`).
    - `< 50%`: Neutral slate pill (`42% Match`).
    - `needsResume`: Subtle outline badge prompting `Upload resume for ATS score`.
    - Tooltip/popover displaying matched skills vs. missing skills.
  - **Applied Badge**: Prominent badge (`Applied ✓`) displayed alongside the bookmark button. Applied jobs remain fully visible in search, filter, and pagination results.

### 5.2 Universal Form Discovery, Adaptive Autofill & Scoped AI Generation
- **Files**: `jobright_extension/core/form-discovery.js`, `jobright_extension/core/field-mapping.js`, `jobright_extension/core/field-writer.js`, `jobright_extension/manifest.json`, `jobright_extension/panel.js`, `jobright_extension/background.js`, `src/app/api/extension/generate-answer/route.ts`.

#### A. DOM Discovery, Iframes & Shadow DOM
1. **Manifest V3 Frames & Floating UI Guard**:
   - `manifest.json` configures `"all_frames": true` and `"match_about_blank": true` for field discovery content scripts.
   - **Crucial Guard**: Floating UI / side panels (`floating-widget.js`, `panel.js`) strictly guard mounting: `if (window !== window.top) return;`. Child iframes communicate DOM fields and execution commands back and forth with `background.js`.
2. **Shadow DOM Recursion**: `core/form-discovery.js` implements recursive tree-walking through `element.shadowRoot` to discover inputs inside Web Components.
3. **Resume File Attachment via Background Proxy**:
   - To bypass third-party portal CORS and SameSite cookie restrictions, file fetching is proxied through `background.js` from `/api/extension/resume-file`.
   - `background.js` preserves the genuine MIME type (`application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`) and filename, returning the array buffer to the content script.
   - Content script constructs a `new File([buffer], filename, { type: mimeType })` and sets it via `DataTransfer` on `<input type="file">`.

#### B. Execution Cascade & Field Mapping
1. **Tier 1 - Specialized Adapter**: Hostname matching against `NextkinAdapters`.
2. **Tier 2 - Universal Semantic Discovery**:
   - Semantic identifiers: HTML5 `autocomplete`, `aria-label`, `aria-labelledby`, `<label for>`, container headings, placeholders, input `name`/`id` tokens.
   - Canonical keys: `first_name`, `last_name`, `full_name`, `email`, `phone`, `current_city`, `current_state`, `country`, `zip_code`, `linkedin_url`, `github_url`, `website`, `work_authorization`, `needs_sponsorship`, `salary_expectation`, `years_of_experience`.
   - Dispatches synthetic events (`input`, `change`, `blur`).
3. **Multi-Step & Custom Dropdowns**:
   - Handles custom comboboxes (`[role="combobox"]`, Kendo, Select2, ng-select) by simulating click, typing, and option selection.
   - Step-by-step autofill supported via top-level floating widget re-triggering.

#### C. Tier 3 - Scoped Asynchronous AI Screening Fallback
1. **Asynchronous Bounded Concurrency**:
   - Unmapped screening questions run concurrently in a pool of **2–3 requests max** with inline pulsing loaders on fields.
2. **Cache Scoping Rules**:
   - **Factual / Universal Questions**: Cached globally in `candidate.confirmed_facts.saved_answers[normKey]`.
   - **Company / Role-Specific Questions**:
     - Keyed by `normKey + '|' + companyName.toLowerCase() + '|' + jobTitle.toLowerCase()`.
     - **Fallback Rule**: If `companyName` cannot be reliably extracted, **skip caching** completely to prevent answer contamination.
3. **Secure Server-Side Profile Hydration**:
   - `/api/extension/generate-answer/route.ts` resolves candidate facts and parsed resume directly from Supabase via authenticated session `actor.id`.

---

### 5.3 End-to-End Submission Capture & Deduplication
- **Files**: `jobright_extension/application-confirmation.js`, `jobright_extension/background.js`, `jobright_extension/core/job-capture.js`, `src/app/api/applications/submission-events/route.ts`, `src/app/api/extension/auto-submit/route.ts`, `src/lib/jobs/application-state.ts`.

#### A. Pre-Submit Metadata Snapshotting
- At autofill or submit-click, `job-capture.js` snapshots `jobTitle`, `companyName`, `jobLocation`, `jobUrl`, `portalSource`.
- Sends to `background.js`, which caches it in `chrome.storage.session` under `submission_snapshot:${sender.tab.id}`.

#### B. Redirect-Resistant Submission Attempt Tracking
- When a submit button is clicked, `application-confirmation.js` messages `background.js`.
- `background.js` writes `submissionAttempted: true` to `chrome.storage.session` keyed by `sender.tab.id` with a **15-minute TTL**.
- Survives browser page redirects (`/apply` -> `/thanks`).

#### C. Confirmation Observation & False-Positive Guards
1. **URL & DOM Detection**:
   - Confirmation URLs: `/(?:thanks|thank-you|confirmation|applied|submission-success)/i`.
   - SPA / Inline Banners: `MutationObserver` on success containers.
2. **False-Positive Guards**:
   - Exclude search bars (`input[type="search"]`, inputs inside `header`, `nav`, `[role="search"]`) and newsletter/job-alert email inputs (`[class*="newsletter"]`, `[class*="subscribe"]`, `[id*="alert"]`) when evaluating whether active application fields remain.
   - Require preceding `submissionAttempted` flag in the same tab session before confirming receipt.

#### D. Unified URL Canonicalization & Deduplication
1. **Query-Param Whitelist**:
   - Both the extension canonicalizer and the web app's `applicationUrlKey()` in `src/lib/jobs/application-state.ts` share the exact same whitelist: strictly preserve job ID parameters (`gh_jid`, `jobId`, `job_id`, `jk`, `requisition`, `req_id`, `id`) while discarding tracking parameters (`utm_*`, `ref`, `source`, `fbclid`, `gclid`, `trk`).
2. **Deterministic Idempotency Key**:
   - Generated as `sha256(candidateId + ':' + canonicalJobUrl + ':' + calendarDate)`.

---

### 5.4 Cross-Tab Dashboard Synchronization via Content-Script Bridge
- **Files**: `jobright_extension/background.js`, `jobright_extension/portal-connection.js` (or dashboard content script), `src/hooks/use-application-realtime.ts`, `src/app/dashboard/submissions/page.tsx`, `src/app/dashboard/jobs/page.tsx`.
- **Bridge Architecture**:
  1. `background.js` dispatches `chrome.tabs.sendMessage(tab.id, { type: 'NEXTKIN_APPLICATION_SUBMITTED', data: submittedJob })` to all open tabs with URL matching `*/dashboard/*`.
  2. The content script running on the dashboard origin receives the message and relays it to the Next.js window:
     ```javascript
     window.postMessage({ type: 'NEXTKIN_APPLICATION_SUBMITTED', payload: message.data }, window.location.origin);
     ```
  3. `use-application-realtime.ts` (or dashboard page listener) listens to `window.addEventListener('message', ...)` verifying `event.origin === window.location.origin`, and calls mutate/refetch.
  4. In addition, `window.addEventListener('visibilitychange')` refetches applications whenever the candidate focuses back on the dashboard tab.

---

### 5.5 API Authentication & Security
- `/api/extension/generate-answer`: Authenticates via session cookie/Bearer token; derives candidate context strictly from `candidates.user_id = actor.id`.
- `/api/applications/submission-events` (aliasing `/api/extension/auto-submit`):
  - Strictly validates `candidates.user_id = actor.id` for `body.candidateId`.
  - Atomically records to `job_submissions` (inside jobs) or `outside_jobs` (outside jobs) with status `'Applied'`.

---

## 6. Architecture Decisions & Builder Calls

1. **Storage Session Mediation**: All `chrome.storage.session` reads/writes are mediated solely by `background.js` using `sender.tab.id`.
2. **Top-Frame Floating UI**: `panel.js` and floating triggers execute only in `window === window.top`.
3. **Background Resume Proxy**: Resumes are fetched in `background.js` with genuine MIME types to prevent external portal CORS failures.
4. **Shared URL Whitelist**: Extension and backend `applicationUrlKey()` share identical query-param whitelisting.
5. **PostMessage Dashboard Bridge**: Extension-to-Next.js sync uses a content script `window.postMessage` relay with strict origin validation.
