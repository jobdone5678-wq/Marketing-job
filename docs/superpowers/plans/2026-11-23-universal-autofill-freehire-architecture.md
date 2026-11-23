# Universal Job Autofill Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade NextKinHR's `jobright_extension` autofill engine with FreeHire's universal form detection, question-first grouping, anchored prefix matching, verified combobox interactions, reusable answer bank, and two-tier submission confirmation while preserving all 74 existing adapters and backend integrations.

**Architecture:** A 3-tier hybrid autofill engine where Tier 1 specialized adapters suggest candidate facts, Tier 2 universal semantic engine provides question-first DOM discovery and anchored prefix matching for unlisted or redesigned portals, and Tier 3 provides a candidate-confirmed Answer Bank and scoped AI fallback. All field planning passes through mandatory safety invariants (1-to-1 URL slotting, no duplication, no prose, post-fill readback verification) and submission confirmation features high-confidence auto-capture backed by an ambiguous form disappearance prompt.

**Tech Stack:** Vanilla JavaScript (Chrome Manifest V3 Extension), Next.js 15, TypeScript, Supabase (PostgreSQL 15+), Node.js native test runner (`node:test`, `node:assert/strict`), jsdom / synthetic DOM fixtures.

**Spec:** `docs/superpowers/specs/2026-11-23-universal-autofill-freehire-architecture-design.md`

## Global Constraints
- Preserve all 74 existing adapters in `jobright_extension/adapters/ats-adapters.js` without deletion or regression.
- Safety invariants (1-to-1 URL slotting, zero duplicate URLs, blocking prose in URLs, native event dispatching) remain unconditionally active regardless of feature flag state.
- Sensitive disclosures (race, ethnicity, disability, veteran status, legal consent, e-signatures) must never be synthesized, auto-accepted, or guessed from AI.
- Extension communicates with Supabase exclusively through authenticated backend API routes (`/api/extension/*`).
- All existing tests (`npm test`) must continue to pass cleanly at every stage.

## Review Focus
1. Form asking for multiple URLs (`LinkedIn`, `GitHub`, `Twitter`, `Portfolio`, `Other`): LinkedIn/GitHub map 1-to-1, Portfolio maps once, and Twitter/Other remain completely blank with zero prose injected.
2. Long screening question containing incidental keyword (*"Are you legally authorized to work in this **country**?"*): Evaluated strictly as work authorization, never as candidate country of residence.
3. Multi-step application wizard (Workday/Taleo) on Step 2 where file upload is absent: Scopes correctly to active question container without losing fields or misfiring submission prompts.
4. Transient network failure during auto-submit: Application is held in durable pending queue in `chrome.storage.local` with exponential retry; dashboard is not falsely marked as synced.
5. Answer Bank retrieval: Universal entries (`company_scope IS NULL`) and company-specific entries (`company_scope = 'stripe'`) retrieve accurately without duplicate collision or accidental cross-company leakage.

---

### Task 1: Unconditional Field Safety & Strict 1-to-1 URL Slotting

**Files:**
- Modify: `jobright_extension/core/field-mapping.js:610-675`
- Create: `tests/strict-url-slotting.test.mjs`

**Interfaces:**
- Consumes: Candidate confirmed facts, field descriptors (`field.label`, `field.name`, `field.hint`).
- Produces: `planFill(fields, candidate, options)` returning clean URL mappings with consumed tracking and manual status for extra links.

- [ ] **Step 1: Write the failing test in `tests/strict-url-slotting.test.mjs`**
Test that on forms with multiple URL fields (`urls[LinkedIn]`, `urls[GitHub]`, `urls[Twitter]`, `urls[Portfolio]`, `urls[Other]`), `linkedin_url` and `github_url` map 1-to-1, `portfolio_url` maps once, and `urls[Twitter]` and `urls[Other]` are marked `{ status: 'manual' }` with no duplicate values and no prose.

- [ ] **Step 2: Run test to verify it fails**
Run: `node tests/strict-url-slotting.test.mjs`
Expected: FAIL (currently duplicates website into Other or Twitter, or lacks consumed URL tracking).

- [ ] **Step 3: Implement strict 1-to-1 URL slotting in `jobright_extension/core/field-mapping.js`**
Update `isUrlField`, `linkFieldKey`, and `planFill` to track `consumedUrls = new Set()`. Enforce that once a URL is slotted into a field, it cannot be assigned to another field. Ensure unmapped extra link inputs receive `{ status: 'manual', reason: 'Unmapped link field; enter manually.' }`. Reject values containing whitespace, newlines, or failing `new URL()`.

