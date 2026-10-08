# Real Data and AI Recruiting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. If the user chooses delegation, use superpowers:subagent-driven-development. Steps use checkbox syntax for tracking.

**Goal:** Replace the portal's demo behavior with real persistent data, resume-driven candidate profiles, public-job ingestion and factual AI matching.

**Architecture:** Preserve the existing Next.js/Supabase app. Authenticated routes write persistent records and queue tasks; a separate Node worker handles resume extraction, job sync and matching through server-only provider adapters. Ship contract-focused native ATS feeds now; Firecrawl is deferred.

**Tech Stack:** Installed Next.js 16.3.8 / React 19.2.8 / TypeScript / Zod 4, Supabase Auth/Postgres/Storage; add OpenAI SDK, a validated PDF metadata reader for page/encryption checks, HTML sanitization, Vitest, Playwright and tsx for the Node worker. Firecrawl REST v2 is a later adapter, excluded from initial dependencies and setup.

**Spec:** `docs/superpowers/specs/2026-10-08-ai-recruiting-design.md` (proposed, for review alongside this plan).

## Global Constraints

- One shared recruiting workspace, consistent with the current schema: active recruiters/admins access workspace candidates; candidates access only their own records and resumes. New recruiter signups are pending until an admin approves them. Existing legitimate active staff are preserved.
- Resume limit: 10 MiB, PDF/DOCX only, maximum 20 PDF pages; reject encrypted, corrupted, unsupported, or oversized files with a useful error.
- Source defaults: sync every 30 minutes, staff-adjustable to 15/30/60 minutes; one active sync per source.
- Default job browse/recommendations show contract roles. Permanent, temporary and unknown jobs have separate filters; C2C/W2/1099 arrangements remain separate nullable facts.
- Default daily provider budgets: 100 AI processing calls across extraction/job classification/matching/packets, adjustable by admin. Scraping budgets apply only to the deferred Firecrawl release.
- Additive migrations preserve user-created records; no deletion based on names or guessed provenance.
- Missing facts stay unknown; generated packets are drafts; external sending/application automation is outside this release.
- Read installed Next.js guides before code changes; keep secrets on the server and authenticated permission checks on every protected operation.

## Review Focus

1. Older candidate rows contain defaulted facts with no recorded provenance: label legacy unconfirmed data for review, never silently treat it as extracted evidence (Tasks 1, 6).
2. Two resumes for the same candidate complete out of order: the older draft must not overwrite the newer version or confirmed fields (Tasks 4, 6).
3. Jobs disappear from a partial/failed feed: retain records and show stale source health instead of closing them (Task 7).
4. Careers URLs redirect to private hosts or scraped descriptions contain executable markup/instructions: reject unsafe targets and sanitize content; no model-triggered actions (Tasks 8, 9).
5. A worker lease expires or a provider succeeds before a database write fails: retry without duplicate records, bound repeated provider spend, and surface uncertain outcomes (Tasks 4, 5).

## File and interface map

Retain the UI layout and existing components. Replace data access implementations rather than creating another competing dashboard.

New focused modules:
- `src/lib/auth/require-profile.ts`: session, active status and permission checks.
- `src/lib/db/admin.ts`: privileged worker database client, server-only and never used in UI code.
- `src/lib/settings.ts`, `src/lib/jobs/repository.ts`: persistent settings/job queries.
- `src/lib/tasks/{types,repository,handlers}.ts`, `scripts/worker.ts`: durable task contracts and worker execution.
- `src/lib/ai/{client,schemas,resume,match,packet}.ts`: one provider adapter and bounded validated AI operations.
- `src/lib/resumes/{validation,repository}.ts`, `src/components/resume-upload-review.tsx`: private documents, extraction drafts and review.
- `src/lib/jobs/{types,normalize,sync}.ts`, `src/lib/jobs/adapters/{greenhouse,ashby}.ts`: normalized provider-independent ingestion. A Firecrawl adapter is deferred.
- `src/lib/security/{public-url,sanitize-html}.ts`: public URL restrictions and safe rendering.
- Routes under `src/app/api/{resumes,job-sources,matches,packets,tasks}`; keep `/api/jobs` as the stored-job listing API.
- Sequential SQL files under `supabase/migrations/`, fixtures under `tests/fixtures/`, service tests under `tests/unit/`, permission tests under `supabase/tests/`, end-to-end tests under `tests/e2e/`.

