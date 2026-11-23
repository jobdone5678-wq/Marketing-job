# Jobright Parity: Universal Autofill, Remote Rules, Receipt Evidence & Dynamic Resolution

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal.** Close the release blockers in NextKinHR Recruiting Copilot v3.3.19, then improve the autofill and submission outcomes measured against the supplied Jobright v1.26.3 report.

**Architecture.** Reuse paired extension authentication and candidate access checks, the browser receipt queue, and the database submission RPC. Keep bundled ATS rules as the offline fallback for validated remote updates. Use supported browser interactions and provider integrations for autofill and receipt detection.

**Tech stack.** Next.js, React, TypeScript, Chrome Extension Manifest V3, and the Node.js test runner.

**Design reference.** [Jobright parity spec](../specs/2026-11-23-jobright-parity-autofill-ats-spec.md).

## Audit Baseline

- The 19 files in the local v3.3.19 release archive matched the extension source byte for byte. Type checking and 81 targeted tests passed. The full suite reported 162 passes and one failure in the live Lever test. Its failure cause remains unverified.
- The registry includes 81 adapter definitions. End-to-end support is tracked separately for discovery, verified fill, attachment, and receipt detection. The existing saved-only candidate field allowlist passed its contract test.
- The audit verified repository source and local tests. Production ingress controls, deployed migrations, and live coverage across the adapter registry remain unverified. Jobright implementation details come from the supplied report.

## Execution Order

1. **Phase 1.** Approved for local execution. Execute Tasks 0A–0F only, run the offline suite and the release gate below, then stop for review. GitHub push and deployment are outside this execution.
2. **Phase 2.** After Phase 1 review and approval, execute Tasks 4, 5, 1, 2, and 3 in that order. Verify offline fixtures and separately record results on approved test portals.
3. **Phase 3.** Evaluate Tasks 6–10 individually using Phase 2 portal results. Record the unresolved failure rate or latency each task addresses before scheduling it.

**Production handoff.** Apply the Phase 1 forward migration before deploying code that requires its RPC. Verify an authenticated resume upload, a rejected cross-account screening request using controlled test accounts, a Lever fixture with empty URL fields, and receipt recovery with duplicate delivery in an approved deployed environment. Record migration status and results during production review.

## Proposed Approach

For the Lever URL regression, a Lever-only exclusion would be a small patch with narrow coverage. A shared field policy with validation at discovery, draft admission, and write time covers native URL inputs and semantically equivalent text inputs across ATSs. Use the shared policy in Phase 1. Missing candidate URLs stay blank for manual entry. The AI path remains available for actual bio and screening questions.

### Phase 1 verification

Write or extend the named tests first, record each reproduction, apply the smallest change that satisfies the contract, and rerun the named command. When Phase 1 is complete, run `npm run typecheck` and the offline `npm run test:unit`. Record the results from the PostgreSQL fixture for 0D and verify the unpacked extension against local fixtures for the review gate. Leave live smoke checks opt-in. Approval of this document is separate from approval to execute Phase 2.

### Task 0A · Enforce candidate authorization for screening answers

**Files.** `src/app/api/extension/generate-answer/route.ts`, `src/lib/extension-answers/candidate-context.ts`, and the screening answer tests.

**Red/green command.** `node --experimental-strip-types --test tests/generate-answer-authorization.test.mjs tests/ai-screening-scoped.test.mjs`. Add the authorization file with stubbed DB and provider calls. Cover both HTTP methods and verify that generation alone creates no approved answer.

- [ ] Require a valid extension actor and authorized candidate for both generation and saved-answer writes. Reuse the candidate-scoped flow from `answer-drafts`. Resolve the panel's `candidateId` against that actor before reading saved answers, constructing a prompt, calling a provider, or writing.
- [ ] Keep generated drafts separate from candidate-approved reusable answers. Preserve candidate and job scope where applicable, and report a write failure accurately.
- [ ] Verify missing, invalid, and revoked credentials and cross-account reads and writes. Check that rejected requests reach neither the candidate record nor the model provider. Verify successful generation and explicit approval for an authorized candidate.

### Task 0B · Keep resume-derived eligibility in review

**Files.** `src/lib/profile/resume-parser.ts`, `src/components/profile/ProfileView.tsx`, `src/app/api/jobseeker/resume/route.ts`, and the profile and autofill tests.

**Red/green command.** `node --experimental-strip-types --test tests/resume-eligibility-review.test.mjs tests/resume-parsing.test.mjs tests/application-lifecycle.test.mjs`. Add upload-to-projection coverage. Assert that unknown extraction preserves a previously reviewed value and a candidate's explicit clear keeps that field blank.

- [ ] Leave unknown work authorization and age eligibility blank. Preserve reviewed answers and explicit clears when uploading a replacement resume.
- [ ] Require explicit review before newly extracted eligibility answers become available through the saved-only autofill endpoint. Retain its field allowlist.
- [ ] Verify the upload-to-autofill flow with a resume that contains no eligibility statements, a replacement upload with existing reviewed answers, and an explicitly cleared answer.

### Task 0C · Make submission receipt delivery durable and account-scoped

**Files.** `jobright_extension/background.js`, `jobright_extension/panel.js`, and `tests/background-queue.test.mjs`.

