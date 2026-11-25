# Applied Jobs Saving & Capture (`src/lib/capture/`, `src/lib/jobs/`, `src/lib/extension-answers/`)

Handles idempotent saving of applied jobs (both tracked intents and external ATS portals), answer snapshots, applied resume versions, and dashboard deduplication.

## Core Modules

- **`src/app/api/extension/auto-submit/route.ts` & `src/app/api/webhooks/application-submitted/route.ts`**:
  - Validates submissions via `autoSubmitSchema` (`companyName`, `jobTitle`, `jobUrl`, `confirmationUrl`, `answers`, `appliedResume`, `manualAttestation`, `eventKey` / `attemptId`).
  - Computes `computeIdempotencyKey(candidateId, canonicalJobUrl, dateStr)` and `applicationUrlKey` (`src/lib/jobs/application-state.ts`) so duplicate clicks, replays, or query-parameter variants (`?utm_source=...`) do not create duplicate saved applications.
- **`src/lib/capture/`**:
  - `snapshot.ts`: `validateApplicationAnswers` filters out sensitive fields (passwords, SSN, DOB, tokens, payment/bank info, protected demographics) before storing answer snapshots.
  - `validation.ts`: `allowedCaptureUrl` and `validateObservation` ensure captured URLs are safe public HTTPS URLs (blocking internal/loopback targets) and confirmation URLs match the posting.
  - `applied-resume.ts`: Links the exact resume version used at application time (`job_submission_applied_resumes`).
- **`src/lib/jobs/`**:
  - `applications.ts`: Merges and deduplicates `job_submissions` and `outside_jobs` for `/dashboard/submissions` and overview views.
  - `normalize.ts`: `publicJobUrl`, employment type/arrangement normalization, and company/job metadata cleanup (keep `companyname` normalization consistent so saved jobs do not fragment by `"Company, Inc."` vs `"Company"`).

## Rules

- **Atomic/consistent writes**: Keep `job_submissions`, `outside_jobs`, answer snapshots, and `applied_resume` links consistent; never silently drop an `outside_jobs` write failure when returning `200`.
- **Realtime sync**: Any write to `job_submissions` or `outside_jobs` must satisfy Supabase Realtime publication & RLS `SELECT` policies (see `docs/agents/realtime.md`).
