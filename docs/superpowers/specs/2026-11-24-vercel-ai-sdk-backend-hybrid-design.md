# FreeHire AI Autofill Engine: Vercel AI SDK Backend-First Hybrid Provider Architecture

**Date:** 2026-11-24  
**Status:** In Review (Brainstorming Design Specification)  
**Topic:** Integration of Vercel AI SDK Core (`ai`, `@ai-sdk/openai-compatible`, `zod`) into the NextKinHR FreeHire backend architecture as an interchangeable provider transport and structured generation layer, preserving the lightweight browser client in the Chrome extension.

---

## 1. Intent & The Why

NextKinHR recently implemented the FreeHire AI autofill engine with 4-mode hybrid AI provider execution (Server default, Portal encrypted BYOK, Extension direct BYOK, Local direct Ollama/LM Studio), structured question planning (`Plan`), combobox option choice (`Choose`), and strictly typed anti-hallucination validation (`groundedIn` and `VerifiedFact`).

However, the current backend provider client (`provider-client.ts`) relies on custom low-level HTTP requests (`fetch`), manual markdown code fence stripping, custom JSON extraction, and ad-hoc response format switching. While functional, this custom plumbing:
1. **Lacks standardized schema-enforced structured generation**: Providers that natively support structured outputs (OpenAI, OpenRouter, Groq, DeepSeek) are forced through generic JSON mode or prompt constraints, requiring regex fence-stripping.
2. **Has limited token and latency telemetry**: Token tracking and latency measurements are fragmented.
3. **Incurs higher ongoing maintenance**: Handling provider-specific quirks, standardizing error codes, and keeping up with provider API changes requires manual custom code.

By integrating **Vercel AI SDK Core** behind the existing `ProviderClient` interface for the Next.js backend, NextKinHR gains standardized provider abstraction, native Zod schema-enforced structured output generation (`generateText` with `Output.object()`), standardized telemetry, and robust error handling—all while preserving the 19.8 KB lightweight extension client, SSRF socket-bound IP security, and FreeHire's strict factual grounding engine.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- **Adopt Vercel AI SDK Core**: Use `ai` (v7.0.181 already in `package.json`), `@ai-sdk/openai-compatible` (v3.0.94), and `zod` (v4.6.5).
- **Backend-First Hybrid Architecture**:
  - Integrate Vercel AI SDK on the server behind the existing `ProviderClient` interface for **Mode 1 (Server default)** and **Mode 2 (Portal encrypted BYOK)**.
  - Retain the lightweight browser-compatible `ProviderClient` for **Mode 3 (Extension direct BYOK)** and **Mode 4 (Local direct Ollama/LM Studio)**.
  - Ensure server-only packages (`@ai-sdk/openai-compatible`, `ai`) are strictly excluded from the Chrome MV3 extension bundle (`planner-bundle.js`), keeping the bundle size ~19.8 KB.
- **Structured Outputs with Graceful Fallback**:
  - Use `generateText` with `Output.object({ schema })` for form planning and combobox choice on providers supporting structured outputs.
  - Fall back gracefully to JSON mode or prompt-constrained generation on providers that reject `response_format` or structured outputs.
- **Preserve SSRF & Security Guardrails**:
  - Route all Vercel AI SDK outbound requests through our custom socket-bound SSRF-safe fetch transport (`createSafeAgent` in `ssrf-guard.ts`).
  - Enforce `redirect: 'error'`, approved destination whitelists, loopback/private/metadata IP blocking, and TLS SNI preservation.
  - Maintain origin-bound credential decryption (`decryptSecret` with AAD `user_id:key_origin`).
  - Never automatically route requests through Vercel AI Gateway.
- **Preserve All Autofill Intelligence & DOM Execution**:
  - Keep all 82 registered ATS adapters and universal DOM discovery intact.
  - Preserve `VerifiedFact` mapping, `Plan`, `Choose`, and strictly typed `validateGroundedAnswer` validation. Schema-valid JSON must still pass factual grounding before any DOM fill is approved.
  - Preserve dynamic form rescanning, combobox widget deferral, and submission confirmation tracking (autofill NEVER marks applications as submitted).
- **Telemetry & Error Mapping**:
  - Track input tokens, output tokens, total tokens, latency (`durationMs`), and map upstream errors to existing `ProviderError` codes (`AUTH_FAILED`, `HTML_RESPONSE`, `TIMEOUT`, `FETCH_ERROR`).
  - Prevent duplicate retries (`maxRetries: 0` in AI SDK calls so our own retry policy controls backoff).