**Red/green command.** `node --experimental-strip-types --test tests/background-queue.test.mjs tests/background-storage-proxy.test.mjs`. Extend the worker fixture with failing storage writes, restart simulation against the same store, and a different account on reconnect.

- [ ] Surface storage write errors. Acknowledge a receipt after successful durable enqueue or confirmed backend delivery. Preserve a recoverable error state when both fail.
- [ ] Store the minimum receipt metadata needed for retry. Strip credentials from pending, conflict, and dead-letter records. Restrict queue management to trusted extension surfaces and return redacted status.
- [ ] Bind retry to the original workspace and account. Keep pending events recoverable through disconnect and restart. Resume matching events when that account reconnects.
- [ ] Verify storage rejection plus offline delivery, worker restart, account switching, same-account recovery, and credential redaction for immediate dispatch failures.

### Task 0D · Keep application status and linked records consistent

**Files.** `src/app/api/extension/auto-submit/route.ts`, `src/lib/capture/server.ts`, the submission RPC migrations, and the submission lifecycle tests.

**Migration.** Use a new forward migration at `supabase/migrations/20261123000100_atomic_application_receipt.sql`, after the existing `20261120160000_atomic_submission_dual_write.sql`. Check the proposed timestamp against the migration inventory before implementation and advance it if necessary. Apply the new migration in the PostgreSQL fixture. Keep already-applied migrations intact.

**Red/green command.** `node --experimental-strip-types --test tests/application-receipt-atomicity.test.mjs tests/application-lifecycle.test.mjs tests/submission-events.test.mjs`. Add the atomicity test with failure injection, transactional rollback or reconciliation assertions, and same-posting concurrent receipt coverage.

- [ ] Eliminate the production fallthrough to separate writes when the atomic external-submission RPC fails. For portal intents, commit the linked status updates together or durably record reconciliation work in the same transaction.
- [ ] Make applied-resume archival and answer snapshots recoverable independently using the stable event identity. Keep manual attestation distinguishable from a browser-observed receipt.
- [ ] Verify RPC failure, failure after the authoritative transition, replay, and concurrent events for the same posting. Confirm consistent status in My Applications, Dashboard Overview, and Outside Jobs.

### Task 0E · Authenticate resume parsing and enforce request limits

**Files.** `src/app/api/resumes/parse/route.ts` and the resume parsing tests.

**Red/green command.** `node --experimental-strip-types --test tests/resume-parse-auth.test.mjs tests/resume-parsing.test.mjs`. Add route tests that track body reads and parser calls, including a request without a usable Content-Length.

- [ ] Authenticate before reading multipart input. Enforce an upload limit before multipart parsing and bound parser work per account.
- [ ] Verify unauthenticated requests are rejected before decoding, oversize uploads fail predictably, and authorized PDF and DOCX uploads still work.

### Task 0F · Guard typed fields, recover partial drafts, and isolate live tests

**Files.** `jobright_extension/core/form-discovery.js`, `jobright_extension/core/field-mapping.js`, `jobright_extension/core/application.js`, `jobright_extension/core/field-writer.js`, `jobright_extension/panel.js`, Task 0A's answer admission logic, and `package.json`.

**Red/green command.** `node --experimental-strip-types --test tests/autofill-url-fields.test.mjs tests/ai-screening-answers.test.mjs`. Add an offline Lever fixture with native URL inputs and text inputs named `urls[Twitter]`, `urls[GitHub]`, `urls[Portfolio]`, and `urls[Other]`. Add no-network assertions for the batch and fallback requests, and run a positive bio/screening control.

- [ ] Classify URL fields before AI eligibility using input semantics and normalized names, labels, and adapter hints. Maintain a shared policy for drafts, saved-answer reuse, and field writes. Carry field type into the answer request, and reject structured URL questions at authenticated generation admission, including the fallback and any future stream.
- [ ] Fill an empty URL field only from a candidate-provided absolute HTTP(S) URL validated as a single URL. Keep existing manual values and leave missing or invalid URLs blank with a manual-entry reason. Reject prose and unsafe schemes before DOM writes, including stale cached and generated answers. Never count a rejected value as filled.
- [ ] Assert that valid saved links fill, missing links produce no AI calls, and injected invalid draft or cached values leave the DOM unchanged.

- [ ] Preserve successful first-pass answers and send only unresolved questions through the authenticated fallback while the tab, candidate, and job context still match. Show any questions that still need manual review.
- [ ] Move `tests/lever.test.mjs` and `tests/figma-greenhouse.test.mjs` to the opt-in smoke suite. Use sanitized fixtures, assertions for expected fills, and portable output locations. Verify `npm run test:unit` with external networking disabled.
- [ ] Publish a coverage matrix for discovery, field readback, file attachment, and receipts. Start with Workday, Greenhouse, Lever, Ashby, and SmartRecruiters. Mark each stage as fixture-verified, live-verified, or unverified.

## Global Constraints

