# Recruiting automation setup and verification

The implementation is local code. No live migrations, provider credentials, mailbox permissions, extension installation or deployment were applied by this task. Public Supabase browser configuration is present; the server service key and AI credentials are absent. UI/API errors intentionally report missing setup.

## Activate on a reviewed Supabase project

Back up the target database and test migrations on a disposable copy first. Preserve legitimate profiles and candidate/submission rows. Existing candidate values are marked legacy_unconfirmed; reviewers must confirm their facts before AI comparison. No migration deletes records based on names.

Apply migrations in this exact order. Existing projects should apply only versions they have not already applied:
1. 20261006_bench_marketing_schema.sql (initial schema, future demo seed removed)
2. 20261008_email_confirmation_capture.sql
3. 20261009000100_foundation.sql
4. 20261009000200_crm.sql (adds Draft enum; commits before the next migration)
5. 20261009000300_tasks.sql
6. 20261009000400_resumes.sql
7. 20261009000500_jobs.sql
8. 20261009000600_matches.sql
9. 20261009000700_intake_tasks.sql
10. 20261009000800_browser_capture.sql
11. 20261009000900_metrics.sql
12. 20261009001000_requirements.sql

The private candidate-resumes Storage bucket is created by migration: PDF/DOCX, 10 MiB. Do not make it public. Server routes perform uploads and issue authorized five-minute download URLs. Deleted files lose access immediately; storage cleanup failures are surfaced for retry. Reviewed profile facts remain saved when a file is deleted. New staff accounts remain pending; a trusted existing active administrator approves accounts in Settings. Bootstrap the first administrator only through a reviewed database operation, never signup metadata.

Set server environment variables using .env.example, without exposing keys:
- NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: browser configuration.
- SUPABASE_SERVICE_ROLE_KEY: server/worker only.
- APP_URL: exact deployment origin, also used for mutation-origin checks.
- OPENAI_API_KEY and OPENAI_MODEL: configure a model supporting Responses structured outputs and PDF/DOCX file input. No guessed model default is supplied.

Resume processing sends a consented file directly to the Responses API with store:false, strict schemas and no tools. It creates no provider Files API upload. Unknowns stay null; evidence is checked against readable source text. Image-only documents require manual entry if readable evidence is unavailable. Provider calls, including uncertain/failed attempts, count toward the UTC daily allowance (100 by default). Cached job requirements are reused by job version. A new comparison may need a requirements call and a comparison call. Packets use a factual template and consume no AI call. File processing and provider retention remain subject to the provider's account policies.

## Run the app and durable worker

Install dependencies, then:
```powershell
npm run dev
npm run worker
```
Run the worker in a separate terminal/process, with the same server environment and database as the app. For a bounded diagnostic run: npm run worker -- --once. Production hosting must supervise a persistent worker independently of Next.js. Merely deploying Next.js does not activate queued processing. SIGTERM/SIGINT allow the current task to finish; crashes recover through expiring leases. Up to three transient attempts use bounded backoff. Permanent errors stay visible. Task status lives in background_tasks; use the UI retry action after fixing setup. Retry retains provider usage accounting.

Configure public sources in Public Jobs: exact Greenhouse/Ashby board slug plus the real company name. No guessed staffing-company boards are preloaded. Queue Sync; the worker then fetches a bounded native response (20 MiB). Complete snapshots alone close omitted jobs. Partial/failed responses preserve jobs and expose source health. Sources are connected only after a complete successful fetch. The scheduler checks due sources each minute and uses the workspace interval (30 minutes, admin choices 15/30/60). No Firecrawl key or subscription is required. Contract roles are the default; permanent/temporary/part-time/internship/unknown/all are separate filters. W2/C2C/1099 labels are separate from employment type and do not establish legal eligibility.

## Candidate and recruiter flow

Candidates use My Profile & Resume; staff use Candidates:
1. Upload PDF or DOCX and consent (10 MiB, at most 20 PDF pages).
2. Wait for queued extraction. Errors/unknown setup stay visible; manual entry works.
3. Review every extracted field and its evidence/warnings; edit missing or incorrect facts, including employment and education history.
4. Confirm and save. The saved profile appears in the recruiter list and actual saved count.
5. Upload a replacement from the profile edit screen. Older drafts or outdated profile versions cannot overwrite newer data.

AI comparison uses confirmed facts only, includes unknown requirements in coverage, and shows explicit constraints separately. Coverage is not placement probability. At most 20 jobs may be queued per request. Changed candidate/job versions make older comparisons and packets stale. Preparing a packet creates a Draft submission and records no RTR consent or external application.