Shared contracts established with their owning task:
- `requireProfile(access: 'candidate_or_staff' | 'staff' | 'admin'): Promise<UserProfile>`; rejects unauthenticated/pending/suspended users and checks database roles.
- `enqueueTask(input: TaskInput): Promise<{taskId: string}>`; TaskInput is a discriminated union of the four task types with IDs, versions, actor ID and idempotency key.
- `ResumeExtraction = {documentId, candidateVersion, fields, employmentHistory, educationHistory, evidence, warnings, schemaVersion}`; unknown field values are null, and evidence includes exact source text/page when available.
- `JobSnapshot = {jobs: NormalizedJob[], completeness: 'complete' | 'partial', checkedAt: string}`; NormalizedJob requires stable external ID, title, company, source URL and application URL; other fields are nullable.
- `syncSource(sourceId: string): Promise<SyncResult>`; SyncResult records counts, completeness and run status.
- `ConfirmedCandidateSnapshot = {id: string; version: number; confirmedFacts: Partial<Candidate>; employmentHistory: EmploymentEntry[]; educationHistory: EducationEntry[]; evidence: EvidenceReference[]}`. Only confirmed fields enter confirmedFacts. EvidenceReference is `{field: string; sourceId: string; snippet: string; page: number | null}`; history entries use nullable dates with explicit year/month/day precision. Define these in `src/lib/ai/schemas.ts` with Zod-inferred types during Task 5; Task 6 constructs confirmed snapshots.
- `JobSnapshotRecord = NormalizedJob & {id: string; sourceId: string; version: number; contentHash: string; state: 'active' | 'closed' | 'stale'}`; define in `src/lib/jobs/types.ts` during Task 7.
- `analyzeMatch(input: {candidate: ConfirmedCandidateSnapshot; job: JobSnapshotRecord}): Promise<MatchAnalysis>`; MatchAnalysis contains supported requirements, missing requirements, unknowns, evidence, coverage score and constraint status.

## Milestone 1: Reliable real-data foundation

### Task 1: Database permissions and honest candidate facts

**Files:** Create `supabase/migrations/20261008_01_foundation.sql`, `src/lib/auth/require-profile.ts`, `supabase/tests/permissions.sql`; modify `src/types/database.ts`, `src/lib/auth-helpers.ts`, `src/hooks/use-user-profile.ts`, `src/components/signup-form.tsx`, `src/app/auth/callback/route.ts`, `src/components/app-sidebar.tsx`, candidate forms and `supabase/migrations/20261006_bench_marketing_schema.sql` (future demo seed only).

**Produces:** `requireProfile`; nullable candidate fact types; restricted role/status changes; candidate-owner profile writes.

- [ ] Add a minimal Vitest configuration and test scripts in `package.json`; pin compatible installed dependencies after reading the bundled testing guides. Define `npm run test:unit`, `npm run test:e2e` and `npm run typecheck` (`tsc --noEmit`). Add `tests/unit/auth-permissions.test.ts` asserting pending recruiters cannot access staff operations, metadata cannot grant privilege, and missing database profiles fail closed. Run `npm run test:unit -- tests/unit/auth-permissions.test.ts`; expect failure before implementation.
- [ ] Write SQL tests asserting ordinary users cannot change role/status, recruiter signup creates pending status, candidates can modify only their own allowed fields, and active recruiters retain intended workspace access. Establish local Supabase test execution using `supabase test db`.
- [ ] Implement the auth helper, SQL policies/column grants or guarded functions, and privileged admin approval operation. Update signup/callback to request roles without granting staff privileges or rewriting existing roles. Guard internal redirects against protocol-relative URLs. Keep database role and status authoritative throughout navigation.
- [ ] Drop fabricated candidate defaults, allow unknown booleans/visa, add structured histories and candidate version, and update forms to Yes/No/Unknown. Flag older records as legacy-unconfirmed until reviewed; preserve stored values. Remove the future demo seed block without running production deletes.
- [ ] Run the unit and SQL tests; both must pass. Smoke-test existing account login, new pending recruiter signup and candidate-owner editing. Create a version-control checkpoint only if a repository is available; otherwise record the changed-file list.

### Task 2: Persist vendors, settings and submissions

**Files:** Create `supabase/migrations/20261008_02_persistent_crm.sql`, `src/lib/settings.ts`, `tests/unit/persistent-crm.test.ts`; modify `src/lib/vendors.ts`, `src/lib/submissions.ts`, `src/components/vendor-form.tsx`, `src/app/dashboard/settings/page.tsx`, vendor/submission pages and forms, `src/types/database.ts`.