- Retain 100% backward-compatibility with the existing 81 adapter hint definitions in `jobright_extension/adapters/ats-adapters.js`.
- All `chrome.storage.session` and `chrome.storage.local` operations must be mediated inside `jobright_extension/background.js` or safely guarded in content scripts.
- Chrome MV3 background workers do NOT have Node.js globals like `Buffer`; all binary/Base64 conversions must use `Uint8Array` / `btoa()`.
- Chrome `runtime.onMessage` async listeners must use `sendResponse(...)` and synchronously `return true;`.
- Manifest content scripts and classic script injections must parse without top-level ESM syntax. For Tasks 5, 7, 8, and 10, load classic helpers in Node tests with `vm.Script`, or import dedicated pure modules that are bundled before browser use. Verify against the scripts actually shipped in the manifest or injected by the worker.
- No telemetry or discovery payload may transmit raw user input values, passwords, credit card numbers, or PII.
- Preserve ATS authentication and framing protections. Use top-level tabs or provider-supported embedding when an ATS disallows framing.
- Keep third-party cookies, authentication headers, and credentials out of option matching, receipt collection, and telemetry.
- Keep third-party credentials out of extension-to-page bridges and page storage. Field diagnostics remain opt-in and application-scoped.
- All unit tests must execute cleanly using `node --experimental-strip-types --test tests/<name>.test.mjs`.

## Review Focus

1. Verify custom control values after the page rerenders and leave ambiguous answers for candidate review.
2. Tie every confirmed receipt to the candidate's attempt and posting. Keep ambiguous outcomes pending verification.
3. Validate the remote rule schema and version before merging. Test offline, invalid, and stale updates and verify that an explicit site disable remains effective when the extension falls back to bundled rules.
4. Bind streaming responses to the active attempt, candidate, tab, and document. Cancel on disconnect or context change and apply only complete answers to matching fields.

---

### Task 1 · Support ATS applications that require a top-level tab

**Files.** Extension application launch and tracking code, plus lifecycle tests.

- [ ] Use an existing supported embed where the provider permits it. Otherwise, use the extension's top-level tab handoff and retain the application intent for that posting.
- [ ] Verify that an allowed embed still works and that a framing failure opens the correct posting in a top-level tab. Confirm that receipt tracking remains scoped to the handoff.

---

### Task 2 · Verify submission receipts on same-page ATS flows

**Files.** `jobright_extension/application-confirmation.js`, `jobright_extension/background.js`, and `tests/ats-confirmation.test.mjs`.

- [ ] Replace hardcoded receipt text and path overrides with validated `confirmationRules`, layered over bundled rules and tied to the active receipt attempt. Rules can describe exact host and path matches, visible receipt markers, text patterns, and provider-specific ID format. A matching phrase or path alone is insufficient where the provider requires additional evidence.
- [ ] For same-page SPAs, evaluate provider-documented callbacks, supported integrations, and sanitized receipt events on owned fixtures. Begin with Workday, Oracle Cloud, and SuccessFactors fixture scenarios. Accept a read-only post-submit status and confirmation identifier only from a trusted, origin- and attempt-bound source. Keep outcome pending verification wherever a reliable signal is unavailable. Keep the status and identifier local to evidence validation and send only the minimum evidence required by NextKinHR.
- [ ] Require a trusted user submit action to arm an expiring, worker-owned attempt. Correlate evidence to the workspace, candidate, provider, posting, document, and attempt. Deduplicate via the Phase 1 receipt event identity. Keep query strings, fragments, response bodies, and scraped free text out of the evidence payload. Send validated evidence through the durable queue and atomic status path.
- [ ] Test a remotely updated thank-you selector or path, a same-page success, a successful HTTP status without a valid receipt ID, validation failure, unrelated activity, late evidence from a previous attempt, and duplicate receipt delivery. Test that an untrusted page event cannot confirm an attempt.
- [ ] Cover a synthetic submit, a stale receipt already on the page, expired state after a worker restart, and validated navigation handoff. Document fixture coverage separately from provider-confirmed support.

---

### Task 3 · Improve verified fill for custom controls

**Files.** `jobright_extension/core/field-writer.js`, ATS adapters, and the autofill engine tests.

**v3.3.19 scope check.** The local v3.3.19 archive matches the source. `form-discovery.js` already groups native and ARIA checkbox controls and maps structural radio and button groups. `field-mapping.js` and `field-writer.js` support multi-value choices. `application.js` already observes same-document wizard changes and claims continuation after a new document. The focused local run passed 52 tests, including demographic mapping, choice controls, wizard logic, and new-document continuation. Coverage of multiple ethnicity selections in one rendered checkbox group and a complete same-document wizard journey remains unverified.

**Verification command.** `node --experimental-strip-types --test tests/autofill-engine.test.mjs tests/demographics-autofill.test.mjs tests/manual-fields-autofill.test.mjs tests/workday.test.mjs tests/application-lifecycle.test.mjs`.

