# Portal Resume Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for native execution, or superpowers:subagent-driven-development if the user selects that method. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore portal API availability and make portal PDF/DOCX uploads populate an editable, evidence-backed candidate profile with reliable progress and retry.

**Architecture:** Recover missing dependencies and shared resume-engine source before changing extraction. Retain private storage, authenticated task processing, leases, budgets and confirmation; diagnose the failing extraction boundary and repair only the established cause. Keep extension response handling separate from the portal extraction pipeline.

**Tech Stack:** Installed Next.js version from package-lock (currently specified as 16.3.8), React 19, TypeScript, Supabase, pdfjs-dist, mammoth, Zod, OpenAI-compatible server client, Node tests and Playwright.

**Spec:** `../specs/2026-10-21-portal-resume-recovery-and-copilot-design.md`.

## Scope and subsequent deliveries

This is the first independent delivery from the approved specification. It repairs portal uploads and the connection error shown by the user. Separate implementation plans follow for signed-in outside accounts/portal roles, the screenshot-grounded panel and canonical master, durable per-JD generation/downloads, and dropdown/address autofill. Those require their own interfaces and access tests; this plan does not quietly implement a new identity or database model.

## Global Constraints

- Repair resume uploads in the NextKinHR portal first.
- Preserve authentication, storage, leases, AI budgets and evidence validation.
- Missing or unsupported facts remain unknown.
- Saving remains an explicit review/confirmation action.
- Preserve unrelated working-tree changes; no blanket Git restore or directory deletion.
- Follow installed Next.js guides before editing Next.js code.
- No deployment, production migration or bulk candidate-data reprocessing.
- No document contents, credentials or raw provider bodies in diagnostics.

## Review Focus

1. A package/source directory can disappear while a stale development server remains listening: assert required shared imports resolve and unauthenticated APIs return structured 401/403 rather than plain 500 — Tasks 1 and 6.
2. A readable PDF may work in standalone Node but fail in Next.js: use the server execution path and retain a representative synthetic fixture — Tasks 3 and 6.
3. An old document response can arrive after a replacement upload or unmount: reject obsolete results and never populate the wrong draft — Task 5.
4. A task can succeed without an extraction, be cancelled, or outlive a polling window: exit busy state with a recoverable message instead of infinite polling — Task 5.
5. An unknown extracted field must not erase a manually entered fact, while false and zero must survive merging — Task 5.

---

### Task 1: Recover the development runtime and shared engine

**Files:**
- Restore missing: `browser-extension/` from verified `browser-extension-v3.2.1/` and matching tracked declarations where absent.
- Inspect: `package.json`, `package-lock.json`, `next.config.ts`.
- Test: `tests/extension-source-integrity.test.mjs`.
- Record: `docs/operations/portal-resume-recovery.md`.

**Interfaces:**
- Consumes: the remaining 3.2.1 source directory, tracked engine declarations and existing portal imports.
- Produces: canonical `browser-extension/resume-engine.js` with the existing exports and an installed Next.js runtime matching the lockfile. No caller import paths change in this delivery.

- [ ] Verify what still exists: source directories, package-lock state, installed Next package, executable versions and the current server owner. Do not stop an unrelated server or overwrite surviving source files.
- [ ] Extend the source-integrity test to assert the shared engine and manifest exist, the restored engine bytes match the available 3.2.1 artifact, and required server exports load. Run `node --experimental-strip-types --test tests/extension-source-integrity.test.mjs`; expect the current missing-source state to fail.
- [ ] Restore only missing canonical source files. Recover the missing `.d.ts` from Git and compare declarations against actual exports before adding any missing declarations. If remaining source and archive disagree, record hashes and preserve both instead of guessing.
- [ ] If Next.js installation is incomplete, reinstall locked dependencies using `npm.cmd ci` after checking no concurrent installation is active. Preserve package/lockfile versions. Read the restored installed routing, serverExternalPackages and Turbopack guides.
- [ ] Run the source-integrity test again, resolve Next/package.json and verify every imported package exists. Start/restart only the task-owned server or coordinate the existing user server. Check localhost API status without credentials; expect structured authorization failure, never raw 500.
- [ ] Commit only recovered source and the recovery record after checking the precise diff. Do not stage user deletions or unrelated changes.