- [ ] **Step 4: Run test to verify it passes**
Run: `node tests/strict-url-slotting.test.mjs`
Expected: PASS

- [ ] **Step 5: Verify existing URL tests still pass**
Run: `node tests/autofill-url-fields.test.mjs`
Expected: PASS

- [ ] **Step 6: Commit**
```bash
git add jobright_extension/core/field-mapping.js tests/strict-url-slotting.test.mjs
git commit -m "feat(autofill): enforce unconditional 1-to-1 URL slotting and zero duplication"
```

---

### Task 2: Question-First DOM Discovery & Multi-Step Scoping

**Files:**
- Modify: `jobright_extension/core/form-discovery.js:188-250`
- Create: `tests/universal-question-discovery.test.mjs`

**Interfaces:**
- Consumes: Document DOM tree, iframes, shadow roots.
- Produces: `discoverFields(tree)` returning grouped `Question` structures and scoped application form boundaries.

- [ ] **Step 1: Write the failing test in `tests/universal-question-discovery.test.mjs`**
Test that:
1. 5 radio options inside a `<fieldset><legend>Work Authorization</legend>...</fieldset>` are grouped into one Question field with `kind: 'choice'`.
2. A lone checkbox ("I agree to terms") retains its own specific label rather than the fieldset legend.
3. A page with both an application form (with `<input type="file">`) and a job alert form only returns fields from the application form.
4. On a form without a file input (Step 2 of a wizard), scoping falls back cleanly to the active form container without dropping fields.

- [ ] **Step 2: Run test to verify it fails**
Run: `node tests/universal-question-discovery.test.mjs`
Expected: FAIL

- [ ] **Step 3: Implement `scopeToApplication` and question-first grouping in `jobright_extension/core/form-discovery.js`**
Port FreeHire's question aggregation:
1. Group checkbox/radio siblings sharing a labelled container (`fieldset > legend` or `[role="group"][aria-label]`).
2. Add group-of-one exception for single controls.
3. Add `scopeToApplication` to anchor on `<input type="file">` matching resume criteria; fall back to the active form container containing submit/next controls when no file input is present.

- [ ] **Step 4: Run test to verify it passes**
Run: `node tests/universal-question-discovery.test.mjs`
Expected: PASS

- [ ] **Step 5: Verify existing discovery tests still pass**
Run: `node tests/universal-discovery-attachment.test.mjs`
Expected: PASS

- [ ] **Step 6: Commit**
```bash
git add jobright_extension/core/form-discovery.js tests/universal-question-discovery.test.mjs
git commit -m "feat(discovery): implement question-first grouping and application form scoping"
```

---

### Task 3: Anchored Prefix Matching (`opensWith`) & Universal Adapter Fallback

**Files:**
- Modify: `jobright_extension/core/field-mapping.js:35-165`
- Modify: `jobright_extension/adapters/ats-adapters.js:1-85`
- Create: `tests/anchored-field-mapping.test.mjs`

**Interfaces:**
- Consumes: Question labels, adapter hints, field metadata.
- Produces: `resolveFact(label, hint)` returning canonical profile key with exact prefix boundaries.

- [ ] **Step 1: Write the failing test in `tests/anchored-field-mapping.test.mjs`**
Test that:
1. `"Are you legally authorized to work in this country?"` matches `authorized_in_usa` (or work authorization), NOT `country`.
2. `"First Name (required) id_1234"` matches `first_name` because `first name` opens the label.
3. Unlisted portal domains on custom URLs fall back to the registered `generic` adapter rather than returning null.

- [ ] **Step 2: Run test to verify it fails**
Run: `node tests/anchored-field-mapping.test.mjs`
Expected: FAIL

- [ ] **Step 3: Implement `opensWith` matching and register the `generic` adapter**
1. In `jobright_extension/core/field-mapping.js`, implement `opensWith(label, synonym)` checking `label.startsWith(synonym)` and verifying non-alphanumeric trailing boundary.
2. In `jobright_extension/adapters/ats-adapters.js`, add the registered `generic` universal adapter that returns `canonicalHint(el)` so unlisted domains always have an active Tier 2 adapter.
3. Ensure Tier 1 adapter hints are sanitized through Tier 2 safety rules.

- [ ] **Step 4: Run test to verify it passes**
Run: `node tests/anchored-field-mapping.test.mjs`
Expected: PASS

- [ ] **Step 5: Verify all adapter test suites still pass**
Run: `node tests/adapters.test.mjs`
Expected: PASS

