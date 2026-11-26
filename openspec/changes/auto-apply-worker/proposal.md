## Why

Unattended application submission is proposed. The current extension autofills the active form and records observed submissions through the Next.js capture path.

## What Changes

- Use a Supabase PostgreSQL queue with unique candidate/posting attempts and explicit leases. Dispatch orchestration through the existing task webhook pattern and recover expired work with `pg_cron`.
- Delegate page interaction to the browser execution boundary. Reconcile live DOM fields with provider metadata, resolve every required answer, and produce a complete plan before writing any control. Park incomplete or unsupported attempts with the specific reason and preserve the tracked application stage.
- Guard the submit boundary against duplicate attempts. Record only confirmed outcomes through the current atomic, idempotent application persistence path. Keep ambiguous post-submit outcomes out of normal retries. Retry transient pre-submit failures under the lease policy.

Behavior requirements are in [auto apply submit](specs/auto-apply-submit/spec.md).

Implementation references include [leased background task pattern](../../../docs/agents/workers.md), [live form observation](../../../extension/lib/form.ts), [browser-side writes](../../../extension/lib/tools/executor.ts), [submission evidence](../../../extension/lib/applicationCapture.ts), [application recording](../../../src/app/api/extension/auto-submit/route.ts), [tracked application state](../../../src/lib/jobs/application-state.ts).

<details>
<summary>Original Freehire reference</summary>

> Historical implementation and evidence from the Go/SvelteKit project. Paths, deployment commands, progress and measurements refer to that source.

## Why

Nothing in the system can submit a job application without the candidate present. `internal/applyform` only describes a form; `internal/autofillagent` (via the browser extension) only fills whatever page the candidate is already looking at. A candidate matched to a job still has to open the posting themselves before anything moves. A spike (2026-09-02) confirmed this is buildable — a real Greenhouse posting's rendered form can be scanned, reconciled and filled headlessly — and that the naive approach (trusting `internal/applyform`'s stored API-only schema) would silently under-fill: the live DOM carried 36 fields against 17 the stored schema declares. A follow-up check ruled out the simpler-sounding alternative: neither Greenhouse, Lever nor Ashby exposes a submission API this project could call directly (Greenhouse's exists but requires the *employer's own* API key), so browser automation is the only path open to a platform that is not the employer.

## What Changes

- Add a new outbox-style queue, `auto_apply_queue`, holding one row per (user, job) attempt, drained with the same lease/attempts mechanics `internal/outbox.RunPool` already provides elsewhere in the codebase.
- Add `cmd/auto-apply`, a run-once-and-exit cron worker that claims queue rows, assembles the candidate's existing profile answers via `internal/candidateprofile` (extracted from the extension-autofill handler so both paths share one assembler — no new answer source), and delegates the actual browser work to `internal/atsapply`.
- Add `internal/atsapply`, a new Go package (`chromedp`, no second language or process) that scans a job's live rendered application-form DOM, reconciles it against the ATS's own question API where one exists (Greenhouse, Ashby; Lever has none), resolves each field against the answers it was given, and submits the application **only if every required field resolved** — otherwise it touches nothing on the page and reports which fields it could not answer and why. A spike measured `chromedp` (against a real installed Chrome, with one launch flag) matching or beating a Python/Patchright alternative on every automation-detection signal checked, at the cost of no second language and no second deploy artifact — see design.md's Decisions.
- On a successful submission, the worker records it through `db.Queries.MarkJobApplied` (the same statement `jobtracking`'s own manual-apply path runs) inside one transaction with retiring the queue entry, so `user_jobs`/`application_events` never diverge between an automated and a manual application, and a double-claim of the same row cannot double-submit. That guarantee covers the concurrent-worker race specifically — a crash between the employer accepting the submission and this transaction committing is a separate, unclosed gap neither this system nor the ATS platforms it targets can close today; see design.md's Decisions.
- On an unresolved (parked) attempt, the queue row is marked with the unmapped reasons; `user_jobs.stage` is deliberately left untouched, since "parked, needs more answers" is not part of that table's controlled stage vocabulary.

Explicitly **not** part of this change (captured in the design doc, `docs/superpowers/specs/2026-09-02-auto-apply-worker-design.md`):
- What populates `auto_apply_queue` (a candidate action vs. a standing per-user rule) — the worker only drains it.
- Persisting the DOM-scan/reconciled form schema — this change scans live, on every run, and stores nothing new; `internal/applyform`'s own stored schema is not read by this worker.
- Automatically retrying a parked attempt once the candidate supplies the missing answer.
- Routing a parked attempt into the extension's `RunAgentAutofill` as a guided manual finish.

## Capabilities

### New Capabilities
- `auto-apply-submit`: unattended submission of a job application through a queued (user, job) attempt — claiming the queue, resolving the candidate's known answers against the job's live rendered form, and submitting only when every required field is answered, recording the outcome through the existing application-tracking path.

### Modified Capabilities
(none — `apply-form-capture` and `extension-autofill` are unchanged; this worker reads neither)

## Impact

- **New table**: `auto_apply_queue` (migration) — done.
- **New Go packages**: `internal/autoapply` (queue-drain domain logic — done), `internal/atsapply` (chromedp-based DOM scan/reconcile/resolve/fill/submit — not yet built).
- **New Go worker**: `cmd/auto-apply` — done, currently backed by an HTTP `SidecarClient` implementation that this change is replacing with an in-process `internal/atsapply` implementation of the same interface; no other part of `cmd/auto-apply` changes.
- **Extracted**: `internal/candidateprofile`, pulled out of `internal/handler` (was unexported and handler-scoped) — done. Both the extension-autofill path and `cmd/auto-apply` now share one profile assembler.
- **Existing code touched, not modified in behavior**: `internal/candidateprofile` (read-only reuse) and `db.Queries.MarkJobApplied`/`LockJobForApply` (called, not changed).
- **Dependencies**: adds `chromedp` (pure Go) and requires a Chrome/Chromium binary on the deploy host; no second language, no new deploy artifact beyond the one binary. (Superseded: this change originally proposed a Python/Playwright/Patchright sidecar — see design.md's Decisions for why it was dropped.)
- **Operational**: a new cron worker to run alongside the existing fleet (`cmd/capture-apply-form` et al.); no new service to deploy.

</details>
