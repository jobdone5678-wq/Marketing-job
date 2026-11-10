# Recruiting operations setup and verification

The approved workflows are implemented and locally verified in this workspace. Live activation of this pass still requires the new incremental SQL update and deployment/restart of this application version. No live account roles, payments or third-party applications were changed during verification.

## Database activation

Read-only verification on October 12 confirmed the configured project exposes the original operations tables: assignments, staff employment, placement months, external payments and answer snapshots. The new `oauth_registration_intents` table is absent (HTTP 404 / PGRST205).

For a database already running operations migrations 001–010, apply `supabase/recruiting-operations-2026-10-12.sql` once in the Supabase SQL editor. It contains only:

- `20261011001100_oauth_staff_registration.sql`
- `202610120001_submission_actor_integrity.sql`

Do not also run the same individual migrations or rerun the full operations bundle. If an earlier migration is missing, apply it first. The full `supabase/recruiting-operations-update.sql` is for projects with none of the operations migrations installed; preserve its individual transaction boundaries so enum changes commit first. Reconcile manually applied SQL with migration history before switching to a CLI deployment.

The new migration adds signed, single-use Google registration intents, pending staff registration, audited admin role correction and submission actor integrity. The workspace has a service-role REST key but no SQL connection or Supabase dashboard session; a REST key cannot execute DDL.

## Application and extension activation

Restart/deploy the application. Reload the unpacked extension and portal tabs, then reconnect if needed. Compatible AI providers use the configured base URL and model; the user's exact provider/PDF still needs a live check.

For an account incorrectly created as Candidate by the old Google flow: Dashboard → Team → Correct an account role → select Technical Recruiter → save → separately approve the pending account → assign candidates → sign in again. New staff accounts remain pending until admin approval. An existing account never changes role simply by selecting a different login role.

## Using the workflow

1. Approve recruiter/technical recruiter accounts and assign candidates from Dashboard → Team. Approval does not create salary terms. Candidate and staff access remains scoped by the API and database policies.
2. Enter actual staff joining dates and salary terms in Payroll. The initial effective date equals joining; subsequent terms preserve previously generated snapshots. For an October 11 start, the first displayed period is October 11–November 10. Short and leap months preserve the original joining-day anchor.
3. Choose manual partial-period review or fixed monthly pay explicitly. Manual partial amounts require an amount and reason. Account suspension does not itself end employment.
4. Upload a private PDF/DOCX, review extracted facts and confirm before recommendations or autofill. Duplicate-contact warnings use only authorized candidate records and never merge or block a save. Comparisons show cited evidence, unknowns, conflicts and stale-result warnings.
5. Select the reviewed candidate in the extension. Supported fields use known facts, retain edits and supported multi-step answers, and capture final values on applicant submission. The extension never clicks final submit; custom widgets and file uploads remain manual.
6. Review capture failures through the widget/popup or Application Capture. Offline events retain identity; permanent validation failures pause for review. Explicit manual attestation updates the same linked intent instead of creating a second application. Observed submission and email confirmation remain separate.
7. Record the successful application, company/role, credited staff, planned/actual joining dates and expected/actual ending dates in Placements. Candidate employment records follow calendar months, with explicit review of partial amounts. Compensation is candidate-visible only when enabled.
8. Set a fixed one-time technical commission on the placement. It becomes eligible at actual joining or the configured active-placement milestone, then requires admin approval. Candidate reassignment or normal employment completion does not erase earned credit.
9. Pay through the chosen external source, then record date, amount, currency, method and reference in Payroll/Commissions. Multiple/partial entries update balances. Corrections append a bounded negative entry with a reason; the original record remains.
10. Use Overview for priority queues and currency-separated balances; Team, Placements, Payroll, Commissions and Payments replace overview content. Compact tables open detail sheets for edits and history. Saved mutations refresh summaries. Staff see assigned placements and their own earnings; candidates see their own permitted details.

## Verification and limits

Final local verification on October 12: **186/186 tests passed**; the separate TypeScript check and production build passed. Scoped UI/auth/extension/API lint reported no errors and two full-navigation warnings. The AI normalizer retains pre-existing explicit-any lint debt; Next.js still emits its existing middleware convention deprecation notice.

The exact complete SQL bundle applied successfully to a baseline PGlite database. Browser checks cover 390/768/1440 pixels, dark mode, empty and populated data, mixed currencies, partial salary/payment actions, role correction with separate approval, keyboard focus and visible in-panel failure feedback. Independent review findings were fixed and regression-checked.

Local fixture tests do not establish live Google OAuth configuration, the user's exact provider/PDF, real mailbox delivery or real recruiting portal behavior. Firecrawl remains deferred; Gmail is the selected mailbox adapter; one-time fixed commission agreements are the initial scope. Bank transfers, tax/accounting and unknown portal widgets/file attachments are outside the approved scope.

See [the complete workspace audit](workspace-audit-2026-10-12.md) for requirement mapping, screenshots and activation details.
