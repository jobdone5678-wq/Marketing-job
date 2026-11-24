import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { ProviderClient, ProviderError } from '../../src/lib/ai/provider-client.ts';

test('ProviderClient: Markdown fence stripping and JSON parsing', async (t) => {
  await t.test('strips ```json markdown fences and extracts valid rawJson', async () => {
    const mockJson = { fills: [{ label: 'Full Name', value: 'Jane Doe' }] };
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

    const result = await client.generateChatCompletion([
      { role: 'user', content: 'Generate form plan' },
    ]);

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
