# FreeHire AI Autofill Engine: Hybrid Provider & Planning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade NextKinHR's `jobright_extension` and Next.js backend with FreeHire's structured AI form planning (`Plan`), combobox option selection (`Choose`), and strictly typed anti-hallucination validation (`groundedIn`), powered by a 4-mode hybrid AI provider architecture (Server default, Portal encrypted BYOK, Extension direct BYOK, and Local Ollama/LM Studio) with two-table database secret isolation, socket-bound SSRF/DNS-rebinding protection, and dynamic conditional rescanning.

**Architecture:** A 4-mode hybrid autofill engine where deterministic profile slotting and Answer Bank execute first at zero token cost, while unresolved screening questions and dynamic dropdowns are resolved via a shared TypeScript FreeHire planning core (`Plan`, `Choose`, `groundedIn`). The engine supports direct client-side execution for local/extension keys and secure Next.js proxy execution for server/portal-encrypted keys, backed by two-table Supabase secret isolation with AAD binding, socket-level IP binding for SSRF/DNS-rebinding defense, MV3 resumable session tracking, and dynamic conditional question rescanning.

**Tech Stack:** TypeScript, Next.js 15 (App Router, Node.js runtime), Supabase (PostgreSQL with RLS), Node.js native test runner (`node:test`, `node:assert/strict`), Playwright (`@playwright/test`), Vanilla JavaScript Chrome Manifest V3 Extension, AES-256-GCM encryption with AAD, Zod schema validation, jsdom DOM fixtures.

**Spec:** `docs/superpowers/specs/2026-11-24-freehire-ai-autofill-hybrid-provider-design.md`

## Global Constraints
- Preserve all 74 existing ATS adapters in `jobright_extension/adapters/ats-adapters.js` with zero regressions.
- FreeHire algorithms ported from pinned commit `strelov1/freehire@2843637c09fb818fb64d4e7979638ff350b500c7` with full MIT attribution.
- Two-table database isolation: `private.user_ai_provider_secrets` has all grants revoked from `anon` and `authenticated`; accessible strictly via server `service_role`.
- Dedicated `AI_PROVIDER_ENCRYPTION_KEY` used for credential encryption with authenticated additional data (`user_id:key_origin`); never reuse `EMAIL_TOKEN_ENCRYPTION_KEY`.
- Extension sets `chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })` after auditing and migrating content script access to messaging.
- Extension-only keys store in `chrome.storage.session` by default; persistent storage requires explicit user opt-in.
- Next.js backend proxy enforces outbound SSRF socket IP binding with TLS SNI verification and approved destination whitelist.
- Outbound proxy requests strictly disable automatic redirects (`redirect: 'error'`).
- AI model responses are never trusted to self-verify; `groundedIn` independently validates typed evidence IDs and detects negation reversals.
- Candidate ownership (`user_id = auth.uid()`) is strictly validated on every authenticated server route.
- Backward compatibility maintained for `/api/extension/generate-answer`.
- Server-enforced feature flag: `SERVER_ENABLE_STRUCTURED_AI_PLANNER`.
- Application submission tracking: Application marked as applied ONLY after confirmed submission verification, never upon autofill completion.

## Review Focus
1. Negation reversal on immigration questions (*"Candidate requires sponsorship: false"* vs AI answering *"Yes"* or *"Requires sponsorship"*): Rejected by `groundedIn` with `source: 'unresolved'` and `action: 'skip'`.
2. Hallucinated experience/degree escalation (*"Candidate has 3 years Java / Bachelor's"* vs AI claiming *"7 years Java / Master's"*): Rejected by `groundedIn` with numeric and qualification ceiling rules.
3. Server proxy SSRF evasion (e.g. `http://169.254.169.254`, IPv6 `::ffff:127.0.0.1`, or DNS rebinding to internal IP): Blocked by `ssrf-guard.ts` via socket IP binding before TLS/HTTP handshake.
4. MV3 service worker termination during multi-question autofill: Resumable session state in `chrome.storage.session` recovers without duplicate LLM calls or ghost fills.
5. Dynamic conditional question rendering (selecting "Yes" dynamically renders "Please explain" textarea): MutationObserver rescans and schedules an incremental planning turn.

---

### Task 1: Two-Table Supabase Secret Isolation, Migration & AAD-Bound AES-256-GCM Encryption

