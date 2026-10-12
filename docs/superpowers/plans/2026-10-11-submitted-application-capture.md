# Submitted Application Detail Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Save the final answers entered on supported recruiting portals and show those answers on the matching application record.

**Architecture:** Keep the extension's existing intent and submission-event lifecycle. Add a server-validated, allowlisted answer snapshot linked to an intent and attempt, then expose it through the existing application-capture workspace with retries that are safe to repeat.

**Tech Stack:** Next.js 16.3.8 route handlers, TypeScript, Supabase Postgres, browser-extension MV3 JavaScript.

**Spec:** `docs/superpowers/specs/2026-10-11-recruiting-operations-and-payroll.md`

## Implementation status

Implemented in the workspace and regression-verified. Live database activation is pending. See [setup and verification](../../operations/recruiting-operations.md) for the final file mapping, migration order, and live verification limits.

## Global Constraints

- Read the installed Next.js 16.3.8 guides in `node_modules/next/dist/docs/` before editing application code.
- Do not add dependencies or edit older deployed migrations; use a new forward-only Supabase migration.
- Keep portal submission user-controlled; the extension captures fields and does not press final submit.
- Capture only relevant allowlisted answers. Never store passwords, credentials, payment secrets, file bytes, or session tokens.
- Submission observation, success evidence, and email confirmation remain separate states.
- Preserve current resume-based role recommendations and safe autofill behavior.

## Review Focus

- An extension retry for the same intent/attempt must not create a second answer snapshot or submission.
- React-controlled inputs, selects, radios, and edits made after autofill must be reflected in the final snapshot.
- Multi-step forms retain earlier answers while recording answers from the final step.
- Validation error pages and uncertain success messages must not mark an application submitted or confirmed.
- A revoked, expired, pending, or unassigned extension actor cannot upload or read another candidate's snapshot.

---

### Task 1: Add a private snapshot record and validation boundary

**Files:**
- Create: `supabase/migrations/20261011000300_application_answer_snapshots.sql`
- Create: `src/lib/capture/snapshot.ts`
- Modify: `src/types/database.ts`

**Interfaces:**
- `ApplicationAnswer = { key: string; label: string; value: string }`.
- `ApplicationAnswerSnapshot = { id: string; intent_id: string; candidate_id: string; submission_id: string | null; attempt: number; revision: number; answers: ApplicationAnswer[]; observed_at: string }`.
- `validateApplicationAnswers(input)` accepts bounded answer arrays and returns normalized allowlisted answers or a validation error.
- Table uniqueness on `(intent_id, attempt, event_key)` makes network retries idempotent; later explicitly new revisions remain traceable.

- [x] **Step 1: Inspect the current `application_intents`/`browser_capture_events` schema and extension event validator.**
- [x] **Step 2: Add an RLS-protected answer snapshot table with candidate, actor, intent, optional submission, attempt, event key, revision, JSON answers, portal URL, profile version, and observed/created timestamps.** Do not grant authenticated direct writes.
- [x] **Step 3: Implement bounded validation for answer count, key/label/value lengths, duplicate keys, and rejected sensitive field names.**
- [x] **Step 4: Keep the service write behind a database function or the existing server-only database layer and verify its actor, active role, intent ownership, and candidate assignment.**

### Task 2: Capture final portal answers and submit them idempotently

**Files:**
- Modify: `browser-extension/content.js`
- Modify: `browser-extension/background.js`
- Modify: `src/lib/capture/server.ts`
- Modify: `src/app/api/extension/events/route.ts`
- Modify: `src/app/api/extension/auto-submit/route.ts`
- Modify: `src/app/api/extension/intents/[id]/route.ts`
- Modify: `src/app/api/application-intents/[id]/events/route.ts`

**Interfaces:**
- `captureApplicationAnswers(document)` returns only visible, named, allowlisted text/select/choice fields and omits passwords, credentials, files, payment controls, and uncertain fields.
- `recordObservation(actorId, event)` remains responsible for event status; answer persistence is associated with `intentId`, `attempt`, and `eventKey` and returns the snapshot id/revision.
- Extension requests identify the current tab intent and selected candidate; the server verifies the relationship rather than trusting extension-provided ownership.

- [x] **Step 1: Add content-script field collection that reads current DOM control values immediately before reporting a submission attempt, including applicant edits and supported multi-step answers.**
- [x] **Step 2: Send the bounded snapshot through the existing background request flow with a stable event key for retries and without changing autofill or manual submit behavior.**
- [x] **Step 3: Persist snapshot and status event with independently checked status semantics; validation or sync failure never becomes a successful submission.**
- [x] **Step 4: Make submission upsert/link behavior idempotent for the same intent and attempt while preserving existing duplicate warnings and email confirmation fields.**
- [x] **Step 5: Keep recruiter attestations clearly labeled and unable to impersonate extension field snapshots.**

### Task 3: Show submitted answers in the workspace

**Files:**
- Modify: `src/app/api/application-intents/route.ts`
- Modify: `src/app/dashboard/application-capture/page.tsx`
- Create or modify: `src/components/application-answer-snapshot.tsx`
- Modify: `src/app/dashboard/submissions/page.tsx`
- Modify: `src/types/database.ts`

**Interfaces:**
- Authorized intent/submission reads return snapshot revision metadata and answers only for candidates the viewer can access.
- The UI labels answer records with portal, attempt, capture time, and confirmation state; it never presents autofill output as submitted proof.

- [x] **Step 1: Add assignment-scoped API reads for snapshots and include revision/event metadata.**
- [x] **Step 2: Add a detail panel on application capture and submission views for the final submitted answers.**
- [x] **Step 3: Show an empty/manual-review state when a portal does not provide a complete snapshot, and keep observed/confirmed labels distinct.**
- [x] **Step 4: Verify denied reads, revoked credentials, repeat event delivery, changed answers, and portal validation failures against the acceptance criteria.**

---