- **Feature Flag & Rollback**:
  - Introduce `SERVER_ENABLE_VERCEL_AI_SDK` (boolean flag, defaulting to `true`, allowing instant rollback to legacy client without deployment rollback).

### Non-Goals
- Redesigning the FreeHire planning algorithm or field discovery engine.
- Bundling Vercel AI SDK into the Chrome extension MV3 service worker.
- Migrating to Vercel AI Gateway or proprietary Vercel cloud services.
- Altering the database schema or candidate profile data model.

### Anti-Goals
- **Never bypass `groundedIn` validation**: Just because the AI SDK outputs schema-valid JSON does not mean the values are grounded in candidate facts. Every fill must still link to valid `evidenceIds`.
- **Never allow duplicate retry amplification**: AI SDK internal retries combined with backend retries can multiply latency and token costs.
- **Never leak server-only dependencies into the browser extension**: The extension build must remain pure ESM, browser-safe, and lightweight.

---

## 3. Approaches Considered & Trade-Offs

### Approach 1: Backend-First Hybrid Adapter (Selected)
- **Concept**: Integrate Vercel AI SDK Core (`@ai-sdk/openai-compatible`) in the Next.js backend (`src/lib/ai/server-provider-client.ts` implementing `ProviderClient` or wrapped via `resolveProviderClient`), while retaining `src/lib/ai/provider-client.ts` as the lightweight browser client bundled into `jobright_extension/core/ai/planner-bundle.js`.
- **Pros**:
  - Zero impact on Chrome extension bundle size (~19.8 KB maintained).
  - Complete MV3 compatibility (no Node streams or polyfills in browser extension).
  - Maximizes reliability on server with native Zod structured outputs, token tracking, and provider abstraction.
  - Clean feature flag toggling between legacy client and Vercel AI SDK on server.
- **Cons**:
  - Two client implementations to maintain (one lightweight browser client, one Vercel AI SDK server client), sharing the same interface and schemas.

### Approach 2: Full Replacement Across Backend and Extension
- **Concept**: Completely delete the custom client and bundle `@ai-sdk/openai-compatible` into the Chrome extension's `planner-bundle.js` for all four execution modes.
- **Pros**:
  - Single provider implementation across all runtimes.
- **Cons**:
  - Drastic increase in extension bundle size (estimated >250 KB minified).
  - Potential MV3 service worker runtime incompatibilities with streaming and Node/Fetch shims.
  - High risk of breaking offline and local direct Ollama execution.

### Approach 3: Route All Extension Traffic Through Server
- **Concept**: Eliminate client-side execution in the extension; route all direct BYOK and local Ollama requests through the Next.js server.
- **Pros**:
  - Only one runtime environment (Node.js/Next.js).
- **Cons**:
  - Violates privacy and enterprise local execution guarantees (local Ollama at `localhost:11434` cannot and should not be accessed from remote servers).
  - Adds server infrastructure costs and latency for BYOK users.

**Decision**: Approach 1 was selected. It provides the strengths of Vercel AI SDK for server-managed and portal-encrypted BYOK modes while preserving the extension's lightweight, privacy-preserving client.

---

## 4. Architectural Design & Implementation Details

### 4.1 Dependency Verification & Package Alignment
- `ai`: `^7.0.181` is already installed in `package.json`.
- `zod`: `^4.6.5` is already installed.
- `@ai-sdk/openai-compatible`: Will be installed at version `3.0.94`. Its peer dependency `{ zod: '^3.25.76 || ^4.1.8' }` is fully satisfied by `zod: ^4.6.5`.
- Verification dry-run confirmed 0 conflicts.

### 4.2 Shared Structured Schemas (`src/lib/ai/schemas.ts`)
Define shared Zod schemas used for structured outputs by both the server AI SDK and browser validation:
```ts
export const PlanOutputSchema = z.object({
  fills: z.array(
    z.object({
      label: z.string(),
      value: z.string(),
    })
  ),
});

export const ChooseOutputSchema = z.object({
  choice: z.string().nullable(),
});
```

To enable schema selection without importing Zod into the Chrome extension bundle, `GenerateCompletionOptions` in `src/lib/ai/provider-client.ts` is extended with a lightweight string discriminant:
```ts
export interface GenerateCompletionOptions {
  responseFormat?: 'json_object' | 'text';
  schemaName?: 'plan' | 'choose';
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}
```
- `planner.ts` passes `{ responseFormat: 'json_object', schemaName: 'plan' }`.
- `chooser.ts` passes `{ responseFormat: 'json_object', schemaName: 'choose' }`.
- This adds zero bytes of runtime dependency to `planner-bundle.js` while allowing `ServerVercelProviderClient` to bind the exact Zod schema.

