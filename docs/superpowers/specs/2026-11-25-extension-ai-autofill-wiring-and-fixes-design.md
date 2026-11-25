# Extension AI Autofill Wiring & Backend Reliability Fix Design

**Date:** 2026-11-25  
**Status:** Draft (Pending Builder Check & User Approval)  
**Topic:** Wiring `jobright_extension` (`panel.js` + `application.js`) to the 4-mode `AIRouter` (`/api/extension/autofill/plan` & `/choose`), fixing field-drop and silent-failure bugs, hardening `generate-answer` + `ai/settings` for reasoning models and BYOK, and enabling `SERVER_ENABLE_VERCEL_AI_SDK` on `marketing-job-wufj`.

---

## 1. Intent & The Why

An end-to-end audit of Vercel (`marketing-job-wufj` at `https://www.nextkinhr.com`), production Supabase (`yzworkrtgbcrsewjsfsg`), and the Chrome extension (`jobright_extension/`) found that:
1. The server AI credentials (`OPENAI_BASE_URL=https://api.cent-ai.dev/v1`, `OPENAI_MODEL=hy4-flash:free`, `OPENAI_API_KEY`, `AI_PROVIDER_ENCRYPTION_KEY`) on `marketing-job-wufj` are valid, **but `panel.js` never calls the new `AIRouter` (`jobright_extension/core/ai-router.js`) or `/api/extension/autofill/plan` & `/choose`**.
2. Instead, `panel.js` still calls `/api/extension/generate-answer` and `/api/extension/answer-drafts`, which ignores `extension_byok`/`local` modes, silently swallows HTTP/decryption/empty-content errors, and skips `answer-drafts` whenever `job.description` is missing or under 40 characters.
3. Even when AI runs, `application.js` and `field-writer.js` drop valid questions and answers due to: `#ai-screening` defaulting to unchecked, `application.js` line 852 blocking work-auth/visa fields from AI, `application.js` line 1210 defaulting unknown checkboxes to `false`, `readChoices` failing to open async comboboxes, `application.js` line 859 requiring case-sensitive `options.includes(...)`, and key truncation (`key.slice(0, 200)` vs untruncated `key`).
4. On the backend, `SERVER_ENABLE_VERCEL_AI_SDK` is unset on Vercel (defaulting `autofill-orchestrator.ts` to the legacy `ProviderClient`), `ai-router.js` sends `{ fields, facts, context, mode }` instead of `{ candidateId, fields, context, answerBank }`, `ai/settings` allows saving `portal_byok` with no API key, and `generate-answer` swallows BYOK decryption errors silently and can return empty text on reasoning models like `hy4-flash:free`.

This design wires the extension to the 4-mode `AIRouter` hybrid pipeline while preserving grounded prose generation for open-ended screening questions, fixes the DOM/matching drops, and hardens backend + Vercel configuration.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- **Wire `panel.js` to `AIRouter` + `planner-bundle.js`:** Load `AIRouter` (`core/ai-router.js`) and `buildVerifiedFacts` (`core/ai/planner-bundle.js`) in the side panel so all 4 modes (`server`, `portal_byok`, `extension_byok`, `local_direct`) execute as designed.
- **Align `AIRouter` and `/api/extension/autofill/*` contracts:** Ensure `AIRouter.plan()` and `AIRouter.choose()` send `{ candidateId, fields, context, answerBank }` in proxy modes (`server`, `portal_byok`) while keeping local/extension BYOK (`extension_byok`, `local_direct`) working with `VerifiedFact` maps and preserving backwards compatibility for existing unit/E2E tests.
- **Support Both Structured Fields AND Open-Ended Prose Questions:**
  - Use `AIRouter.plan()` (`planFormBatch`) + live DOM `readChoices` -> `AIRouter.choose()` (`chooseComboboxOption`) for structured/factual/choice/combobox fields with strict `validateGroundedAnswer` verification.
  - Route remaining open-ended prose questions (bio, cover letter, "why this company/role", open textareas) that `validateGroundedAnswer` intentionally does not classify as structured facts through `generate-answer` (using the same active 4-mode credential routing for `server`/`portal_byok` or direct browser `ProviderClient` for `extension_byok`/`local`).
