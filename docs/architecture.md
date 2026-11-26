# System Architecture

This workspace implements **candidate-based AI autofill** and **applied job saving/tracking** on a unified **Next.js (TypeScript) + Supabase** stack.

```text
+-----------------------------------------------------------------------+
| Browser Tab (ATS Portal: Greenhouse, Lever, Ashby, Workday, Custom)   |
|  - Content script reads DOM -> scoped questions + job posting metadata|
|  - Verified DOM writer fills inputs, dispatches events, drives combos |
+-----------------------------------+-----------------------------------+
                                    | chrome.runtime / sidepanel
+-----------------------------------v-----------------------------------+
| Browser Extension (extension/)                                        |
|  - Deterministic Pass 1 fill from confirmed candidate facts           |
|  - AI Pass 2: calls /api/extension/autofill/plan, /choose,            |
|    and /generate-answer (or direct BYOK in extension_byok/local mode) |
|  - Submission detector -> prompts candidate -> /auto-submit / /events |
+-----------------------------------+-----------------------------------+
                                    | HTTPS + Bearer / Cookie + CORS
+-----------------------------------v-----------------------------------+
| Next.js 16 App Router (src/app/)                                      |
|  - UI: /dashboard/candidates, /dashboard/submissions, /outside-jobs   |
|  - APIs: /api/extension/*, /api/v1/me/*, /api/resumes/*,              |
|          /api/submissions/*, /api/outside-jobs, /api/webhooks/*       |
|  - AI Orchestrator (src/lib/ai/): Vercel AI SDK, grounded validator,  |
|    AES-GCM BYOK decryption, SSRF-safe fetch                           |
+------------------+--------------------------------+-------------------+
                   | SQL / RPC / Storage            ^ pg_net HTTP POST
                   v                                | (/api/webhooks/process-task)
+-----------------------------------------------------------------------+
| Supabase Platform                                                     |
|  - Auth: Supabase Auth + extension_credentials (sha256 bearer tokens) |
|  - PostgreSQL: user_profiles, candidates, experience_*,               |
|    screening_answers, screening_answer_bank, job_submissions,         |
|    outside_jobs, user_ai_provider_configs, background_tasks           |
|  - pgvector (target): embeddings on answer bank & experience atoms    |
|  - Workers: pg_net trigger + pg_cron lease recovery -> Next.js API    |
|  - Realtime WebSockets: postgres_changes -> React dashboard hooks     |
+-----------------------------------------------------------------------+
```

## Core Flows

### 1. Candidate Truth & Resume Ingestion
1. Candidate uploads a PDF/DOCX resume in `/dashboard/candidates` (`ProfileView`).
2. `POST /api/resumes/parse` extracts raw structure; the candidate reviews and explicitly confirms facts before saving via `/api/jobseeker/resume` or `/api/v1/me/*`.
3. Heavy extraction or batch AI tasks can be queued in `public.background_tasks`, triggering `pg_net` -> `POST /api/webhooks/process-task` -> `src/lib/tasks/handlers.ts`.
4. Confirmed truth is stored across `candidates`, `user_profiles`, `experience_employments`, `experience_atoms`, `screening_answers`, and `screening_answer_bank`.

### 2. AI-Assisted ATS Autofill
1. Extension scans the open application page, scopes the form to the application container, and groups controls by question.
2. **Pass 1 (Deterministic)**: Fills contact, URL slots (1:1 LinkedIn/GitHub/Portfolio), and confirmed screening facts locally. Reads typed screening first and uses the candidate’s confirmed legacy answers if the typed row is missing. Base location comes from the confirmed address and stays independent of job-search country preferences.
3. **Pass 2 (Structured AI Plan & Combobox Choose)**: Sends unresolved fields + job context (`title`, `company`, `description` / extracted requirements) to `POST /api/extension/autofill/plan` (`executePlan` in `src/lib/ai/autofill-orchestrator.ts`).
   - `validateGroundedAnswer` enforces strict truth-table checks against `VerifiedFact` (work authorization, sponsorship, years of experience, education, certifications).
   - Async/custom dropdowns deferred by `plan` are opened in the live DOM and resolved via `POST /api/extension/autofill/choose`.
4. **Pass 3 (Open-Ended Screening Prose & Answer Bank)**:
   - Reuses candidate-approved entries from `screening_answer_bank` (with `pgvector` semantic similarity as the target retrieval upgrade).
   - Drafts novel open-ended prose via `POST /api/extension/generate-answer` using candidate-approved answers and confirmed evidence from `experience_atoms`. The captured job description supplies role context. Direct provider modes run in the extension.

### 3. Applied Jobs Saving & Realtime Sync
1. When the candidate submits an ATS application (or confirms the *"Did you submit?"* prompt), the extension posts the posting metadata, normalized company/URL key, evidence, applied resume version, and answer snapshot to `POST /api/extension/auto-submit` (or `/api/extension/events` / `/api/webhooks/application-submitted`).
2. The server validates caller ownership, URL safety (`allowedCaptureUrl`), and idempotency (`computeIdempotencyKey` + `applicationUrlKey`), and persists the record to `job_submissions` and/or `outside_jobs`.
3. **Supabase Realtime** broadcasts `postgres_changes` events on `job_submissions` and `outside_jobs` over WebSockets to `useApplicationRealtime` and `useOutsideJobsRealtime`, updating `/dashboard/submissions` and `/dashboard/outside-jobs` immediately without a custom WebSocket server.