**Files:**
- Create: `supabase/migrations/20261124000200_user_ai_provider_configs.sql`
- Create: `src/lib/ai/encryption.ts`
- Create: `tests/ai/encryption.test.mjs`
- Create: `tests/ai/provider-database-isolation.test.mjs`

**Interfaces:**
- Consumes: `process.env.AI_PROVIDER_ENCRYPTION_KEY`, Supabase database client.
- Produces: `encryptSecret(plain: string, userId: string, origin: string): { encrypted: string, iv: string, authTag: string }`, `decryptSecret(payload: EncryptedSecretPayload, userId: string, expectedOrigin: string): string`.

- [ ] **Step 1: Write the failing tests in `tests/ai/encryption.test.mjs` and `tests/ai/provider-database-isolation.test.mjs`**
Test that:
1. `encryptSecret` uses AES-256-GCM with a unique 12-byte IV, 16-byte auth tag, and binds AAD to `${userId}:${origin}`.
2. `decryptSecret` successfully decrypts when given matching secret, user ID, and origin; throws if ciphertext or auth tag is tampered.
3. `decryptSecret` throws if called with a mismatched user ID or origin (origin & identity binding).
4. Direct client query to `private.user_ai_provider_secrets` is blocked by database permissions.

- [ ] **Step 2: Run tests to verify they fail**
Run: `node tests/ai/encryption.test.mjs`
Expected: FAIL (module `src/lib/ai/encryption.ts` does not exist).

- [ ] **Step 3: Implement AES-256-GCM encryption in `src/lib/ai/encryption.ts` and migration in `supabase/migrations/`**
Implement authenticated encryption with `crypto.createCipheriv('aes-256-gcm', key, iv)`. Set AAD with `cipher.setAAD(Buffer.from(`${userId}:${origin}`))`. Implement `20261124000200_user_ai_provider_configs.sql` creating `public.user_ai_provider_configs` and `private.user_ai_provider_secrets` with RLS and grant revocations.

- [ ] **Step 4: Run tests to verify they pass**
Run: `node tests/ai/encryption.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add supabase/migrations/20261124000200_user_ai_provider_configs.sql src/lib/ai/encryption.ts tests/ai/encryption.test.mjs tests/ai/provider-database-isolation.test.mjs
git commit -m "feat(ai): add two-table provider secret isolation and AES-256-GCM AAD-bound encryption"
```

---

### Task 2: Outbound Proxy SSRF Guard with Bound-IP TLS Connection & DNS Rebinding Immunity

**Files:**
- Create: `src/lib/ai/ssrf-guard.ts`
- Create: `tests/ai/ssrf-guard.test.mjs`

**Interfaces:**
- Consumes: Target `baseUrl: string`.
- Produces: `createSafeAgent(url: string, options?: { allowCustom?: boolean }): { agent: http.Agent | https.Agent; validatedUrl: string }`.

- [ ] **Step 1: Write the failing test in `tests/ai/ssrf-guard.test.mjs`**
Test that `createSafeAgent`:
1. Accepts approved hosts: `https://api.openai.com/v1`, `https://openrouter.ai/api/v1`, `https://api.deepseek.com/v1`, `https://api.groq.com/openai/v1`, `https://api.mistral.ai/v1`, `https://api.xkiro.com/v1`.
2. Blocks loopback: `http://127.0.0.1`, `http://localhost:11434`, `http://[::1]`.
3. Blocks RFC1918 private IPs: `http://10.0.0.1`, `http://172.16.0.5`, `http://192.168.1.1`.
4. Blocks cloud metadata IPs: `http://169.254.169.254`, `http://metadata.google.internal`.
5. Blocks IPv4-mapped IPv6: `http://[::ffff:127.0.0.1]`.
6. Disables automatic redirects (`redirect: 'error'`).
7. Connects the actual TCP socket to the validated IP while setting `servername: hostname` on TLS connections to defeat DNS rebinding attacks.

- [ ] **Step 2: Run test to verify it fails**
Run: `node tests/ai/ssrf-guard.test.mjs`
Expected: FAIL

- [ ] **Step 3: Implement `createSafeAgent` in `src/lib/ai/ssrf-guard.ts`**
Implement pre-resolution DNS lookup, IP blocklist validation, and custom `createConnection` in `http.Agent`/`https.Agent` binding socket connection to the verified IP with `servername: hostname`.

