import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { ProviderClient, ProviderError } from '../../src/lib/ai/provider-client.ts';

test('ProviderClient: Markdown fence stripping and JSON parsing', async (t) => {
  await t.test('strips JSON fences and accepts plan entries without a value', async () => {
    const mockJson = {
      fills: [
        { label: 'Full Name', value: 'Jane Doe' },
        { label: 'Remote', action: 'skip' },
        { label: 'City', action: 'defer_combobox', searchQuery: 'Austin' },
      ],
    };
    const wrappedContent = '```json\n' + JSON.stringify(mockJson, null, 2) + '\n```';

    const customFetch = async () => {
      return new Response(
        JSON.stringify({
          id: 'chatcmpl-123',
          choices: [{ message: { content: wrappedContent, role: 'assistant' } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const client = new ProviderClient({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-4o-mini',
      fetchFn: customFetch,
    });

    const result = await client.generateChatCompletion(
      [{ role: 'user', content: 'Generate form plan' }],
      { schemaName: 'plan' },
    );

    assert.deepEqual(result.rawJson, mockJson);
    assert.equal(result.text, JSON.stringify(mockJson, null, 2));
  });

  await t.test('strips plain ``` fences and commentary preamble/postamble', async () => {
    const mockJson = { fills: [{ label: 'Email', value: 'jane@example.com' }] };
    const responseText = `Here is your JSON response:\n\`\`\`\n${JSON.stringify(mockJson)}\n\`\`\`\nHope this helps!`;

    const customFetch = async () => {
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: responseText } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const client = new ProviderClient({
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: 'test-key',
      model: 'deepseek/deepseek-chat',
      fetchFn: customFetch,
    });

    const result = await client.generateChatCompletion([
      { role: 'user', content: 'Fill form' },
    ]);

    assert.deepEqual(result.rawJson, mockJson);
  });

  await t.test('parses pure JSON output directly without modification', async () => {
    const mockJson = { choice: 'United States' };
    const customFetch = async () => {
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(mockJson) } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const client = new ProviderClient({
      baseUrl: 'http://localhost:11434/v1',
      model: 'llama3:8b',
      fetchFn: customFetch,
    });

    const result = await client.generateChatCompletion([
      { role: 'user', content: 'Choose option' },
    ]);

    assert.deepEqual(result.rawJson, mockJson);
  });
});

test('ProviderClient: HTML error page detection and handling', async (t) => {
  await t.test('detects <!DOCTYPE html> and throws ProviderError with 502 status', async () => {
    const htmlBody = '<!DOCTYPE html><html><head><title>502 Bad Gateway</title></head><body>Cloudflare gateway down</body></html>';
    const customFetch = async () => {
      return new Response(htmlBody, {
        status: 502,
        headers: { 'Content-Type': 'text/html; charset=UTF-8' },
      });
    };

    const client = new ProviderClient({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-4o',
      fetchFn: customFetch,
    });

    await assert.rejects(
      async () => {
        await client.generateChatCompletion([{ role: 'user', content: 'test' }]);
      },
      (err) => {
        assert.ok(err instanceof ProviderError);
        assert.equal(err.status, 502);
        assert.match(err.message, /Endpoint returned HTML error page instead of JSON/i);
        return true;
      },
    );
  });

  await t.test('detects HTML even if server returns 200 with HTML body', async () => {
    const htmlBody = '<html><body><h1>Login Required - Captive Portal</h1></body></html>';
    const customFetch = async () => {
      return new Response(htmlBody, {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    };

    const client = new ProviderClient({
      baseUrl: 'https://proxy.example.com/v1',
      apiKey: 'test-key',
      model: 'gpt-4o',
      fetchFn: customFetch,
    });

    await assert.rejects(
      async () => {
        await client.generateChatCompletion([{ role: 'user', content: 'test' }]);
      },
      (err) => {
        assert.ok(err instanceof ProviderError);
        assert.equal(err.status, 502);
        assert.match(err.message, /Endpoint returned HTML error page instead of JSON/i);
        return true;
      },
    );
  });
});

test('ProviderClient: JSON mode capability detection and fallback retry', async (t) => {
  await t.test('sends response_format json_object, falls back and caches on 400 unsupported parameter', async () => {
    let callCount = 0;
    const requestBodies = [];

    const customFetch = async (url, opts) => {
      callCount++;
      const parsedBody = JSON.parse(opts.body);
      requestBodies.push(parsedBody);

      if (callCount === 1) {
        // First call: provider rejects response_format
        assert.deepEqual(parsedBody.response_format, { type: 'json_object' });
        return new Response(
          JSON.stringify({
            error: {
              message: "Unsupported parameter: 'response_format' is not supported by this model.",
              type: 'invalid_request_error',
              code: 'unsupported_parameter',
            },
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        );
      }

      // Second call (retry): response_format should be omitted and prompt should constrain JSON
      assert.equal(parsedBody.response_format, undefined);
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({ fills: [{ label: 'City', value: 'Austin' }] }),
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const client = new ProviderClient({
      baseUrl: 'https://api.mistral.ai/v1',
      apiKey: 'test-mistral',
      model: 'open-mistral-7b',
      fetchFn: customFetch,
    });

    assert.equal(client.supportsJsonMode, true);

    const result = await client.generateChatCompletion([
      { role: 'user', content: 'Extract candidate city' },
    ]);

    assert.equal(callCount, 2, 'Should automatically retry once after 400 unsupported parameter');
    assert.deepEqual(result.rawJson, { fills: [{ label: 'City', value: 'Austin' }] });
    assert.equal(client.supportsJsonMode, false, 'Capability must be cached as false');

    // Make another call to verify cached capability is respected (no response_format sent)
    const result2 = await client.generateChatCompletion([
      { role: 'user', content: 'Second question' },
    ]);
    assert.equal(callCount, 3, 'Should succeed on first try without response_format');
    assert.equal(requestBodies[2].response_format, undefined);
  });
});

test('ProviderClient: Timeout and redirect enforcement', async (t) => {
  await t.test('enforces timeout with AbortSignal', async () => {
    const customFetch = async (url, opts) => {
      return new Promise((resolve, reject) => {
        opts.signal?.addEventListener('abort', () => {
          const abortError = new Error('The operation was aborted');
          abortError.name = 'AbortError';
          reject(abortError);
        });
      });
    };

    const client = new ProviderClient({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-4o',
      timeoutMs: 50,
      fetchFn: customFetch,
    });

    await assert.rejects(
      async () => {
        await client.generateChatCompletion([{ role: 'user', content: 'hello' }]);
      },
      (err) => {
        assert.ok(err instanceof ProviderError);
        assert.equal(err.status, 504);
        assert.match(err.message, /timed out/i);
        return true;
      },
    );
  });

  await t.test('disables HTTP redirects and sets redirect: error', async () => {
    let capturedRedirect = null;
    const customFetch = async (url, opts) => {
      capturedRedirect = opts.redirect;
      return new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const client = new ProviderClient({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-4o',
      fetchFn: customFetch,
    });

    await client.generateChatCompletion([{ role: 'user', content: 'test' }]);
    assert.equal(capturedRedirect, 'error', 'Must specify redirect: error');
  });

  await t.test('throws ProviderError when redirect occurs', async () => {
    const customFetch = async () => {
      const redirectError = new TypeError('Failed to fetch: redirect mode is set to error');
      throw redirectError;
    };

    const client = new ProviderClient({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-4o',
      fetchFn: customFetch,
    });

    await assert.rejects(
      async () => {
        await client.generateChatCompletion([{ role: 'user', content: 'test' }]);
      },
      (err) => {
        assert.ok(err instanceof ProviderError);
        assert.match(err.message, /redirect/i);
        return true;
      },
    );
  });
});

test('ProviderClient: URL resolution and headers', async (t) => {
  await t.test('formats headers with Authorization Bearer and JSON Content-Type', async () => {
    let capturedUrl = null;
    let capturedHeaders = null;

    const customFetch = async (url, opts) => {
      capturedUrl = url;
      capturedHeaders = opts.headers;
      return new Response(
        JSON.stringify({ choices: [{ message: { content: '{"status":"ok"}' } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const client = new ProviderClient({
      baseUrl: 'https://api.groq.com/openai/v1',
      apiKey: 'gsk-12345',
      model: 'llama-3.3-70b-versatile',
      fetchFn: customFetch,
    });

    await client.generateChatCompletion([{ role: 'user', content: 'ping' }]);

    assert.equal(capturedUrl, 'https://api.groq.com/openai/v1/chat/completions');
    assert.equal(capturedHeaders['Authorization'], 'Bearer gsk-12345');
    assert.equal(capturedHeaders['Content-Type'], 'application/json');
  });

  await t.test('omits Authorization header when apiKey is empty or not provided (e.g. local Ollama)', async () => {
    let capturedHeaders = null;
    let capturedUrl = null;

    const customFetch = async (url, opts) => {
      capturedUrl = url;
      capturedHeaders = opts.headers;
      return new Response(
        JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const client = new ProviderClient({
      baseUrl: 'http://localhost:11434',
      model: 'llama3',
      fetchFn: customFetch,
    });

    await client.generateChatCompletion([{ role: 'user', content: 'ping' }]);
    assert.equal(capturedUrl, 'http://localhost:11434/v1/chat/completions');
    assert.equal(capturedHeaders['Authorization'], undefined);
  });
});

test('ProviderClient: PC-01..PC-06 telemetry, schema enforcement, error codes, completion validation, retries, and redaction', async (t) => {
  await t.test('PC-01: populates usage telemetry without inventing counts and always sets durationMs and status OK', async () => {
    const customFetch = async () =>
      new Response(
        JSON.stringify({
          choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ fills: [] }) } }],
          usage: { prompt_tokens: 42, completion_tokens: 11 }, // total_tokens intentionally omitted
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );

    const client = new ProviderClient({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test-secret-123456789',
      model: 'gpt-4o-mini',
      fetchFn: customFetch,
    });

    const result = await client.generateChatCompletion([{ role: 'user', content: 'Plan' }], {
      responseFormat: 'json_prompt',
      schemaName: 'plan',
    });

    assert.equal(result.status, 'OK');
    assert.equal(result.finishReason, 'stop');
    assert.equal(typeof result.durationMs, 'number');
    assert.ok(result.durationMs >= 0);
    assert.equal(result.usage?.inputTokens, 42);
    assert.equal(result.usage?.promptTokens, 42);
    assert.equal(result.usage?.outputTokens, 11);
    assert.equal(result.usage?.completionTokens, 11);
    assert.equal(result.usage?.totalTokens, undefined);
  });

  await t.test('PC-02: sends provider-side json_schema when supported and enforces runtime Zod validation on plan/choose', async () => {
    let seenResponseFormat;
    const validClient = new ProviderClient({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test-123456789',
      model: 'gpt-4o-mini',
      fetchFn: async (_url, init) => {
        seenResponseFormat = JSON.parse(init.body).response_format;
        return new Response(
          JSON.stringify({
            choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ choice: 'Yes' }) } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      },
    });

    const okRes = await validClient.generateChatCompletion([{ role: 'user', content: 'Choose' }], {
      schemaName: 'choose',
    });
    assert.equal(seenResponseFormat?.type, 'json_schema');
    assert.equal(seenResponseFormat?.json_schema?.name, 'choose');
    assert.equal(okRes.rawJson?.choice, 'Yes');

    // Runtime Zod validation runs even with supportsStructuredOutputs=false and responseFormat='json_prompt'
    const invalidSchemaClient = new ProviderClient({
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      supportsStructuredOutputs: false,
      supportsJsonMode: false,
      fetchFn: async () =>
        new Response(
          JSON.stringify({
            choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ wrongField: 123 }) } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    });

    await assert.rejects(
      () =>
        invalidSchemaClient.generateChatCompletion([{ role: 'user', content: 'Plan' }], {
          responseFormat: 'json_prompt',
          schemaName: 'plan',
        }),
      (err) =>
        err instanceof ProviderError &&
        err.status === 502 &&
        err.code === 'SCHEMA_VALIDATION_ERROR' &&
        err.statusCode === 'INVALID_RESPONSE',
    );
  });

  await t.test('PC-04: separates ABORTED, TIMEOUT, RATE_LIMITED, NETWORK_ERROR, and INVALID_RESPONSE', async () => {
    // External AbortSignal -> ABORTED (not TIMEOUT)
    const abortController = new AbortController();
    const abortClient = new ProviderClient({
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      timeoutMs: 5000,
      fetchFn: async (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            const e = new Error('Aborted');
            e.name = 'AbortError';
            reject(e);
          });
          setTimeout(() => abortController.abort(), 15);
        }),
    });
    await assert.rejects(
      () => abortClient.generateChatCompletion([{ role: 'user', content: 'Hi' }], { signal: abortController.signal }),
      (err) => err instanceof ProviderError && err.status === 499 && err.code === 'ABORTED' && err.statusCode === 'ABORTED',
    );

    // HTTP 429 -> RATE_LIMITED
    const rateClient = new ProviderClient({
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      fetchFn: async () => new Response(JSON.stringify({ error: 'rate limit' }), { status: 429 }),
    });
    await assert.rejects(
      () => rateClient.generateChatCompletion([{ role: 'user', content: 'Hi' }]),
      (err) => err instanceof ProviderError && err.status === 429 && err.statusCode === 'RATE_LIMITED',
    );

    // Network socket failure -> NETWORK_ERROR
    const netClient = new ProviderClient({
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      fetchFn: async () => {
        throw new TypeError('ECONNRESET');
      },
    });
    await assert.rejects(
      () => netClient.generateChatCompletion([{ role: 'user', content: 'Hi' }]),
      (err) => err instanceof ProviderError && err.code === 'NETWORK_ERROR' && err.statusCode === 'NETWORK_ERROR',
    );
  });

  await t.test('PC-05: rejects missing choice, non-string content, finish_reason length, and model refusal', async () => {
    const cases = [
      { name: 'missing choice', body: { choices: [] }, expectedCode: 'INVALID_RESPONSE' },
      { name: 'non-string content', body: { choices: [{ message: { content: null } }] }, expectedCode: 'INVALID_RESPONSE' },
      { name: 'truncated length', body: { choices: [{ finish_reason: 'length', message: { content: '{"fills":[' } }] }, expectedCode: 'TRUNCATED_RESPONSE' },
      { name: 'refusal field', body: { choices: [{ message: { content: '', refusal: 'Cannot answer' } }] }, expectedCode: 'MODEL_REFUSAL' },
      { name: 'content_filter', body: { choices: [{ finish_reason: 'content_filter', message: { content: '' } }] }, expectedCode: 'MODEL_REFUSAL' },
    ];

    for (const c of cases) {
      const client = new ProviderClient({
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
        fetchFn: async () =>
          new Response(JSON.stringify(c.body), { status: 200, headers: { 'Content-Type': 'application/json' } }),
      });

      await assert.rejects(
        () => client.generateChatCompletion([{ role: 'user', content: 'Plan' }], { schemaName: 'plan' }),
        (err) =>
          err instanceof ProviderError &&
          err.status === 502 &&
          err.code === c.expectedCode &&
          err.statusCode === 'INVALID_RESPONSE',
        `Expected INVALID_RESPONSE for ${c.name}`,
      );
    }
  });

  await t.test('PC-03 & PC-06: bounded transient retries and sensitive-data redaction in ProviderError', async () => {
    let attempts = 0;
    const retryClient = new ProviderClient({
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      fetchFn: async () => {
        attempts++;
        if (attempts < 3) {
          return new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 });
        }
        return new Response(
          JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ fills: [] }) } }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      },
    });

    const res = await retryClient.generateChatCompletion([{ role: 'user', content: 'Plan' }], {
      schemaName: 'plan',
      maxRetries: 2,
      retryBaseDelayMs: 1,
    });
    assert.equal(attempts, 3);
    assert.deepEqual(res.rawJson, { fills: [] });

    // Sensitive data redaction
    const err = new ProviderError(
      'Failed with Bearer secret-token-123 sk-proj-abcdef123456 email candidate@example.com ssn 123-45-6789',
      500,
    );
    assert.ok(!err.message.includes('secret-token-123'));
    assert.ok(!err.message.includes('sk-proj-abcdef123456'));
    assert.ok(!err.message.includes('candidate@example.com'));
    assert.ok(!err.message.includes('123-45-6789'));
    assert.match(err.message, /\[REDACTED\]/);
    assert.match(err.message, /\[REDACTED_EMAIL\]/);
  });
});
