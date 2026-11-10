# Placement and Payroll Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track candidate employment month by month, recruiter salary from each staff member's joining date, technical recruiter commissions, and external payments from role-scoped pages led by the super admin dashboard.

**Architecture:** Keep employment and placement records separate from login profiles and applications. Generate recruiter salary periods by joining-date calendar anniversaries, record external payments as an auditable ledger, and aggregate currency-safe summaries behind role-checked APIs.

**Tech Stack:** Next.js 16.3.8, TypeScript, Supabase Postgres/RLS, existing dashboard components and protected route helpers.

**Spec:** `docs/superpowers/specs/2026-10-11-recruiting-operations-and-payroll.md`

## Implementation status

Implemented in the workspace and regression-verified. Live database activation is pending. See [setup and verification](../../operations/recruiting-operations.md) for the final file mapping, migration order, and live verification limits.

## Global Constraints

- Read the installed Next.js 16.3.8 guides in `node_modules/next/dist/docs/` before editing application code.
- Do not add dependencies or edit older deployed migrations; use a new forward-only Supabase migration.
- Use exact numeric amounts plus ISO currency codes; never add totals across currencies.
- Record payments made externally; do not initiate transfers or calculate tax/accounting obligations.
- Salary begins at the recorded actual staff joining date; access approval does not imply or backdate employment.
- Candidate placement months are calendar months; staff salary periods follow the joining-day monthly anniversary.
- Recruiter salary and technical recruiter placement commissions are separate earning records.

## Review Focus

- Joining on the 29th, 30th, or 31st creates non-overlapping calendar-anniversary cycles through February and leap years.
- A candidate joining mid-month gets a partial first calendar record; actual end date closes the final record without future periods.
- A salary-rate change affects periods on or after its effective date, not previously generated/paid periods.
- Multiple external payments, partial payments, and admin corrections produce the correct balance and an audit trail.
- A recruiter/technical recruiter cannot inspect another person's salary/commission or an unassigned candidate placement.

---

### Task 1: Define compensation, period, placement, and payment records

**Files:**
- Create: `supabase/migrations/20261011000400_placement_payroll.sql`
- Create: `src/lib/payroll/periods.ts`
- Modify: `src/types/database.ts`

**Interfaces:**
- `generateSalaryPeriod(hireDate: string, periodIndex: number): { startDate: string; endDateExclusive: string }` uses the original join-day anchor and calendar month arithmetic.
- `generateCandidateCalendarPeriod(joinDate: string, monthStart: string, employmentEndDate?: string | null): { startDate: string; endDate: string }` returns the covered candidate calendar-month dates clipped to employment.
- Tables: `staff_employments`, effective-dated `staff_compensation_terms`, `staff_salary_periods`, `placements`, `placement_months`, `technical_recruiter_commissions`, `external_payments`.
- Generated periods store their boundaries, applicable terms/rate snapshot, currency, due date, and status; unique keys prevent repeat generation.

- [x] **Step 1: Add the normalized schema, foreign keys, date/amount checks, RLS, and service-only write functions in a forward migration.** Super admin sees all; staff reads are owner-scoped; candidates read only their own approved-visible placement details.
- [x] **Step 2: Implement salary anniversary arithmetic without fixed-day increments.** For a 31st anchor, use each target month's last day and keep the original anchor for subsequent periods.
- [x] **Step 3: Implement calendar-month placement period clipping for actual join/end dates.** Persist the period with unique `(placement_id, year, month)` identity.
- [x] **Step 4: Add TypeScript row/form types and inspect generated period behavior for short months, leap years, first/final partial placement months, and reversed dates.**

### Task 2: Create and maintain employment and placement records

**Files:**
- Create: `src/lib/placements/repository.ts`
- Create: `src/app/api/admin/staff-employments/route.ts`
- Create: `src/app/api/admin/placements/route.ts`
- Create: `src/app/api/admin/placements/[id]/route.ts`
- Create: `src/app/api/placements/route.ts`
- Create: `src/app/api/placements/[id]/route.ts`
- Modify: `src/app/api/admin/profiles/route.ts`
- Modify: `src/app/api/candidates/[id]/route.ts`

**Interfaces:**
- `POST /api/admin/staff-employments` creates or updates staff employment and effective-dated salary terms.
- `POST /api/admin/placements` creates a placement linked to candidate and submission, assigned recruiter/technical recruiter, date and compensation terms.
- `PATCH /api/admin/placements/[id]` updates status/date/terms with an audit event; closing employment finalizes the last candidate calendar month.
- `GET /api/placements` returns the caller's permitted staff or candidate placement rows.

- [x] **Step 1: Implement repository operations that validate related candidate, submission, assignments, and staff employment before writes.**
- [x] **Step 2: Implement super-admin APIs for staff joining dates, compensation terms, placement lifecycle, candidate joining/end dates, and authorized corrections.**
- [x] **Step 3: Implement role-scoped placement reads for recruiter, technical recruiter, and candidate.** Do not expose another staff member's compensation through joined candidate data.
- [x] **Step 4: Add auditable employment/placement events for actor, timestamp, changed fields, and reason where an admin correction is made.**