## Browser and email capture

Chrome/Edge MV3 source: browser-extension/. Install manually using the browser's Extensions developer mode and Load unpacked. The task does not install or publish it. Generate a five-minute one-use code under Application Capture; enter the portal origin and code in the popup and grant that origin. Credentials expire after 30 days and are revocable in the portal. Disconnect removes local credentials; use portal Revoke to invalidate a credential server-side.

Select a candidate on a stored job and Start linked application. The portal creates/reuses one application intent and opens its URL with an opaque intent fragment. Each tab keeps its own candidate/job link. The extension stores no form values, passwords, cookies or resume contents. It sends only supported event evidence, the linked page URL, event time and attempt counter, with a bounded persistent retry outbox.

Supported site matrix:
| Site/template | Observation support | Fallback |
| --- | --- | --- |
| boards.greenhouse.io, job-boards.greenhouse.io; application form on the linked job path | form opened, final submit attempted, application-specific success heading/status, explicit validation error | recruiter attestation / email receipt |
| jobs.ashbyhq.com; form on the linked job/application path | same bounded observations where known form/heading/status selectors exist | recruiter attestation / email receipt |
| Custom embeds, new templates, cross-domain redirects, all other portals | no guaranteed automatic capture | review outcome / import or authorized mailbox receipt |

Selectors/templates can change. Browser success is an observation, not an authenticated receipt. Permission denial, closed tabs, offline queues and missing selectors leave status open for review. Clicking Apply or final Submit never confirms submission. No CAPTCHA/login bypass or automated final Submit is performed.

Capture status is separate from recruiting stage: started -> in_progress -> submit_attempted -> submitted; authenticated or reviewed receipt -> confirmed; explicit validation/submission error -> failed. Failed attempts can retry. Late failures cannot downgrade submitted/confirmed. Replayed events and receipts deduplicate; ambiguous attribution requires human review. Receipts arriving first can be linked to the same later intent. Manual attestation is labeled recruiter evidence and cannot create confirmed status.

Email integration remains configured separately: see email-confirmation-setup.md. It supports authorized Gmail sync and reviewed .eml imports; automatic sender authentication and exact candidate/application matching are required. Outlook and other mailbox providers are not connected by this implementation.

## Verification and safe data review

```powershell
npm run test:unit
npm run typecheck
npm run lint
npm run test:e2e
npm run build
node scripts/verify-routes.mjs
```
Run memory-heavy build and browser commands sequentially. Unit tests use one process at a time to bound embedded database memory.

Unit tests include real embedded PostgreSQL execution of migrations, RLS, ownership, leases, budgets, snapshots and capture correlation. Browser tests use synthetic authentication and API fixtures at the HTTP boundary against an isolated production build; they do not claim live AI, Supabase Storage, mailbox or portal verification. The e2e runtime never uses production credentials. Its build directory is .next-e2e and ports are 3100/54549. The existing development server is preserved.

Live verification requires a reviewed target and credentials: upload one consented synthetic resume, run the supervised worker, sync a configured real board, compare a confirmed candidate, prepare a Draft packet, observe a consented supported-site application, and verify an authorized email receipt. Those checks cannot be claimed complete without configuration.

To inventory legacy candidate data without deleting it, run npm run legacy:report after configuring server credentials. Treat every returned row as needing review, not proven demo data. No deletion automation is included.

Official integration references: [Responses structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [file inputs](https://developers.openai.com/api/docs/guides/file-inputs), [Greenhouse Job Board API](https://docs.greenhouse.io/job-board.html), [Ashby public job posting API](https://developers.ashbyhq.com/docs/public-job-posting-api).

## Empty public jobs directory repair

A directory with zero job sources cannot fetch anything; Reload saved jobs only reloads persisted records. Candidate accounts browse shared jobs but do not configure sources. Recruiters can add exact boards under Public Jobs. For an authorized operator, npm run jobs:sync refreshes enabled sources immediately, without needing to start the general AI worker. It claims only due queued source_sync tasks, observes atomic leases, and retains configured or disabled sources.

To connect the verified starter contract boards explicitly, run npm run jobs:sync -- --starter. The command validates complete live listings and adds a board only while contract jobs exist. Starter boards are G2i Inc., Docker, Saronic Technologies, Owner.com, Lavendo and Quadrivia through their official Ashby public feeds. It requires an existing approved active staff owner; no role changes are made. Listings change and are not guaranteed to be US-only or compatible with a particular candidate. The normal supervised worker handles ongoing source scheduling.
