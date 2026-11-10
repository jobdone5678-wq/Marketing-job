# Jobright-Observed Application Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match the observed Jobright application workflow with factual multi-candidate autofill, contextual JD resumes, reviewable answers and exact application snapshots.

**Architecture:** Extend the existing Manifest V3 copilot and 3.1.0 AI-resume task flow. Separate candidate facts, job context, form discovery, proposed values, reviewed writes and evidence snapshots. Reuse the authenticated provider/worker and existing capture state machine; add a versioned screening-answer task path where the current direct route lacks those controls.

**Tech Stack:** Next.js 16.3.8, React 19, TypeScript, existing OpenAI-compatible SDK, Zod, Chrome MV3 JavaScript, existing DOCX engine, Node tests and Playwright. No new provider or UI library is assumed.

**Spec:** `../specs/2026-10-21-jobright-observed-workflow.md`. Read its observation ledger and contract boundaries before implementation. This is a proposed plan, not evidence of full Jobright parity or approval to implement.

## Global Constraints

- Keep provider keys on the server; no direct BYO API key stored in the extension.
- Unknown facts stay unknown. Preserve 0 and false; never infer a legal or demographic answer.
- Candidate, JD, draft, reviewed answer and attached-file identities must agree.
- No fixed ten-application cap; workspace quotas and storage limits still apply.
- Retain existing APIs and contracts except the explicitly versioned screening task addition described below. Preserve authentication/OAuth and capture states.
- No final employer submission, CAPTCHA bypass, account creation or private candidate upload during reference inspection.
- No product source changes in this planning phase; preserve unrelated working-tree changes.
- Before Next.js implementation, read the relevant installed guide in `node_modules/next/dist/docs/`.

## Review Focus

1. A zero-years profile, null sponsorship and a non-US candidate must not acquire guessed facts — Task 2.
2. Two candidates and simultaneous tabs on similarly named jobs must not exchange fields, drafts or files — Tasks 3 and 7.
3. Controlled React inputs, duplicated labels and conditional work-history rows must retain the intended values after rerender — Task 4.
4. A provider timeout, exhausted budget, revoked credential or reassignment must yield an explicit recoverable/denied state without fallback content — Tasks 5 and 6.
5. Reload/back navigation, manual correction and repeated submission signals must retain the right reviewed answers and exact resume, without false confirmation — Task 7.

## Shared proposed interfaces

These names describe new modules to create, not existing exported APIs.

- `FactValue`: `string | number | boolean | string[] | null`; `CandidateFact`: `{id:string, value:FactValue, evidence:string}`.
- `CandidateContext`: `{candidateId:string, source:'connected'|'uploaded', version:number, factsHash:string, facts:Record<string,CandidateFact>}`. Connected facts are refreshed from the server, not accepted from a browser-provided profile object.
- `JobContext`: `{jobKey, url, company, title, description, jdHash}`; jobKey includes canonical posting identity, not title alone.
- `FieldDescriptor`: `{fieldKey:string, label:string, kind:'text'|'select'|'radio'|'checkbox'|'date'|'combobox'|'file', options:{id:string,label:string,value:string}[], groupKey:string|null, required:boolean, editable:boolean}`. DOM element handles remain in the content-script adapter and never go to the server.
- `FillDecision`: `{fieldKey, status: 'supported'|'needs_review'|'unknown'|'excluded', value?, factIds, reason}`.
- `FillSession`: `{sessionId, candidateId, factsHash, jobKey, jdHash, revision}`; all preview/write/undo actions carry this identity.
- `WriteReceipt`: `{fieldKey:string, previousValue:FactValue, writtenValue:FactValue, sessionId:string}`. A receipt proves a verified local write, not employer submission.
- `QuestionDescriptor`: `{fieldKey:string, label:string, kind:'text'|'choice'|'boolean'|'number', options:{id:string,label:string,value:string}[]}`; question identity includes its text/options and current application session.
- `candidateSource`: `{source:'connected',candidateId:string,version:number,factsHash:string}` or `{source:'uploaded',candidateId:string,sourceText:string,sourceHash:string}`. The server authorizes the connected candidate or reparses the uploaded source; it never accepts original file bytes or provider keys here.
- Screening v2 request: `{version:2, consent:true, candidateSource, jobContext, sessionId, questions}`; response: `{version:2, taskId, status, answers:Record<string,string>, decisions:FillDecision[]}`. `answers` is an adapter containing only approved supported values, not an invitation to apply raw model output.

