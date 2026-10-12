# Recruiting operations setup and verification

The approved plan is implemented in the workspace. Live activation still requires the Supabase schema update and deployment of this application version. No payment transfers or third-party applications were submitted during verification.

## Database activation

The connected project's REST endpoint returned HTTP 404 for `staff_employments`, so the new tables were not present when checked. This workspace has a service-role REST key, but no SQL database connection, Supabase CLI login, or connected dashboard session. A REST key cannot execute these schema migrations.

For a project that already has the October 6, 8 and 9 schema, apply migrations `20261011000100` through `20261011001000` in filename order. The first migration adds enum values and must commit before the following migrations use them. Do not wrap all migrations in one outer transaction.

If none of those ten migrations have been applied, `supabase/recruiting-operations-update.sql` contains the same ordered update for the Supabase SQL editor. Run that bundle once, or use the individual migrations; do not apply both. If some migrations already exist, run only the missing individual migrations. A manual SQL-editor deployment must be reconciled with the migration history before switching to a CLI migration workflow.

Confirm these objects exist after applying the update: `candidate_staff_assignments`, `application_answer_snapshots`, `staff_employments`, `staff_compensation_terms`, `staff_salary_periods`, `placements`, `placement_months`, `technical_recruiter_commissions`, `external_payments`, and `earning_payment_balances`. The migrations notify PostgREST to reload its schema.

## Application and extension activation

Deploy/restart the application using the updated source. Reload the unpacked browser extension, then reload recruiting portal tabs and reconnect it to the platform. Existing keys and reviewed resumes remain in their existing configuration; OpenAI-compatible providers use the configured base URL and model. Provider credentials and a real PDF upload still need a live check with that provider.

## Using the workflow

1. Recruiters and technical recruiters register as pending. The super admin approves them from the dashboard or Team and Assignments, then assigns candidates. Approval does not create salary terms.
2. Enter a staff member's actual joining date and salary terms in Salary. The first effective date must equal that joining date. Periods follow calendar month anniversaries, preserving the original day through February and short months. For an October 11 start, the displayed first period is October 11–November 10. End dates are inclusive in the UI.
3. Choose an explicit partial-period rule. Manual partial amounts remain awaiting review until the admin records an amount and reason. Generated salary periods snapshot their terms; new terms do not silently rewrite existing periods.
4. Candidates review their extracted resume facts before related job discovery or extension autofill. Recruiters select an assigned candidate. The extension fills supported fields, retains edits and supported multi-step answers, and captures final values when the applicant submits. Submission observation and email confirmation remain separate. Offline updates retain their event key and retry without creating duplicate applications.
5. Record the successful application, company, role, planned/actual joining dates and expected/actual ending dates as a placement. Candidate month records follow calendar months, with manual review for partial-month amounts. Candidate compensation is hidden unless enabled for that candidate. Internal notes and commission agreements stay out of candidate placement responses.
6. Technical recruiter credit is stored on the placement. A fixed commission becomes eligible at the configured actual-joining or active-placement milestone, then requires admin approval. Later candidate reassignment does not change that credit or another person's financial history.
7. Pay staff through the chosen external source, then record the date, amount, currency, method and reference. Partial payments update balances. Corrections append a negative entry linked to the original payment and require a reason; they retain the original history.
8. The super admin dashboard starts with operations and includes approval, assignment, date, salary, commission and capture queues. Embedded management refreshes the summary after changes. Staff see assigned placements and their own earnings/payments. Candidate accounts see only their own placement and permitted compensation.

## Implementation mapping

The three implementation plans share `placements-workspace.tsx` for placement, salary, commission and payment tabs, rather than separate management components. `/api/admin/operations` supplies the operations dashboard alongside the existing `/api/dashboard` activity metrics. The scoped `/api/placements` collection supplies placement/month details, so a redundant read-only placement-detail endpoint was not added.

Corrective migrations 006–010 add salary snapshots and adjustments, automatic commission eligibility, monthly record maintenance, aggregate balances, snapshot revision integrity, task access revocation after candidate reassignment, and earned commission retention after employment ends. The SQL bundle is generated directly from all ten source migrations.

## Verification and limits

Regression coverage includes PGlite execution of the full migration chain, anniversary/leap-month arithmetic, assignment and financial RLS, account suspension, external partial payments and bounded reversals, commission approval and immutable approved terms, snapshot retries/revisions, multi-step edited field capture, offline extension retries, resume recommendations, and browser-rendered staff/application views. Run `npm test`, `npm run typecheck`, and `npm run build` for the current verification result. Feature-scoped ESLint checks are recorded separately from existing repository lint issues.

Browser verification uses representative local portal fixtures. Live portal submissions, the user's exact PDF and provider, email delivery, and production database migration execution are not covered by those fixtures. Unknown custom widgets and file attachments remain manual; the extension does not click final submit.

Final local verification on October 11, 2026: all 123 tests passed; the separate TypeScript check, feature-scoped ESLint checks, production build, and diff whitespace check passed. The complete SQL bundle (001–010) applied successfully to a baseline PGlite database. Independent review findings about explicit PostgREST relationships, earned commission retention, and extension confirmation navigation were corrected and rechecked. Existing repository-wide lint issues and Next.js middleware deprecation warnings are outside this feature update.

The user chose to apply the SQL bundle in the Supabase SQL editor. If the earlier 001–009 bundle was already applied, run only migration `20261011001000_preserve_earned_commission.sql`; otherwise use the current 001–010 bundle once.