- [ ] **Step 6: Commit**
```bash
git add jobright_extension/core/field-mapping.js jobright_extension/adapters/ats-adapters.js tests/anchored-field-mapping.test.mjs
git commit -m "feat(mapping): add anchored prefix matching and universal generic adapter"
```

---

### Task 4: Verified Combobox Driver & Post-Fill Readback Verification

**Files:**
- Modify: `jobright_extension/core/field-writer.js:1-250`
- Create: `tests/verified-combobox-writer.test.mjs`

**Interfaces:**
- Consumes: Form plans (`planFill` output), document DOM.
- Produces: `applyFill(plans, context)` with native setters, combobox driver, and post-fill readback report `{ filled, unverified, manual, unmapped }`.

- [ ] **Step 1: Write the failing test in `tests/verified-combobox-writer.test.mjs`**
Test that:
1. Programmatic writes use native prototype descriptors and fire both `input` and `change` events.
2. Custom combobox (`[role="combobox"]`) triggers option list opening, selects matching option text, and verifies the selected value.
3. A field where a framework drops the write is flagged as `unverified` in the post-fill report.

- [ ] **Step 2: Run test to verify it fails**
Run: `node tests/verified-combobox-writer.test.mjs`
Expected: FAIL

- [ ] **Step 3: Implement native setters, combobox protocol, and readback verification in `jobright_extension/core/field-writer.js`**
1. Implement `setNativeValue(element, value)` using `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')`.
2. Port FreeHire's combobox interaction sequence: trigger open -> wait options -> match option -> click option.
3. Add `verifyWrites(plans)` to re-read elements after 50ms and return structured results.

- [ ] **Step 4: Run test to verify it passes**
Run: `node tests/verified-combobox-writer.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add jobright_extension/core/field-writer.js tests/verified-combobox-writer.test.mjs
git commit -m "feat(writer): add framework-safe native value setters and post-fill readback verification"
```

---

### Task 5: Supabase Schema & Backend API for Candidate Answer Bank

**Files:**
- Create: `supabase/migrations/20261124000100_candidate_answer_bank.sql`
- Create: `src/app/api/extension/answer-bank/route.ts`
- Create: `tests/answer-bank-api.test.mjs`

**Interfaces:**
- Consumes: Authenticated session / extension token, question-answer payloads.
- Produces: Persistent `candidate_answer_bank` table and Next.js REST API (`GET`, `POST`, `PUT`, `DELETE`).

- [ ] **Step 1: Write the failing API test in `tests/answer-bank-api.test.mjs`**
Test that:
1. `GET /api/extension/answer-bank` returns candidate's saved answers.
2. `POST /api/extension/answer-bank` upserts an answer, correctly handling NULL `company_scope` vs non-NULL without duplicate collisions.
3. `DELETE /api/extension/answer-bank` removes an answer.

- [ ] **Step 2: Run test to verify it fails**
Run: `node tests/answer-bank-api.test.mjs`
Expected: FAIL

- [ ] **Step 3: Create the migration and implement the API route**
1. In `supabase/migrations/20261124000100_candidate_answer_bank.sql`, define table and separate partial unique indexes (`uq_candidate_answer_universal` WHERE `company_scope IS NULL`, `uq_candidate_answer_company` WHERE `company_scope IS NOT NULL`).
2. Implement `src/app/api/extension/answer-bank/route.ts` using `protectedRoute` and candidate access verification.

- [ ] **Step 4: Run test to verify it passes**
Run: `node tests/answer-bank-api.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add supabase/migrations/20261124000100_candidate_answer_bank.sql src/app/api/extension/answer-bank/route.ts tests/answer-bank-api.test.mjs
git commit -m "feat(api): create candidate answer bank migration and extension API endpoints"
```

---

### Task 6: Extension Answer Bank Client & Context-Aware Matching

**Files:**
- Create: `jobright_extension/core/answer-bank.js`
- Modify: `jobright_extension/core/field-mapping.js`
- Modify: `jobright_extension/panel.js`
- Create: `tests/answer-bank-extension.test.mjs`

**Interfaces:**
- Consumes: Saved answers from local storage / API, field question contexts.
- Produces: `matchAnswerBank(field, companySlug)` providing verified match or prompting candidate to save new answers with `[ Save for all jobs ]` / `[ Save for this company only ]`.

