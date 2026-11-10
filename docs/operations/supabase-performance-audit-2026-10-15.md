# Live Supabase performance audit — 15 October 2026

Inspected the authenticated Supabase dashboard for Marketing-Job-application (`yzworkrtgbcrsewjsfsg`, us-east-2). The initial performance inspection was read-only. A subsequent email scheduler URL correction is documented below. No functions, policies, indexes, saved business records or schedules were deleted, and query statistics were not reset.

## Evidence

- Overview snapshot: CPU 5%, RAM 63%, 8/60 connections; database query cache hit rate 99.98%. These are snapshots, not a peak-load guarantee.
- The database has approximately 391 jobs, 146 background tasks, 4 saved submissions and 1 application answer snapshot.
- Cumulative statement statistics showed 28,409 calls each to `record_extension_submission` and `save_application_answer_snapshot`, averaging 0.863 ms and 0.796 ms respectively. Counters increased during inspection. These are cumulative counts, not counts for one hour.
- The largest cumulative SQL time entries were Supabase Studio extension/function metadata queries; these are dashboard inspection queries, not application endpoints to delete.
- `sync_recruiting_periods(uuid[],uuid[])` exists, and the optimized salary status refresh is installed.
- No equivalent duplicate indexes were found in public schema by comparing keys, operator classes, collations, sort options, uniqueness, expressions and predicates.
- One cron job exists: `sync-recruiting-emails-every-5-mins`, active on `*/5 * * * *`. Its 288 daily scheduler invocations succeeded in about 0.021 seconds on average. This measures queuing, not delivery: the retained HTTP response records were 78 responses with status 401, with no pending requests. Keep the required email schedule; repair its endpoint authorization separately.
- Six metadata-only HEAD requests from the local computer returned HTTP 200 in 387–1,285 ms. These include network/API latency and do not measure SQL execution alone.

## Reproduced unnecessary requests and fix

The content script remembered only the last confirmation element's text. With success text in a container, heading and paragraph, each observer scan alternated between the texts and logged again. Logging updated the extension's toast/status DOM, which triggered another scan. Database idempotency preserved the small number of records, but did not prevent thousands of repeated HTTP/RPC calls.

The observer now records success once per application event key and submission attempt, ignores extension-owned status/toast nodes, and stops scanning after the first accepted confirmation. A new actual attempt remains eligible. Observer setup also waits for the linked application context and candidate to load, so linked tabs use the correct observer.

Regression tests reproduce the previous repeated-capture failure and cover both linked and unlinked applications, duplicate/nested confirmations, unrelated DOM changes, and subsequent attempts. Existing outbox/offline/manual-review recovery checks remain applicable.

Reload the installed unpacked extension and refresh all already-open recruiting tabs to activate the updated content script. Existing tabs keep their old script until refreshed. The observed production request reduction has not yet been measured after that activation.

The reusable metadata query is in `supabase/performance-audit-readonly.sql`. Credentials and candidate/mailbox contents are intentionally excluded from the audit artifacts.

## Email scheduler URL correction

Further inspection confirmed that the cron already had an Authorization header with a Bearer value and no detected placeholder. It was calling `https://nextkinhr.com/api/email-confirmations/sync`, which returned an HTTP 308 redirect to the canonical `www` host. Libcurl normally withholds Authorization when following a redirect to a different host ([documentation](https://curl.se/libcurl/c/CURLOPT_FOLLOWLOCATION.html)).

Applied `supabase/fix-email-sync-cron-url.sql` through `cron.alter_job`, changing only the URL to `https://www.nextkinhr.com/api/email-confirmations/sync`. The existing stored header, job activation and five-minute schedule were preserved. The SQL editor confirmed `uses_direct_url=true`.

Verified the next automatic invocation on 15 October 2026 at 13:15 UTC (6:45 PM IST): HTTP response ID 1112 returned **200**, without timeout. Previous invocations 1111 and 1110 returned 401. This verifies scheduler delivery and endpoint authentication; it does not establish that any particular mailbox had new receipts to import. No secret was revealed, replaced or copied between services.

## Source cleanup

Removed 15 modules with no references from application routes, workers, scripts or tests: obsolete sheet/table/dashboard wrappers, the no-op mandatory phone dialog, unused breadcrumb/checkbox/drawer/toggle components, and unused auth/settings/utils helpers. Removed unused imports from the active vendor and submission components. Removed five unused direct dependencies (`@dnd-kit/core`, `@dnd-kit/modifiers`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, `@tanstack/react-table`) and updated the lockfile. Active AI compatibility code, worker diagnostics, tested chart/payroll/sync helpers, SQL migrations and business records were retained. The scan found no obvious dummy records in active UI code.

Validation: production build, TypeScript check, ESLint for the four edited source files, and eight chart/vendor/submission/sidebar UI tests passed. Job-date database persistence and six ingestion tests passed. One ingestion assertion (missing Greenhouse totals must produce a partial snapshot) also fails against the pre-cleanup HEAD source; this existing behavior remains unresolved. Full-repository lint still reports pre-existing explicit-any errors in the AI client and worker. Source cleanup is local and has not been deployed. Removing unused modules chiefly reduces maintenance and dependency overhead; the repeated-request fix above addresses measured database traffic.

## Dashboard data and Analytics removal

Audited the role dashboards: general counts and chart series come from `workspace_metrics`, and super-admin totals and lists come from `/api/admin/operations`. No hardcoded demo counts were found. Removed the global contract-job count from individual workspace summaries because it does not represent resume-matched jobs. Added refresh, updated-at information, retry controls and explicit stale-data messaging; failed loads never substitute invented zero counts. Candidate, recruiter and technical-recruiter dashboards label their saved records and link to the appropriate service-fee, payroll or referral-commission sections.

The admin commission card now lists saved commission records instead of an intentionally empty row list. Missing collection summaries show unavailable rather than zero unpaid periods. Removed the Analytics page, sidebar entry, navigation grouping and header label; the production route manifest no longer includes `/dashboard/analytics`. These are local source changes pending deployment.

## Provider-wide public jobs — 16 October 2026

The live ATS selector previously filled a default company slug (Spotify for Lever), limiting every provider selection to that single board. Company board selection is now optional: a provider-only request merges the public catalog and enabled saved sources, deduplicates boards, and preserves explicit source disables. Provider changes clear the previous board and company restriction. Live and saved provider selections stay aligned. Saved-job filtering now accepts every provider offered in the UI, including Lever, rather than rejecting all but Greenhouse/Ashby.

Added the official Palantir and Zoox Lever boards alongside Spotify. Live results show source coverage, software-role counts per board and source errors. This is coverage of known public boards, not a worldwide Lever index: Lever's public API requires a company site name ([official documentation](https://github.com/lever/postings-api)). Candidate resume ranking and explicit location/employment filters still apply. These source changes require deployment; no production database records were changed for this update.

## Recent posting dates — 16 October 2026

Public Jobs defaults to the last 30 days, using source `posted_at` rather than our database `updated_at`/sync time. Saved results filter dates before counting, resume matching and pagination; live results apply the same cutoff. Both display newest posting dates first, including for resume-related results. The shared Posting date control supports 7, 30, 90 days and All dates. Recent views exclude unknown posting dates and future timestamps; All dates includes historical/undated jobs, with undated jobs last. Full source snapshots remain saved for history; this change does not delete old jobs or pretend a refresh is a new posting. Source changes are local pending deployment.