- [ ] Adapt public controls and supported interactions for React Select and Workday. Use a bounded readiness wait, verify the selected value after rerender, and report ambiguous outcomes for review.
- [ ] Treat an adapter selector matching zero visible controls as a per-field fallback. If an adapter yields no usable fields, start semantic discovery for the active form. On write readback failure, re-discover once in the active document, then try the semantically matched control if it is unambiguous and has not been edited by the candidate.
- [ ] Match a replacement control by the normalized field key, form scope, control kind, and available options under the same run and posting. Cancel recovery after a trusted edit or context change. Native URL and protected-field semantics take precedence over all remote hints.
- [ ] Apply validated remote label and answer rules to semantically discovered fields. For unmapped eligible dropdowns, radios, and checkbox groups, call the authenticated structured-field resolver described in Task 5. Revalidate returned mappings against the live local control before writing. Keep consequential, sensitive, and ambiguous items for candidate review.
- [ ] Test delayed options, disconnected controls, duplicate labels, manual edits during a run, and context changes. Verify that the field is counted as filled only after readback.
- [ ] Add a fixture with two selected ethnicity values and an unrelated adjacent group. Check that selection is scoped to the correct group and that absent demographic answers leave it untouched.
- [ ] Exercise a full same-document SPA wizard and a navigation to a new document. Fill newly visible fields only, preserve reviewed values, and stop after a posting or candidate change.

---

### Task 4: Server-Side Remote Site Rules API (`/api/extension/site-rules`)

**Files:**
- Create: `src/app/api/extension/site-rules/route.ts`
- Create: `src/lib/extension/site-rules-registry.ts`
- Create: a forward migration such as `supabase/migrations/20261123000200_extension_site_rule_publications.sql`, after Phase 1. Verify the timestamp against the migration inventory. Keep publication writes restricted to a reviewed service role and grant no public write privileges.
- Test: `tests/site-rules-api.test.mjs`

**Interfaces:**
- Produces: `GET /api/extension/site-rules?schema=1&v=<version>` returning JSON site rules with ETag support.
- Consumes: Query parameters `schema`, `v`, and request header `If-None-Match`.
- `SiteRulesPayload` contains `schema: 1`, `ruleVersion`, `publishedAt`, `minimumExtensionVersion`, `siteRulesKillSwitch` (site ID mapped to `'on' | 'off'`), `sites`, `selectorTables`, `scrapingRules`, `labelPatterns`, `answerMaps`, `fieldTypes`, `params`, and `confirmationRules`. The [Phase 2 design](../specs/2026-11-23-jobright-parity-autofill-ats-spec.md) defines their allowed capabilities.

- [ ] **Step 1: Write the failing unit test for site rules generation and ETag validation**

Create `tests/site-rules-api.test.mjs`:
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { getLatestSiteRules, computeRulesETag } from '../src/lib/extension/site-rules-registry.ts';

test('getLatestSiteRules returns structured rule tables and version metadata', () => {
  const rules = getLatestSiteRules();
  assert.ok(rules.ruleVersion);
  assert.ok(rules.publishedAt);
  assert.equal(rules.schema, 1);
  assert.match(rules.minimumExtensionVersion, /^\d+(\.\d+){1,3}$/);
  assert.ok(rules.siteRulesKillSwitch);
  assert.ok(rules.selectorTables);
  assert.ok(rules.selectorTables.workday);
  assert.ok(rules.selectorTables.greenhouse);
  assert.ok(rules.selectorTables.ashby);
  assert.ok(rules.labelPatterns);
  assert.ok(rules.answerMaps);
});