### Task 2: Handle non-JSON connection failures safely

**Files:**
- Create: `browser-extension/api-response.js`.
- Modify: `browser-extension/background.js`, `browser-extension/popup.js`, `browser-extension/popup.html`.
- Modify: `scripts/package-extension.mjs` only if its file inventory is explicit.
- Test: `tests/extension-connection-errors.test.mjs`.

**Interfaces:**
- Produces: `NextkinAPI.readJSON(response, operation): Promise<object>`; throws a sanitized Error containing operation and HTTP status for non-JSON responses, preserves a valid JSON error message, and never includes raw HTML/body text.
- Consumes: existing quick-pair, pairing and candidate-refresh responses. Token storage and request payloads remain unchanged.

- [ ] Add tests with `new Response('Internal Server Error', {status:500})`, HTML 502, JSON 401 and valid pairing JSON. Assert messages identify server failure/status, never expose SyntaxError or response HTML, and failed responses never save credentials.
- [ ] Run `node --test tests/extension-connection-errors.test.mjs`; expect failure before the helper exists.
- [ ] Implement the helper and load it before consumers using existing popup script and service-worker import patterns. Replace direct JSON parsing in the connection paths only; preserve successful response validation and credential behavior.
- [ ] Run the new test and existing installed-extension/source-integrity tests. Verify the package inventory includes the helper. Commit only these files.

### Task 3: Pinpoint and repair the portal extraction boundary

**Files:**
- Modify as the reproduced failure requires: `src/lib/resumes/validation.ts`, `src/lib/ai/resume.ts`, `src/lib/ai/client.ts`, `src/app/api/tasks/[id]/process/route.ts`.
- Create: `src/lib/resumes/processing-error.ts`.
- Tests: `tests/resume-processing.test.mjs`, `tests/portal-resume-task.test.mjs`, `tests/ai-provider-adapter.test.mjs`.
- Update: `docs/operations/portal-resume-recovery.md`.

**Interfaces:**
- Preserve `readResume(raw: Buffer, filename: string): Promise<{text:string;pages:number|null;mime:string}>` and `extractResume(task: BackgroundTask)`.
- Produce `resumeProcessingError(stage: ResumeProcessingStage, error: unknown): CaptureError` with stages `document`, `download`, `read`, `cache`, `ai`, `validate`, `save`. Preserve existing CaptureError status/message; map unexpected errors to safe stage-specific text. Server logs contain stage/error class and task ID only.

- [ ] Add a handler test using the existing moduleLoader harness and mocked storage/task DB. Assert read failure prevents provider calls, provider rejection retains its meaningful status, validation failure saves no extraction, and successful explicit facts reach `save_resume_extraction` with the current lease. Assert diagnostic output contains no synthetic resume contents.
- [ ] Reproduce through the current Next server with synthetic PDF/DOCX and controlled provider/database fixtures. Record the exact failing stage before modifying extraction. If runtime recovery alone resolves parsing, retain that reproduction as the regression and do not introduce speculative parser changes.
- [ ] Implement the smallest repair established by that reproduction. Add stage-specific safe errors around the existing pipeline; retain source-hash checks, owner-scoped cache lookup, budget reservation and evidence filtering. Do not bypass validation to make fields appear.
- [ ] Run `node --experimental-strip-types --test tests/resume-processing.test.mjs tests/portal-resume-task.test.mjs tests/ai-provider-adapter.test.mjs`; expect all pass. Cover malformed PDF, password protection, empty/scanned text and DOCX limits without representing unsupported OCR as successful extraction.
- [ ] Record the confirmed cause, runtime and regression evidence. Commit only the targeted repair and tests.

### Task 4: Preserve durable task failure and retry behavior

**Files:**
- Modify only if needed: `src/app/api/tasks/[id]/process/route.ts`, `src/app/api/resumes/[id]/process/route.ts`.
- Test: `tests/portal-resume-task.test.mjs`, `tests/task-claims.test.mjs`.

**Interfaces:**
- Preserve existing request/response contracts: process returns taskId/status; document status returns document/extraction/task. Retry uses the registered document task and does not upload a second private file.