- [ ] **Step 4: Run test to verify it passes**
Run: `node tests/ai/ssrf-guard.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/lib/ai/ssrf-guard.ts tests/ai/ssrf-guard.test.mjs
git commit -m "feat(ai): add outbound proxy SSRF guard with socket-bound IP connection and TLS SNI preservation"
```

---

### Task 3: Candidate VerifiedFact Builder & Candidate Schema Mapping

**Files:**
- Create: `src/lib/ai/verified-facts.ts`
- Create: `tests/ai/verified-facts.test.mjs`

**Interfaces:**
- Consumes: `Candidate`, `confirmed_facts`, resume parsed data, and Answer Bank entries.
- Produces: `buildVerifiedFacts(candidate: Candidate, answerBank?: Map<string, string>): Map<string, VerifiedFact>`.

- [ ] **Step 1: Write the failing test in `tests/ai/verified-facts.test.mjs`**
Test that `buildVerifiedFacts`:
1. Maps candidate name, contact, and structured location (`city`, `state`, `country`, `zip_code`) into typed `VerifiedFact` objects with IDs like `profile.location.city`.
2. Strictly maps `visa_status`, `authorized_in_usa`, `need_sponsorship_now`, and `need_sponsorship_future` as distinct typed facts.
3. Maps `total_experience_years` and skill-specific experience into numeric facts.
4. Maps `highest_qualification` and `university_name` into education facts.
5. Maps `certifications` into a normalized list of certification facts.
6. Maps approved Answer Bank entries into `answer_bank.{topic}` facts.
7. Omits unconfirmed fields so that missing facts are never treated as blank or truthy defaults.

- [ ] **Step 2: Run test to verify it fails**
Run: `node tests/ai/verified-facts.test.mjs`
Expected: FAIL

- [ ] **Step 3: Implement `buildVerifiedFacts` in `src/lib/ai/verified-facts.ts`**
Implement typed extraction and normalization across personal, contact, work auth, experience, education, and Answer Bank sources.

- [ ] **Step 4: Run test to verify it passes**
Run: `node tests/ai/verified-facts.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/lib/ai/verified-facts.ts tests/ai/verified-facts.test.mjs
git commit -m "feat(ai): implement candidate VerifiedFact builder mapping profile, resume, and Answer Bank into typed evidence"
```

---

### Task 4: Question-Specific Typed Grounding Engine (`src/lib/ai/grounded.ts`)

**Files:**
- Create: `src/lib/ai/grounded.ts`
- Create: `tests/ai/grounded.test.mjs`

**Interfaces:**
- Consumes: Proposed answer string, `facts: Map<string, VerifiedFact>`, question descriptor.
- Produces: `validateGroundedAnswer(answer: string, facts: Map<string, VerifiedFact>, question: QuestionDescriptor): GroundingResult`.

- [ ] **Step 1: Write the failing test in `tests/ai/grounded.test.mjs`**
Test that `validateGroundedAnswer`:
1. Rejects answers relying on word-overlap without verified fact backing.
2. Rejects negation reversal on sponsorship: when `profile.work_auth.need_sponsorship_future` is `false`, rejects `"Yes"` or `"I require sponsorship"`.
3. Rejects experience inflation: when candidate has 3 years experience, rejects `"5 years"`, `"7 years"`, or `"10+ years"`.
4. Rejects degree elevation: when candidate has `"Bachelor's"`, rejects `"Master's degree"` or `"Doctorate"`.
5. Rejects unconfirmed certifications: rejects `"AWS Certified"` when not in `profile.certifications`.
6. Populates `evidenceIds: string[]` citing the exact fact IDs supporting the answer.
7. Returns `{ valid: false, source: 'unresolved', action: 'skip', requiresReview: true }` when evidence is missing.

- [ ] **Step 2: Run test to verify it fails**
Run: `node tests/ai/grounded.test.mjs`
Expected: FAIL

- [ ] **Step 3: Implement question-specific grounding in `src/lib/ai/grounded.ts`**
Implement category-specific validators for work auth, numeric/experience, degrees, certifications, and dates. Discard raw token overlap as an acceptance criterion.

- [ ] **Step 4: Run test to verify it passes**
Run: `node tests/ai/grounded.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/lib/ai/grounded.ts tests/ai/grounded.test.mjs
git commit -m "feat(ai): implement question-specific typed grounding engine with negation, experience, and degree validation"
```

