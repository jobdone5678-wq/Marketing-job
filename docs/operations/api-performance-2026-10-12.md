# API performance investigation — 2026-10-12

## Findings

Read-only requests against the configured Supabase project took approximately 270–400 ms once connected. Measurements include network latency; they do not isolate PostgreSQL execution time. Both `workspace_metrics` and `recruiting_operations_totals` were in this range. No credentials or candidate data were logged.

The operations, employment and placement GET handlers made one refresh RPC for every record, with unbounded parallel fan-out. The personal placement handler also fetched unrelated financial data sequentially after placement maintenance. SQL refresh functions updated unchanged rows, acquiring locks and firing update triggers on repeated reads.

## Changes

- Batch period maintenance in groups of at most 200 distinct IDs. A 100-employment refresh now uses one refresh RPC rather than 100 after the migration is installed. This measures request count, not a claimed live latency improvement.
- Preserve a compatibility fallback when the batch RPC is absent; legacy refreshes run at most five at once. Other errors propagate. No cache of permissions, balances or salary records was introduced.
- Run independent placement and financial reads concurrently, and fetch employment/placement records alongside payment balances. Remove unused embedded placement-month and commission fetches from the personal placement endpoint.
- Aggregate salary payments once per period during SQL status refresh. Update salary and placement-month status rows only when their values actually change. Preserve anniversary dates, historical salary snapshots, partial-period adjustments and payment checks.
- Add `Server-Timing` headers to protected route responses, including failures: `auth`, `work` and `total` durations in milliseconds. Inspect a request in browser DevTools → Network → Timing or Response Headers. Timings contain no SQL, user IDs or provider messages.

## Activate the SQL changes

Run **supabase/migrations/202610120002_api_performance.sql** in the Supabase SQL editor after the existing recruiting-operations migrations. This file is a standalone transaction and can be rerun. It replaces two functions and adds one service-only batch function. It does not delete business records. The complete `supabase/recruiting-operations-update.sql` bundle also includes this migration for fresh setup.

This workspace has REST credentials but no direct SQL connection or authenticated SQL-editor session, so the live schema has not been changed here. Until this migration is applied, the compatibility fallback keeps the APIs working but cannot provide the full batching and SQL improvements.

## Verification and limits

Regression checks cover bounded/deduplicated batches, unapplied migration fallback, error propagation, parallel reads, private compensation filtering, service-only SQL permissions and repeated refreshes that fire zero update triggers. The existing financial suite also exercises payments, adjustments, immutable compensation history and monthly dates against the updated SQL.

Verified: 193 tests passed; TypeScript checking and ESLint on changed server files passed; production build passed. The build required access outside the filesystem sandbox to write Next.js generated directories. The complete SQL update bundle and the forward performance migration were executed successfully in the PostgreSQL test database.

These changes address reproduced request and SQL bottlenecks. They do not establish a latency guarantee for every endpoint. Authentication still verifies the user and current account status for each request. AI calls, external job-source requests, initial development compilation and Supabase network latency remain separate sources of delay. Failed REST reads may still use the SDK's retry backoff; that durability policy has not been changed globally. Whole-feed resume job ranking remains a potential scaling bottleneck for large feeds and needs a separate representative-data benchmark before changing ranking semantics.
