# Vercel AI SDK Backend-First Hybrid Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Vercel AI SDK Core (`ai`, `@ai-sdk/openai-compatible`, `zod`) into the NextKinHR Next.js backend for Server-managed and Portal-encrypted BYOK modes with native structured outputs (`Output.object()`), a three-tier fallback (structured -> JSON mode -> prompt-constrained), shared-deadline cancellation, SSRF socket-level transport binding, and token/latency telemetry, while retaining the lightweight browser client in the Chrome extension and preserving the FreeHire AI engine and all 82 ATS adapters.

**Architecture:** A backend-first hybrid provider layer where the Next.js backend uses `ServerVercelProviderClient` (backed by `@ai-sdk/openai-compatible` and `createOpenAICompatible`) to communicate with OpenAI-compatible LLMs using native Zod schema-enforced structured generation, mapped through an SSRF-safe socket transport (`createSafeAgent`). The Chrome extension retains the standalone, lightweight `ProviderClient` in `planner-bundle.js` for direct BYOK and local Ollama/LM Studio execution. The system features a three-tier fallback for model compatibility, per-(baseUrl, modelId) capability caching, shared request deadlines, and strict factual post-validation via `groundedIn` (`validateGroundedAnswer`).

**Tech Stack:** TypeScript, Next.js 15/16 (App Router, Node.js runtime), Vercel AI SDK Core (`ai` v7.0.181, `@ai-sdk/openai-compatible` v3.0.94), Zod (v4.6.5), Undici / Node.js `http`/`https` socket agents, esbuild (for extension bundling with metafile analysis), Node.js native test runner (`node:test`, `node:assert/strict`), Playwright (`@playwright/test`).

**Spec:** `docs/superpowers/specs/2026-11-24-vercel-ai-sdk-backend-hybrid-design.md`

## Global Constraints

- Retain all 82 ATS adapters in `jobright_extension/adapters/ats-adapters.js` with zero regressions.
- FreeHire planning core (`Plan`, `Choose`, `groundedIn`, `VerifiedFact`) remains the sole authority for factual validation; schema-valid model outputs are never trusted without independent `validateGroundedAnswer` verification.
- Server-enforced feature flag `SERVER_ENABLE_VERCEL_AI_SDK`: defaults to `false` during implementation until all tests pass, enabling zero-risk rollback to legacy client.
- Outbound SSRF guard: All server requests must bind the TCP socket to a validated public IP via `createSafeAgent`, enforce TLS SNI verification, block loopback/private/metadata IPs, and disable automatic redirects (`redirect: 'error'`).
- Shared deadline: A single `AbortSignal` deadline governs all fallback attempts within one user request.
- Zero retry multiplication: AI SDK calls must specify `maxRetries: 0` to prevent compounding backend retries.
- Extension bundle isolation: `planner-bundle.js` must strictly exclude `ai`, `@ai-sdk/openai-compatible`, and Node builtins; verified via esbuild bundler metafile analysis and size threshold (≤ 50 KB unminified).
- Candidate ownership and privacy: Decrypted BYOK keys are held in memory only for the request duration with AAD verification (`user_id:key_origin`); candidate PII is never logged in telemetry.

## Review Focus

1. Negation reversal and hallucination bypass: A model returning schema-valid JSON that contradicts verified candidate facts (e.g. sponsorship required = true when profile says false) must still be rejected by `validateGroundedAnswer`.
2. Outbound SSRF bypass via redirects or DNS rebinding: Any attempt to redirect to `169.254.169.254` or resolve to a private IP must throw `SSRFError` or `ProviderError` with status 308/400.
3. Fallback degradation: When an upstream provider returns HTTP 400 for structured outputs, the client must seamlessly fall back to standard JSON mode, and then to prompt-constrained text mode with fence stripping, caching capabilities without throwing.
4. Shared request timeout expiration mid-fallback: If a request has a 20-second timeout and Tier 1 takes 18 seconds before failing, Tier 2 must abort within the remaining 2 seconds, not reset a new 20-second timer.
5. Extension bundle dependency leakage: Importing server files into extension-bundled paths must fail the esbuild metafile inspection test in CI.

---

### Task 1: Package Installation & Shared Zod Response Contracts

**Files:**
- Modify: `package.json`
- Create: `src/lib/ai/structured-contracts.ts`
- Modify: `src/lib/ai/provider-client.ts:16-27`
- Test: `tests/ai/structured-contracts.test.mjs`

