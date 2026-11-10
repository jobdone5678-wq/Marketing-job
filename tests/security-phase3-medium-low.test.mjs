import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { checkRateLimit } from '../src/lib/rate-limit.ts';
import { moduleLoader, fixtureDatabase } from './helpers/load-ts-module.mjs';

test('VULN-11: cors helper rejects malicious or invalid chrome-extension IDs', async () => {
  const db = fixtureDatabase({ extension_credentials: [], profiles: [] });
  class CaptureError extends Error {
    constructor(message, status = 400) {
      super(message);
      this.status = status;
    }
  }
  const load = moduleLoader({
    '@/lib/db/admin': {
      database: () => db,
      checkDb: () => {},
      CaptureError,
      errorResponse: (e) => Response.json({ error: e.message }, { status: e.status || 500 }),
    },
  });

  const { cors } = load('src/lib/capture/server.ts');

  // Valid 32-character extension ID
  const validReq = new Request('http://localhost/api/test', {
    headers: { origin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop' },
  });
  const res1 = cors(validReq, new Response(null));
  assert.equal(res1.headers.get('Access-Control-Allow-Origin'), 'chrome-extension://abcdefghijklmnopabcdefghijklmnop');

  // Malicious / invalid extension origin (e.g. invalid chars or path traversal)
  const invalidReq = new Request('http://localhost/api/test', {
    headers: { origin: 'chrome-extension://malicious-extension-id-123' },
  });
  const res2 = cors(invalidReq, new Response(null));
  assert.equal(res2.headers.get('Access-Control-Allow-Origin'), null, 'Must reject invalid extension ID');
});

test('VULN-14: extension manifests do not contain unauthorized typosquat domain nexckinhr.com', () => {
  const jobrightManifest = fs.readFileSync('jobright_extension/manifest.json', 'utf8');
  assert.doesNotMatch(jobrightManifest, /nexckinhr\.com/i, 'jobright manifest must not contain nexckinhr');
});

test('VULN-15: Gmail callback validates destination origin and prevents open redirect', () => {
  const callbackCode = fs.readFileSync('src/app/api/email-connections/gmail/callback/route.ts', 'utf8');
  assert.match(callbackCode, /isAllowedRedirectOrigin/, 'Must validate redirect destination origin');
  assert.match(callbackCode, /safeRedirectBase/, 'Must use sanitized base for redirect');
});

test('VULN-16: rate limiter throttles requests after reaching threshold', () => {
  const testKey = `test-limit-${Date.now()}`;
  for (let i = 0; i < 5; i++) {
    const res = checkRateLimit(testKey, { windowMs: 10000, max: 5 });
    assert.equal(res.allowed, true, `Call ${i + 1} within max 5 should be allowed`);
  }
  const exceeded = checkRateLimit(testKey, { windowMs: 10000, max: 5 });
  assert.equal(exceeded.allowed, false, '6th call exceeding limit must be blocked');
  assert.equal(exceeded.remaining, 0);
  assert.ok(exceeded.resetInMs > 0);
});