test('computeRulesETag produces deterministic hash of rules', () => {
  const rules = getLatestSiteRules();
  const etag1 = computeRulesETag(rules);
  const etag2 = computeRulesETag(rules);
  assert.equal(etag1, etag2);
  assert.ok(etag1.startsWith('"') && etag1.endsWith('"'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/site-rules-api.test.mjs`  
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement `site-rules-registry.ts` and `src/app/api/extension/site-rules/route.ts`**

1. Create `src/lib/extension/site-rules-registry.ts`:
   - Define `SiteRulesPayload` structure.
   - Seed bundled defaults from the existing priority ATS rules. Support publishing an override for any of the 81 registered adapter IDs through a service-managed versioned Supabase rule store. Publish atomically after validating the entire merged pack. Keep previous versions for rollback and use bundled rules when the store has no valid publication.
   - Restrict writes to the authorized rule publisher, validate site matchers against the shipped ATS trust boundary, and prohibit executable content, arbitrary requests, or newly granted host access. Compute the ETag from the exact merged publication.
   - Use closed schemas per rule category. Bound rule counts, matcher complexity, pattern grammar, and selector scope. Reject overlapping matchers without a deterministic winner. Reject remote attempts to reclassify native URL or sensitive controls.
   - Store workspace, version, schema, publisher, publication time, parent version, and immutable rules. Keep an active version pointer per workspace. Publishing or rollback requires the expected active version and updates the pointer in the same transaction. Test rejected concurrent changes, failed reads, overlapping site matchers, and ETag behavior across publish and rollback.
   - Implement `computeRulesETag(rules)` using Node's `crypto.createHash('sha256')`.
2. Create `src/app/api/extension/site-rules/route.ts`:
   - Require exactly one supported `schema=1` and one valid extension version `v`. Return 400 for missing, malformed, duplicated, or unsupported inputs before ETag comparison.
   - Add route-level tests for valid schema, bad query input with a matching ETag, and an empty 304 response for a valid matching request.
   - Check `request.headers.get('if-none-match')` against current ETag.
   - If matched, return `new Response(null, { status: 304 })`.
   - Otherwise return `NextResponse.json(rules, { headers: { 'ETag': etag, 'Cache-Control': 'public, max-age=900' } })`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/site-rules-api.test.mjs`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/extension/site-rules-registry.ts src/app/api/extension/site-rules/route.ts tests/site-rules-api.test.mjs
git commit -m "feat(api): implement remote site rules endpoint with ETag caching and selector tables"
```

---

### Task 5: Extension Remote Rules Sync, Cache & Adapter Fallback Engine

**Files:**
- Create: `jobright_extension/core/site-rules-manager.js`
- Verify: `jobright_extension/manifest.json` already declares `alarms` in the v3.3.19 source and archive. Add a manifest assertion and preserve the permission.
- Modify: `jobright_extension/background.js:60-120`
- Modify: `jobright_extension/adapters/ats-adapters.js:10-50`
- Modify: `jobright_extension/core/application.js` and `jobright_extension/core/form-discovery.js` to pass a rules snapshot through the active run.
- Modify: `jobright_extension/core/field-mapping.js`, `jobright_extension/core/field-writer.js`, and `jobright_extension/application-confirmation.js` to consume the rules at their respective call sites. Add the authenticated structured resolver and its tests.
- Test: `tests/extension-rules-manager.test.mjs`

**Interfaces:**
- Produces: `getActiveSiteRules(): Promise<ActiveSiteRules>`, where the snapshot includes effective site availability and a validated compatible rule payload or bundled fallback.
- Consumes: `/api/extension/site-rules` and `chrome.storage.local` key `SITE_RULES_CACHE_KEY`.

- [ ] **Step 1: Write the failing unit test for extension site rules manager**

Create `tests/extension-rules-manager.test.mjs`:
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const context = {};
runInNewContext(readFileSync(new URL('../jobright_extension/core/site-rules-manager.js', import.meta.url), 'utf8'), context);
const { mergeRulesWithAdapters, isSiteKillSwitched } = context.NextkinSiteRules;

test('mergeRulesWithAdapters merges remote selectors over local adapter hints', () => {
  const localAdapters = [
    { id: 'workday', hint: () => 'old_val' }
  ];
  const remoteRules = {
    selectorTables: {
      workday: { first_name: 'input[data-custom="first"]' }
    }
  };

  const merged = mergeRulesWithAdapters(localAdapters, remoteRules);
  assert.equal(merged[0].remoteSelectors?.first_name, 'input[data-custom="first"]');
});

test('isSiteKillSwitched checks remote killswitch flags', () => {
  const rules = {
    siteRulesKillSwitch: { greenhouse: 'off', workday: 'on' }
  };
  assert.equal(isSiteKillSwitched('greenhouse', rules), true);
  assert.equal(isSiteKillSwitched('workday', rules), false);
  assert.equal(isSiteKillSwitched('unknown', rules), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/extension-rules-manager.test.mjs`  
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement `site-rules-manager.js` and wire into `background.js` and `ats-adapters.js`**

1. Create `jobright_extension/core/site-rules-manager.js`:
   - Implement `syncSiteRules(apiOrigin, currentEtag)` with 15s timeout.
   - Validate the Task 4 contract, including `schema`, selector bounds, `minimumExtensionVersion`, and `siteRulesKillSwitch`. Compare numeric version components before replacing the last known good rules and ETag in `chrome.storage.local`. Test invalid or incompatible payloads, 304 responses, and site disables during fallback.
   - Expose `mergeRulesWithAdapters` and `isSiteKillSwitched` on the classic-script `globalThis.NextkinSiteRules` namespace. Load the shipped helper before worker use.
2. In `jobright_extension/background.js`:
   - Register the alarm listener at worker evaluation and ensure the 15-minute alarm exists after installation and worker startup. On its trigger, run `syncSiteRules()`.
   - Resolve the active rule snapshot through the worker. Scope cached rules to the configured workspace and keep storage reads in the worker.
   - Start a run from a validated local snapshot or bundled rules. Refresh remotely in parallel and offer a bounded user-initiated refresh for the next run. Pin the snapshot to the application attempt through wizard and receipt continuation. A newly published disable stops further writes. An explicit compatible `on` clears a prior disable. A missing flag, read failure, or expired rule does not clear it.
3. In the application, discovery, and adapter path:
   - Await `getActiveSiteRules()` at the start of an autofill run and pass its resolved snapshot into discovery and adapter matching. Reuse that snapshot through the active step, with context validation on continuation. Adapters remain synchronous and receive their rules explicitly.
   - Test a first fill while storage is pending, offline fallback, and a refresh during an active fill. Confirm the run uses one consistent snapshot.
   - Use `sites` in adapter matching, `scrapingRules` for form containers, triggers, options, file inputs, and navigation recognition, and `selectorTables` as field hints. Resolve `labelPatterns`, `answerMaps`, and `fieldTypes` in field mapping. Feed `confirmationRules` into receipt detection. Remote rules can recognize submit controls for receipt arming. Submit behavior remains user-initiated.
   - Apply the Task 3 fallback on adapter miss or failed readback. Add `POST /api/extension/resolve-structured-fields`, authenticated through the worker session. Require a server-verifiable attempt or a short-lived server-issued run bound to the workspace, candidate, and posting. Accept at most 20 eligible control descriptors per request, with allowlisted fact and control types, bounded sanitized labels, and run-local choice tokens with bounded public option labels. Return a canonical fact key, a current choice token, or abstention. Set per-account quotas and bounded expiry and timeouts. Keep inputs and answers out of logging.
   - Verify the returned field identity and token against the live control before writing. Preserve Phase 1 draft, URL, eligibility, and manual-edit protections. Keep telemetry separate from runtime resolution and avoid sending values, files, cookies, headers, or full page HTML.
   - Exercise a redesigned fixture from an adapter outside the bundled priority set. Verify that publishing overrides changes scraping, label and choice mapping, and confirmation together without rebuilding the extension or redeploying Next.js. Include rollback, offline, ambiguous choice, failed readback, and site-disabled cases.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/extension-rules-manager.test.mjs`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add jobright_extension/core/site-rules-manager.js jobright_extension/background.js jobright_extension/adapters/ats-adapters.js jobright_extension/core/application.js jobright_extension/core/form-discovery.js tests/extension-rules-manager.test.mjs
git commit -m "feat(extension): add 15-minute background site rules sync and adapter override engine"
```

---

### Task 6: Match Options Returned by Supported ATS Controls (`/api/extension/option-resolve`)

**Files:**
- Create: `src/app/api/extension/option-resolve/route.ts`
- Create: `src/lib/extension/option-resolver.ts`
- Test: `tests/option-resolver.test.mjs`

**Interfaces:**
- Produces: `POST /api/extension/option-resolve` returning matched option `{ id, label, value }`.
- Consumes: `{ site, fieldType, searchQuery, options }`.

Start with the existing DOM search and readback. Use the resolver where a supported integration provides a candidate option list and matching is still ambiguous. The route accepts a bounded option list and uses it locally for matching. Its input schema excludes arbitrary URLs, request headers, cookies, and request replay instructions. Use an authorized candidate context and leave ties for manual review.

- [ ] **Step 1: Write the failing unit test for option resolution**

Create `tests/option-resolver.test.mjs`:
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDynamicOption } from '../src/lib/extension/option-resolver.ts';

test('resolveDynamicOption matches exact city and state from query', async () => {
  const candidateQuery = 'San Francisco, CA';
  const remoteOptions = [
    { id: '101', text: 'San Diego, CA, United States' },
    { id: '102', text: 'San Francisco, CA, United States' },
    { id: '103', text: 'San Jose, CA, United States' }
  ];

  const match = await resolveDynamicOption('location', candidateQuery, remoteOptions);
  assert.ok(match);
  assert.equal(match.id, '102');
  assert.equal(match.text, 'San Francisco, CA, United States');
});

test('resolveDynamicOption handles school name fuzzy matching', async () => {
  const candidateQuery = 'UC Berkeley';
  const remoteOptions = [
    { id: '201', text: 'University of California, Berkeley (UC Berkeley)' },
    { id: '202', text: 'University of California, Davis' }
  ];

  const match = await resolveDynamicOption('school', candidateQuery, remoteOptions);
  assert.ok(match);
  assert.equal(match.id, '201');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/option-resolver.test.mjs`  
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement `option-resolver.ts` and `src/app/api/extension/option-resolve/route.ts`**

1. Create `src/lib/extension/option-resolver.ts`:
   - Implement `resolveDynamicOption(fieldType, candidateQuery, remoteOptions)` with normalization and token-overlap scoring.
2. Create `src/app/api/extension/option-resolve/route.ts`:
   - Authenticate the extension actor and verify candidate and attempt access. Add the required scope to the request contract.
   - Validate the site, field type, search text, and returned options. Cover ambiguous labels, unsupported sites, and malformed or oversized options.
   - Return `{ ok: true, match }` or `{ ok: false, match: null }`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/option-resolver.test.mjs`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/extension/option-resolver.ts src/app/api/extension/option-resolve/route.ts tests/option-resolver.test.mjs
git commit -m "feat(api): implement dynamic option search and resolution endpoint"
```

---

### Task 7 · Stream screening drafts with cancellation and run isolation

**Dependencies.** Tasks 0A and 0F. Measure time to first verified fill before scheduling this work.

**Files.** Create `src/app/api/extension/generate-answer-stream/route.ts` and `jobright_extension/core/sse-parser.js`. Extend `jobright_extension/background.js`, `jobright_extension/core/application.js`, and the manifest or injection order as needed. Test in `tests/streaming-autofill.test.mjs`.

- [ ] **Red.** Test a UTF-8 character and CRLF split across chunks, several events in one read, multiline data, malformed and oversized events, incomplete EOF, repeated events, and normal completion. Load the shipped parser as a classic script with `vm.Script`. Add route tests for unauthorized candidates, structured URL rejection, and draft-only responses. Add a mocked-port test for disconnect and navigation during generation.
- [ ] **Implement framing.** Use a streaming `TextDecoder` and a bounded stateful SSE parser that retains pending line and event state between reads. Dispatch only complete frames, handle blank-line delimiters and multiline data, and terminate cleanly on invalid input or incomplete EOF. Expose the helper through a classic-safe namespace. Route output uses `answer`, `profile`, `error`, and `done` events.
- [ ] **Implement cancellation.** Give each worker stream fetch an `AbortController`. Abort on `port.onDisconnect`, explicit cancel, or invalidated tab, document, or candidate context, and release listeners and reader state in cleanup. Carry the request abort and response stream cancellation through the server to the model provider call. Test that disconnect aborts the mocked upstream request and stops writes.
- [ ] **Enforce Task 0A and 0F.** Reuse the same active credential and candidate ownership checks before any model call, saved-answer lookup, or candidate lookup beyond authorization. Emit authorized profile facts and drafts under a run ID. Apply only complete, eligible answers to the matching active fields. Keep drafts out of the approved answer store and exclude URL fields from generation and streamed writes.
- [ ] **Green.** Run `node --experimental-strip-types --test tests/streaming-autofill.test.mjs tests/generate-answer-authorization.test.mjs tests/autofill-url-fields.test.mjs`. Verify the shipped extension on a local page with a stream interrupted mid-answer.

---

### Task 8 · Show submission and sync status in the top-level application page

**Dependencies.** Tasks 0C and 0D.

**Files.** Create `jobright_extension/applied-success-popup.js` and its styles. Modify `jobright_extension/background.js` for tracked-document delivery. Test in `tests/applied-popup.test.mjs`.

- [ ] **Red.** Load the popup as a classic script with `vm.Script` or a local browser fixture. Verify that markup in scraped job titles and company names renders as literal text. Cover a wrong origin, lookalike host, unsafe scheme, child frame, and repeated message for the same attempt.
- [ ] **Implement safe rendering.** Construct the popup with `document.createElement` and assign scraped strings via `textContent`. Use Shadow DOM for styling isolation. Guard initialization and mounting with `window === window.top`.
- [ ] **Validate navigation.** Build the submission dashboard URL from the pinned route and exact trusted NextKinHR HTTPS origin for the connected workspace. Validate the parsed origin against the configured allowlist before assigning the link. Omit the link if validation fails.
- [ ] **Validate delivery.** Send from the worker to the tracked top-level document after receipt and attempt validation. For embedded applications, resolve the tracked parent separately. Deduplicate by attempt and show distinct observed, pending, synced, and recoverable error states.
- [ ] **Green.** Run `node --experimental-strip-types --test tests/applied-popup.test.mjs tests/ats-confirmation.test.mjs`. Verify a top-level document and child iframe on a local test page.

---

### Task 9: Dynamic Resume Tailoring & Cover Letter Base64 Attachment Bridge

Extend the existing authorized resume bridge for cover letters. Bind the selected document to the candidate and target form, require candidate review, and verify the filename and attachment after rerender. Keep document bytes and filenames out of discovery and diagnostic telemetry.

**Files:**
- Create: `src/app/api/extension/cover-letter/route.ts`
- Create: `src/lib/extension/cover-letter-formatter.ts`
- Modify: `jobright_extension/background.js`
- Modify: `jobright_extension/panel.js:350-420`
- Modify: `jobright_extension/core/field-writer.js:180-240`
- Test: `tests/cover-letter-bridge.test.mjs`

**Interfaces:**
- Produces: `POST /api/extension/cover-letter` returning a text draft for review or real PDF bytes for an approved draft.
- Consumes: Authorized candidate and job context, and a reference to the reviewed draft for file rendering.

- [ ] **Step 1: Write the failing unit test for cover letter generation formatting**

Create `tests/cover-letter-bridge.test.mjs`:
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCoverLetterBody } from '../src/lib/extension/cover-letter-formatter.ts';

test('formatCoverLetterBody formats standard business letter header and signoff', () => {
  const result = formatCoverLetterBody({
    candidateName: 'Jane Doe',
    companyName: 'Acme Corp',
    jobTitle: 'Product Designer',
    bodyText: 'I am excited to apply...'
  });

  assert.ok(result.startsWith('Dear Hiring Team at Acme Corp,'));
  assert.ok(result.includes('Product Designer'));
  assert.ok(result.includes('Sincerely,\nJane Doe'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/cover-letter-bridge.test.mjs`  
Expected: FAIL with "Cannot find module"

Extend this test with a parseable PDF assertion, including a long or Unicode letter, unauthorized retrieval, and a transport round trip that reproduces the server bytes. Include a mislabeled text payload and assert that the extension rejects it.

- [ ] **Step 3: Implement cover letter endpoint and extension fill integration**

1. Create `src/lib/extension/cover-letter-formatter.ts` and `src/app/api/extension/cover-letter/route.ts`. Generate a valid PDF server-side with `pdf-lib` or the existing PDF tooling when the approved letter is needed as a file. Verify that a PDF parser can load the resulting pages.
2. In `jobright_extension/background.js`, fetch the authorized file through the existing resume-style bridge. Check response type, size, and the expected PDF signature, then transfer the bytes as base64. File signatures supplement server-side PDF validation.
3. In `jobright_extension/panel.js` and the field writer:
   - If the form contains a cover letter textarea or file input, offer to insert a candidate-approved letter into that field.
   - For a file field, reconstruct a `File` from the decoded PDF bytes and attach via `DataTransfer`. Verify file readback after rerender and report attachment failure.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/cover-letter-bridge.test.mjs`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/extension/cover-letter-formatter.ts src/app/api/extension/cover-letter/route.ts jobright_extension/background.js jobright_extension/panel.js jobright_extension/core/field-writer.js tests/cover-letter-bridge.test.mjs
git commit -m "feat: implement cover letter generation and automated document attachment bridge"
```

---

### Task 10: Passive Field Discovery Telemetry & Sanitized Ingestion

Treat remote collection as optional. Use local diagnostics first. Limit collection to an explicit, consented diagnostic run on a supported application page and require an authorized actor at ingestion. Prefer structural counts and approved control types. Free-form labels, options, and accessibility text can contain personal data and stay local unless a separately reviewed allowlist makes a specific attribute safe to send.

**Files:**
- Create: `jobright_extension/core/field-discovery.js`
- Create: `src/app/api/extension/discover-fields/route.ts`
- Modify: `jobright_extension/manifest.json:50-80`
- Test: `tests/field-discovery-telemetry.test.mjs`

**Interfaces:**
- Produces: `POST /api/extension/discover-fields` receiving allowlisted structural metadata such as `controlType` and `required`.
- Consumes: A snapshot requested during a consented diagnostic run on a supported top-frame HTTPS application page.

- [ ] **Step 1: Write the failing unit test for field sanitization**

Create `tests/field-discovery-telemetry.test.mjs`:
```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const context = {};
runInNewContext(readFileSync(new URL('../jobright_extension/core/field-discovery.js', import.meta.url), 'utf8'), context);
const { sanitizeDiscoveredField } = context.NextkinFieldDiscovery;

test('sanitizeDiscoveredField strips user values and passwords completely', () => {
  const mockInput = {
    tagName: 'INPUT',
    type: 'text',
    value: 'secret_user_entry@example.com',
    getAttribute: (attr) => attr === 'aria-label' ? 'Email Address' : null,
    required: true
  };

  const sanitized = sanitizeDiscoveredField(mockInput);
  assert.equal(sanitized.ariaLabel, undefined);
  assert.equal(sanitized.controlType, 'text');
  assert.equal(sanitized.required, true);
  assert.equal(sanitized.value, undefined, 'User value must be stripped');
});

test('sanitizeDiscoveredField ignores password and hidden inputs', () => {
  const passwordInput = { tagName: 'INPUT', type: 'password', getAttribute: () => null };
  assert.equal(sanitizeDiscoveredField(passwordInput), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/field-discovery-telemetry.test.mjs`  
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement `field-discovery.js` and ingestion endpoint**

1. Create `jobright_extension/core/field-discovery.js`:
   - Expose `sanitizeDiscoveredField(el)` through the classic-script `globalThis.NextkinFieldDiscovery` namespace. Keep initialization inert until the consented diagnostic run begins.
   - Collect up to 100 fields during the consented diagnostic run and limit the snapshot to 64 KB.
   - Send payload to background worker to dispatch to `/api/extension/discover-fields`.
2. Create `src/app/api/extension/discover-fields/route.ts`:
   - Revalidate the allowlist and payload limits on the server. Before enabling collection, document retention and verify that labels, options, URLs, and file metadata are excluded.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/field-discovery-telemetry.test.mjs`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add jobright_extension/core/field-discovery.js src/app/api/extension/discover-fields/route.ts jobright_extension/manifest.json tests/field-discovery-telemetry.test.mjs
git commit -m "feat: implement passive field discovery telemetry with zero-PII sanitization"
```

---

## Plan Review & Handoff Checklist

- [ ] Phase 1 Tasks 0A–0F pass their named offline tests and the Phase 1 verification gate. Stop and report results for review before starting Phase 2.
- [ ] Lever URL fixtures confirm that invalid or missing candidate links trigger zero model calls and leave the fields available for manual entry.
- [ ] Signed-out and cross-account requests fail before candidate data is read, forwarded, or written.
- [ ] Receipt recovery handles storage failure, network interruption, replays, restarts, and account changes.
- [ ] The ATS coverage matrix records results by provider and workflow stage. Verify the shipped archive and unpacked extension against the tested source.
- [ ] Rule updates preserve existing adapter behavior when offline and support recovery from a bad rule release.
- [ ] Default tests run offline and leave the workspace clean. Live smoke tests are opt-in.

## Phase 1 ATS coverage

Fixture coverage below establishes the named behavior. Provider-specific upload and live end-to-end behavior are tracked separately.

| ATS | Discovery | Verified fill | Resume attachment | Receipt evidence | Live Phase 1 |
| --- | --- | --- | --- | --- | --- |
| Workday | Multistep fixture | Multistep field fixture | Generic file-input fixture only | Terminal selector and requisition fixture | Unverified |
| Greenhouse | Adapter and choice fixtures | Button-choice fixture | Generic file-input fixture only | Board/posting and confirmation fixtures | Unverified |
| Lever | Unpacked MV3 form fixture | Saved URL and missing-link fixture | Generic file-input fixture only | Posting and confirmation fixture | Unverified |
| Ashby | Adapter, choice, and embedded-form fixtures | Button-choice fixture | Generic file-input fixture only | Embedded receipt and ordinary success-text fixtures | Unverified |
| SmartRecruiters | Adapter identification | Unverified for provider-specific fill | Generic file-input fixture only | Confirmation attribute and job ID fixture | Unverified |

The default unit suite uses local fixtures. Use `npm run test:ats:smoke` with `NEXTKIN_LEVER_SMOKE_URL` or `NEXTKIN_GREENHOUSE_SMOKE_URL` set to an approved test posting to opt in. The smoke uses synthetic candidate data and checks fill without submitting the form.