- **Fix Extension Field-Drop & UI Bugs:**
  - Persist `#ai-screening` checkbox preference (defaulting to `checked` when unset) so users do not silently get zero AI answers.
  - Remove silent `catch {}` swallowing in `panel.js` `draftScreening()` and surface clear, actionable error/status notices (e.g., missing BYOK key, 401 auth failure, provider timeout/error).
  - Fix `application.js` Pass 2 matching (`case-insensitive` + trimmed option lookup, consistent key length without `slice(0, 200)` mismatch).
  - Allow work-auth/visa/sponsorship fields to be planned by `AIRouter` (where `validateGroundedAnswer` enforces strict truth-table & negation checks against `VerifiedFact`), while continuing to block `date_of_birth` from AI.
  - Stop defaulting unrecognized non-legal checkboxes to `false` before AI sees them.
  - Upgrade `readChoices()` in `field-writer.js` with `ArrowDown` fallback + 400ms wait (matching `fillCombo`) so async combobox options are captured for `chooseComboboxOption`.
- **Harden Backend & Vercel Production Config:**
  - Set `SERVER_ENABLE_VERCEL_AI_SDK=true` on Vercel project `marketing-job-wufj` so `ServerVercelProviderClient` (Zod structured outputs + 3-tier fallback) is enabled.
  - Fix `autofill-orchestrator.ts` `createSafeAgent(defaultBaseUrl, { allowCustom: true })` so valid custom `OPENAI_BASE_URL` / `AI_PROVIDER_DEFAULT_BASE_URL` hosts aren't blocked inconsistently with `test-connection`.
  - Fix `generate-answer/route.ts`: read `AI_PROVIDER_DEFAULT_* || OPENAI_*`, stop swallowing BYOK decrypt/missing-key errors (fail fast with 401 when `portal_byok` has no valid key), fix `/v1` URL normalization (do not corrupt `/v1beta/openai`), and reject empty `result.text` from reasoning-token exhaustion with a 502 error instead of `{ ok: true, answer: "" }`.
  - Fix `ai/settings/route.ts`: reject `PUT` with `mode: 'portal_byok'` if no `apiKey` is supplied and no secret is stored yet.

### Non-Goals
- Rewriting ATS-specific DOM adapters (`adapters/ats-adapters.js`) or `form-discovery.js`.
- Removing `/api/extension/answer-drafts` (`extension-answers/service.ts`) or changing background task queue architecture (`source_sync` / `pdfjs-dist` worker packaging are separate tasks).
- Bundling `@ai-sdk/openai-compatible` or `ai` into `jobright_extension/core/ai/planner-bundle.js`.

### Anti-Goals
- **Never bypass `validateGroundedAnswer` for factual fields:** Work authorization, visa sponsorship, experience years, education degree tiers, and certifications must never be fabricated or inferred beyond `VerifiedFact`.
- **Never send `date_of_birth`, passwords, SSN, or marketing opt-in checkboxes to AI.**
- **Never silently fall back to server keys when `portal_byok`, `extension_byok`, or `local` is configured and fails authentication.**

---

## 3. Approaches Considered & Trade-Offs

1. **Approach 1 (Selected): Wire Extension to `AIRouter` Hybrid Pipeline + Fix Legacy Gaps**
   - `panel.js` dynamically loads `core/ai-router.js` + `core/ai/planner-bundle.js`, dispatches structured/choice/combobox fields via `AIRouter.plan()` / `AIRouter.choose()`, dispatches open-ended prose questions via `generate-answer` (or direct `ProviderClient` in `extension_byok`/`local`), and fixes `application.js`, `field-writer.js`, `autofill-orchestrator.ts`, `generate-answer/route.ts`, and `ai/settings/route.ts`.
   - **Trade-offs:** Slightly larger scope across extension + backend, but aligns the live product with all 4 AI settings modes, eliminates dead code, and activates `ServerVercelProviderClient` in production.
2. **Approach 2 (Rejected): Patch Legacy `generate-answer` + `panel.js` Only**
   - Faster single-path fix, but leaves `extension_byok`, `local`, `AIRouter`, `/api/extension/autofill/plan`, `/choose`, and `ServerVercelProviderClient` dead code.

---

## 4. Architecture & Component Changes

