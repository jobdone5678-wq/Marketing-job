# AI Autofill Engine (`src/lib/ai/`)

TypeScript AI planning, combobox selection, grounded validation, job requirement extraction, and BYOK provider orchestration.

## Core Modules

- **`autofill-orchestrator.ts`**: Server-enforced orchestrator (`executePlan`, `executeChoose`, `resolveProviderClient`) called by `/api/extension/autofill/plan` and `/choose`.
  - Checks `SERVER_ENABLE_STRUCTURED_AI_PLANNER` (default enabled).
  - Verifies candidate ownership against `actorId`.
  - Switches between `ServerVercelProviderClient` (`SERVER_ENABLE_VERCEL_AI_SDK=true`) and `ProviderClient`.
  - Returns token usage telemetry (`TokenUsageTelemetry`) and `durationMs` so server-mode usage/spend can be tracked and rate-limited.
- **`planner.ts` & `chooser.ts`**:
  - `planFormBatch`: Classifies unresolved ATS fields, matches against `VerifiedFact` / answer bank, returns executable fills and `deferred` comboboxes.
  - `chooseComboboxOption`: Selects the best live DOM option for async/custom dropdowns.
  - Confirmed answers are checked before provider resolution. `reusable-answers.ts` shares confirmed Answer Bank matching with the extension.
  - With `TYPESAFE_API_KEY` set, `jev-choice.ts` can classify unresolved server-mode choices using only question-relevant evidence. A failed request falls back to the configured LLM and returned choices still pass grounding.
  - The WXT build bundles the browser-safe modules imported by `extension/`.
- **`grounded.ts` & `verified-facts.ts`**:
  - `buildVerifiedFacts`: Builds typed facts from confirmed candidate profile + reusable answer bank.
  - `validateGroundedAnswer`: Hard safety gate preventing fabricated or contradicted answers on factual fields (work authorization, sponsorship, experience years, education tiers, certifications).
- **`requirements.ts` & `requirements-validation.ts`**:
  - Extracts explicit, verifiable requirements from a job description (`jobRequirements`) to ground tailored screening answers.
- **`provider-client.ts` & `server-provider-client.ts`**:
  - OpenAI-compatible client + Vercel AI SDK (`ai` + `@ai-sdk/openai-compatible`) with Zod structured outputs (`structured-contracts.ts`, `schemas.ts`).
- **`encryption.ts`, `ssrf-guard.ts`, `ssrf-fetch-adapter.ts`**:
  - AES-GCM encryption/decryption for `user_ai_provider_secrets` with AAD bound to `userId:origin`.
  - `createSafeAgent` + `createSsrfSafeFetch` block private/loopback/metadata IPs on custom BYOK endpoints.

## Non-Negotiable Rules

1. **Zero silent BYOK fallback**: If `portal_byok`, `extension_byok`, or `local` fails decryption or auth, return `401`/`400`/`502` — never fall back to server env keys.
2. **Never bypass `validateGroundedAnswer`** for factual/eligibility fields.
3. **Never send `date_of_birth`, passwords, SSNs, or marketing opt-ins** to an LLM.
4. **Reject empty outputs** (e.g., reasoning-token exhaustion) with `502` rather than returning `{ ok: true, answer: "" }`.
