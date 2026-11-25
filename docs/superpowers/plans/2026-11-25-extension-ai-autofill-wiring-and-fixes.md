# Extension AI Autofill Wiring & Backend Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the Chrome extension's autofill flow (`panel.js`, `application.js`, `field-writer.js`) to the 4-mode `AIRouter` (`/api/extension/autofill/plan` & `/choose` plus `planner-bundle.js`), preserve grounded prose generation for open-ended questions, fix silent field/error drops, harden backend BYOK/reasoning-model handling, and enable `SERVER_ENABLE_VERCEL_AI_SDK=true` on `marketing-job-wufj`.

**Architecture:** `panel.js` dynamically loads `core/ai-router.js` and `core/ai/planner-bundle.js` to run Stage A (`AIRouter.plan()` + live DOM `readChoices()` -> `AIRouter.choose()`) for structured/choice/combobox fields with strict `validateGroundedAnswer` verification, followed by Stage B (`generate-answer` or direct `ProviderClient`) strictly for remaining open-ended prose questions. Backend routes (`autofill-orchestrator.ts`, `generate-answer/route.ts`, `ai/settings/route.ts`) are hardened to surface BYOK/empty-output errors instead of silently falling back, and `SERVER_ENABLE_VERCEL_AI_SDK=true` activates `ServerVercelProviderClient` in production.

**Tech Stack:** TypeScript, Next.js 16, Zod v4, Vercel AI SDK (`ai`, `@ai-sdk/openai-compatible`), Chrome MV3 Extension (vanilla JS / ESM), Node test runner (`node --test`), Playwright.