**Produces:** Existing vendor/submission methods retain their UI-facing names but return real database results/errors. `getWorkspaceSettings()` and `updateWorkspaceSettings(updates)` persist staff-approved configuration; daily budgets are admin-only.

- [ ] Write failure tests: empty SELECT returns an empty list, failed inserts return an error, and failed delete/update cannot report success. Run `npm run test:unit -- tests/unit/persistent-crm.test.ts`; expect failure with the current in-memory fallbacks.
- [ ] Add vendor/contact and settings tables with RLS and foreign keys. Add Draft submission status and nullable future job/vendor links, preserving historical text. Perform settings and vendor-contact writes atomically.
- [ ] Replace sample arrays and fallback caches with persistent queries. Remove preset candidate identity/rates from submission forms and status dialogs. Ordinary drafts must not default to Applied. Keep real manually entered submissions supported.
- [ ] Persist profile fields separately from workspace settings; source connection badges reflect actual setup and last sync status. Restrict account email display to the signed-in identity.
- [ ] Run failure tests, SQL permission tests, and a reload/restart persistence smoke test. Verify failed settings saves do not toast success.

### Task 3: Remove all remaining demo UI and metrics

**Files:** Modify `src/app/dashboard/jobs/page.tsx`, `src/components/dashboard-view.tsx`, `src/components/dashboard-overview.tsx`, `src/components/chart-area-interactive.tsx`, `src/components/section-cards.tsx`, `src/components/data-table.tsx`, candidate forms/details, analytics/help pages; remove `src/app/dashboard/data.json` once every runtime import is replaced. Create `tests/e2e/empty-workspace.spec.ts` and Playwright config.

**Consumes:** Real candidate/submission/vendor/settings queries from Tasks 1-2. Job listing is honestly empty until Task 7 connects it.

- [ ] Write an empty-workspace browser test asserting zero counts, meaningful empty states, no invented vendor/candidate/job rows, and visible errors for failed requests. Run `npm run test:e2e -- tests/e2e/empty-workspace.spec.ts`; expect failure against the current demo UI.
- [ ] Remove candidate preset buttons, static jobs/charts, fabricated Add Board jobs, assumed integration badges and fixed metric counts. Wire dashboard totals to saved records; defer the Add Board action to a clearly unavailable state until Task 7 provides it.
- [ ] Show loading, empty, error and stale states distinctly. Render chart series from persisted activity or an empty state; test fixtures may remain under tests but are never loaded by the app.
- [ ] Run the empty-workspace test. Audit runtime references with `rg -n 'SAMPLE_|TARUN_PRESET|localMemory|dashboard/data.json|handleLoadTarunPreset' src`; expect no hits. Run `npm run typecheck`, `npm run lint`, `npm run build`; record any pre-existing failures separately and resolve failures affected by these edits.

## Milestone 2: Resume upload and candidate intake

### Task 4: Durable background execution and provider limits

**Files:** Create `supabase/migrations/20261008_03_tasks.sql`, `src/lib/tasks/{types,repository,handlers}.ts`, `src/lib/db/admin.ts`, `src/app/api/tasks/[id]/route.ts`, `scripts/worker.ts`, `tests/unit/task-worker.test.ts`, `supabase/tests/task-leases.sql`; modify `package.json` and add `.env.example` without copying secrets.

**Produces:** `enqueueTask`, an atomic claim/heartbeat/complete API, worker dispatch and task status access. Add `npm run worker` using tsx with server environment loading.

- [ ] Write tests for duplicate enqueue keys, one winner across concurrent claims, expired lease recovery, 3-attempt transient retry limit, no permanent-error retry, and atomic quota reservations. Run `npm run test:unit -- tests/unit/task-worker.test.ts`; expect failure before implementation.
- [ ] Implement background_tasks, provider_usage and audit_events with restricted worker-only mutation functions and actor-appropriate task visibility. Deduplicate active tasks; versioned document/job writes make retried handlers idempotent. Include heartbeat, graceful shutdown and terminal failure reporting.
- [ ] Implement worker dispatch for the four specified task types, with handlers registered as their tasks are delivered. The worker can schedule due source_sync tasks after Task 7 exists. Never ship a success-returning stub for an unimplemented handler.
- [ ] Implement quota reservation, retry backoff and provider-attempt logging without PII. Unknown outcomes count toward budgets; application database commit occurs before task acknowledgement.
- [ ] Run unit/SQL tests and a local worker restart test. A queued task survives process termination and runs with the browser closed. Document that hosting must run this worker separately from Next.js.