### 4.1 Extension Side Panel (`jobright_extension/panel.html`, `panel.js`)
- **Module loading:** Keep `panel.js` compatible with existing non-module `<script defer>` loading (and any CommonJS/test requires on `panel.js`) by dynamically importing `./core/ai-router.js` and `./core/ai/planner-bundle.js` via `import(chrome.runtime.getURL(...))` inside an async helper with graceful fallback in unit-test environments.
- **AI toggle default & persistence (Call):** Default `#ai-screening` to `checked` when no user preference is saved in `chrome.storage.local` (`aiScreeningEnabled`), and persist user changes on `change`.
- **Active AI config resolution & `extension_byok` isolation (Call):**
  - Read `ai_provider_mode` (`server` | `portal_byok` | `extension_byok` | `local`), `ai_provider_type`, `ai_base_url`, `ai_model_id`, and `ai_api_key` from `chrome.storage.session` (hydrated from `GET /api/extension/ai/settings` in `loadAiSettings()`, resetting `aiSettingsLoaded` on account change and mapping `'local'` -> `'local_direct'` for `AIRouter`).
  - When `mode === 'extension_byok'`, `panel.js` stores `ai_api_key` **only** in `chrome.storage.session` and does **not** send `apiKey` to `PUT /api/extension/ai/settings`. If `ai_api_key` is missing (e.g., after a browser restart or web-portal save), `draftScreening()` fails fast with a clear `#notice` error prompting the user to enter their API key in AI Provider Settings (or switch to Portal Encrypted BYOK).
- **Two-stage AI drafting in `draftScreening()` (Call):**
  - Remove the `/api/extension/answer-drafts` fallback from `panel.js` `draftScreening()` completely so BYOK/local modes never silently fall back to server keys and direct ATS pages without a 40-char JD aren't gated.
  1. **Stage A (Structured Plan + Combobox Choose via `AIRouter`):**
     - Build `facts = buildVerifiedFacts(profile, reusableAnswerBank)` for local/direct modes and pass `{ candidateId: profile.id, fields: planFields, context: { jobTitle, company, url }, answerBank }` to `router.plan(...)`.
     - For `deferred` comboboxes returned by `plan()`, resolve each unique `fieldId` (falling back to index/label match) and open the DOM widget via `readChoices()` in the active frame, passing the captured options to `router.choose(...)`.
  2. **Stage B (Open-Ended Prose Questions):**
     - Only fields still unanswered after Stage A that have `!options.length`, are `type === 'textarea'` or match open-ended prose screening patterns (`bio`, `summary`, `cover letter`, `why`, `describe`, `explain`, `tell us`, `motivation`, `additional information`, etc.), AND do **not** match `inferQuestionDescriptor(q).category !== ''`, `CONSEQUENTIAL_FACTS`, `privateAnswer`, or `manualQuestion` are eligible for Stage B.
     - Route Stage B directly via `ProviderClient` in `extension_byok` / `local_direct` modes (using the saved `baseUrl`, `model`, `apiKey`), OR via `POST /api/extension/generate-answer` in `server` / `portal_byok` modes.
     - Surface explicit errors (missing BYOK key, 401 auth failure, 422 image model, 502 provider/empty output, 503 unconfigured) in `#notice` instead of silently swallowing them.

### 4.2 `AIRouter` Contract Alignment (`jobright_extension/core/ai-router.js`)
- Update `AIRouter.plan(fields, factsOrOptions, context = {})` and `AIRouter.choose(question, options, factsOrOptions, context = {})`:
  - Support passing either a `VerifiedFact` `Map` (preserving existing unit/E2E tests) or `{ facts, candidateId, answerBank }` (or `options.candidateId` / `options.answerBank`).
  - In proxy modes (`server`, `portal_byok`), send `{ candidateId, fields, context, answerBank }` to `/api/extension/autofill/plan` and `{ candidateId, question, options, context, answerBank }` to `/api/extension/autofill/choose`, matching `PlanApiRequest` and `ChooseApiRequest` in `src/lib/ai/autofill-orchestrator.ts`.
  - Keep `this.fetchFn` bound cleanly via `(...args) => globalThis.fetch(...args)` for Chrome MV3 window context safety.

