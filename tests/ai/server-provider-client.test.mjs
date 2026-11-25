import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ServerVercelProviderClient,
  normalizeUrl,
  isUnsupportedParamError,
} from '../../src/lib/ai/server-provider-client.ts';
import { ProviderClient, ProviderError } from '../../src/lib/ai/provider-client.ts';

test('ServerVercelProviderClient: 3-Tier Fallback, Telemetry, and Capability Cache', async (t) => {
  await t.test('1. Structured Plan generation returning parsed rawJson, usage tokens, and durationMs', async () => {
    ServerVercelProviderClient.clearCache();
    const mockPlan = {
      fills: [
        { label: 'Full Name', value: 'Jane Doe', action: 'fill', fieldId: 'f1', evidenceIds: ['ev1'] },
        { label: 'Remote', value: null, action: 'skip', fieldId: 'f2' },
      ],
    };

    let capturedBody;
    const mockFetch = async (url, init) => {
      capturedBody = JSON.parse(init.body);
      return new Response(
        JSON.stringify({
          id: 'chatcmpl-plan',
          choices: [
            {
              message: {
                role: 'assistant',
                content: JSON.stringify(mockPlan),
              },
            },
          ],
          usage: {
            prompt_tokens: 24,
            completion_tokens: 16,
            total_tokens: 40,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const client = new ServerVercelProviderClient({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-4o',
      fetchFn: mockFetch,
    });

    assert.ok(client instanceof ProviderClient, 'Must be instance of ProviderClient');
    assert.ok(client instanceof ServerVercelProviderClient, 'Must be instance of ServerVercelProviderClient');

    const result = await client.generateChatCompletion(
      [{ role: 'user', content: 'Create plan for form' }],
      { schemaName: 'plan' },
    );

    assert.deepEqual(result.rawJson, mockPlan);
    assert.equal(typeof result.text, 'string');
    assert.deepEqual(JSON.parse(result.text), mockPlan);
    assert.ok(result.usage, 'Usage should be populated');
    assert.equal(result.usage.promptTokens, 24);
    assert.equal(result.usage.completionTokens, 16);
    assert.equal(result.usage.totalTokens, 40);
    assert.equal(typeof result.durationMs, 'number');
    assert.ok(result.durationMs >= 0);
    assert.equal(capturedBody.response_format?.type, 'json_schema');
  });

  await t.test('2. Structured Choose generation returning { choice: ... } with tokens and latency', async () => {
    ServerVercelProviderClient.clearCache();
    const mockChoose = {
      choice: 'United States',
      evidenceIds: ['location.country'],
      reason: 'Candidate resides in US',
    };

    let capturedBody;
    const mockFetch = async (url, init) => {
      capturedBody = JSON.parse(init.body);
      return new Response(
        JSON.stringify({
          id: 'chatcmpl-choose',
          choices: [
            {
              message: {
                role: 'assistant',
                content: JSON.stringify(mockChoose),
              },
            },
          ],
          usage: {
            prompt_tokens: 18,
            completion_tokens: 12,
            total_tokens: 30,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const client = new ServerVercelProviderClient({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-4o-mini',
      fetchFn: mockFetch,
    });

    const result = await client.generateChatCompletion(
      [{ role: 'user', content: 'Select country' }],
      { schemaName: 'choose' },
    );

    assert.deepEqual(result.rawJson, mockChoose);
    assert.equal(result.rawJson.choice, 'United States');
    assert.equal(result.rawJson.reason, 'Candidate resides in US');
    assert.equal(result.usage.promptTokens, 18);
    assert.equal(result.usage.completionTokens, 12);
    assert.equal(result.usage.totalTokens, 30);
    assert.ok(result.durationMs >= 0);
    assert.equal(capturedBody.response_format?.type, 'json_schema');
  });

  await t.test('3. Fallback from structured output (Tier 1) to JSON mode (Tier 2) on 400 unsupported parameter error, verifying capability cache update', async () => {
    ServerVercelProviderClient.clearCache();
    const mockPlan = {
      fills: [{ label: 'Email', value: 'user@example.com', action: 'fill' }],
    };

    const calls = [];
    const mockFetch = async (url, init) => {
      const body = JSON.parse(init.body);
      calls.push(body);

      if (body.response_format?.type === 'json_schema') {
        return new Response(
          JSON.stringify({
            error: {
              message: "Unsupported parameter: 'response_format.json_schema' is not supported by this model",
              type: 'invalid_request_error',
              param: 'response_format',
              code: 'unsupported_parameter',
            },
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (body.response_format?.type === 'json_object') {
        return new Response(
          JSON.stringify({
            id: 'chatcmpl-json-mode',
            choices: [{ message: { role: 'assistant', content: JSON.stringify(mockPlan) } }],
            usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      throw new Error(`Unexpected request format: ${JSON.stringify(body.response_format)}`);
    };

    const client = new ServerVercelProviderClient({
      baseUrl: 'https://api.together.xyz/v1',
      apiKey: 'test-key',
      model: 'mistralai/Mixtral-8x7B-Instruct-v0.1',
      fetchFn: mockFetch,
    });

    assert.equal(client.supportsStructuredOutputs, true, 'Initially supports structured output');
    assert.equal(client.supportsJsonMode, true, 'Initially supports json mode');

    const result = await client.generateChatCompletion(
      [{ role: 'user', content: 'Fill form' }],
      { schemaName: 'plan' },
    );

    assert.equal(calls.length, 2, 'Should make 2 attempts: Tier 1 then Tier 2');
    assert.equal(calls[0].response_format.type, 'json_schema');
    assert.equal(calls[1].response_format.type, 'json_object');

    assert.deepEqual(result.rawJson, mockPlan);
    assert.equal(client.supportsStructuredOutputs, false, 'Capability cache updated to false for structured output');
    assert.equal(client.supportsJsonMode, true, 'Capability cache retains true for json mode');

    // Verify subsequent call uses cached capability directly (Tier 2) without trying Tier 1
    calls.length = 0;
    await client.generateChatCompletion([{ role: 'user', content: 'Fill form again' }], { schemaName: 'plan' });
    assert.equal(calls.length, 1, 'Subsequent call uses cached capability directly');
    assert.equal(calls[0].response_format.type, 'json_object');
  });

  await t.test('4. Fallback to prompt-constrained text (Tier 3) when response_format is completely rejected on 400, stripping markdown fences', async () => {
    ServerVercelProviderClient.clearCache();
    const mockPlan = {
      fills: [{ label: 'Phone', value: '+1234567890', action: 'fill' }],
    };

    const calls = [];
    const mockFetch = async (url, init) => {
      const body = JSON.parse(init.body);
      calls.push(body);

      if (body.response_format) {
        return new Response(
          JSON.stringify({
            error: {
              message: 'Unsupported parameter: response_format is not recognized by this endpoint',
              code: 'unsupported_parameter',
            },
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        );
      }

      // Tier 3: plain text prompt with markdown fences
      const fencedContent = '```json\n' + JSON.stringify(mockPlan, null, 2) + '\n```';
      return new Response(
        JSON.stringify({
          id: 'chatcmpl-tier3',
          choices: [{ message: { role: 'assistant', content: fencedContent } }],
          usage: { prompt_tokens: 30, completion_tokens: 15, total_tokens: 45 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const client = new ServerVercelProviderClient({
      baseUrl: 'https://llm.internal.corp/v1',
      model: 'legacy-llama',
      fetchFn: mockFetch,
    });

    const result = await client.generateChatCompletion(
      [{ role: 'user', content: 'Generate form plan' }],
      { schemaName: 'plan' },
    );

    assert.equal(calls.length, 3, 'Should attempt Tier 1 -> Tier 2 -> Tier 3');
    assert.equal(calls[0].response_format?.type, 'json_schema');
    assert.equal(calls[1].response_format?.type, 'json_object');
    assert.equal(calls[2].response_format, undefined, 'Tier 3 must not send response_format');
    assert.ok(
      calls[2].messages[calls[2].messages.length - 1].content.includes('IMPORTANT: Respond with valid JSON only'),
      'Tier 3 adds prompt constraint',
    );

    assert.deepEqual(result.rawJson, mockPlan);
    assert.equal(client.supportsStructuredOutputs, false);
    assert.equal(client.supportsJsonMode, false);

    // Subsequent call jumps straight to Tier 3
    calls.length = 0;
    await client.generateChatCompletion([{ role: 'user', content: 'Generate another plan' }], { schemaName: 'plan' });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].response_format, undefined);
  });

  await t.test('5. 401 Unauthorized does NOT trigger fallback and throws ProviderError(..., 401)', async () => {
    ServerVercelProviderClient.clearCache();
    let callCount = 0;
    const mockFetch = async () => {
      callCount++;
      return new Response(
        JSON.stringify({
          error: { message: 'Incorrect API key provided', type: 'invalid_request_error', code: 'invalid_api_key' },
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const client = new ServerVercelProviderClient({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'bad-key',
      model: 'gpt-4o',
      fetchFn: mockFetch,
    });

    await assert.rejects(
      async () => {
        await client.generateChatCompletion(
          [{ role: 'user', content: 'Hi' }],
          { schemaName: 'plan' },
        );
      },
      (err) => {
        assert.ok(err instanceof ProviderError, 'Must be instance of ProviderError');
        assert.equal(err.status, 401, 'Status must be 401');
        assert.equal(err.code, 'AUTH_ERROR');
        return true;
      },
    );

    assert.equal(callCount, 1, 'Must not retry on 401 unauthorized');
    assert.equal(client.supportsStructuredOutputs, true, 'Capabilities must not be invalidated on 401');
  });

  await t.test('6. Shared deadline expiration mid-fallback throws 504 TIMEOUT', async () => {
    ServerVercelProviderClient.clearCache();
    const mockFetch = async (url, init) => {
      const body = JSON.parse(init.body);
      if (body.response_format?.type === 'json_schema') {
        // Delay long enough to consume deadline
        await new Promise((resolve) => setTimeout(resolve, 80));
        return new Response(
          JSON.stringify({
            error: { message: 'unsupported parameter: json_schema', code: 'unsupported_parameter' },
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({ choices: [] }));
    };

    const client = new ServerVercelProviderClient({
      baseUrl: 'https://api.slow.com/v1',
      model: 'slow-model',
      fetchFn: mockFetch,
    });

    await assert.rejects(
      async () => {
        await client.generateChatCompletion(
          [{ role: 'user', content: 'Generate plan' }],
          { schemaName: 'plan', timeoutMs: 50 },
        );
      },
      (err) => {
        assert.ok(err instanceof ProviderError);
        assert.equal(err.status, 504);
        assert.equal(err.code, 'TIMEOUT');
        return true;
      },
    );
  });

  await t.test('7. Immediate pre-aborted signal throws 499 ABORTED', async () => {
    ServerVercelProviderClient.clearCache();
    let fetchCalled = false;
    const mockFetch = async () => {
      fetchCalled = true;
      return new Response('{}');
    };

    const client = new ServerVercelProviderClient({
      baseUrl: 'https://api.openai.com/v1',
      fetchFn: mockFetch,
    });

    const controller = new AbortController();
    controller.abort();

    await assert.rejects(
      async () => {
        await client.generateChatCompletion(
          [{ role: 'user', content: 'Generate' }],
          { schemaName: 'choose', signal: controller.signal },
        );
      },
      (err) => {
        assert.ok(err instanceof ProviderError);
        assert.equal(err.status, 499);
        assert.equal(err.code, 'ABORTED');
        return true;
      },
    );

    assert.equal(fetchCalled, false, 'Fetch should never be called when signal is pre-aborted');
  });

  await t.test('8. Bounded expiring capability cache (hit, miss, expiration)', async () => {
    ServerVercelProviderClient.clearCache();

    // 1. Miss
    const miss = ServerVercelProviderClient.getCachedCapability('https://api.example.com', 'gpt-unknown');
    assert.equal(miss, undefined, 'Uncached model should return undefined');

    // 2. Hit
    ServerVercelProviderClient.setCachedCapability('https://api.example.com/v1/', 'gpt-4o', {
      supportsStructured: false,
      supportsJsonMode: true,
    });

    const hit = ServerVercelProviderClient.getCachedCapability('https://api.example.com/v1', 'gpt-4o');
    assert.ok(hit, 'Hit should return capability');
    assert.equal(hit.supportsStructured, false);
    assert.equal(hit.supportsJsonMode, true);

    // Client instance checks normalized hit
    const client = new ServerVercelProviderClient({
      baseUrl: 'https://api.example.com/v1///',
      model: 'gpt-4o',
    });
    assert.equal(client.supportsStructuredOutputs, false);
    assert.equal(client.supportsJsonMode, true);

    // 3. Expiration
    ServerVercelProviderClient.setCachedCapability('https://api.example.com/v1', 'gpt-expired', {
      supportsStructured: false,
      supportsJsonMode: false,
      ttlMs: -5000, // already expired
    });

    const expired = ServerVercelProviderClient.getCachedCapability('https://api.example.com/v1', 'gpt-expired');
    assert.equal(expired, undefined, 'Expired entry should return undefined');

    // 4. Bounded: 100 entries max
    ServerVercelProviderClient.clearCache();
    for (let i = 0; i < 110; i++) {
      ServerVercelProviderClient.setCachedCapability('https://api.bounded.com/v1', `model-${i}`, {
        supportsStructured: false,
        supportsJsonMode: false,
      });
    }

    const cache = ServerVercelProviderClient.getCache();
    assert.equal(cache.size, 100, 'Cache size must not exceed 100 entries');

    // Earliest entries (model-0 through model-9) should have been evicted
    assert.equal(ServerVercelProviderClient.getCachedCapability('https://api.bounded.com/v1', 'model-0'), undefined);
    assert.ok(ServerVercelProviderClient.getCachedCapability('https://api.bounded.com/v1', 'model-109'));
  });

  await t.test('9. HTML 502 response throws ProviderError with HTML_RESPONSE code', async () => {
    const htmlPage = '<!DOCTYPE html><html><head><title>502 Bad Gateway</title></head><body>Server error</body></html>';
    const mockFetch = async () => {
      return new Response(htmlPage, {
        status: 502,
        headers: { 'Content-Type': 'text/html; charset=UTF-8' },
      });
    };

    const client = new ServerVercelProviderClient({
      baseUrl: 'https://api.gateway.com/v1',
      model: 'gpt-4o',
      fetchFn: mockFetch,
    });

    await assert.rejects(
      async () => {
        await client.generateChatCompletion([{ role: 'user', content: 'test' }], { schemaName: 'plan' });
      },
      (err) => {
        assert.ok(err instanceof ProviderError);
        assert.equal(err.status, 502);
        assert.equal(err.code, 'HTML_RESPONSE');
        return true;
      },
    );
  });

  await t.test('10. 500 Internal Server Error does not fall back and throws ProviderError(500)', async () => {
    let callCount = 0;
    const mockFetch = async () => {
      callCount++;
      return new Response(JSON.stringify({ error: { message: 'Internal server error' } }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const client = new ServerVercelProviderClient({
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      fetchFn: mockFetch,
    });

    await assert.rejects(
      async () => {
        await client.generateChatCompletion([{ role: 'user', content: 'test' }], { schemaName: 'plan' });
      },
      (err) => {
        assert.ok(err instanceof ProviderError);
        assert.equal(err.status, 500);
        return true;
      },
    );

    assert.equal(callCount, 1, '500 error must not trigger fallback');
  });

  await t.test('11. Maps inputTokens/outputTokens and does not invent missing token counts', async () => {
    ServerVercelProviderClient.clearCache();
    const mockPlan = { fills: [{ label: 'Name', value: 'Ada', action: 'fill' }] };

    // Case A: usage reported
    const clientWithUsage = new ServerVercelProviderClient({
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      fetchFn: async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { role: 'assistant', content: JSON.stringify(mockPlan) } }],
            usage: { prompt_tokens: 15, completion_tokens: 7 }, // total_tokens intentionally omitted
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    });

    const resA = await clientWithUsage.generateChatCompletion([{ role: 'user', content: 'Plan' }], { schemaName: 'plan' });
    assert.equal(resA.usage?.inputTokens, 15);
    assert.equal(resA.usage?.outputTokens, 7);
    assert.equal(resA.usage?.promptTokens, 15);
    assert.equal(resA.usage?.completionTokens, 7);

    // Case B: usage completely omitted -> usage must be undefined, not invented
    ServerVercelProviderClient.clearCache();
    const clientWithoutUsage = new ServerVercelProviderClient({
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-no-usage',
      fetchFn: async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { role: 'assistant', content: JSON.stringify(mockPlan) } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    });

    const resB = await clientWithoutUsage.generateChatCompletion([{ role: 'user', content: 'Plan' }], { schemaName: 'plan' });
    assert.equal(resB.usage, undefined, 'Missing usage must remain undefined');
  });

  await t.test('12. Tier 2 & Tier 3 enforce schema validation and reject 200 HTML portal pages', async () => {
    ServerVercelProviderClient.clearCache();
    ServerVercelProviderClient.setCachedCapability('https://api.tier2fail.com/v1', 'model-x', {
      supportsStructured: false,
      supportsJsonMode: true,
    });

    // Tier 2 returns invalid schema (missing fills array)
    const clientInvalidTier2 = new ServerVercelProviderClient({
      baseUrl: 'https://api.tier2fail.com/v1',
      model: 'model-x',
      fetchFn: async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { role: 'assistant', content: JSON.stringify({ wrongKey: 123 }) } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    });

    await assert.rejects(
      async () => clientInvalidTier2.generateChatCompletion([{ role: 'user', content: 'Plan' }], { schemaName: 'plan' }),
      (err) => {
        assert.ok(err instanceof ProviderError);
        assert.equal(err.status, 502);
        assert.equal(err.code, 'SCHEMA_VALIDATION_ERROR');
        return true;
      },
    );

    // 200 OK with HTML captive portal
    ServerVercelProviderClient.clearCache();
    const clientHtml200 = new ServerVercelProviderClient({
      baseUrl: 'https://api.captive.com/v1',
      model: 'gpt-4o',
      fetchFn: async () =>
        new Response('<html><body>Captive Portal Login</body></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
    });

    await assert.rejects(
      async () => clientHtml200.generateChatCompletion([{ role: 'user', content: 'Plan' }], { schemaName: 'plan' }),
      (err) => {
        assert.ok(err instanceof ProviderError);
        assert.equal(err.status, 502);
        assert.equal(err.code, 'HTML_RESPONSE');
        return true;
      },
    );
  });
});