### Task 5: Private upload and validated AI extraction

**Files:** Create `supabase/migrations/20261008_04_resumes.sql`, `src/lib/resumes/{validation,repository}.ts`, `src/lib/ai/{client,schemas,resume}.ts`, `src/app/api/resumes/upload-intent/route.ts`, `src/app/api/resumes/[id]/process/route.ts`, `src/app/api/resumes/[id]/route.ts`, `src/app/api/resumes/[id]/download/route.ts`, `tests/unit/resume-extraction.test.ts`, `supabase/tests/resume-access.sql`; add synthetic PDF/DOCX fixtures under `tests/fixtures/resumes/`.

**Consumes:** `requireProfile`, `enqueueTask`, quotas and private worker client. **Produces:** ResumeExtraction and persisted versioned extraction drafts.

- [ ] Write tests for valid PDF/DOCX, missing skills/authorization/rate remaining unknown, 10 MiB/20-page rejection, encrypted/malformed files, instruction-like text, unsupported factual claims, and overlapping experience dates. Run `npm run test:unit -- tests/unit/resume-extraction.test.ts`; expect failure.
- [ ] Create a private resume bucket and candidate_documents/resume_extractions tables with uploader/owner and staff policies. Upload intent checks ownership and consent; processing rechecks the stored object's signature, actual size and document limits instead of trusting browser metadata. A new candidate intake can own a document before a candidate ID exists.
- [ ] Implement Responses API file processing with a configurable file-capable model and strict Zod schemas. Record model/prompt/schema version, supporting snippets and warnings. Reject invalid/refused/incomplete responses rather than inventing defaults. Remove provider file copies after processing, including failure paths.
- [ ] Build resume_extract handler with version checks and cached extraction by content hash scoped to authorized users. Return status and the draft through authenticated endpoints. Issue authorized 5-minute download URLs; provide authorized document deletion and orphan-upload cleanup.
- [ ] Run unit tests and cross-user SQL/storage tests. Perform one consented synthetic live-provider extraction if credentials exist; label unavailable live verification honestly. No real candidate resume goes to Firecrawl or logs.

### Task 6: Review, confirm and save candidate details

**Files:** Create `src/components/resume-upload-review.tsx`, `src/app/api/resumes/[id]/confirm/route.ts`, `tests/e2e/resume-intake.spec.ts`; modify `src/components/candidate-form.tsx`, `src/components/candidate-form-sheet.tsx`, `src/components/candidate-detail-dialog.tsx`, candidate pages, `src/lib/candidates.ts`, `src/types/database.ts`.

**Produces:** ConfirmedCandidateSnapshot, confirmed profile provenance and monotonically increasing candidate versions.

- [ ] Write flow tests: upload -> progress -> extracted draft -> edit -> confirm -> reload; missing name prevents save, missing authorization stays Unknown, duplicate contact prompts review, and a late older extraction cannot overwrite a newer draft. Run `npm run test:e2e -- tests/e2e/resume-intake.spec.ts`; expect failure.
- [ ] Add drag/drop upload with clear PDF/DOCX limits and third-party processing consent, plus processing/error/retry UI. Show extracted fields, evidence, warnings and manual overrides; preserve an ordinary manual-entry path when AI is unavailable.
- [ ] Implement confirmation as an atomic version-checked transaction linking document/extraction and saving allowed candidate fields. Set ownership from the session, never client-supplied owner IDs. Re-upload displays differences; confirmed fields change only after explicit review.
- [ ] Update candidate details to show confirmed skills/history, latest private resume link and extraction state. Legacy defaults remain marked unconfirmed and excluded from AI factual claims until reviewed.
- [ ] Run the flow tests, SQL access tests, typecheck and lint. Milestone 2 is complete only when confirmed records survive reload and worker restart.

## Milestone 3: Contract public jobs and AI matching

### Task 7: Stored native ATS feeds and real source configuration

**Files:** Create `supabase/migrations/20261008_05_jobs.sql`, `src/lib/jobs/{types,normalize,repository,sync}.ts`, `src/lib/jobs/adapters/{greenhouse,ashby}.ts`, `src/app/api/job-sources/route.ts`, `src/app/api/job-sources/[id]/sync/route.ts`, `src/app/api/jobs/[id]/route.ts`, `tests/unit/job-ingestion.test.ts`; modify `/api/jobs`, `/api/greenhouse`, job pages/details/table, Greenhouse/Ashby views, settings and worker scheduler.

