# Recruiting operations, placement tracking, and payroll

## Status

Approved by the user on 2026-10-11. Implemented and regression-verified in the workspace; production database activation and live provider/portal verification remain pending. See [setup and verification](../../operations/recruiting-operations.md).

## Goal

Extend the current recruiting workspace so an approved recruiting team can work assigned candidates, capture application answers after portal submission, record candidate placements and month-by-month employment details, and track recruiter salary and technical recruiter commission payments made outside the platform. Give the super admin a concise dashboard for approvals, placements, dates, and money.

## Current application context

- The application already has `super_admin`, `recruiter`, and `client` roles. Here, `client` is the candidate's own account.
- Recruiter accounts can remain pending until a super admin activates them. Candidate profiles already have an assigned recruiter field.
- The browser extension already fills supported application forms and records submission observations. The application capture endpoint creates a submission record, but does not store the final form answers.
- Candidate job submissions include text fields for submitted and client pay rates. They are not a payroll ledger.
- Dashboard metrics are currently basic candidate, submission, confirmation, and public-job totals.

## Roles and access

Add `technical_recruiter` as a staff role. Recruiters and technical recruiters register as pending. A super admin can approve, reject, or suspend either kind of staff account; only active staff can access staff pages, APIs, or extension credentials. Approval and status changes record the actor and time.

| Role | Permitted data and actions |
|---|---|
| Super admin | All workspace profiles, candidates, submissions, assignments, placements, salary terms, commissions, payment records, and dashboard totals; manage approvals and corrections. |
| Recruiter | Assigned candidates and their applications and placements; own salary periods, payment records, and permitted commission details. |
| Technical recruiter | Assigned candidates and applications they are allowed to work on; own placement credit, salary if applicable, commission terms, and payment records. |
| Client/candidate | Own reviewed profile and resume, related jobs, application details for their own submissions, and their own placement dates and agreed compensation that is marked visible to them. |

Candidate assignment must be checked in the server APIs and database policies, including extension operations. A staff user cannot gain access to another team's candidate simply by changing a candidate ID. Keep assignment and submission-credit history when the current assignment changes. Financial views are scoped independently so team access does not grant access to another person's pay.

## Final application answer capture

Extend the supported browser-extension flow to save an allowlisted snapshot of the answers actually present when the user submits an application, including edits made after autofill and answers collected across supported multi-step forms. Link every snapshot to its candidate, submission/application intent, portal, URL, attempt, actor, profile version where available, and capture time. A later correction creates a revision with its actor and timestamp rather than erasing the earlier snapshot.

The user continues to review and submit the portal form. The extension reports application status separately from answer capture:

`in progress → submit attempted → success observed → confirmed`

Validation failure or capture failure is recorded without claiming an application succeeded. An idempotency key based on the intent and attempt makes retries update or complete the same record rather than create duplicate submissions. Existing email-receipt confirmation remains separate evidence.

Do not capture passwords, session tokens, payment credentials, file contents, or unrelated sensitive controls. Store only application fields needed to review what was submitted. Unsupported pages or uncertain portal state require a visible manual review path. Keep current resume-based job recommendations and safe autofill behavior.

## Candidate assignments and placements

A candidate can be assigned a recruiter and a technical recruiter. Record assignment start/end times and who made each change. Each application submission retains the staff member who submitted it, even if the assignment later changes.

A placement is a distinct record linked to the successful application and candidate. It records the company, role, current status, responsible recruiter and technical recruiter, planned start, actual joining date, expected end date, actual end date, and compensation terms. This allows a candidate to have multiple placements over time without one job overwriting another.

Placement lifecycle should distinguish offer/accepted, joining scheduled, active, completed, ended early, and cancelled. The actual joining date starts candidate employment tracking. The expected end date may be revised with an audit entry; actual employment end closes further monthly records. Candidate month-by-month records show the covered calendar dates, applicable agreed rate or amount, currency, payment/billing facts that the workspace tracks, and status. A candidate joining on 15 October has an initial 15–31 October record, then a 1–30 November record. A final partial month ends on the actual employment end date. Do not infer hourly earnings without approved hours or invent a financial amount from a resume.

## Recruiter and technical recruiter salary periods

Maintain staff employment and compensation independently from account registration and access status. A staff employment record contains the actual joining date, agreed salary amount, currency, payment schedule, effective dates for compensation changes, and employment end date if known. Account approval does not silently backdate salary; a super admin enters or confirms the actual joining date.

Create recurring salary periods from the staff member's joining-day anniversary. For a joining date of 11 October 2026, the first covered period is 11 October–10 November, with the next period beginning 11 November. The following period is 11 November–10 December. Calculate month anniversaries by calendar arithmetic, not by adding a fixed 30 days; for dates beyond a month's final day, use that month's last day and preserve the original anchor for later cycles. Store period boundaries and due date explicitly.

Snapshot the applicable salary terms onto each period so later rate changes do not rewrite history. Track upcoming/accruing, due, partially paid, paid, and overdue states. Partial employment periods and manual adjustments need an explicit configured calculation rule and audit record; do not silently assume a proration formula. Suspension of login access is separate from the employment record and does not itself modify a salary period.

