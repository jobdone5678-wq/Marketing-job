import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createSsrfSafeFetch } from '../../src/lib/ai/ssrf-fetch-adapter.ts';
import { SafeHttpAgent } from '../../src/lib/ai/ssrf-guard.ts';
import { ProviderError } from '../../src/lib/ai/provider-client.ts';

test('SSRF Fetch Adapter: Socket binding, redirect blocking, and HTML error translation', async (t) => {
  await t.test('1. custom fetch binds socket agent and passes valid requests', async () => {
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
    const data = await res.json();
    assert.deepEqual(data, { ok: true });
  });

  await t.test('2. detects HTML DOCTYPE and throws ProviderError with 502 status and HTML_RESPONSE code', async () => {
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
        assert.match(err.responseBody || '', /502 Bad Gateway/);
        return true;
      }
    );
  });

  await t.test('3. detects HTML tags in non-HTML Content-Type responses and throws 502 HTML_RESPONSE', async () => {
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
      return new Response('<html><head><title>Cloudflare 502</title></head><body>Error</body></html>', {
        status: 502,
        headers: { 'Content-Type': 'text/plain' },
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
        return true;
      }
    );
  });

  await t.test('4. real network connection via local HTTP server binds agent and forwards headers/body', async () => {
    let serverReceivedHeaders = null;
    let serverReceivedBody = '';
    let serverReceivedMethod = '';

    const server = http.createServer((req, res) => {
      serverReceivedMethod = req.method;
      serverReceivedHeaders = req.headers;
      let bodyChunks = [];
      req.on('data', (chunk) => bodyChunks.push(chunk));
      req.on('end', () => {
        serverReceivedBody = Buffer.concat(bodyChunks).toString('utf-8');
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'X-Server-Proof': 'verified',
        });
        res.end(JSON.stringify({ received: true, body: JSON.parse(serverReceivedBody) }));
      });
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    try {
      const safeAgent = new SafeHttpAgent('127.0.0.1', port);
      const safeResult = {
        agent: safeAgent,
        validatedUrl: `http://127.0.0.1:${port}`,
        targetIp: '127.0.0.1',
        hostname: '127.0.0.1',
        port,
        protocol: 'http:',
        redirect: 'error',
      };

      const safeFetch = createSsrfSafeFetch(safeResult);
      const payload = { model: 'local-test', prompt: 'ping' };
      const res = await safeFetch(`http://127.0.0.1:${port}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token-123',
          'X-Client-Header': 'foobar',
        },
        body: JSON.stringify(payload),
      });

      assert.equal(res.status, 200);
      assert.equal(res.headers.get('x-server-proof'), 'verified');
      assert.equal(serverReceivedMethod, 'POST');
      assert.equal(serverReceivedHeaders['authorization'], 'Bearer test-token-123');
      assert.equal(serverReceivedHeaders['x-client-header'], 'foobar');

      const data = await res.json();
      assert.equal(data.received, true);
      assert.deepEqual(data.body, payload);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  await t.test('5. enforces redirect: error by throwing ProviderError with 308 REDIRECT_BLOCKED', async () => {
    const server = http.createServer((req, res) => {
      res.writeHead(302, {
        Location: 'http://169.254.169.254/latest/meta-data',
      });
      res.end('Redirecting...');
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    try {
      const safeAgent = new SafeHttpAgent('127.0.0.1', port);
      const safeResult = {
        agent: safeAgent,
        validatedUrl: `http://127.0.0.1:${port}`,
        targetIp: '127.0.0.1',
        hostname: '127.0.0.1',
        port,
        protocol: 'http:',
        redirect: 'error',
      };

      const safeFetch = createSsrfSafeFetch(safeResult);
      await assert.rejects(
        async () => {
          await safeFetch(`http://127.0.0.1:${port}/redirect-me`);
        },
        (err) => {
          assert.ok(err instanceof ProviderError);
          assert.equal(err.status, 308);
          assert.equal(err.code, 'REDIRECT_BLOCKED');
          assert.match(err.message, /redirects are not permitted/i);
          return true;
        }
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  await t.test('6. abort signal cancels request and throws ProviderError with 499 ABORTED', async () => {
    const server = http.createServer((req, res) => {
      // Intentionally do not respond, simulating hung server
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    try {
      const safeAgent = new SafeHttpAgent('127.0.0.1', port);
      const safeResult = {
        agent: safeAgent,
        validatedUrl: `http://127.0.0.1:${port}`,
        targetIp: '127.0.0.1',
        hostname: '127.0.0.1',
        port,
        protocol: 'http:',
        redirect: 'error',
      };

      const safeFetch = createSsrfSafeFetch(safeResult);
      const controller = new AbortController();

      const fetchPromise = safeFetch(`http://127.0.0.1:${port}/hang`, {
        signal: controller.signal,
      });

      // Abort after a small tick
      setTimeout(() => controller.abort(), 20);

      await assert.rejects(
        fetchPromise,
        (err) => {
          assert.ok(err instanceof ProviderError);
          assert.equal(err.status, 499);
          assert.equal(err.code, 'ABORTED');
          assert.match(err.message, /aborted/i);
          return true;
        }
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  await t.test('7. timeout signal cancels request and throws ProviderError with 504 TIMEOUT', async () => {
    const server = http.createServer((req, res) => {
      // Deliberately delay response
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ done: true }));
      }, 500);
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    try {
      const safeAgent = new SafeHttpAgent('127.0.0.1', port);
      const safeResult = {
        agent: safeAgent,
        validatedUrl: `http://127.0.0.1:${port}`,
        targetIp: '127.0.0.1',
        hostname: '127.0.0.1',
        port,
        protocol: 'http:',
        redirect: 'error',
      };

      const safeFetch = createSsrfSafeFetch(safeResult);

      await assert.rejects(
        async () => {
          await safeFetch(`http://127.0.0.1:${port}/slow`, {
            signal: AbortSignal.timeout(30),
          });
        },
        (err) => {
          assert.ok(err instanceof ProviderError);
          assert.equal(err.status, 504);
          assert.equal(err.code, 'TIMEOUT');
          assert.match(err.message, /timed out/i);
          return true;
        }
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