**Produces:** NormalizedJob, JobSnapshot, `syncSource`, persistent source CRUD and list/detail job APIs with stable database IDs.

- [ ] Write adapter tests with synthetic ATS fixtures: complete responses over 40 jobs, stable IDs/URLs, descriptions, nullable missing facts, idempotent upserts, partial/429/timeout failures not closing jobs, and complete-snapshot closure. Add assertions for Ashby Contract mapping, explicit contract descriptions, permanent W2 not being classified contract, incidental contract keywords, conflicting evidence remaining unknown, and default contract filtering. Run `npm run test:unit -- tests/unit/job-ingestion.test.ts`; expect failure.
- [ ] Add jobs, job_sources and source_sync_runs with unique source/external-ID keys, canonical URL normalization, snapshot completeness and timestamps. Preserve application URLs and salary units; sanitize descriptions before rendering.
- [ ] Implement bounded native fetch adapters and explicit complete/partial results. Remove hardcoded company limits and title-based guessing of requisitions. If a provider omits an ID, derive it from a normalized job-URL hash; filter isListed=false Ashby postings from public listings. Configure validated board slugs in the UI, selecting sources that actually publish contract roles; mark them connected only after a successful real fetch. Do not hardcode guessed staffing-company slugs or invent contract listings when a feed lacks them.
- [ ] Implement employment-type normalization and provenance. Prefer provider metadata; otherwise use explicit role-level description evidence. Add optional bounded/cached AI classification for unclear descriptions within the daily quota, as a stage of source_sync; keep unknown values if classification is unavailable or conflicting. Preserve separate nullable C2C/W2/1099 attributes. Job filters default to contract and provide temporary/unknown/all alternatives.
- [ ] Make `/api/jobs` query stored jobs with search/filter/pagination, and use database IDs for job details and candidate comparisons. Consolidate legacy API/views through the shared adapters to avoid competing caches or duplicate feeds.
- [ ] Connect refresh actions and 30-minute due-source scheduling to source_sync tasks, enforce one running sync/source and preserve last successful results with stale health on errors. Build actual dashboard job-history chart data from saved sync events.
- [ ] Run adapter tests, source permissions tests and a real Greenhouse/Ashby read-only smoke sync when network access exists. Verify all available jobs are accounted for or the run is explicitly partial, rather than silently capped.

### Deferred Task 8: Firecrawl fallback for configured public careers pages

Do not execute this task for the initial release. It remains here as future scope requested by the user, and Tasks 9-10 do not depend on it. Do not show a connected scraper or require its key in current setup. Recheck provider documentation, limits and pricing before implementation.

**Files:** Create `src/lib/jobs/adapters/firecrawl.ts`, `src/lib/security/{public-url,sanitize-html}.ts` if not already added in Task 7, `tests/unit/careers-scraping.test.ts`; modify source configuration, normalization, sync and settings modules.

**Consumes:** JobSnapshot and shared source_sync pipeline. **Produces:** The same NormalizedJob records as native feeds, with scrape provenance and bounded completeness.

- [ ] Write tests for same-site careers discovery, JobPosting JSON-LD normalization, missing required title/application URL rejected, script sanitization, private-IP/redirect rejection, 100-page cap, 500-page daily budget, duplicate URLs and truncated crawl remaining partial. Run `npm run test:unit -- tests/unit/careers-scraping.test.ts`; expect failure.
- [ ] Implement staff-approved URL validation and same-domain/path limits, including redirect handling and normalization. Provider URLs from returned page content remain untrusted; do not let extracted links control arbitrary fetches.
- [ ] Implement Firecrawl v2 asynchronous crawl/poll handling with persisted provider job IDs and bounded polling across worker leases. Extract deterministic JobPosting data first, then bounded AI output where needed; validate source and application links and never fabricate jobs from company names.
- [ ] Keep Firecrawl credentials optional: native ATS sources work without them, scrape sources display Not configured until setup passes. Meter calls/pages and show partial/failed runs. No login/CAPTCHA bypass or private profile crawling.
- [ ] Run scraping tests and one bounded live scrape against an allowed configured careers page if credentials exist. Verify repeated syncs do not multiply jobs and failures do not imply closure.

### Task 9: Evidence-based matching and factual draft packets