## Task 1: Complete the observable reference baseline

**Files:** Extend the spec's ledger and `docs/operations/jobright-observation-2026-10-21/`; do not modify product code.

**Consumes:** OBS-01 through OBS-06, the existing open Greenhouse observation tab.
**Produces:** A behavior matrix with each feature marked observed, publisher-described, blocked or not present.

- [ ] Record the current verified profile gate and collapse/reopen behavior. Keep the installed version unknown unless it is actually visible.
- [ ] After the user completes Jobright profile setup, observe ready state, field preview, repeatable sections, question handling, resume creation/editing/download, attachment and tracking. Use a user-approved synthetic profile/test environment for actions that transmit data; stop before employer submission.
- [ ] Record actual UI actions and screenshots, including warnings and failure states. Do not infer proprietary algorithms from percentages or marketing claims.
- [ ] Review the matrix with the user. Expand implementation scope only for observed behavior or clearly labeled product choices; retain blocked items as release criteria.

**Exit:** Full parity can be judged only for observed rows. The present profile gate does not block independent safety corrections, but blocks a claim of exact feature parity.

## Task 2: Remove guessed answers and close screening candidate access

**Files:** Modify `browser-extension/background.js`, `browser-extension/content.js`, `src/app/api/extension/ai-answers/route.ts`. Extend `tests/resume-autofill.test.mjs`; create `tests/extension-screening-access.test.mjs`.

**Consumes:** Existing shared `candidateAccess` authorization and confirmed source facts.
**Produces:** A factual baseline with no fabricated fallback answers and authorized screening access.

- [x] Write failing cases: unknown years stays blank; 0 remains 0; missing country stays blank; current salary cannot fill expected salary; null work authorization remains unanswered; missing notice does not become Immediately.
- [x] Add denial cases for another client's candidate, an unassigned recruiter, a technical recruiter without tailoring permission, an inactive account and an unreviewed profile. Assert no provider invocation on rejection.
- [x] Run `node --experimental-strip-types --test tests/resume-autofill.test.mjs tests/extension-screening-access.test.mjs` and observe the expected assertion failures before implementation.
- [x] Replace templated screening fallbacks with explicit unavailable/unknown decisions. Use `candidateAccess` and the same reviewed-source/role rules as resume generation. Preserve explicit false values without converting null to No.
- [x] Re-run the cases; inspect only this task's diff. Keep missing information visible for recruiter completion.

## Task 3: Introduce coherent context and form readiness

**Files:** Create `browser-extension/candidate-context.js`, `browser-extension/job-context.js`, `browser-extension/fill-session.js`. Integrate into `content.js`, `background.js`, `resume-workflows.js`, `manifest.json` and popup files. Create `tests/extension-fill-session.test.mjs`.

**Consumes:** Existing candidate selection, reviewed source upload, JD detection and per-job resume scope.
**Produces:** `CandidateContext`, `JobContext`, `FillSession`, and `readiness(context): {ready:boolean, reasons:string[]}`.

- [x] Write failing tests for absent candidate/JD, unreviewed facts, stale JD during generation, same-title postings with different IDs, and concurrent candidates in two tabs.
- [x] Test that account connection alone does not mean candidate/profile readiness; uploaded sources can be ready locally while AI service access remains unavailable.
- [x] Implement context modules and stable session hashes. Tie late responses, review flags, undo records and attachments to the session. Never change another tab's active candidate implicitly.
- [x] Replace ambiguous panel state with a compact readiness checklist and one primary next action. Keep the collapsible panel/launcher behavior verified in OBS-04 and existing Nextkinlife branding/footer.
- [x] Run the session test and existing `extension-tailoring-browser`, `extension-resume-history` and `browser-extension-runtime` suites. Expect stale responses rejected and all histories preserved.

## Task 4: Build explainable autofill with tested platform adapters

**Files:** Create `browser-extension/form-discovery.js`, `field-mapping.js`, `field-writer.js`, `adapters/{generic,greenhouse,lever,ashby,workday}.js`. Modify manifest/runtime integration. Create `tests/extension-form-adapters.test.mjs` and synthetic HTML fixtures under `tests/fixtures/extension-forms/`.

**Consumes:** Task 3 contexts. `discoverFields(root): FieldDescriptor[]`, `planFill(fields,context): FillDecision[]`, `applyFill(decisions,session): WriteReceipt[]` are the new module boundaries.
**Produces:** Stable field decisions, verified writes and per-operation undo, plus a list of unresolved fields.