---

### Task 5: OpenAI-Compatible Provider Client with Capability Fallback & HTML Guard

**Files:**
- Create: `src/lib/ai/provider-client.ts`
- Create: `tests/ai/provider-client.test.mjs`

**Interfaces:**
- Consumes: Target URL, API key, model ID, messages payload, optional safe agent.
- Produces: `ProviderClient` class with `generateChatCompletion(messages, options): Promise<{ text: string, rawJson: any }>`.

- [ ] **Step 1: Write the failing test in `tests/ai/provider-client.test.mjs`**
Test that `ProviderClient`:
1. Strips markdown fences (` ```json\n{...}\n``` `) and extracts valid JSON.
2. Detects HTML and `<!DOCTYPE html>` error pages and throws friendly `ProviderError('Endpoint returned HTML error page instead of JSON', 502)`.
3. Handles JSON mode capability: sends `response_format: { type: 'json_object' }`. If provider returns HTTP 400 with "unsupported parameter", caches capability and automatically retries with prompt-constrained JSON.
4. Enforces a 20-second timeout with `AbortSignal`.
5. Disables HTTP redirects (`redirect: 'error'`).

- [ ] **Step 2: Run test to verify it fails**
Run: `node tests/ai/provider-client.test.mjs`
Expected: FAIL

- [ ] **Step 3: Implement `ProviderClient` in `src/lib/ai/provider-client.ts`**
Implement clean HTTP fetcher with capability detection, timeout handling, redirect blocking, and HTML/fence cleaning.

- [ ] **Step 4: Run test to verify it passes**
Run: `node tests/ai/provider-client.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/lib/ai/provider-client.ts tests/ai/provider-client.test.mjs
git commit -m "feat(ai): implement OpenAI-compatible provider client with capability fallback and HTML guard"
```

---

### Task 6: FreeHire Batch `Plan` & Combobox `Choose` TypeScript Port with Full Context

**Files:**
- Create: `src/lib/ai/planner.ts`
- Create: `src/lib/ai/chooser.ts`
- Create: `tests/ai/planner.test.mjs`
- Create: `tests/ai/chooser.test.mjs`

**Interfaces:**
- Consumes: Scanned `Field[]`, candidate `Map<string, VerifiedFact>`, `ProviderClient`, `groundedIn`.
- Produces: `planFormBatch(fields: Field[], facts: Map<string, VerifiedFact>, client: ProviderClient, context?: FormContext): Promise<PlanResult>`, `chooseComboboxOption(question: Field, options: string[], facts: Map<string, VerifiedFact>, client: ProviderClient): Promise<ChooseResult>`.

- [ ] **Step 1: Write the failing tests in `tests/ai/planner.test.mjs` and `tests/ai/chooser.test.mjs`**
Test that:
1. `planFormBatch` chunks fields into batches of 4–6 questions while including neighboring questions and previously resolved values in context.
2. Constructs the FreeHire system prompt and parses JSON responses containing `{ fills: [...] }`.
3. Discards any fills that fail `validateGroundedAnswer`.
4. `chooseComboboxOption` passes live captured options to model and requires exact option label.
5. Rejects any option not in the provided `options` array.
6. Returns `choice: null` when facts do not answer the question.

- [ ] **Step 2: Run tests to verify they fail**
Run: `node tests/ai/planner.test.mjs`
Expected: FAIL

- [ ] **Step 3: Implement `planner.ts` and `chooser.ts` in `src/lib/ai/`**
Port prompt templates and parsing logic from FreeHire `scratch/freehire/internal/ai/autofillagent/planner.go:1-120`. Integrate batching, context preservation, and grounded validation.

- [ ] **Step 4: Run tests to verify they pass**
Run: `node tests/ai/planner.test.mjs` && `node tests/ai/chooser.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/lib/ai/planner.ts src/lib/ai/chooser.ts tests/ai/planner.test.mjs tests/ai/chooser.test.mjs
git commit -m "feat(ai): port FreeHire Plan and Choose engines to TypeScript with neighbor context preservation"
```

---

### Task 7: Shared Extension AI Bundling Strategy & Manifest Optional Permissions