### 4.3 Form Execution & Matching Fixes (`jobright_extension/core/application.js`, `field-writer.js`)
- **`application.js` question collection & Pass 2 matching (Call):**
  - Keep Pass 1 deterministic profile-fact heuristics (lines 884–1207) active when a profile value matches locally, so autofill works instantaneously even when AI is unchecked; remove `authorized_in_usa`, `needs_sponsorship`, `visa_status`, `work_authorization`, and `citizenship_status` from the line 852 AI exclusion list (keeping `date_of_birth` strictly excluded from AI and `manualQuestion` exclusions intact) so any field Pass 1 could not resolve falls through to `AIRouter`'s strict `validateGroundedAnswer` validation.
  - Remove the blanket `else { autoValue = false; }` on unrecognized checkboxes (lines 1208–1211) so unrecognized checkboxes are passed for AI/review rather than forced to `false`.
  - Skip calling `writer.readChoices(field)` on `combobox` fields during Pass 1 when `aiAnswers` is an empty object (`Object.keys(aiAnswers).length === 0`) so combobox widgets are only opened once (for `deferred` items in Stage A).
  - Preserve the 4-key `{ id, label, type, options }` shape on `result.questions[]` (keeping `tests/ai-screening-answers.test.mjs` intact) while exposing a sibling `result.questionMeta` (keyed by `question.id` / index) containing `{ fieldId, combo, required, planStatus }` for `AIRouter` and `deferred` disambiguation.
  - In Pass 2 lookup (`aiAnswers`), match by exact `key`, truncated `key.slice(0, 200)`, or `field.key` / `field.id`, and perform **case-insensitive + trimmed** option matching when `options.length > 0`.
- **`field-writer.js` `readChoices()`:**
  - Extend `readChoices()` to match `fillCombo()`'s opening sequence: click trigger (and `.select__control` parent if applicable), wait up to 400ms, and send `ArrowDown` fallback if options haven't rendered yet, before closing.

### 4.4 Backend & Settings Hardening (`src/lib/ai/autofill-orchestrator.ts`, `src/app/api/extension/generate-answer/route.ts`, `src/app/api/extension/ai/settings/route.ts`)
- **`autofill-orchestrator.ts` (Call):**
  - Pass `{ allowCustom: true }` to `createSafeAgent(targetUrl, { allowCustom: true })` for **both** `portal_byok` (line 176) and `defaultBaseUrl` (line 212) so `"Custom Endpoint"` works consistently across `test-connection` and `autofill/plan`/`choose` while still blocking private/loopback/metadata IPs and non-HTTP(S) schemes.
- **`generate-answer/route.ts`:**
  - Resolve server defaults from `AI_PROVIDER_DEFAULT_BASE_URL || OPENAI_BASE_URL` and `AI_PROVIDER_DEFAULT_API_KEY || OPENAI_API_KEY` and `AI_PROVIDER_DEFAULT_MODEL || OPENAI_MODEL` (defaulting to `https://api.openai.com/v1` + `gpt-4o-mini` consistently with `autofill-orchestrator.ts`).
  - Do **not** wrap `portal_byok` lookup + `decryptSecret` in a silent `catch {}`: if `userConfig` is in portal BYOK mode (`mode === 'portal_byok'` or `routing === 'proxy'`) and the secret is missing or fails decryption, throw `CaptureError('Custom provider authentication failed. Re-save your API key in AI Provider Settings.', 401)`.
  - Fix `normalizedBaseUrl` helper (reuse `resolveAiSdkBaseUrl` from `server-provider-client.ts` or avoid appending `/v1` when a versioned path like `/v1beta/openai` is already present).
  - Throw `CaptureError('AI provider returned an empty response (try increasing tokens or switching from a reasoning-only model).', 502)` when `rawAnswer` is empty after `generateText`.
- **`ai/settings/route.ts` (Call):**
  - On `PUT`, validate **before** deleting `user_ai_provider_secrets`: if target `mode === 'portal_byok'` and `!isNewKey` and (`incomingApiKey === null` or `incomingApiKey === ''` or `!existingSecret?.encrypted_api_key`), return HTTP `400` (`'An API key is required for Portal Encrypted BYOK mode.'`) without modifying the database.
- **Vercel (`marketing-job-wufj`):**
  - Set `SERVER_ENABLE_VERCEL_AI_SDK=true` on `marketing-job-wufj` (`preview` and `production`) and redeploy once changes land.

---

## 5. What Is Left to the Builder
- Exact helper function names, file splitting in `panel.js` / `application.js`, and test mock fixtures.
- Rebuilding `jobright_extension/core/ai/planner-bundle.js` via `npm run bundle:extension-ai` if `src/lib/ai/*` files included in the bundle change.
- Updating/adding unit tests (`tests/ai/*.test.mjs`, `tests/*.test.mjs`) and Playwright extension E2E tests (`tests/e2e/extension-ai-autofill.spec.ts`) to cover the new `panel.js` -> `AIRouter` wiring, open-ended prose routing, case-insensitive option matching, and `portal_byok` strict error handling.