**Interfaces:**
- Consumes: `zod`
- Produces: `PlanContractSchema`, `ChooseContractSchema`, `PlanFillOutput`, `ChooseOutput`, `GenerateCompletionOptions.schemaName`

- [ ] **Step 1: Write failing test in `tests/ai/structured-contracts.test.mjs`**

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { PlanContractSchema, ChooseContractSchema } from '../../src/lib/ai/structured-contracts.ts';

test('Structured Contracts: Schema validation for Plan and Choose', async (t) => {
  await t.test('PlanContractSchema accepts valid FreeHire plan output with fieldId, label, value, action', () => {
    const validPlan = {
      fills: [
        {
          label: 'Full Name',
          value: 'Jane Doe',
          fieldId: 'field_1',
          evidenceIds: ['name.full_name'],
          action: 'fill'
        },
        {
          label: 'Gender',
          value: null,
          fieldId: 'field_2',
          evidenceIds: [],
          action: 'defer_combobox'
        }
      ]
    };
    const parsed = PlanContractSchema.parse(validPlan);
    assert.equal(parsed.fills.length, 2);
    assert.equal(parsed.fills[0].action, 'fill');
    assert.equal(parsed.fills[1].value, null);
  });

  await t.test('ChooseContractSchema accepts choice string, null, evidenceIds and reason', () => {
    const validChoice = {
      choice: 'United States',
      evidenceIds: ['location.country'],
      reason: 'Candidate resides in US'
    };
    const parsed = ChooseContractSchema.parse(validChoice);
    assert.equal(parsed.choice, 'United States');

    const nullChoice = { choice: null, reason: 'Profile does not support' };
    const parsedNull = ChooseContractSchema.parse(nullChoice);
    assert.equal(parsedNull.choice, null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/ai/structured-contracts.test.mjs`
Expected: FAIL (module `structured-contracts.ts` does not exist)

- [ ] **Step 3: Install `@ai-sdk/openai-compatible` and implement contracts**

Run: `npm install @ai-sdk/openai-compatible@3.0.94`

Implement `src/lib/ai/structured-contracts.ts`:
- Define `PlanFillSchema`: `label: z.string()`, `value: z.string().nullable()`, `fieldId: z.string().optional()`, `evidenceIds: z.array(z.string()).optional()`, `action: z.enum(['fill', 'skip', 'defer_combobox']).optional()`.
- Define `PlanContractSchema`: `z.object({ fills: z.array(PlanFillSchema) })`.
- Define `ChooseContractSchema`: `z.object({ choice: z.string().nullable(), evidenceIds: z.array(z.string()).optional(), reason: z.string().optional() })`.
- Export inferred TypeScript types: `PlanContract`, `ChooseContract`.

Update `src/lib/ai/provider-client.ts`:
- Extend `GenerateCompletionOptions`:
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

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/ai/structured-contracts.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/lib/ai/structured-contracts.ts src/lib/ai/provider-client.ts tests/ai/structured-contracts.test.mjs
git commit -m "feat(ai): install @ai-sdk/openai-compatible and define structured response contracts"
```

---

### Task 2: SSRF-Safe Custom Fetch Dispatcher for Vercel AI SDK

**Files:**
- Create: `src/lib/ai/ssrf-fetch-adapter.ts`
- Modify: `src/lib/ai/ssrf-guard.ts`
- Test: `tests/ai/ssrf-fetch-adapter.test.mjs`

**Interfaces:**
- Consumes: `createSafeAgent` from `src/lib/ai/ssrf-guard.ts`
- Produces: `createSsrfSafeFetch(safeAgentResult: SafeAgentResult): typeof fetch`

- [ ] **Step 1: Write failing test in `tests/ai/ssrf-fetch-adapter.test.mjs`**

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSsrfSafeFetch } from '../../src/lib/ai/ssrf-fetch-adapter.ts';
import { ProviderError } from '../../src/lib/ai/provider-client.ts';

test('SSRF Fetch Adapter: Socket binding, redirect blocking, and HTML error translation', async (t) => {
  await t.test('custom fetch binds socket agent and passes valid requests', async () => {
    let capturedOptions = null;
    const mockSafeResult = {
      agent: { fakeAgent: true },
      validatedUrl: 'https://api.openai.com/v1',
      targetIp: '104.18.6.192',
      hostname: 'api.openai.com',
      port: 443,
      protocol: 'https:',
      redirect: 'error',
    };

    const mockRequestFn = async (url, opts) => {
      capturedOptions = opts;
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const safeFetch = createSsrfSafeFetch(mockSafeResult, mockRequestFn);
    const res = await safeFetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ model: 'gpt-4o' }),
    });

    assert.equal(res.status, 200);
    assert.deepEqual(capturedOptions.agent, mockSafeResult.agent);
  });

  await t.test('detects HTML DOCTYPE and throws ProviderError with 502 status and HTML_RESPONSE code', async () => {
    const mockSafeResult = {
      agent: {},
      validatedUrl: 'https://api.openai.com/v1',
      targetIp: '104.18.6.192',
      hostname: 'api.openai.com',
      port: 443,
      protocol: 'https:',
      redirect: 'error',
    };

    const mockRequestFn = async () => {
      return new Response('<!DOCTYPE html><html><body>502 Bad Gateway</body></html>', {
        status: 502,
        headers: { 'Content-Type': 'text/html; charset=UTF-8' },
      });
    };

    const safeFetch = createSsrfSafeFetch(mockSafeResult, mockRequestFn);
    await assert.rejects(
      async () => {
        await safeFetch('https://api.openai.com/v1/chat/completions', { method: 'POST' });
      },
      (err) => {
        assert.ok(err instanceof ProviderError);
        assert.equal(err.status, 502);
        assert.equal(err.code, 'HTML_RESPONSE');
        assert.match(err.message, /HTML error page instead of JSON/i);
        return true;
      }
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/ai/ssrf-fetch-adapter.test.mjs`
Expected: FAIL (module `ssrf-fetch-adapter.ts` does not exist)

- [ ] **Step 3: Implement `src/lib/ai/ssrf-fetch-adapter.ts`**

Implement `createSsrfSafeFetch(safeAgentResult, customFetchFn)`:
- Binds `init.agent = safeAgentResult.agent` and `init.dispatcher = safeAgentResult.agent`.
- Enforces `init.redirect = 'error'`.
- Wraps response stream to handle HTML/DOCTYPE checks and redirect detection.
- Re-exports compatible fetch signature for `@ai-sdk/openai-compatible`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/ai/ssrf-fetch-adapter.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/ssrf-fetch-adapter.ts tests/ai/ssrf-fetch-adapter.test.mjs
git commit -m "feat(ai): add SSRF-safe custom fetch dispatcher adapter for Vercel AI SDK"
```

---

### Task 3: Vercel AI SDK Server Provider Client with 3-Tier Fallback & Telemetry

**Files:**
- Create: `src/lib/ai/server-provider-client.ts`
- Test: `tests/ai/server-provider-client.test.mjs`

**Interfaces:**
- Consumes: `@ai-sdk/openai-compatible`, `ai`, `PlanContractSchema`, `ChooseContractSchema`, `ProviderClientConfig`, `ChatMessage`
- Produces: `ServerVercelProviderClient implements ProviderClient`
  - `generateChatCompletion(messages: ChatMessage[], options?: GenerateCompletionOptions): Promise<ChatCompletionResult>`
  - `capabilityCache: Map<string, ProviderCapabilities>`

- [ ] **Step 1: Write failing tests in `tests/ai/server-provider-client.test.mjs`**

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { ServerVercelProviderClient } from '../../src/lib/ai/server-provider-client.ts';
import { ProviderError } from '../../src/lib/ai/provider-client.ts';

test('ServerVercelProviderClient: Structured generation, 3-tier fallback, and token telemetry', async (t) => {
  await t.test('1. executes structured plan generation using Output.object and tracks tokens/latency', async () => {
    const mockOutput = {
      fills: [
        { label: 'Full Name', value: 'Ada Lovelace', fieldId: 'name_1', evidenceIds: ['name.full_name'], action: 'fill' }
      ]
    };

    const mockFetch = async (url, init) => {
      return new Response(JSON.stringify({
        id: 'chatcmpl-1',
        choices: [{
          message: {
            content: JSON.stringify(mockOutput),
            role: 'assistant'
          }
        }],
        usage: { prompt_tokens: 120, completion_tokens: 45, total_tokens: 165 }
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    };

    const client = new ServerVercelProviderClient({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-4o-mini',
      fetchFn: mockFetch
    });

    const result = await client.generateChatCompletion(
      [{ role: 'user', content: 'Plan fields' }],
      { responseFormat: 'json_object', schemaName: 'plan' }
    );

    assert.deepEqual(result.rawJson, mockOutput);
    assert.equal(result.usage?.promptTokens, 120);
    assert.equal(result.usage?.completionTokens, 45);
    assert.equal(result.usage?.totalTokens, 165);
    assert.ok(typeof result.durationMs === 'number' && result.durationMs >= 0);
  });

  await t.test('2. falls back from structured output to JSON mode on HTTP 400 unsupported parameter', async () => {
    let callCount = 0;
    const mockOutput = { choice: 'United States', evidenceIds: ['location.country'], reason: 'Resident' };

    const mockFetch = async (url, init) => {
      callCount++;
      const body = JSON.parse(init.body);
      if (callCount === 1) {
        // First call rejects structured schema
        return new Response(JSON.stringify({
          error: { message: "Unsupported parameter: 'response_format.json_schema' is not supported.", code: 'unsupported_parameter' }
        }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      // Second call succeeds in standard JSON mode
      return new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(mockOutput) } }],
        usage: { prompt_tokens: 80, completion_tokens: 20, total_tokens: 100 }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const client = new ServerVercelProviderClient({
      baseUrl: 'https://api.groq.com/openai/v1',
      apiKey: 'test-key',
      model: 'llama-3.1-70b',
      fetchFn: mockFetch
    });

    const result = await client.generateChatCompletion(
      [{ role: 'user', content: 'Choose option' }],
      { responseFormat: 'json_object', schemaName: 'choose' }
    );

    assert.equal(callCount, 2, 'Should retry once via fallback');
    assert.deepEqual(result.rawJson, mockOutput);
    assert.equal(client.supportsStructuredOutputs, false, 'Capability must be cached as false');
  });

  await t.test('3. enforces shared request deadline across fallbacks', async () => {
    const controller = new AbortController();
    controller.abort(); // already aborted

    const client = new ServerVercelProviderClient({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-4o',
      fetchFn: async () => new Response('{}')
    });

    await assert.rejects(
      async () => client.generateChatCompletion([{ role: 'user', content: 'test' }], { signal: controller.signal }),
      (err) => {
        assert.ok(err instanceof ProviderError);
        assert.equal(err.status, 499);
        assert.equal(err.code, 'ABORTED');
        return true;
      }
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/ai/server-provider-client.test.mjs`
Expected: FAIL (module `server-provider-client.ts` does not exist)

- [ ] **Step 3: Implement `src/lib/ai/server-provider-client.ts`**

Implement `ServerVercelProviderClient`:
- Capability cache: static `Map<string, { structured: boolean, jsonMode: boolean }>` keyed by `${baseUrl}::${modelId}`.
- Wraps `createOpenAICompatible` with `customFetch` and `supportsStructuredOutputs`.
- Implements `generateChatCompletion(messages, options)`:
  - Checks capability cache.
  - Setup shared deadline: calculates `deadline = Date.now() + timeoutMs`, builds `AbortSignal.any([options.signal, AbortSignal.timeout(remainingMs)])`.
  - Tier 1: `generateText` with `Output.object({ schema })`, `maxRetries: 0`.
  - On HTTP 400 (`unsupported_parameter`, `json_schema`, `response_format`):
    - Updates cache for `(baseUrl, modelId)`.
    - Tier 2: `generateText` with standard JSON mode or prompt constraint.
    - Tier 3: plain text generation with prompt constraint and `stripMarkdownFences`.
  - Aggregates usage across attempts (`promptTokens`, `completionTokens`, `totalTokens`).
  - Measures total latency (`Date.now() - startTime`).
  - Translates HTML responses, timeouts, and HTTP errors to `ProviderError`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/ai/server-provider-client.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/server-provider-client.ts tests/ai/server-provider-client.test.mjs
git commit -m "feat(ai): implement ServerVercelProviderClient with 3-tier fallback and telemetry"
```

---

### Task 4: Autofill Orchestrator Integration & Rollback Feature Flag

**Files:**
- Modify: `src/lib/ai/autofill-orchestrator.ts:90-205`
- Modify: `src/lib/ai/planner.ts:240-246`
- Modify: `src/lib/ai/chooser.ts:84-88`
- Test: `tests/ai/autofill-orchestrator-api.test.mjs`

**Interfaces:**
- Consumes: `ServerVercelProviderClient`, `ProviderClient`, `SERVER_ENABLE_VERCEL_AI_SDK` env var
- Produces: `resolveProviderClient` returning `ServerVercelProviderClient` when flag is enabled, falling back to `ProviderClient` when false.

- [ ] **Step 1: Write test verifying feature flag toggling in `tests/ai/autofill-orchestrator-api.test.mjs`**

Add subtest to `tests/ai/autofill-orchestrator-api.test.mjs`:
```javascript
await t.test('SERVER_ENABLE_VERCEL_AI_SDK controls provider client implementation', async () => {
  process.env.SERVER_ENABLE_VERCEL_AI_SDK = 'false';
  const legacyClient = await resolveProviderClient(USER_OWNER, { db, fetchFn: mockFetch });
  assert.equal(legacyClient.constructor.name, 'ProviderClient');

  process.env.SERVER_ENABLE_VERCEL_AI_SDK = 'true';
  const sdkClient = await resolveProviderClient(USER_OWNER, { db, fetchFn: mockFetch });
  assert.equal(sdkClient.constructor.name, 'ServerVercelProviderClient');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/ai/autofill-orchestrator-api.test.mjs`
Expected: FAIL (returns `ProviderClient` in both cases)

- [ ] **Step 3: Update `src/lib/ai/autofill-orchestrator.ts`, `planner.ts`, and `chooser.ts`**

In `autofill-orchestrator.ts`:
- Check `const useVercelAiSdk = process.env.SERVER_ENABLE_VERCEL_AI_SDK === 'true';` (defaults to `false` until final signoff).
- If `useVercelAiSdk`: instantiate and return `new ServerVercelProviderClient(...)`.
- Otherwise: instantiate and return `new ProviderClient(...)`.

In `planner.ts`:
- Pass `schemaName: 'plan'` in `client.generateChatCompletion(messages, { responseFormat: 'json_object', schemaName: 'plan' })`.

In `chooser.ts`:
- Pass `schemaName: 'choose'` in `client.generateChatCompletion(messages, { responseFormat: 'json_object', schemaName: 'choose' })`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/ai/autofill-orchestrator-api.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/autofill-orchestrator.ts src/lib/ai/planner.ts src/lib/ai/chooser.ts tests/ai/autofill-orchestrator-api.test.mjs
git commit -m "feat(ai): wire ServerVercelProviderClient to autofill orchestrator with rollback feature flag"
```

---

### Task 5: Extension Bundler Metafile Dependency Graph Analysis & Isolation Verification

**Files:**
- Modify: `scripts/bundle-extension-ai.mjs`
- Modify: `tests/ai/extension-bundle.test.mjs`

**Interfaces:**
- Consumes: esbuild `metafile`
- Produces: `scripts/bundle-extension-ai.mjs` generating `planner-bundle.js` + `planner-bundle.meta.json`

- [ ] **Step 1: Write test in `tests/ai/extension-bundle.test.mjs` inspecting the bundler metafile**

```javascript
await t.test('4. bundler metafile proves zero dependencies on ai, @ai-sdk, or prohibited server packages', () => {
  const metaPath = path.join(rootDir, 'jobright_extension/core/ai/planner-bundle.meta.json');
  assert.ok(fs.existsSync(metaPath), `Bundler metafile must exist at ${metaPath}`);

  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  const inputFiles = Object.keys(meta.inputs || {});

  // Forbidden third-party packages and server-only modules
  // Use exact package delimiters to avoid false positives on legitimate src/lib/ai/ files
  const forbiddenPatterns = [
    /node_modules\/ai\//,
    /node_modules\/@ai-sdk\//,
    /node_modules\/zod\//,
    /src\/lib\/ai\/ssrf-guard/,
    /src\/lib\/ai\/encryption/,
    /src\/lib\/ai\/server-provider-client/,
    /src\/lib\/ai\/autofill-orchestrator/,
  ];

  for (const file of inputFiles) {
    const normalizedFile = file.replace(/\\/g, '/');
    for (const pattern of forbiddenPatterns) {
      assert.equal(
        pattern.test(normalizedFile),
        false,
        `Bundle input graph contains forbidden dependency matching ${pattern} in file "${file}"`
      );
    }
  }

  const stat = fs.statSync(bundlePath);
  assert.ok(stat.size <= 50 * 1024, `Bundle size must remain <= 50 KB (actual: ${stat.size} bytes)`);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/ai/extension-bundle.test.mjs`
Expected: FAIL (metafile does not exist)

- [ ] **Step 3: Update `scripts/bundle-extension-ai.mjs` to output `metafile`**

In `scripts/bundle-extension-ai.mjs`:
- Set `metafile: true` in esbuild options.
- Write `result.metafile` to `jobright_extension/core/ai/planner-bundle.meta.json`.
- Run: `npm run bundle:extension-ai`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/ai/extension-bundle.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/bundle-extension-ai.mjs tests/ai/extension-bundle.test.mjs
git commit -m "test(ai): add esbuild metafile dependency graph verification for Chrome extension bundle"
```

---

### Task 6: Comparative Benchmark Suite (Legacy vs. Vercel AI SDK)

**Files:**
- Create: `scripts/testing/benchmark-ai-providers.mjs`
- Test: `tests/ai/benchmark-validation.test.mjs`

**Interfaces:**
- Consumes: `ProviderClient`, `ServerVercelProviderClient`, ATS form fixtures (`ashby-universal.html`, `greenhouse-universal.html`)
- Produces: Benchmark report measuring:
  - Schema-valid response rate (%)
  - Grounded fill rate (%)
  - Latency (p50 / p95 ms)
  - Token consumption (prompt, completion, total)
  - Total HTTP request count (including retries)

- [ ] **Step 1: Write benchmark script `scripts/testing/benchmark-ai-providers.mjs`**

Implement benchmarking across 10 sample form planning and combobox choosing scenarios:
1. Run identical inputs through Legacy `ProviderClient`.
2. Run identical inputs through `ServerVercelProviderClient` (with structured outputs enabled).
3. Record and assert:
   - Schema validity: `100%` on both.
   - Grounded fill rate: identical grounded answers (proving zero hallucination change).
   - Structured parsing success: `100%` on Vercel AI SDK without fence regex stripping.
   - Token tracking accuracy: non-zero tokens reported on Vercel AI SDK.

- [ ] **Step 2: Run benchmark script to verify metrics**

Run: `node --experimental-strip-types scripts/testing/benchmark-ai-providers.mjs`
Expected: PASS and output formatted comparison table.

- [ ] **Step 3: Commit**

```bash
git add scripts/testing/benchmark-ai-providers.mjs
git commit -m "feat(ai): add comparative benchmark suite for legacy vs Vercel AI SDK clients"
```

---

### Task 7: Full Test Suite, Regression Verification & Production Signoff

**Files:**
- Modify: `src/lib/ai/autofill-orchestrator.ts` (Keep `SERVER_ENABLE_VERCEL_AI_SDK` disabled by default until final benchmark and Playwright signoff)

- [ ] **Step 1: Run all 138+ AI unit and integration tests**

Run: `node --experimental-strip-types --test tests/ai/*.test.mjs`
Expected: All 138+ tests PASS with 0 failures.

- [ ] **Step 2: Run full project regression suite**

Run: `npm run test:unit`
Expected: PASS

- [ ] **Step 3: Run ATS smoke tests**

Run: `npm run test:ats:smoke`
Expected: PASS (All 82 ATS adapters loaded and operational)

- [ ] **Step 4: Execute Playwright Chrome Extension E2E tests**

Run: `npx playwright test tests/e2e/extension-ai-autofill.spec.ts`
Expected: PASS (Covers all 4 provider modes, provider failure recovery, dynamic conditional rescanning, combobox dropdown selection, and application submission tracking).

- [ ] **Step 5: Verify Next.js production build**

Run: `npm run build`
Expected: Build succeeds with 0 TypeScript or bundling errors.

- [ ] **Step 6: Pack Chrome Extension**

Run: `npm run pack:extension`
Expected: Extension bundles successfully into `dist/` with valid manifest, excluded metafiles from production ZIP, and verified bundle size.

---

### Task 8: Final Engineering Report

- [ ] **Step 1: Compile actual benchmark results, test counts, token savings, and bundle metrics into a final markdown engineering report.**
