# Staff Roles and Candidate Assignments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add approved technical-recruiter accounts and enforce history-backed recruiter/technical-recruiter candidate assignments across the workspace and extension.

**Architecture:** Add one forward-only Supabase migration for the role and assignment history, then make the existing profile-access and candidate-access helpers the shared authorization boundary for routes, UI, and extension credentials. Add a super-admin team page for approvals and assignments.

**Tech Stack:** Next.js 16.3.8, React, TypeScript, Supabase Postgres/Auth, existing extension MV3 API.

**Spec:** `docs/superpowers/specs/2026-10-11-recruiting-operations-and-payroll.md`

## Implementation status

Implemented in the workspace and regression-verified. Live database activation is pending. See [setup and verification](../../operations/recruiting-operations.md) for the final file mapping, migration order, and live verification limits.

## Global Constraints

- Read the installed Next.js 16.3.8 guides in `node_modules/next/dist/docs/` before editing application code.
- Do not add dependencies or edit older deployed migrations; use a new forward-only Supabase migration.
- Pending staff accounts cannot use staff APIs, dashboard pages, or extension credentials.
- Super admin retains workspace-wide access; recruiter and technical recruiter candidate access must be assignment-scoped on the server.
- Keep the existing resume-personalization working-tree changes intact.

## Review Focus

- A pending or suspended staff account using a valid session or extension credential must still be denied.
- Changing `candidateId` in a request must not expose an unassigned candidate.
- Client accounts must not assign themselves staff access or change staff ownership.
- Reassigning a candidate must retain prior assignment and submission attribution history.
- Admin account approval and assignment actions must be auditable and must not affect unrelated pending workspace changes.

---

### Task 1: Add the staff role and assignment history schema

**Files:**
- Create: `supabase/migrations/20261011000100_add_technical_recruiter_status_values.sql`
- Create: `supabase/migrations/20261011000200_staff_roles_and_assignments.sql`
- Modify: `src/types/database.ts`

**Interfaces:**
- Add `technical_recruiter` to `AppRole` and `rejected` to `AccountStatus`.
- Add nullable `assigned_technical_recruiter_id` to `Candidate`.
- Create `candidate_staff_assignments` with `candidate_id`, `profile_id`, `assignment_role` (`recruiter` or `technical_recruiter`), `assigned_by`, `started_at`, and nullable `ended_at`.
- Assignment history is append/close only. One active assignment per candidate/profile/assignment role.

- [x] **Step 1: Add only the `technical_recruiter` and `rejected` enum values in the first migration.** Commit this migration before later migrations use the new enum values, since PostgreSQL does not allow a newly added enum value to be used before the migration transaction commits.

- [x] **Step 2: Read the current profile triggers, `get_current_role`, candidate RLS, and extension policies in `supabase/migrations/20261009000100_foundation.sql`, `20261008_email_confirmation_capture.sql`, and `20261009000800_browser_capture.sql`.**

- [x] **Step 3: Add the new assignment columns/history with the second forward-only migration.** Keep `get_current_role()` active-account aware. Add narrowly scoped RLS policies for assignment reads and service writes; deny direct assignment writes to clients and staff.

- [x] **Step 4: Extend `UserProfile`/`Candidate` and add `CandidateStaffAssignment` types in `src/types/database.ts`.**

- [x] **Step 5: Review the migration for existing-row defaults and policy coverage.** Existing recruiter assignments must remain valid, and migration execution must not require a destructive rebuild.

### Task 2: Make role checks and candidate reads assignment-scoped

**Files:**
- Modify: `src/lib/auth/profile-access.ts`
- Modify: `src/lib/auth/require-profile.ts`
- Modify: `src/lib/resumes/repository.ts`
- Modify: `src/app/api/candidates/route.ts`
- Modify: `src/app/api/candidates/[id]/route.ts`
- Modify: `src/app/api/candidates/[id]/documents/route.ts`
- Modify: staff APIs that accept candidate IDs, including `src/app/api/application-intents/route.ts`, `src/app/api/matches/route.ts`, and `src/app/api/packets/route.ts`
- Modify: `src/lib/capture/server.ts`
- Modify: `src/app/api/extension/candidates/route.ts`
- Modify: `src/app/api/extension/quick-pair/route.ts`
- Modify: `src/app/api/settings/route.ts`
- Modify: relevant submission/resume/task/email-confirmation APIs surfaced by the role-scope scan

**Interfaces:**
- `profileAccess(profile, access)` recognizes active technical recruiters for candidate-workflow access while keeping full recruiter/admin-only APIs restricted; rejected/pending/suspended accounts are never active.
- `candidateAccess(profile, candidateId)` returns the candidate only to its owner, super admin, or a staff member with a current assignment.
- Candidate-list APIs return the caller's authorized rows and preserve existing pagination.

- [x] **Step 1: Update shared role guards and `candidateAccess` so super admin remains global, clients remain owner-scoped, and each staff role is assignment-scoped.**
- [x] **Step 2: Route all candidate-ID operations through `candidateAccess` before reading or mutating candidate-specific data. Add a limited technical-recruiting access level and keep vendors, workspace settings, and job-source management for recruiter/super-admin only.**
- [x] **Step 3: Scope the browser extension's candidate list and explicit candidate selection to current assignments.** Keep credential revocation and active-account checks.
- [x] **Step 4: Inspect every `protectedRoute(..., 'staff'...)` and direct role comparison surfaced by `rg` and update role/assignment policy consistently.**

### Task 3: Add staff approval and assignment administration

**Files:**
- Modify: `src/components/signup-form.tsx`
- Modify: `src/app/auth/callback/route.ts`
- Modify: `src/app/api/admin/profiles/route.ts`
- Create: `src/app/api/admin/assignments/route.ts`
- Create: `src/app/dashboard/team/page.tsx`
- Create: `src/components/team-management.tsx`
- Modify: `src/components/app-sidebar.tsx`
- Modify: `src/types/database.ts`

**Interfaces:**
- Admin assignment API: `POST { candidateId, profileId, assignmentRole }`, `DELETE { candidateId, profileId, assignmentRole }`; responses return the active assignment and affected profile/candidate identifiers.
- Team list API uses `/api/admin/profiles` and includes role, status, and display fields only.
- Only super admin can make staff status or assignment changes.

- [x] **Step 1: Allow signup to request `recruiter` or `technical_recruiter`; keep both requests pending. Client signup remains active under the current flow.**
- [x] **Step 2: Extend the admin profile API to approve, reject, or suspend staff and record each status decision.**
- [x] **Step 3: Implement assignment close/create operations with candidate and staff validation plus an `audit_events` entry.**
- [x] **Step 4: Build the team page to review pending staff, set status, search staff/candidates, and assign or remove recruiter roles.**
- [x] **Step 5: Add the Team navigation entry for super admin and confirm pending accounts do not see staff navigation.**
- [x] **Step 6: Verify the review-focus scenarios with the existing app routes, database policies, and extension credential lifecycle before moving to the next plan.**

---
