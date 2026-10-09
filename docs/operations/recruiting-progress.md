# Execution ledger — docs/superpowers/plans/2026-10-08-ai-recruiting-plan.md

- Authorization: latest user instruction requests all remaining planned work; preserve working email capture and implement the remaining milestones inline.
- Ruling: work in place because this directory has no Git repository — existing user-owned workspace — cost: no commit/worktree rollback; preserve this ledger and files.
- Ruling: use existing Node tests and embedded PostgreSQL, adding browser tests for integrated flows rather than replacing the runner with Vitest — email suite already has 44 meaningful passing tests — cost: different test commands from the proposed plan.
- Ruling: use unique ordered migration versions after the email migration; runbook states exact order — proposed same-date suffixes collide in migration tooling — cost: update plan filename references.
- Scope: resume PDF/DOCX upload, strict supported AI extraction/review, candidate self-service and recruiter lists/counts, real vendors/settings/dashboard, durable queue/budgets, public contract-focused ATS jobs, supported matching and draft packets, application intents and Greenhouse/Ashby extension. Firecrawl remains explicitly deferred; no external applications or emails are sent.
- Pre-flight: permissions -> all endpoints, nullable facts -> candidate forms/matching, task leases -> each provider handler, confirmed candidate/job versions -> matches/packets, intents -> browser/email correlation. Preserve separate capture and recruiting status and private receipt ownership.
- Existing configuration: public Supabase configuration only. Service key, AI credentials/model, mailbox credentials, live migrations and deployed workers remain unconfigured. Build useful local behavior and truthful setup states without waiting for these.
- Task 1 foundation: implemented; embedded PostgreSQL ownership/version and fail-closed permissions tests pass.
- Task 2 persistence: implemented vendors/settings API and persistent CRM; submissions preserved and new defaults are Draft.
- Task 3 demo/UI cleanup: implemented real metrics and job/candidate screens; removed runtime data.json and fabricated matcher. Browser fixtures pass 2/2.
- Task 4 durable tasks: implemented four handlers and scheduler, atomic leases/retries/budget reservations; queue tests pass.
- Task 5 resume extraction: implemented private PDF/DOCX pipeline and supported Responses API extraction; parser/privacy tests pass. Live AI unavailable without credentials.
- Task 6 candidate review: implemented upload/review/manual edits/confirmation and recruiter list/count. Browser fixtures pass 2/2.
- Task 7 contract job ingestion: implemented configured native boards, bounded complete snapshots, persisted identities/versions and stale health. Adapter and full SQL integration tests pass.
- Task 8 Firecrawl: explicitly deferred by user.
- Task 9 matches/packets: implemented versioned evidence comparisons and factual packet drafts. Validation tests pass; live AI unavailable.
- Capture follow-up: implemented scoped MV3 extension, paired/revocable credentials, per-tab intents, append-only deduplicated events and email correlation. SQL and attribution tests pass.
- Task 10 verification/runbook: implemented runbook at docs/operations/ai-recruiting-runbook.md; the final verification record below supersedes intermediate runs.

- Ruling: use direct file input with store:false rather than provider Files uploads - official Responses API supports it - cost: request size is larger, with no provider file deletion step.
- Ruling: packet generation uses a factual template from confirmed facts, avoiding another AI call - prevents unsupported prose and preserves blank unknown recipients - cost: less narrative customization.
- Ruling: unclear job employment types remain Unknown rather than paid AI classification - public jobs are the current unpaid ingestion scope - cost: users must include Unknown to review ambiguous contract roles.
- Ruling: source and resume endpoints retain equivalent focused contracts rather than proposed filenames - upload registration and queue linking now commit atomically - cost: runbook and plan endpoint references differ.
- Verification so far: 63/63 unit tests before added full migration integration tests; additional integration suite 4/4 passes. SQL executed in embedded PostgreSQL, not a live Supabase project.

- Final: fixed staff confirmation detaching client intake ownership - staff review of an unlinked client resume retains candidate ownership RED to GREEN, full integration suite 5/5.
- Final review limitation: fresh reviewer could not start because account usage limit. No independent review result was received; continuing local verification and self-review.

- Final: fixed candidate access to recruiter-uploaded own-profile resumes and hidden deleted files - resume ownership regression RED to GREEN 1/1.
- Final: corrected form submit button semantics - browser resume confirmation flow exposed a missing explicit submit type. Browser rerun underway.
- Final: fixed SQL versus NoSQL/negated experience evidence - match evidence regression RED to GREEN.
- Task 9 requirement cache: added lease-protected job-version requirement cache; unknowns remain in coverage denominator.

- Final: candidate review of a staff-uploaded linked resume and edited history retention RED to GREEN; full migration integration suite 7/7.
- Final: added employment/education history editors with retained source evidence; browser fixture verifies edited history in the saved request.
- Final: extension runtime test verifies per-tab attribution, offline queue replay with stable event keys, attempt increments and rejection of confirmed events.
- Verification: npm run test:unit -> 76/76 pass, zero skipped; limiting test concurrency to one resolves the memory exhaustion seen when many embedded database processes ran beside a build. Those earlier failures were environmental, not pre-existing product failures.
- Verification: npm run typecheck -> exit 0; npm run test:e2e -> 2/2 pass against an isolated production build with synthetic auth/API fixtures.
- Verification: read-only real Greenhouse Stripe board fetch -> 726 normalized jobs, zero classified contract roles; no source or job rows written. No live Supabase/AI/mailbox/installed-extension acceptance check is claimed.
- Verification: npm run legacy:report -> exit 1 with truthful missing server setup; no report or database modification was produced.
- Dependency audit limitation: npm audit failed because this npm installation cannot resolve @npmcli/arborist/lib/query-selector-all.js. No clean security-audit claim is made.
- Deferred minor: duplicate-contact warning UI from the proposed intake checklist; profiles are never auto-merged, and candidate self-service retains one owned profile. Staff can review existing candidates before creating an additional record.
- Deferred minor: existing Next.js middleware convention emits a deprecation warning; migration to proxy is separate cleanup and does not block this release.

- Final verification: npm run build -> exit 0, successful optimized production build and all 43 static pages generated; npm run lint -> exit 0, zero errors and 30 warnings; typecheck -> exit 0.
- Final route verification: node scripts/verify-routes.mjs -> exit 0, 17 recruiting/extension authentication and origin checks plus 8 existing email checks pass. Only the isolated server created by this script was stopped; the user development server was preserved.
- Handoff: changes retained in the original non-Git workspace. Runbook opened for review. No deployment, live migration, email sending, external application submission, or extension installation was performed.

## Public jobs follow-up, 2026-10-08

- User reported an empty public jobs directory. Read-only live diagnostics established jobs=0 and job_sources=0; this was missing ingestion configuration, not a failed contract query.
- Verified official public boards before connecting sources. During this authorized repair, connected six real Ashby boards owned by an existing approved staff account and persisted complete snapshots: 360 total jobs, 23 contract jobs. No migration, role change, candidate data mutation, AI call, or email action was performed.
- Added jobs:sync operator command. It processes only specific source_sync tasks through atomic conditional claims, respects concurrent workers and preserves disabled sources. Regression test rejects other task kinds/running or delayed tasks/attempt exhaustion: RED missing helper -> GREEN.
- Clarified candidate empty-state guidance and renamed Reload to Reload saved jobs; candidates are not asked to configure sources they cannot manage.
- Browser limitation: the connected browser has no signed-in portal tab. The user's external browser from the screenshot is not connected; live page verification requires the user's existing session to reload. Persisted jobs and the exact API database query are checked separately.