**Spec:** [docs/superpowers/specs/2026-11-25-extension-ai-autofill-wiring-and-fixes-design.md](file:///c:/Users/bharg/Downloads/marketing-job/docs/superpowers/specs/2026-11-25-extension-ai-autofill-wiring-and-fixes-design.md)

## Global Constraints
- Never bundle `ai`, `@ai-sdk/openai-compatible`, or Node-only builtins into `jobright_extension/core/ai/planner-bundle.js`.
- Never bypass `validateGroundedAnswer` for factual, work-authorization, visa sponsorship, experience, education, or certification fields.
- Never send `date_of_birth`, passwords, SSN, banking fields, or marketing opt-in checkboxes to AI.
- Never silently fall back to server `.env` keys when `portal_byok`, `extension_byok`, or `local` fails authentication or lacks a key.
- Keep `result.questions[]` items in `application.js` conforming to the 4-key `{ id, label, type, options }` shape expected by `tests/ai-screening-answers.test.mjs`.

## Review Focus
- **Reasoning-model empty `content` (`hy4-flash:free` / OpenRouter):** `generate-answer` must fail with HTTP 502 instead of returning `{ ok: true, answer: "" }` when `result.text.trim()` is empty.
- **`extension_byok` after browser restart (`ai_api_key` absent in `chrome.storage.session`):** `panel.js` must fail fast with a clear `#notice` error before dispatching unauthenticated requests.
- **Duplicate field labels in `deferred` comboboxes:** `panel.js` must disambiguate `deferred` comboboxes via `questionMeta` (`fieldId` / index) rather than crashing or overwriting the wrong widget.
- **Case/whitespace differences on dropdown options in Pass 2:** `application.js` must match `aiAnswers[key]` against `options` case-insensitively and trimmed before applying.
- **Keyless `portal_byok` saves in `PUT /api/extension/ai/settings`:** Submitting `mode: 'portal_byok'` with `apiKey: null` or `""` (or no existing secret) must return HTTP 400 *before* deleting any existing secret, while still returning 409 first on `configVersion` mismatch.

---

### Task 1: Harden Backend AI Routes & Settings Validation

**Files:**
- Modify: `src/lib/ai/autofill-orchestrator.ts:174-229`
- Modify: `src/app/api/extension/generate-answer/route.ts:196-301`
- Modify: `src/app/api/extension/ai/settings/route.ts:151-176`
- Test: `tests/ai/autofill-orchestrator-api.test.mjs`, `tests/generate-answer-authorization.test.mjs`, `tests/ai/settings-sync-endpoints.test.mjs`

**Interfaces:**
- Consumes: `resolveAiSdkBaseUrl` from `src/lib/ai/server-provider-client.ts`, `createSafeAgent` from `src/lib/ai/ssrf-guard.ts`.
- Produces:
  - `resolveProviderClient(actorId, options)` allowing custom HTTPS/HTTP hosts (`{ allowCustom: true }`) in both `portal_byok` and `default` branches while blocking private/loopback/metadata IPs.
  - `POST /api/extension/generate-answer` reading `AI_PROVIDER_DEFAULT_* || OPENAI_*`, throwing 401 when `portal_byok` secret is missing or fails decryption, preserving `/v1beta/openai` base paths, and throwing 502 on empty `result.text`.
  - `PUT /api/extension/ai/settings` returning 400 when `mode === 'portal_byok'` would leave no stored secret.

- [ ] **Step 1: Write failing tests for backend hardening**

Add tests covering:
1. In `tests/ai/autofill-orchestrator-api.test.mjs`: `resolveProviderClient()` succeeds for a custom non-whitelist public host (with mocked `dnsLookup` / `createSafeAgent` or verifying custom host does not throw `DISALLOWED_HOST` for both `portal_byok` and `defaultBaseUrl`).
2. In `tests/generate-answer-authorization.test.mjs`:
   - `POST` returns `401` when `userConfig.mode === 'portal_byok'` and secret is missing or decryption fails (never silently falling back to `OPENAI_API_KEY`).
   - `POST` returns `502` when upstream model returns `{ choices: [{ message: { content: "" } }] }`.
   - `POST` preserves `/v1beta/openai` base URL without appending `/v1`.
3. In `tests/ai/settings-sync-endpoints.test.mjs`:
   - `PUT` with `mode: 'portal_byok'` and no `apiKey` for `USER_2` (no stored secret) returns `400`.
   - `PUT` with `mode: 'portal_byok'` and `apiKey: null` or `""` for `USER_1` (who already has a secret) returns `400` and preserves the existing secret.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --experimental-strip-types --test tests/ai/autofill-orchestrator-api.test.mjs tests/generate-answer-authorization.test.mjs tests/ai/settings-sync-endpoints.test.mjs`
Expected: FAIL on the newly added assertions.

- [ ] **Step 3: Update `src/lib/ai/autofill-orchestrator.ts`, `src/app/api/extension/generate-answer/route.ts`, and `src/app/api/extension/ai/settings/route.ts`**

1. In `src/lib/ai/autofill-orchestrator.ts`:
   - Pass `{ allowCustom: true }` to `createSafeAgent(targetUrl, { allowCustom: true })` (line 176) and `createSafeAgent(defaultBaseUrl, { allowCustom: true })` (line 212).
2. In `src/app/api/extension/generate-answer/route.ts`:
   - Resolve server defaults via `AI_PROVIDER_DEFAULT_API_KEY || OPENAI_API_KEY`, `AI_PROVIDER_DEFAULT_BASE_URL || OPENAI_BASE_URL || 'https://api.openai.com/v1'`, `AI_PROVIDER_DEFAULT_MODEL || OPENAI_MODEL || 'gpt-4o-mini'`.
   - Inside portal BYOK check (`isPortalMode`), if `userSecret?.encrypted_api_key` is missing or `decryptSecret()` throws, throw `new CaptureError('Custom provider authentication failed. Re-save your API key in AI Provider Settings.', 401)` (only swallow schema-missing errors if the config tables themselves do not exist, not `portal_byok` auth errors).
   - Normalize `baseURL` without appending `/v1` when the URL already contains a versioned path segment (`/v\d+` such as `/v1beta/openai`).
   - If `!rawAnswer`, throw `new CaptureError('AI provider returned an empty response. Increase token limit or switch from a reasoning-only model.', 502)`.
3. In `src/app/api/extension/ai/settings/route.ts`:
   - After optimistic locking check (`409`) and before `deleteUserAiProviderSecret()`, fetch `existingSecret = await getUserAiProviderSecret(userId, options?.db)`.
   - Compute `targetMode` first; if `targetMode === 'portal_byok'` and `!isNewKey` and (`incomingApiKey === null || incomingApiKey === '' || !existingSecret?.encrypted_api_key`), return `Response.json({ ok: false, error: 'An API key is required for Portal Encrypted BYOK mode.' }, { status: 400 })`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --experimental-strip-types --test tests/ai/autofill-orchestrator-api.test.mjs tests/generate-answer-authorization.test.mjs tests/ai/settings-sync-endpoints.test.mjs`
Expected: PASS (all tests green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/autofill-orchestrator.ts src/app/api/extension/generate-answer/route.ts src/app/api/extension/ai/settings/route.ts tests/ai/autofill-orchestrator-api.test.mjs tests/generate-answer-authorization.test.mjs tests/ai/settings-sync-endpoints.test.mjs
git commit -m "fix(ai): harden portal_byok error handling, custom host SSRF consistency, and reasoning empty-output guard"
```

---

### Task 2: Align `AIRouter` Request Contracts & Direct Prose Generation

**Files:**
- Modify: `jobright_extension/core/ai-router.js:43-145`
- Test: `tests/ai/mv3-lifecycle-and-rescan.test.mjs`

**Interfaces:**
- Consumes: `planFormBatch`, `chooseComboboxOption`, `ProviderClient` from `./ai/planner-bundle.js`.
- Produces:
  - `AIRouter.plan(fields, factsOrPayload, context = {})` accepting either `Map<string, VerifiedFact>` or `{ facts?, candidateId?, answerBank? }`, sending `{ candidateId, fields, context, answerBank }` in proxy modes (`server`, `portal_byok`).
  - `AIRouter.choose(question, options, factsOrPayload, context = {})` accepting either `Map<string, VerifiedFact>` or `{ facts?, candidateId?, answerBank? }`, sending `{ candidateId, question, options, context, answerBank }` in proxy modes.
  - `AIRouter.generateTextAnswer(promptPayload, systemPrompt, userPrompt)` for Stage B direct browser execution in `extension_byok` / `local_direct` modes.

- [ ] **Step 1: Write failing tests in `tests/ai/mv3-lifecycle-and-rescan.test.mjs`**

Assert that:
1. `server` / `portal_byok` `router.plan(fields, { candidateId: 'cand-1', answerBank: [{ topic: 'relocation', answer: 'Yes' }] }, { jobTitle: 'Eng' })` sends JSON body `{ candidateId: 'cand-1', fields, context: { jobTitle: 'Eng' }, answerBank: [...] }` to `/api/extension/autofill/plan`.
2. `server` / `portal_byok` `router.choose(question, ['A', 'B'], { candidateId: 'cand-1', answerBank: [] }, { jobTitle: 'Eng' })` sends JSON body `{ candidateId: 'cand-1', question, options: ['A', 'B'], context: { jobTitle: 'Eng' }, answerBank: [] }` to `/api/extension/autofill/choose`.
3. `extension_byok` / `local_direct` `router.generateTextAnswer(...)` calls `clientFactory` / `ProviderClient.generateChatCompletion` with `responseFormat: 'text'` and returns `{ ok: true, answer }`.
4. Existing `router.plan(fields, new Map(...))` calls still work unchanged.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/ai/mv3-lifecycle-and-rescan.test.mjs`
Expected: FAIL on proxy payload keys (`candidateId`, `answerBank`) and `generateTextAnswer`.

- [ ] **Step 3: Implement `AIRouter` contract alignment & `generateTextAnswer` in `jobright_extension/core/ai-router.js`**

- Add private helper `_unpackInput(factsOrPayload)`: returns `{ facts: factsOrPayload, candidateId: undefined, answerBank: undefined }` if `factsOrPayload instanceof Map`, else extracts `{ facts, candidateId, answerBank }` (falling back to `this.candidateId` / `this.answerBank`).
- Update `plan()` and `choose()` proxy payloads to `{ candidateId, fields, context, answerBank }` and `{ candidateId, question, options, context, answerBank }`.
- Normalize `'local'` -> `'local_direct'` in `constructor`.
- Implement `generateTextAnswer(systemPrompt, userPrompt, options = {})` using `this.clientFactory` or `new ProviderClient(...)` with `responseFormat: 'text'` and `maxTokens: options.maxTokens ?? 1500`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/ai/mv3-lifecycle-and-rescan.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add jobright_extension/core/ai-router.js tests/ai/mv3-lifecycle-and-rescan.test.mjs
git commit -m "fix(extension): align AIRouter proxy payloads with autofill orchestrator and add direct text helper"
```

---

### Task 3: Fix `field-writer.js` `readChoices()` and `application.js` Question Extraction + Pass 2 Matching

**Files:**
- Modify: `jobright_extension/core/field-writer.js:623-639`
- Modify: `jobright_extension/core/application.js:842-865,1204-1222,1315`
- Test: `tests/ai-screening-answers.test.mjs`, `tests/verified-combobox-writer.test.mjs`

**Interfaces:**
- Consumes: `writer.readChoices(field, isCurrent)`
- Produces:
  - `readChoices()` clicking `.select__control` fallback, waiting up to 400ms, and dispatching `ArrowDown` fallback (up to 250ms) when combobox options load asynchronously.
  - `application.fill()` returning `{ filled, unfilled, questions, questionMeta, total }` where `questions[]` preserves `{ id, label, type, options }`, `questionMeta` maps `id` -> `{ fieldId, combo, required, planStatus, factKey }`, `authorized_in_usa`/`needs_sponsorship`/`visa_status`/`work_authorization`/`citizenship_status` are no longer blocked from `questions[]`, unrecognized checkboxes are not forced to `false`, Pass 1 skips `readChoices()` on `combobox` when `aiAnswers` is `{}` (initial probe), and Pass 2 matches `aiAnswers` by `key`, `key.slice(0, 200)`, or `field.key`/`field.id` with case-insensitive trimmed option matching.

- [ ] **Step 1: Write failing tests in `tests/ai-screening-answers.test.mjs` and `tests/verified-combobox-writer.test.mjs`**

1. In `tests/ai-screening-answers.test.mjs`:
   - Test case-insensitive option matching in Pass 2 (`aiAnswers: { 'work authorization': 'yes' }` selects option `'Yes'`).
   - Test lookup when question label > 200 chars (`id = key.slice(0, 200)` still resolves in Pass 2).
   - Test that unresolved `authorized_in_usa` / `needs_sponsorship` / unrecognized checkbox enter `questions[]` (while `date_of_birth` stays excluded) and that `result.questionMeta` exposes `{ fieldId, combo, required, planStatus }`.
   - Test that Pass 1 with `aiAnswers = {}` does NOT invoke `readChoices()` for `combobox` fields.
2. In `tests/verified-combobox-writer.test.mjs`:
   - Test `readChoices()` dispatches `ArrowDown` fallback when initial trigger click renders no options, then returns options that appear afterward.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --experimental-strip-types --test tests/ai-screening-answers.test.mjs tests/verified-combobox-writer.test.mjs`
Expected: FAIL on the new assertions.

- [ ] **Step 3: Implement fixes in `jobright_extension/core/field-writer.js` and `jobright_extension/core/application.js`**

1. In `jobright_extension/core/field-writer.js` (`readChoices`):
   - Mirror `fillCombo()` opening logic: click `trigger` (and `.select__control` parent if distinct), poll up to 400ms, and if still empty dispatch `ArrowDown` keydown/keyup on `trigger || el` and poll up to 250ms before closing in `finally`.
2. In `jobright_extension/core/application.js`:
   - Line 852: keep ONLY `'date_of_birth'` blocked from AI (`if (plan.factKey === 'date_of_birth') continue;`).
   - Line 854: if `aiAnswers && Object.keys(aiAnswers).length === 0 && field.kind === 'combobox'`, skip `readChoices()` in Pass 1 (`choices = plan.options?.length ? plan.options : []`).
   - Line 859: resolve `aiReply` from `aiAnswers[key] ?? aiAnswers[key.slice(0, 200)] ?? (field.key ? aiAnswers[field.key] : undefined) ?? (field.id ? aiAnswers[field.id] : undefined)`. If `typeof aiReply === 'string'`, when `options.length > 0`, find `matchedOption = options.find(o => o.trim().toLowerCase() === aiReply.trim().toLowerCase())`; apply `matchedOption` if found, else skip.
   - Line 1208–1211: remove `else { autoValue = false; }` for unrecognized checkboxes.
   - Line 1219: populate `questionMeta[qid] = { fieldId: field.id || field.name || field.key || qid, combo: field.kind === 'combobox', required: Boolean(field.required), planStatus: plan.status, factKey: plan.factKey || null }`, keep `questions.push({ id: qid, label: label.slice(0, 2000), type: field.kind, options })`, and include `questionMeta` on the return object (keeping existing properties intact).

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --experimental-strip-types --test tests/ai-screening-answers.test.mjs tests/verified-combobox-writer.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add jobright_extension/core/field-writer.js jobright_extension/core/application.js tests/ai-screening-answers.test.mjs tests/verified-combobox-writer.test.mjs
git commit -m "fix(extension): improve combobox option capture, unblock grounded AI questions, and fix Pass 2 matching"
```

---

### Task 4: Wire Side Panel (`panel.html` & `panel.js`) to Hybrid `AIRouter` (Stage A + Stage B) & Surface Errors

**Files:**
- Modify: `jobright_extension/panel.html:77`
- Modify: `jobright_extension/panel.js:178,428-434,982-1044,1267-1296,1579-1719`
- Test: `tests/ai/mv3-lifecycle-and-rescan.test.mjs`, `tests/e2e/extension-ai-autofill.spec.ts`

**Interfaces:**
- Consumes: `AIRouter` (`./core/ai-router.js`), `buildVerifiedFacts`, `inferQuestionDescriptor` (`./core/ai/planner-bundle.js`), `NextkinFieldWriter.readChoices` (via `chrome.scripting.executeScript` in target frame).
- Produces:
  - `#ai-screening` defaulting to checked when `chrome.storage.local.aiScreeningEnabled` is unset, persisted on change.
  - `extension_byok` keys stored only in `chrome.storage.session` (omitted from `PUT /api/extension/ai/settings`); `loadAiSettings()` refreshing on `accountChanged` and hydrating `chrome.storage.session` metadata.
  - `draftScreening()` executing Stage A (`AIRouter.plan` + `deferred` combobox `readChoices` + `AIRouter.choose`) and Stage B (strict prose-only `generate-answer` or direct `ProviderClient`), throwing actionable errors to `#notice` instead of silently swallowing them.

- [ ] **Step 1: Write failing tests for `panel.js` wiring and E2E autofill**

1. Update/add unit test in `tests/ai/mv3-lifecycle-and-rescan.test.mjs` (or a new `tests/ai/panel-ai-router-wiring.test.mjs` loaded via `node --test`) verifying:
   - `panel.js` imports/loads `core/ai-router.js` and `core/ai/planner-bundle.js`, does NOT reference `answer-drafts`, does NOT send `apiKey` in `PUT ai/settings` when `mode === 'extension_byok'`, and passes Stage A structured fields to `router.plan` + `router.choose` and prose-only fields to Stage B.
2. Add an E2E assertion in `tests/e2e/extension-ai-autofill.spec.ts` driving the side panel autofill button (`#autofill`) against a mock ATS page with text, select, combobox, work-auth, and prose textarea fields to prove Stage A + Stage B + error surfacing work end-to-end.

- [ ] **Step 2: Run the new unit test to verify it fails**

Run: `node --experimental-strip-types --test tests/ai/mv3-lifecycle-and-rescan.test.mjs`
Expected: FAIL on `panel.js` `AIRouter` wiring assertions.

- [ ] **Step 3: Implement `panel.html` & `panel.js` updates**

1. In `jobright_extension/panel.html`:
   - Set `<input type="checkbox" id="ai-screening" checked>` (and let `panel.js` sync/override from `chrome.storage.local.get('aiScreeningEnabled')`).
2. In `jobright_extension/panel.js`:
   - Load `aiScreeningEnabled` from `chrome.storage.local` on startup (`checked = stored.aiScreeningEnabled !== false`) and save on `$('ai-screening').addEventListener('change', ...)`.
   - On `accountChanged` in `refresh()`, reset `aiSettingsLoaded = false` and `aiSettingsDirty = false`, and clear `ai_api_key` / `ai_provider_*` in `chrome.storage.session` before `loadAiSettings(true)`.
   - In `loadAiSettings()`, also mirror `{ ai_provider_mode, ai_provider_type, ai_base_url, ai_model_id }` into `chrome.storage.session`.
   - In `$('#ai-save-settings')` click handler: when `mode === 'extension_byok'`, omit `apiKey` from the `PUT ai/settings` body and store `ai_api_key` strictly in `chrome.storage.session`.
   - Replace `draftScreening()` with:
     - Resolve active AI settings from `chrome.storage.session` (falling back to `GET ai/settings`), normalize `'local'` -> `'local_direct'`.
     - If `mode === 'extension_byok'` and `!apiKey`, throw `new Error('Enter your API key in AI Provider Settings for Extension Direct BYOK (or switch to Portal Encrypted BYOK).')`.
     - Dynamically import `core/ai-router.js` and `core/ai/planner-bundle.js` via `chrome.runtime.getURL(...)`.
     - **Stage A:** Build `facts = buildVerifiedFacts(profile, reusable)` and `planFields` (attaching `fieldId`, `combo`, `required` from `result.questionMeta`). Call `router.plan(planFields, { facts, candidateId: profile.id, answerBank: reusable }, { jobTitle: job?.title, company: job?.company, url: frame.result.url })`. Apply returned `fills` into `answers` keyed by question ID (`meta` / label match). For each item in `planRes.deferred`, map to the unique unanswered combobox field (`questionMeta` -> `fieldId` / index / label), read live DOM options in the target frame via `chrome.scripting.executeScript` calling `NextkinFieldWriter.readChoices`, and call `router.choose(...)`, writing non-null `choice` into `answers`.
     - **Stage B:** Filter remaining unanswered questions where `!q.options?.length`, `(q.type === 'textarea' || OPEN_PROSE_REGEX.test(q.label))`, and `inferQuestionDescriptor({ id: q.id, label: q.label, type: q.type }).category === ''` and not `privateAnswer` / `manualQuestion` / `CONSEQUENTIAL_FACTS`. For each eligible prose question (concurrency 3), call `router.generateTextAnswer(...)` (`extension_byok` / `local_direct`) or `api('generate-answer', ...)` (`server` / `portal_byok`).
     - Remove `answer-drafts` calls; collect errors from Stage A/B and throw/surface the first fatal auth/config/provider error if no answers succeeded (or show a warning notice alongside partial results).

- [ ] **Step 4: Run unit & E2E tests**

Run: `node --experimental-strip-types --test tests/ai/mv3-lifecycle-and-rescan.test.mjs tests/ai-screening-answers.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add jobright_extension/panel.html jobright_extension/panel.js tests/ai/mv3-lifecycle-and-rescan.test.mjs tests/e2e/extension-ai-autofill.spec.ts
git commit -m "feat(extension): wire side panel autofill to 4-mode AIRouter hybrid planner and prose fallback"
```

---

### Task 5: Rebuild Bundle, Run Full Verification Suite, and Configure & Deploy Vercel (`marketing-job-wufj`)

**Files:**
- Modify (generated): `jobright_extension/core/ai/planner-bundle.js`, `dist/planner-bundle.meta.json` (if source bundle inputs changed)

- [ ] **Step 1: Rebuild extension AI bundle & run typecheck, lint, unit tests, and Playwright E2E**

Run: `npm run bundle:extension-ai && npm run typecheck && npm run lint && npm run test:unit`
Expected: All pass with 0 errors.

Run: `npx playwright test tests/e2e/extension-ai-autofill.spec.ts`
Expected: All E2E extension tests pass.

- [ ] **Step 2: Configure `SERVER_ENABLE_VERCEL_AI_SDK=true` on Vercel (`marketing-job-wufj`)**

Use Vercel MCP (`create_project_env`) on project `prj_Za8wJmm0qe4YFwNPlQm59DsPluIF` (`team_xONSPpXUXUmpWz1dovQAvMyF`) to set `SERVER_ENABLE_VERCEL_AI_SDK=true` for `["preview", "production"]`.

- [ ] **Step 3: Push & verify production deployment on `www.nextkinhr.com`**

Once the user confirms pushing `main` (or deploying), push commits, confirm the Vercel production deployment reaches `READY`, and verify `/api/extension/autofill/plan` and `/api/extension/generate-answer` in Vercel runtime logs show no errors.