- [ ] Write failing fixture tests for text/email/phone/date, select, radio and non-consent checkbox, React combobox, asynchronously loaded options, negative Boolean wording and duplicate labels.
- [ ] Add work/education repetition tests with group-specific dates and employers, manually edited values, controlled rerenders, SPA transitions, open shadow roots and an inaccessible-frame manual fallback.
- [ ] Implement label/legend/ARIA/autocomplete matching with adapter-provided platform hints. Prefer exact semantic evidence; ambiguous fields become needs_review.
- [ ] Apply supported values through framework-safe writers and verify the resulting state. Default filling requires a recruiter action; preserve existing values unless explicitly reviewed for replacement. Undo restores only extension-owned values that have not subsequently been edited.
- [ ] Add narrowly scoped frame support only for tested ATS hosts. Do not silently expand permissions or claim closed-root/cross-origin support when unavailable.
- [ ] Run `extension-form-adapters`, `resume-autofill`, `extension-domain-exclusions` and installed-extension smoke tests. Require all adapters' contract fixtures to pass before labeling a portal supported.

## Task 5: Add grounded, option-aware screening answers

**Files:** Create `src/lib/extension-answers/{schema,handler,repository}.ts`, `browser-extension/answer-review.js`, `src/app/api/extension/answer-drafts/route.ts`, and `supabase/migrations/20261021000100_extension_screening_tasks.sql`. Modify task types/handlers, processing allowlists and shared task-access SQL as required. Keep `/api/extension/ai-answers` as a compatibility adapter. Create `tests/extension-answer-drafts.test.mjs` and `tests/extension-answer-database.test.mjs`.

**Consumes:** Tasks 2–4; existing `structuredAI`, task leases, provider allowance and extension credentials.
**Produces:** Screening v2 request/response, durable `application_answers` tasks, evidence-bearing decisions and explicit reviewed insertion.

- [ ] Write failing contract tests for invalid option IDs, absent evidence, prompt injection in JD/questions, unknown years/sponsorship, unsupported behavioral stories, candidate reassignment, and actor-scoped task results.
- [ ] Add database tests for task kind/access, atomic quota reservation, lease recovery and two actors attempting the same draft. Uploaded tasks remain actor-scoped without creating a portal candidate record.
- [ ] Apply the migration only in an isolated test database first. Reuse existing worker/provider budgeting, rather than direct unmetered SDK calls. Keep null distinct from false and restrict choice answers to actual options.
- [ ] Implement a per-answer preview with source references, editable draft, explicit Accept & Fill, and undo. Text edits become reviewed recruiter answers; option changes invalidate the old selection. Never auto-write a raw provider response.
- [ ] Preserve old request clients through the compatibility adapter; return only supported answers in its `answers` map. Do not mix unreviewed AI text into factual autofill.
- [ ] Run the new answer suites plus task-process, task-execution-safety, AI output-contract and candidate-access regressions. Expect denied requests to make no provider call and retryable errors to remain recoverable.

**Backend requirement:** This task is an explicit additive API/database change. It is not covered by a frontend-only scope; its contract and migration need review before implementation/deployment.

## Task 6: Validate and refine the existing contextual resume workspace

**Files:** Modify only as justified by the reference matrix: `src/lib/tailored-resumes/extension-{content,task,service}.ts`, `browser-extension/resume-workflows.js`, `answer-review.js` and resume-review UI. Extend the existing contextual AI/workflow/tailoring tests.

**Consumes:** Existing 3.1.0 generation, Task 3 session context, and Task 1's observed output controls.
**Produces:** Reviewable candidate/JD-specific resume versions whose evidence and downloaded bytes match the preview.

- [ ] Test missing candidate/JD errors; exact source-fact selection; preservation of every history/education/source section; source-only uploaded resumes; stale profile/JD responses; quota exhaustion, revocation, offline network and worker recovery.
- [ ] Recheck provider connectivity from the service that actually performs inference, using a synthetic prompt. The 2026-10-20 refused gateway is a prior observation, not current proof of availability.
- [ ] Reuse the current fact-ID selection and advisory contextual evidence. Keep numeric ATS coverage separate and calculated from the current generated document. Invalidate old assessments after edits.
- [ ] Add output/editing controls only where the Task 1 matrix or reviewed product choice requires them. Free-form section rewriting needs a separate factual-diff design and validation plan; it is not silently included as “exact Jobright logic.”
- [ ] Generate 25 distinct job contexts for one candidate and two candidates on one posting. Assert distinct history scopes and genuine DOCX round trips, with no fixed ten-job cap.
- [ ] Run `extension-contextual-ai`, `extension-ai-workflow`, `extension-tailor-resume`, `extension-resume-history`, `extension-tailoring-browser` and installed smoke tests. Record live provider validation separately from simulated-provider fixtures.