**Files:**
- Create: `scripts/bundle-extension-ai.mjs`
- Modify: `jobright_extension/manifest.json`
- Create: `tests/ai/extension-bundle.test.mjs`

**Interfaces:**
- Consumes: `src/lib/ai/{planner,chooser,grounded,verified-facts,provider-client}.ts`.
- Produces: Bundled browser-compatible ES module `jobright_extension/core/ai/planner-bundle.js`.

- [ ] **Step 1: Write the failing test in `tests/ai/extension-bundle.test.mjs`**
Test that:
1. `jobright_extension/core/ai/planner-bundle.js` exists and is a valid ES module.
2. Contains `planFormBatch`, `chooseComboboxOption`, `validateGroundedAnswer`, `buildVerifiedFacts`, and `ProviderClient`.
3. Does NOT contain Node.js server dependencies (`dns`, `net`, `tls`, `crypto`, `@supabase/supabase-js`, `ssrf-guard`).
4. `manifest.json` declares optional host permissions (`optional_host_permissions: ["http://localhost/*", "http://127.0.0.1/*", "https://*/*"]`).

- [ ] **Step 2: Run test to verify it fails**
Run: `node tests/ai/extension-bundle.test.mjs`
Expected: FAIL

- [ ] **Step 3: Implement `scripts/bundle-extension-ai.mjs` and update `manifest.json`**
Implement esbuild/bundler script compiling the browser-safe AI files into `jobright_extension/core/ai/planner-bundle.js`. Update `manifest.json`. Add bundle step to `package.json` (`npm run pack:extension`).

- [ ] **Step 4: Run test to verify it passes**
Run: `node tests/ai/extension-bundle.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add scripts/bundle-extension-ai.mjs jobright_extension/manifest.json tests/ai/extension-bundle.test.mjs
git commit -m "feat(extension): implement shared AI bundler and add optional host permissions to manifest"
```

---

### Task 8: Settings Synchronization, Origin-Binding & SSRF-Guarded Test Connection Endpoints

**Files:**
- Create: `src/app/api/extension/ai/settings/route.ts`
- Create: `src/app/api/extension/ai/test-connection/route.ts`
- Create: `tests/ai/settings-sync-endpoints.test.mjs`

**Interfaces:**
- Consumes: Authenticated session bearer token, Next.js request, Supabase DB.
- Produces: `GET /api/extension/ai/settings`, `PUT /api/extension/ai/settings`, `POST /api/extension/ai/test-connection`.

- [ ] **Step 1: Write the failing test in `tests/ai/settings-sync-endpoints.test.mjs`**
Test that:
1. `GET /api/extension/ai/settings` returns user configuration with `hasApiKey: true` and `maskedApiKey: "sk-or-••••9102"`; never exposes plaintext secret.
2. `PUT /api/extension/ai/settings` validates payload with Zod, encrypts new API key with AAD (`userId:origin`), and increments `config_version`.
3. Optimistic locking: `PUT` fails with 409 if `config_version` does not match current database state.
4. `PUT` without `apiKey` retains existing encrypted secret without overwriting with masked strings.
5. `POST /api/extension/ai/test-connection` runs lightweight ping against provider; blocks loopback/metadata IPs via `ssrf-guard`.

- [ ] **Step 2: Run test to verify it fails**
Run: `node tests/ai/settings-sync-endpoints.test.mjs`
Expected: FAIL

- [ ] **Step 3: Implement route handlers in `src/app/api/extension/ai/`**
Implement authenticated routes with RLS ownership check (`auth.uid()`), Zod validation, SSRF guard, and encryption helpers.

- [ ] **Step 4: Run test to verify it passes**
Run: `node tests/ai/settings-sync-endpoints.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/app/api/extension/ai/settings/route.ts src/app/api/extension/ai/test-connection/route.ts tests/ai/settings-sync-endpoints.test.mjs
git commit -m "feat(api): implement authenticated AI settings sync with AAD and SSRF-guarded test-connection"
```

---

### Task 9: Server-Enforced Orchestrator Endpoints with Feature Flag & Rate Limits

**Files:**
- Create: `src/app/api/extension/autofill/plan/route.ts`
- Create: `src/app/api/extension/autofill/choose/route.ts`
- Create: `tests/ai/autofill-orchestrator-api.test.mjs`