- [ ] Test a busy lease, failed task retry, missing task, owner mismatch, provider timeout and successful task completion. Assert unauthorized requests never claim work and concurrent processing cannot invoke AI twice.
- [ ] Run those tests; retain passing behavior unchanged. Where a test demonstrates a real failure, repair the route using existing claim/retry/finish RPCs. Preserve task actor and assignment checks.
- [ ] Verify terminal errors remain actionable and transient work is not silently declared succeeded. Run `node --experimental-strip-types --test tests/portal-resume-task.test.mjs tests/task-claims.test.mjs tests/resume-ownership-regression.test.mjs`.
- [ ] Commit only changes necessary for a demonstrated failure; skip a redundant code-only refactor.

### Task 5: Make portal review state recoverable and preserve entered facts

**Files:**
- Modify: `src/components/resume-upload-review.tsx`, `src/components/candidate-form.tsx`.
- Create: `src/lib/resumes/draft.ts`.
- Test: `tests/portal-resume-review.test.mjs` using the existing React/Playwright module-fixture approach.

**Interfaces:**
- Produce `mergeResumeDraft(previous: Record<string,unknown>, draft: Record<string,unknown>): Record<string,unknown>`: unknown scalar null/undefined values preserve previous values; explicit false/0/empty string are not treated as missing. Empty history arrays preserve entered histories; nonempty histories remain reviewable replacements.
- Preserve `onDraft(fields, documentId, version)` and explicit Confirm and save profile.
- Poll at 1.5 seconds as today, pause after 120 checks with Check processing status, and invalidate old requests immediately when replacement upload starts. Cancelled/missing-task and succeeded-without-extraction states stop busy and display a recoverable error.

- [ ] Write tests for upload A responding after upload B starts, unmount, cancelled task, missing task, terminal success without extraction, polling pause/resume, retry same document, and unknown draft fields preserving manually entered contact/history values. Assert false and zero survive merging.
- [ ] Run `node --experimental-strip-types --test tests/portal-resume-review.test.mjs`; expect failing assertions before the change.
- [ ] Implement the pure merge helper and use it in CandidateForm. Add a request generation guard to upload and poll, bounded status checking and explicit task-based labels. Distinguish queued from running and keep errors visible beside the upload control.
- [ ] Run the new review tests plus `tests/resume-jobs-ui.test.mjs`. Verify extracted evidence remains inspectable, profile save remains deliberate, and partial drafts do not auto-confirm.
- [ ] Commit the helper, UI change and tests.

### Task 6: Verify the repaired journey through the server runtime

**Files:**
- Create: `tests/e2e/portal-resume-recovery.spec.ts` under the configured Playwright testDir.
- Modify only as needed for isolated fixtures: existing E2E configuration/helpers.
- Update: `docs/operations/portal-resume-recovery.md`.

**Interfaces:**
- Consumes Tasks 1–5. Synthetic fixtures simulate authenticated candidate/staff sessions, storage and provider responses through existing test seams. They must not add a production authentication bypass or consume production records.

- [ ] Test PDF and DOCX upload -> task execution -> populated contact/history fields -> review -> explicit save. Include one Next.js server execution test, not only mocked component requests. Assert unknown visa/authorization stays unknown.
- [ ] Test the server failure path and connection UI; HTTP 500 produces a useful message and no credential write. Assert inactive/unassigned users cannot access a document or process its task.
- [ ] Run the focused unit/regression tests and `node node_modules/typescript/bin/tsc --noEmit`. Run the isolated E2E build/test with `node scripts/e2e.mjs tests/e2e/portal-resume-recovery.spec.ts`; `.next-e2e` must not overwrite the user's `.next`.
- [ ] Inspect the portal upload/review UI in the browser at desktop and narrow widths. Verify loading, review, error, paused checking and retry. Report any live provider/database prerequisite separately from fixture success.
- [ ] Commit only final verification artifacts and relevant fixes. Report exactly what passed and any remaining live-runtime blocker. Prepare the next delivery plan for sign-in/access and the Jobright-style panel after portal recovery is verified.

## Completion boundary

This delivery is complete when the portal server responds normally, the demonstrated extraction failure has a targeted verified repair, uploaded facts populate review without destroying manual data, and the screenshot's raw JSON exception is replaced by an actionable error. It does not claim that the extension redesign, outside-account onboarding or canonical/per-JD PDF workflow has shipped.
