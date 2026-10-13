# Platform fixes — 12 October 2026

## Implemented behavior

- AI supports an OpenAI key or a compatible key paired with its API base URL and model. Hosted environment variables take precedence over local defaults. Invalid production loopback endpoints produce safe setup diagnostics.
- Resume upload/status/retry requests queue or read durable work. They no longer execute AI synchronously or overwrite worker leases. The optional processing webhook requires authentication and can only claim its specified eligible task; unavailable web-server AI configuration leaves the task for the separate worker.
- Failed comparisons have an explicit authorized retry action. Format fallbacks are limited to actual unsupported JSON-format errors, preserving reserved attempt accounting.
- Gmail exposes safe administrator setup diagnostics and uses one canonical callback host, avoiding cross-host state-cookie failures.
- Saved and live job cards/details show provider publication dates and explicit closing dates when available. Current Greenhouse/Ashby feeds do not supply documented closing deadlines: the UI says “Not provided by source”. Existing jobs need a source refresh to populate publication dates.
- Candidate discovery requires a confirmed resume profile, ranks the full eligible feed before pagination, excludes expired explicit deadlines, and never falls back to unrelated jobs. Staff can select an assigned candidate or browse jobs under existing access rules.
- Candidate/client service fees are incoming collections for recruiter application services. Recruiter payroll and technical recruiter commissions are outgoing payments. Actual job employment dates remain independent.
- Service fees follow the service joining date and next monthly anniversary. Recruiter salary periods follow the recruiter joining date. Short months preserve the original anniversary anchor. Service fees use the agreed full fee for a partial final month; this rule is disclosed before enrollment.
- Admins can create service agreements, record partial external receipts and audited reversals, see outstanding/due totals per currency, and end an agreement without rewriting existing bills. Candidates see only their own service fees; recruiters cannot read or change collections.
- The dashboard keeps urgent approvals near the top and provides separate Collections, Job placements, Recruiter payroll, Commissions and Outgoing payments tabs. Navigation labels expose the new fees/payroll areas.

## Activation on Vercel and the separate worker

1. If the earlier recruiting operations schema is already installed through `202610120001`, run `supabase/platform-fixes-2026-10-12.sql` **once** in the Supabase SQL editor. It includes the prior performance RPC update plus migrations 003–005. Do not apply both this file and the full cumulative bundle. For an older database, use the migration sequence/full recruiting bundle appropriate to its installed schema.
2. Deploy the website and restart/deploy the worker with this code. The worker must keep `npm run worker` running with its Supabase server configuration and AI key/base URL/model. A gateway on your computer at localhost is unreachable from a hosted worker.
3. Configure Vercel Production Gmail variables, Google consent and the exact callback URL as described in [Gmail production setup](../gmail-production-setup.md), then redeploy. Keep the encryption key stable across deployments.
4. Follow [AI recovery](ai-production-recovery.md) for worker-only credentials, compatible endpoints and failed-task retries. Configure AI on Vercel too only if using its optional authenticated processing webhook.
5. Refresh public job sources, retry a failed PDF/comparison, complete Gmail consent and sync a known receipt. Create one service agreement and verify its monthly bill and an external receipt in the admin UI.

## Verification and limits

- Broad automated run: 231 tests, 229 passed; two dashboard failures identified (urgent content placement and renamed tab).
- After correcting those failures: all five targeted layout/admin/bundle tests passed, including both incremental and cumulative SQL updates. A subsequent seven-test UI/configuration run passed after the final navigation and diagnostic wording changes. This covers all 231 broad checks plus the additional incremental-bundle test across these runs; the broad command was not rerun after the two corrections.
- Type checking passed after final source edits. The production build passed. Browser layout checks cover 390, 768 and 1440 pixels, light/dark modes and scroll behavior; generated screenshots were inspected.
- Changed-file lint found 13 existing explicit-any errors in the AI adapter/worker and one existing email effect-cleanup warning. No claim of a clean lint run is made.
- SQL was verified in a disposable PostgreSQL-compatible test database. No production SQL, deployment settings or secrets were changed. Live provider completion, worker hosting and Gmail consent remain unverified because those services are not linked here; the local gateway probe could not connect and the database host could not resolve from this environment.
- Collections display the latest 500 service agreements with a visible limit notice; dashboard collection totals cover all records and preserve separate currencies.
