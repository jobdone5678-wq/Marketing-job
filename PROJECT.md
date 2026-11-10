# Project: JobRight Extension & Next.js Marketing Portal Integration

## Architecture
The system integrates a Chrome MV3 browser extension (`jobright_extension/`) with a Next.js 16 App Router marketing and candidate portal backed by Supabase (PostgreSQL, Authentication, and Realtime).
- **Extension Content Layer**: Runs on external career sites (Greenhouse, Lever, Ashby, Workday, Keka, etc.). Intercepts DOM, extracts job postings (JSON-LD & DOM selectors), provides universal autofill bypassing React Fiber value trackers, and intercepts application submissions.
- **Extension Background Layer**: Service worker (`static/background/index.js`, `background.js`) handling token management, CORS proxying, and communication with portal backend.
- **Backend API Endpoints**:
  - `/api/extension/save-external-job`: Persists discovered external jobs to `public.outside_jobs` and `public.jobs`, and links or creates `public.job_submissions`.
  - `/api/extension/auto-submit`: Records completed job applications into `public.job_submissions` with `status: 'Applied'`, attaches applied resumes and answer snapshots, and links to `public.outside_jobs`.
- **Real-Time Submissions Dashboard**: `src/app/dashboard/submissions/page.tsx` subscribes to Supabase Realtime channel `job_submissions_realtime_feed` on table `public.job_submissions`, rendering both portal applications and external jobs in real time with the "Outside Portal" badge.

## Code Layout
- `jobright_extension/`: Chrome MV3 extension source, manifests, content scripts, background worker, adapters, and resume engine.
- `src/app/api/extension/`: Next.js backend API routes for extension communication.
- `src/app/dashboard/submissions/`: Next.js React client page for real-time application tracking.
- `src/lib/capture/`: Validation, applied resume helpers, and CORS utilities.
- `supabase/migrations/`: PostgreSQL schema migrations and RLS policies.
- `scripts/`: Packaging scripts (`scripts/package-extension.mjs`).
- `tests/`: Automated unit, integration, and E2E test scripts and mock form fixtures.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | `CLEAN_NEXT_BUILD` | Next.js production build (`npm run build`) and typecheck (`tsc --noEmit`) complete cleanly with 0 errors. | M1 | Survey 1 |
| 2 | `SRC_IMPORT_INTEGRITY` | All `src/` files import from `jobright_extension/` with zero references to deleted `browser-extension`. | M1 | Survey 1 |
| 3 | `NODE_TEST_RELATIVE_IMPORT` | `src/lib/capture/validation.ts` uses relative import `../jobs/application-state` for Node test runner. | M1 | Survey 1 |
| 4 | `TEST_REFERENCES_CLEANUP` | All 26 test files under `tests/` and `eslint.config.mjs` updated from `browser-extension` to `jobright_extension`. | M1 | Survey 1 |
| 5 | `EXTENSION_RUNTIME_ASSETS` | `jobright_extension/` contains `content.js`, `background.js`, `resume-engine.d.ts`, and popup assets for self-contained execution. | M1 | Survey 1 |
| 6 | `MANIFEST_ADAPTERS` | `manifest.json` includes all ATS adapters (`adapters/greenhouse.js`, `lever.js`, `ashby.js`, `workday.js`, `generic.js`). | M1 | Survey 2 |
| 7 | `OUTSIDE_JOBS_MIGRATION_FILE` | Local migration `20261105021852_create_outside_jobs_table.sql` added to `supabase/migrations/`. | M2 | Survey 2 |
| 8 | `APPLIED_RESUME_COLUMN` | `public.job_submissions` remote table schema verified/altered to include `applied_resume jsonb`. | M2 | Survey 2 |
| 9 | `SAVE_EXTERNAL_JOB_UNIFICATION` | `/api/extension/save-external-job` records into both `public.outside_jobs` and `public.job_submissions` with candidate attribution. | M2 | Survey 2 & 3 |
| 10 | `EXTENSION_AUTH_RESILIENCE` | `/api/extension/save-external-job` includes fallback actor authentication matching `/api/extension/auto-submit`. | M2 | Survey 2 |
| 11 | `BACKGROUND_SERVICE_WORKER_ALIGN` | `static/background/index.js` standardizes origin detection and token retrieval (`token` & `nextkin_auth_token`). | M2 | Survey 2 |
| 12 | `AUTOFILL_PHONE_FORMAT` | Autofill in `outside-job-engine.js` formats phone cleanly matching country code or 10-digit requirements. | M3 | Survey 2 & 3 |
| 13 | `DOM_CAPTURE_ACCURACY` | DOM scraper extracts job details from page DOM and triggers save on apply button click and form submit. | M3 | Survey 2 |
| 14 | `REALTIME_SUBMISSIONS_FEED` | Submissions page (`src/app/dashboard/submissions/page.tsx`) displays external submissions real-time via `job_submissions_realtime_feed`. | M3 | Survey 3 |
| 15 | `EXTENSION_PACKAGING_ZIP` | `scripts/package-extension.mjs` validates and produces `jobright_extension.zip` cleanly, with `.gitignore` updated. | M4 | Survey 3 |
| 16 | `MOCK_JOB_PAGES_E2E` | Local mock job application HTML pages and automated test scripts verify autofill, DOM capture, and DB persistence end-to-end. | M4 | Survey 3 |
| 17 | `FINAL_E2E_VERIFICATION` | 100% of test suite passes and clean `npm run build` succeeds. | M4 | ORIGINAL_REQUEST |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Extension Import Integrity & Assets | Features 1, 2, 3, 4, 5, 6: Clean tests, update stale paths to `jobright_extension/`, add missing assets and manifest adapters. | none | IN_PROGRESS |
| M2 | Database & Backend Endpoints Integration | Features 7, 8, 9, 10, 11: Schema migrations, `applied_resume` column, `/api/extension/save-external-job` unification with `job_submissions`, background worker tokens. | none | PLANNED |
| M3 | Autofill & Real-Time Dashboard Integration | Features 12, 13, 14: Autofill field writing, DOM capture reliability, and Supabase Realtime synchronization on submissions page. | M1, M2 | PLANNED |
| M4 | Packaging & Automated E2E Verification | Features 15, 16, 17: Local mock test suite, extension zip packaging, adversarial verification, and clean build. | M3 | PLANNED |