**Interfaces:**
- Consumes: `PlanApiRequest`, `ChooseApiRequest`, candidate ownership.
- Produces: `POST /api/extension/autofill/plan`, `POST /api/extension/autofill/choose`.

- [ ] **Step 1: Write the failing test in `tests/ai/autofill-orchestrator-api.test.mjs`**
Test that:
1. Server checks feature flag `SERVER_ENABLE_STRUCTURED_AI_PLANNER` (defaults to true; can be disabled).
2. Verifies candidate belongs to authenticated user (`auth.uid()`).
3. If user has portal BYOK key, decrypts key and routes to user's remote endpoint via SSRF safe agent. If default mode, routes to server `.env` provider.
4. Never silently switches to server key if BYOK key fails (returns HTTP 401 with `{ ok: false, error: 'Custom provider authentication failed' }`).
5. Returns `PlanApiResponse` with verified fills and evidence IDs.
6. `POST /api/extension/autofill/choose` runs combobox choice against captured options.

- [ ] **Step 2: Run test to verify it fails**
Run: `node tests/ai/autofill-orchestrator-api.test.mjs`
Expected: FAIL

- [ ] **Step 3: Implement route handlers in `src/app/api/extension/autofill/`**
Implement candidate ownership verification, credential resolution, SSRF guard, and `planFormBatch`/`chooseComboboxOption` invocation.

- [ ] **Step 4: Run test to verify it passes**
Run: `node tests/ai/autofill-orchestrator-api.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/app/api/extension/autofill/plan/route.ts src/app/api/extension/autofill/choose/route.ts tests/ai/autofill-orchestrator-api.test.mjs
git commit -m "feat(api): implement server-enforced autofill plan and choose orchestrator endpoints"
```

---

### Task 10: Chrome Extension MV3 Lifecycle, Trusted Context Migration, Sender Validation & Dynamic Rescanning

**Files:**
- Modify: `jobright_extension/portal-connection.js`
- Modify: `jobright_extension/background.js`
- Modify: `jobright_extension/panel.js`
- Modify: `jobright_extension/core/application.js`
- Create: `jobright_extension/core/ai-router.js`
- Create: `tests/ai/mv3-lifecycle-and-rescan.test.mjs`

**Interfaces:**
- Consumes: Extension background message bus, `chrome.storage.session`, `chrome.storage.local`.
- Produces: Resumable autofill session tracking, 4-mode routing dispatcher, storage security access level, dynamic conditional question rescanning.

- [ ] **Step 1: Write the failing test in `tests/ai/mv3-lifecycle-and-rescan.test.mjs`**
Test that:
1. `portal-connection.js` communicates connection saves via runtime messaging rather than direct `chrome.storage.local` writes.
2. Extension background initialization invokes `chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })`.
3. All `runtime.onMessage` listeners validate `sender.id === chrome.runtime.id`.
4. `ai-router.js` dispatches Mode 4 (Local Ollama at `localhost:11434`) and Mode 3 (Extension BYOK) directly from worker, and Modes 1 & 2 via backend proxy.
5. Stale plan protection rejects fills if `documentId`, `tabId`, or `formRevision` changed after plan generation.
6. Dynamic rescanning detects newly visible conditional fields and schedules an incremental pass.

- [ ] **Step 2: Run test to verify it fails**
Run: `node tests/ai/mv3-lifecycle-and-rescan.test.mjs`
Expected: FAIL

- [ ] **Step 3: Implement `ai-router.js`, migrate `portal-connection.js`, and update `background.js` and `application.js`**
Enforce trusted context storage, add resumable session management, connect `ai-router` into the autofill workflow, and implement MutationObserver rescanning in `application.js`.

- [ ] **Step 4: Run test to verify it passes**
Run: `node tests/ai/mv3-lifecycle-and-rescan.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add jobright_extension/portal-connection.js jobright_extension/core/ai-router.js jobright_extension/background.js jobright_extension/panel.js jobright_extension/core/application.js tests/ai/mv3-lifecycle-and-rescan.test.mjs
git commit -m "feat(extension): enforce storage access level, sender validation, hybrid routing, and dynamic question rescanning"
```

---

### Task 11: Portal Settings UI, Extension Panel AI Controls, and Submission Tracking Safety

**Files:**
- Create: `src/components/ai-provider-settings.tsx`
- Modify: `src/app/dashboard/candidates/[id]/edit/page.tsx`
- Modify: `jobright_extension/panel.html`
- Modify: `jobright_extension/panel.js`
- Create: `tests/ai/submission-tracking-safety.test.mjs`