- [ ] **Step 1: Write the failing test in `tests/answer-bank-extension.test.mjs`**
Test that:
1. Universal answers match across any company.
2. Company-specific answers match only when the company slug matches.
3. Factual profile data always overrides Answer Bank entries.
4. Sensitive disclosures (consent, signatures) are rejected from being saved to the Answer Bank.

- [ ] **Step 2: Run test to verify it fails**
Run: `node tests/answer-bank-extension.test.mjs`
Expected: FAIL

- [ ] **Step 3: Implement `jobright_extension/core/answer-bank.js` and integrate into `field-mapping.js` and `panel.js`**
1. Implement `AnswerBankClient` with local `chrome.storage.local` caching and API sync.
2. Integrate into `field-mapping.js` as Tier 3 fallback before AI generation.
3. In `panel.js`, render the prompt offering `Save for all jobs` and `Save for this company only` on manual edits.

- [ ] **Step 4: Run test to verify it passes**
Run: `node tests/answer-bank-extension.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add jobright_extension/core/answer-bank.js jobright_extension/core/field-mapping.js jobright_extension/panel.js tests/answer-bank-extension.test.mjs
git commit -m "feat(extension): integrate candidate answer bank with context-aware matching and offline caching"
```

---

### Task 7: Two-Tier Submission Confirmation & Durable Retry Queue

**Files:**
- Modify: `jobright_extension/application-confirmation.js`
- Modify: `jobright_extension/background.js`
- Modify: `jobright_extension/panel.js`
- Create: `tests/submission-confirmation-two-tier.test.mjs`

**Interfaces:**
- Consumes: DOM mutation events, navigation events, user confirmation clicks.
- Produces: Reliable submission dispatch to `/api/extension/auto-submit` with durable retry queue.

- [ ] **Step 1: Write the failing test in `tests/submission-confirmation-two-tier.test.mjs`**
Test that:
1. High-confidence confirmation receipts auto-record only when preceded by an active submission attempt.
2. A form disappearing without a receipt triggers the "Did you submit?" prompt.
3. Wizard step navigation ("Next") does not trigger the submission prompt.
4. If `/api/extension/auto-submit` fails with 503/network error, the submission remains in pending queue and retries.

- [ ] **Step 2: Run test to verify it fails**
Run: `node tests/submission-confirmation-two-tier.test.mjs`
Expected: FAIL

- [ ] **Step 3: Implement two-tier confirmation and durable retry queue**
1. In `application-confirmation.js`, enforce submission attempt evidence before auto-recording.
2. On unconfirmed form removal, render the "Did you submit?" prompt.
3. In `background.js`, implement durable pending submission queue in `chrome.storage.local` with retry logic.

- [ ] **Step 4: Run test to verify it passes**
Run: `node tests/submission-confirmation-two-tier.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add jobright_extension/application-confirmation.js jobright_extension/background.js jobright_extension/panel.js tests/submission-confirmation-two-tier.test.mjs
git commit -m "feat(tracking): implement two-tier submission confirmation and durable retry queue"
```

---

### Task 8: End-to-End ATS Fixture Integration & Feature Flag Verification

**Files:**
- Create: `tests/fixtures/greenhouse-universal.html`
- Create: `tests/fixtures/lever-universal.html`
- Create: `tests/fixtures/ashby-universal.html`
- Create: `tests/fixtures/workday-universal.html`
- Create: `tests/e2e-universal-autofill.test.mjs`

**Interfaces:**
- Consumes: Full offline ATS form HTML fixtures, candidate profile, feature flag setting.
- Produces: Comprehensive verification of end-to-end autofill, safety invariants, and backward compatibility.

- [ ] **Step 1: Write synthetic HTML fixtures and integration suite in `tests/e2e-universal-autofill.test.mjs`**
Simulate complete real-world applications across Greenhouse, Lever, Ashby, and Workday. Test that:
1. All standard facts fill cleanly.
2. Multiple URL inputs produce zero duplicates and zero prose.
3. Feature flag `NEXT_PUBLIC_ENABLE_UNIVERSAL_AUTOFILL_V2 = false` still enforces strict URL safety.
4. Form disappearance triggers confirmation flow.

- [ ] **Step 2: Run integration tests to verify they pass**
Run: `node tests/e2e-universal-autofill.test.mjs`
Expected: PASS

- [ ] **Step 3: Run full repository test suite**
Run: `npm test`
Expected: All suites PASS cleanly with zero regressions.

- [ ] **Step 4: Commit**
```bash
git add tests/fixtures/ tests/e2e-universal-autofill.test.mjs
git commit -m "test(e2e): add universal autofill integration suite and ATS portal fixtures"
```