## Task 7: Bind attachments, answers and capture evidence to one application

**Files:** Modify `browser-extension/content.js`, `background.js`, `fill-session.js`, and existing capture integration only where needed. Reuse `src/lib/capture/snapshot.ts` and existing capture API contracts. Extend application-answer-capture, browser-capture, applied-resume-persistence and browser-extension-runtime tests.

**Consumes:** Reviewed resume bytes/version, reviewed answers and Task 3 session identity.
**Produces:** An exact application snapshot without changing the six existing capture states.

- [ ] Write failing cases for two candidates/tabs, reordered multi-step forms, browser reload, manual corrections, replaced attachments, repeated success messages and submit attempts without success.
- [ ] Attach only the reviewed current-job document. Verify the file input where supported; otherwise expose manual download/attachment. Capture the exact file actually used, not whichever resume was generated most recently.
- [ ] Snapshot final reviewed field values and source/version references, excluding secrets, CAPTCHA, consent and sensitive unrelated inputs. Keep extension observations separate from recruiter attestations and authorized email confirmation.
- [ ] Run capture regressions; assert no duplicate records, no false submitted/confirmed transition, no old-candidate document substitution and no lost earlier-step answers.

## Task 8: Validate supported portals and release a paired update

**Files:** Update `browser-extension/README.md`, `scripts/package-extension.mjs` only if packaging changes, and an implementation/release report under `docs/operations/`. Add adapter fixtures to installed smoke tests.

**Consumes:** Completed tasks and the observation matrix. No task is complete because only its happy path works.
**Produces:** A versioned extension ZIP, corresponding portal/worker build, migration instructions and a measured support matrix.

- [ ] Validate fixtures for Greenhouse, Lever, Ashby and Workday at desktop/tablet/mobile widths; include keyboard navigation and dark/light states. Live observations use approved test data and never submit an employer application.
- [ ] Run `node node_modules/typescript/bin/tsc --noEmit`, scoped ESLint, `node node_modules/next/dist/bin/next build --webpack`, and `node --experimental-strip-types --test --test-concurrency=2 tests/*.test.mjs`. Use approved execution outside the restricted filesystem sandbox if browser bundling cannot resolve installed dependencies there; do not weaken tests to bypass it.
- [ ] Verify installed MV3 behavior and open the ZIP to check all manifest/runtime/adapter assets. Compare preview text with downloaded DOCX text and capture attachment bytes.
- [ ] Review API/migration compatibility and obtain an independent code review. Preserve unrelated edits; inspect only intended diffs. Follow repository permissions for any commit rather than staging the whole dirty tree.
- [ ] Update the feature matrix to verified/partial/manual/unsupported per portal. Release notes state remaining unknown Jobright behaviors and live-provider limitations. Deploy/release only in the separately authorized implementation stage.

## Recommended sequence and completion bar

Task 1's observed baseline and Task 2's factual/access corrections first; then contexts → field adapters → screening answers → resume refinement → capture binding → release. No new direct-provider integration or generic autonomous apply agent is needed.

“Exact functionality works” can be asserted only when the relevant Jobright behavior is observed, an equivalent local acceptance test passes, and the paired extension/portal/worker is live-tested. Current planning result: installed onboarding/collapse behavior verified; active Jobright autofill and generated output still blocked by incomplete profile setup. No implementation was performed in this phase.


## Implementation handoff — 2026-10-21

The authorized completion work is implemented and packaged as 3.2.0. See `docs/operations/extension-completion-progress.md` for exact verification and rulings, and `docs/operations/extension-3.2-release.md` for support/deployment boundaries. Final checks: 481 tests, TypeScript, scoped ESLint, production build, installed MV3 smoke, isolated screening migration, source-matching ZIP, independent review and live synthetic AI evidence validation passed.

The original task checklist above is retained as the broader reference-parity acceptance specification. It must not be read as a claim that unobserved Jobright flows, every ATS variant, repeated history automation or production rollout were completed. Implemented history/frame/ambiguous-control behavior uses the explicit manual fallback. The active Jobright profile gate still limits reference comparisons. Production migration and the matching server/worker/extension rollout remain release actions described in the handoff.