**Interfaces:**
- Consumes: Portal settings APIs, extension panel DOM, ATS adapter test suites.
- Produces: Web Portal AI settings card, Extension side panel AI settings section, verified submission safety.

- [ ] **Step 1: Write the failing test in `tests/ai/submission-tracking-safety.test.mjs`**
Test that:
1. Application is NEVER marked as applied upon autofill completion; requires confirmed submission event.
2. Portal settings component renders mode toggle, provider dropdown, Base URL, masked key, model ID, and test connection button.
3. Setting a custom OpenAI-compatible key (e.g. OpenRouter or DeepSeek) updates settings and syncs to extension panel.

- [ ] **Step 2: Run test to verify it fails**
Run: `node tests/ai/submission-tracking-safety.test.mjs`
Expected: FAIL

- [ ] **Step 3: Implement `ai-provider-settings.tsx`, integrate into dashboard, and add panel UI controls**
Build the React settings card in Next.js portal, hook into `/api/extension/ai/settings`, and add the corresponding collapsible AI settings section to `panel.html` and `panel.js`.

- [ ] **Step 4: Run test to verify it passes**
Run: `node tests/ai/submission-tracking-safety.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add src/components/ai-provider-settings.tsx src/app/dashboard/candidates/[id]/edit/page.tsx jobright_extension/panel.html jobright_extension/panel.js tests/ai/submission-tracking-safety.test.mjs
git commit -m "feat(ui): add portal AI settings card, extension panel controls, and verify submission tracking safety"
```

---

### Task 12: Playwright Extension Tests, Full 74-Adapter Regression & Production Build Verification

**Files:**
- Create: `tests/e2e/extension-ai-autofill.spec.ts`
- Create: `playwright.config.ts`
- Create: `tests/ai/e2e-regression-suite.test.mjs`

**Interfaces:**
- Consumes: Packed extension bundle, Next.js production build, synthetic test portals.
- Produces: End-to-end Playwright test suite, full regression report across all 74 adapters.

- [ ] **Step 1: Write the failing Playwright and regression tests in `tests/e2e/` and `tests/ai/`**
Test that:
1. Real Chrome browser loads unpacked extension with persistent context.
2. Extension connects to mock OpenAI-compatible endpoint, captures Greenhouse/Lever/Ashby/Workday forms, fills deterministic facts, plans screening questions with AI, and injects verified values into DOM.
3. Simulates service worker termination mid-form and verifies resumption.
4. All 74 existing specialized ATS adapters pass with 0 regressions (`tests/adapters.test.mjs`).

- [ ] **Step 2: Run test to verify it fails**
Run: `node tests/ai/e2e-regression-suite.test.mjs`
Expected: FAIL

- [ ] **Step 3: Implement Playwright test harness and run complete test verification**
Configure `playwright.config.ts` for Chrome extension loading, execute full regression test suite, and verify `npm run build` and `npm run pack:extension`.

- [ ] **Step 4: Run all test suites and production build**
Run:
- `node tests/ai/encryption.test.mjs`
- `node tests/ai/ssrf-guard.test.mjs`
- `node tests/ai/verified-facts.test.mjs`
- `node tests/ai/grounded.test.mjs`
- `node tests/ai/provider-client.test.mjs`
- `node tests/ai/planner.test.mjs`
- `node tests/ai/chooser.test.mjs`
- `node tests/ai/extension-bundle.test.mjs`
- `node tests/ai/settings-sync-endpoints.test.mjs`
- `node tests/ai/autofill-orchestrator-api.test.mjs`
- `node tests/ai/mv3-lifecycle-and-rescan.test.mjs`
- `node tests/ai/submission-tracking-safety.test.mjs`
- `node tests/ai/e2e-regression-suite.test.mjs`
- `npm test`
- `npm run build`
- `node scripts/pack-extension.mjs`
Expected: ALL PASS with 0 errors.

- [ ] **Step 5: Commit**
```bash
git add tests/e2e/extension-ai-autofill.spec.ts playwright.config.ts tests/ai/e2e-regression-suite.test.mjs
git commit -m "test(e2e): implement Playwright extension browser tests and verify all 74 ATS adapters with zero regressions"
```