## Interface Contracts
### `/api/extension/save-external-job` Request & Response Contract
- **Method**: `POST`
- **Request Headers**: `Authorization: Bearer <token>`, `Content-Type: application/json`
- **Request Body**:
  ```json
  {
    "title": "Senior Frontend Engineer",
    "company": "Acme Corp",
    "jobUrl": "https://boards.greenhouse.io/acme/jobs/12345",
    "portalSource": "Greenhouse",
    "description": "Full job description text...",
    "location": "Remote",
    "department": "Engineering",
    "employmentType": "Full-time",
    "candidateId": "optional-uuid"
  }
  ```
- **Response**: `200 OK`
  ```json
  {
    "success": true,
    "job": { "id": "uuid", "title": "...", "company": "..." },
    "submissionId": "uuid"
  }
  ```
- **Side Effects**: Inserts/updates `public.outside_jobs` AND records corresponding row in `public.job_submissions` (triggering `job_submissions_realtime_feed`).

### `/api/extension/auto-submit` Request & Response Contract
- **Method**: `POST`
- **Request Body**:
  ```json
  {
    "jobUrl": "https://boards.greenhouse.io/acme/jobs/12345",
    "company": "Acme Corp",
    "title": "Senior Frontend Engineer",
    "answers": { "First Name": "Jane", "Email": "jane@example.com" },
    "portalSource": "Greenhouse",
    "candidateId": "optional-uuid"
  }
  ```
- **Side Effects**: Creates/updates `public.job_submissions` (`status: 'Applied'`), saves `applied_resume`, links `outside_jobs.submission_id`.