### Task 3: Generate salary periods and record external payments

**Files:**
- Create: `src/lib/payroll/repository.ts`
- Create: `src/app/api/admin/payroll/route.ts`
- Create: `src/app/api/admin/payroll/[periodId]/payments/route.ts`
- Create: `src/app/api/payroll/route.ts`
- Modify: `src/app/api/webhooks/process-task/route.ts` only if existing worker scheduling is used

**Interfaces:**
- `ensureSalaryPeriods(employmentId: string, throughDate: string): Promise<SalaryPeriod[]>` inserts missing anniversary periods idempotently and snapshots active salary terms.
- `POST /api/admin/payroll/[periodId]/payments` accepts `{ amount, currency, paidAt, externalMethod, externalReference?, notes? }`, and rejects mismatched currency or amounts exceeding the outstanding amount unless an explicit correction is recorded.
- `GET /api/payroll` returns only the caller's salary periods and payment history; super admin sees the permitted workspace summary.

- [x] **Step 1: Generate salary periods from the actual join date up to a bounded horizon; store explicit start, end-exclusive, and due dates.**
- [x] **Step 2: Make compensation changes effective-dated and preserve the terms snapshot for already-created periods.**
- [x] **Step 3: Add append-only external payment entries with transaction reference, actor, and partial-payment support; compute balances from entries.**
- [x] **Step 4: Add explicit admin adjustments/corrections with reason and audit event; do not guess proration for a partial salary period.**
- [x] **Step 5: Expose role-scoped salary and payment summaries for recruiter/technical recruiter accounts.**

### Task 4: Track placement months and technical recruiter commissions

**Files:**
- Create: `src/app/api/admin/placements/[id]/months/route.ts`
- Create: `src/app/api/admin/commissions/route.ts`
- Create: `src/app/api/admin/commissions/[id]/route.ts`
- Create: `src/app/api/commissions/route.ts`
- Modify: `src/lib/placements/repository.ts`
- Modify: `src/lib/payroll/repository.ts`

**Interfaces:**
- `ensurePlacementMonths(placementId: string)` creates missing calendar months beginning at actual joining and closes periods at actual end date.
- `POST /api/admin/commissions` creates the agreed placement commission, credited technical recruiter, milestone, amount, currency, and due date.
- `PATCH /api/admin/commissions/[id]` approves/changes eligibility with audit history; the first business default is one-time fixed amount eligible at actual candidate start.
- Commission payments use the shared external payment ledger with `category = 'commission'` and a commission reference.

- [x] **Step 1: Generate candidate placement calendar months for active placements and finalize a partial last month when employment ends.**
- [x] **Step 2: Create recruiter-credit commission entries from the recorded placement terms and actual-joining milestone; preserve attribution after later assignment changes.**
- [x] **Step 3: Add admin review/approval and external partial/full commission payment recording.**
- [x] **Step 4: Expose only the technical recruiter's own commission terms, eligible entries, approvals, and payment history.**

### Task 5: Build the dashboard and role-specific views

**Files:**
- Create: `supabase/migrations/20261011000500_payroll_dashboard_metrics.sql`
- Modify: `src/app/api/dashboard/route.ts`
- Modify: `src/components/dashboard-overview.tsx`
- Modify: `src/components/app-sidebar.tsx`
- Use: `src/app/dashboard/team/page.tsx` from the Staff Roles and Candidate Assignments plan
- Create: `src/app/dashboard/placements/page.tsx`
- Create: `src/components/placement-management.tsx`
- Create: `src/app/dashboard/payroll/page.tsx`
- Create: `src/components/payroll-management.tsx`
- Create: `src/app/dashboard/commissions/page.tsx`
- Create: `src/components/commission-management.tsx`
- Modify: `src/app/dashboard/page.tsx`

**Interfaces:**
- `GET /api/dashboard` returns role-scoped counts/lists for pending approvals, assignment/review needs, active placements and date milestones, salary due/overdue and outstanding totals, commission queues, and capture failures.
- Financial totals are grouped by ISO currency. Table rows link to the record/action that needs attention.
- `/dashboard/placements`, `/dashboard/payroll`, and `/dashboard/commissions` are role-gated and reuse the same scoped APIs.

- [x] **Step 1: Extend dashboard metrics using service-side role checks and bounded database aggregates; never combine different currencies.**
- [x] **Step 2: Put approval, candidate join/end, salary, commission, and capture queues at the top of the super admin dashboard.**
- [x] **Step 3: Add searchable/filtered placement, salary, and commission tables with expandable histories and admin actions.**
- [x] **Step 4: Add role-specific sidebar and candidate placement views that reveal only each viewer's records.**
- [x] **Step 5: Review all read/write routes against the spec's authorization matrix and manually walk through salary anniversary, placement month, partial payment, commission, and empty/error states.**

---