### 4.3 Vercel AI SDK Server Client (`src/lib/ai/server-provider-client.ts`)
Create a dedicated server provider client implementing the `ProviderClient` interface:
```ts
export class ServerVercelProviderClient implements ProviderClient {
  readonly baseUrl: string;
  readonly apiKey?: string;
  readonly model: string;
  readonly agent?: any;
  readonly defaultTimeoutMs: number;
  readonly customFetch?: typeof fetch;
  readonly customHeaders?: Record<string, string>;
  supportsJsonMode: boolean = true;
  supportsStructuredOutputs: boolean = true;
}
```

Key features:
1. **Custom Fetch Wrapper**:
   - Injects SSRF-safe `agent` / `dispatcher` from `createSafeAgent`.
   - Inspects response bodies for HTML/DOCTYPE errors (e.g. Cloudflare 502 error pages) and immediately translates them to `ProviderError(..., 502, 'HTML_RESPONSE')`.
   - Preserves `redirect: 'error'`.
2. **Two-Tier Structured Output & Fallback Flow**:
   - **Tier 1 (Structured Output)**: When `supportsStructuredOutputs` is true and `schemaName` is `'plan'` or `'choose'`, invokes `generateText` with `Output.object({ schema: ... })` and `maxRetries: 0`.
   - **Tier 2 (Standard JSON Mode Fallback)**: If the provider returns HTTP 400 indicating unsupported structured output (e.g. `unsupported_parameter` on schema), caches `supportsStructuredOutputs = false` and retries using standard JSON mode.
   - **Tier 3 (Prompt-Constrained Text Fallback)**: If the provider rejects `response_format` entirely (HTTP 400 with `response_format` error), caches `supportsJsonMode = false` and retries using plain text generation with prompt constraints and markdown fence stripping (`stripMarkdownFences`).
   - Extracts `result.output` as `rawJson`, `JSON.stringify(result.output)` as `text`, and captures `result.usage` (`promptTokens`, `completionTokens`, `totalTokens`) and `durationMs`.
   - Timeout & Cancellation: Uses caller's `AbortSignal` combined with `AbortSignal.timeout(timeoutMs)`.

### 4.4 Autofill Orchestrator Integration (`src/lib/ai/autofill-orchestrator.ts`)
Update `resolveProviderClient`:
- Check feature flag: `process.env.SERVER_ENABLE_VERCEL_AI_SDK !== 'false'`.
- If flag is active: return new `ServerVercelProviderClient(...)`.
- If flag is `false`: return existing `ProviderClient(...)` for instant zero-downtime rollback.
- Maintain identical method signatures and return shapes so `executePlan` and `executeChoose` remain decoupled from transport mechanics.

### 4.5 Extension Bundler Protection (`scripts/bundle-extension-ai.mjs`)
- Retain existing `bundle-extension-ai.mjs` entry point exporting `ProviderClient` from `src/lib/ai/provider-client.ts`.
- Ensure `src/lib/ai/server-provider-client.ts` is marked as a server-only module and NEVER imported into any file targeted by `bundle-extension-ai.mjs`.
- In `tests/ai/extension-bundle.test.mjs`, add verification that `planner-bundle.js`:
  1. Does NOT contain server dependencies (`ai`, `@ai-sdk/openai-compatible`, `node:*`).
  2. Baseline size does not inflate (verifying size remains ≤ 50 KB unminified, preventing any accidental dependency leakage into the extension).

---

## 5. What's Left to the Builder

The builder owns:
1. Exact error-mapping helper translating AI SDK `APICallError`, `TypeValidationError`, and HTTP status codes into `ProviderError`.
2. Telemetry metadata logging (recording token usage and duration in debug mode or returning via `ChatCompletionResult`).
3. Unit test suite additions in `tests/ai/` testing `ServerVercelProviderClient` against mock servers for structured outputs, prompt fallbacks, HTML error detection, timeout, and token tracking.
4. Clean removal of any deprecated helper functions in `provider-client.ts` once all tests pass.

---

## 6. Verification Plan

Before completing the task, the following verifications MUST pass:
1. `node --experimental-strip-types --test tests/ai/*.test.mjs` (All 138+ AI unit & integration tests).
2. `npm test` (Full project unit test suite).
3. `npm run bundle:extension-ai` and verify bundle size and purity.
4. `npm run pack:extension`.
5. `npm run build` (Next.js production build verification).
6. Playwright browser tests (`npm run test:e2e` / `tests/e2e/extension-ai-autofill.spec.ts`).