Recruiter salary accrues under the employment terms independently of candidate placements. A technical recruiter may have both salary and placement commissions. Keep the two earnings streams distinct.

## External payments and commissions

The platform records payment made elsewhere; it does not initiate transfers. A payment record includes payee, category (salary or commission), linked salary period or commission, amount, currency, date paid, external method/reference, optional notes, and the admin who recorded it. Allow partial payments and multiple payments; derive outstanding balance from the linked records and prevent duplicate transaction references where supplied. Show unpaid balances and period status without marking an external payment as complete until an admin records it.

For a technical recruiter commission, store the credited recruiter, linked candidate placement/application, agreed amount and currency, earning milestone, due date, approval state, and payment history. Recommended initial business default: a fixed, one-time commission becomes eligible when the candidate actually joins and requires super admin approval before payment. Keep the milestone and amount configurable per agreement. Later assignment changes do not change commission already earned. Recurring commissions, if configured, are generated by active placement periods and stop at actual employment end.

Candidate salary/pay and company bill rate, if recorded, are separate from staff payroll and commission. Keep candidate-facing compensation visible only when explicitly enabled for that candidate. The initial scope records agreed amounts and external payment facts; it does not add bank/payment-provider integration or accounting/tax calculations.

## Super admin dashboard

Make the main dashboard action-oriented and load all important counts and lists from role-checked server queries. Show:

- Pending staff approvals and candidates needing assignment or resume review.
- Active placements, upcoming candidate joining dates, and expected/actual employment ends.
- Salary periods due soon, overdue periods, paid-to-date totals, and outstanding balances.
- Commissions awaiting eligibility, approval, or payment.
- Application capture/sync failures needing review.

Provide searchable, filterable sections or tabs for approvals, candidate placements, salary periods, and commissions/payments. A compact placement row includes candidate, company/role, assigned recruiter and technical recruiter, status, joining/end dates, agreed amount/rate, and next action. Salary rows show staff member, actual joining date, period start/end, amount due, amount paid, balance, and payment due date. Commission rows show credited recruiter, placement, milestone, amount, approval, paid amount, and balance. Expand a row for history and allow authorized admin actions without navigating through unrelated pages. Group money totals by currency and distinguish amounts paid from amounts outstanding.

Recruiters and technical recruiters get scoped views for their assigned candidates, own placements, and own salary/commission/payment history. Candidate-facing pages show only that candidate's own placement, dates, and allowed compensation facts.

## Data and audit requirements

Use forward-only database migrations. Add normalized records for assignments, application-answer snapshots and revisions, staff employment/compensation, salary periods, placements, candidate monthly placement periods, commission terms/entries, and external payments. Use numeric monetary columns with explicit ISO currency codes, dates for employment periods, timestamps for events, unique keys for generated periods, and foreign keys to actor/profile and related records. Avoid storing multiple financial concepts in one free-text field.

Audit approvals, assignment changes, placement date/status changes, compensation edits, commission decisions, manual adjustments, and payment creation/correction with actor and timestamp. Protect writes through authenticated APIs and database policies; clients cannot update financial or staff records. Ensure admin dashboard aggregates respect currency and role boundaries.

## Delivery phases

1. Add the technical recruiter role, staff approval workflow, candidate assignment history, and server/database access checks.
2. Add staff employment terms, anniversary-based salary periods, external payment recording, and scoped salary views.
3. Extend browser capture to store submitted answer snapshots and link them idempotently to applications.
4. Add candidate placements, monthly employment records, candidate visibility rules, and extension/application association.
5. Add technical recruiter commission terms, eligibility/approval workflow, and commission payment tracking.
6. Build the super admin dashboard and role-specific pages, then verify permissions, month-end cycles, retries, partial payments, history, and empty/error states.

## Acceptance criteria

- Pending recruiters and technical recruiters cannot access staff pages, candidate APIs, or extension features; approval grants access and status changes are auditable.
- Recruiters and technical recruiters see only assigned/authorized candidates and their own financial history; a candidate sees only their own data.
- Portal submission captures final edited answers for supported forms and links them to the correct candidate and attempt; failed retries do not duplicate submissions or falsely mark applications successful.
- Candidate placements preserve actual joining/end dates and month-by-month records, including partial first and final calendar months.
- Staff salary periods follow each staff member's joining-day calendar cycle, handle short months and leap years, preserve effective-dated rates, and display external partial/full payments accurately.
- A technical recruiter receives commission credit from the recorded placement terms and milestone; admin approval and every payment are visible in the audit history.
- Super admin can identify pending approvals, date milestones, salary due/overdue, commission due/overdue, and capture issues from the dashboard and drill into the relevant record.

## Approved implementation defaults

1. `client` remains the candidate account, matching the existing application.
2. Technical recruiter commission defaults to a one-time fixed amount at actual joining, with admin approval; placement-active eligibility is also supported.
3. The admin explicitly chooses manual partial-period review or fixed monthly pay. Partial external payments are ledger entries; the platform does not guess a proration formula.