**Files:** Create `supabase/migrations/20261008_06_ai_matches.sql`, `src/lib/ai/{match,packet}.ts`, `src/app/api/matches/route.ts`, `src/app/api/packets/route.ts`, `tests/unit/ai-matching.test.ts`; replace the use of `src/lib/matcher.ts` in `src/components/skill-matcher-dialog.tsx`, and modify candidate/job detail views and submission forms.

**Consumes:** ConfirmedCandidateSnapshot, JobSnapshotRecord, candidate/job versions, task/usage services. **Produces:** MatchAnalysis, persisted comparisons and draft submission packets.

- [ ] Write tests asserting no high baseline for zero overlap, unknown requirements stay unknown, explicit constraint conflicts are visible, missing visa facts do not become compatible, unsupported achievements are excluded, and malicious JD instructions cannot invoke actions. Run `npm run test:unit -- tests/unit/ai-matching.test.ts`; expect failure.
- [ ] Persist versioned job requirement extraction once per changed description, then prefilter eligible active contract jobs using confirmed target titles/skills and explicit preferences. Other employment types require an explicit filter choice. Candidate review can select at most 20 jobs for AI comparison; automatic comparisons share the daily budget and versioned cache.
- [ ] Implement `analyzeMatch` with evidence snippets and per-requirement met/missing/unknown statuses. Coverage is round(100 * met / all validated requirements), including unknowns in the denominator; no valid requirements returns null and shows insufficient evidence. Explicit constraint conflicts remain separate. Never present the score as placement probability or make independent legal eligibility determinations.
- [ ] Replace the synchronous browser matcher with queued comparison/progress/results UI. Store input versions/model/prompt identifiers; changed candidate/job data marks old matches stale.
- [ ] Implement factual packet drafts with confirmed candidate facts, an RTR request template, private document references and proposed job/vendor links. Unknown recipient/rate stays blank. Creating a draft does not create consent or mark an external application Applied.
- [ ] Run matching tests and an end-to-end upload -> confirmed profile -> real stored job -> match -> packet -> saved draft test. Inspect supported claims against source evidence before accepting live AI output.

### Task 10: End-to-end verification and deployment handoff

**Files:** Modify `README.md`, `.env.example`, test configs; add `docs/operations/ai-recruiting-runbook.md` and `tests/e2e/real-recruiting-flow.spec.ts`.

- [ ] Document current environment names: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, server-only `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `OPENAI_MODEL`. Defer `FIRECRAWL_API_KEY` and scrape setup entirely. Include configuration validation, migration order, private storage setup, local app/worker commands, queue inspection, retry controls and budget settings. Never put key values in docs/UI.
- [ ] Document production worker hosting separately from Next.js and verify scheduler behavior across restart. If the chosen host cannot run a persistent worker, adapt deployment to a managed durable worker before claiming automation is operational.
- [ ] Inventory existing suspected demo database records and export a review report. Preserve ambiguous real records; removal requires verified provenance. Dry-run migrations against a copy before applying to any live project.
- [ ] Run `npm run test:unit`, `supabase test db`, `npm run test:e2e`, `npm run typecheck`, `npm run lint`, `npm run build`. Expected: all required checks pass. Record live-provider checks separately from synthetic fixtures and list credentials/network checks that could not run.
- [ ] Verify cross-user resume privacy, pending/suspended-user denial, reload persistence, blank-workspace behavior, stale feeds, quota exhaustion, provider failures, duplicate uploads and worker restart. Confirm there are no demo data imports, invented profile facts, or success responses on failed writes.
- [ ] Open the completed app for review; supply migration/deployment instructions and a concrete changed-file summary. Deployment and existing-record deletion are separate reviewed operations; creating this plan performs neither.

## Execution prerequisites and handoff

Revision 2026-10-08: the initial release uses public native ATS feeds with contract jobs as the default; Deferred Task 8 is excluded. The user confirmed recruiters use both websites and email. The design document includes a proposed automatic application-capture follow-up using portal-linked application intents, a supported-site extension and an authorized mailbox adapter, feeding one deduplicated application-event service. Write that integration's own implementation plan before building it. An application-link click is never a completed application.

This plan and its companion design are proposed artifacts created at the user's request. No product code, dependencies, remote database, credentials or hosted services were changed.

Before live verification, confirm the Supabase project and deployment target and configure provider keys through server environment variables. Implement local behavior and automated tests without waiting for paid provider access; missing keys must have truthful Not configured states.

Recommended execution: native implementation in this chat, completing the milestones sequentially because auth, task and data contracts are shared. Delegation is optional only if the user chooses it. Review the proposed behavior and limits before starting implementation.
