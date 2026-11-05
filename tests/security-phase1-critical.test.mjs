import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeJobHtml } from '../src/lib/html-sanitizer.ts';

test('VULN-03: sanitizeJobHtml strips malicious script, event handlers, and iframes from job descriptions', () => {
  const payload = '<p>Great role!</p><script>alert("XSS")</script><img src="x" onerror="alert(1)"><iframe src="javascript:alert(2)"></iframe>';
  const clean = sanitizeJobHtml(payload);

  assert.doesNotMatch(clean, /<script/i, 'Must not contain script tags');
  assert.doesNotMatch(clean, /onerror/i, 'Must not contain onerror handlers');
  assert.doesNotMatch(clean, /<iframe/i, 'Must not contain iframe tags');
  assert.doesNotMatch(clean, /javascript:/i, 'Must not contain javascript: URLs');
  assert.match(clean, /<p>Great role!<\/p>/, 'Must preserve safe allowed HTML tags');
});

test('VULN-03: sanitizeJobHtml handles null, undefined, and non-string inputs safely', () => {
  assert.equal(sanitizeJobHtml(null), '');
  assert.equal(sanitizeJobHtml(undefined), '');
  assert.equal(sanitizeJobHtml(''), '');
  assert.equal(sanitizeJobHtml('Plain text without tags'), 'Plain text without tags');
});

test('VULN-05: next package is upgraded to >=16.4.5 to mitigate GHSA-2464-fhr4-w9xw & GHSA-673q-mjm6-r5xr', async () => {
  const { default: nextPkg } = await import('../node_modules/next/package.json', { with: { type: 'json' } });
  const [major, minor, patch] = nextPkg.version.split('.').map(Number);
  assert.ok(major >= 16, 'Major version must be >= 16');
  if (major === 16) {
    assert.ok(minor >= 4, 'Minor version must be >= 4');
    if (minor === 4) {
      assert.ok(patch >= 5, 'Patch version must be >= 5');
    }
  }
});

import { moduleLoader, fixtureDatabase } from './helpers/load-ts-module.mjs';

test('VULN-01: extensionProfile rejects missing or invalid authorization header with 401', async () => {
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
      checkDb: (err) => { if (err) throw err; },
      CaptureError,
      errorResponse: (e) => Response.json({ error: e.message }, { status: e.status || 500 }),
    },
  });

  const { extensionProfile } = load('src/lib/capture/server.ts');
  const emptyReq = new Request('http://localhost/api/extension/attestations');
  await assert.rejects(
    async () => {
      await extensionProfile(emptyReq);
    },
    (err) => {
      assert.equal(err.status, 401, 'Should fail closed with status 401');
      assert.match(err.message, /Authentication required/i);
      return true;
    }
  );

  const invalidReq = new Request('http://localhost/api/extension/attestations', {
    headers: { authorization: 'Bearer bad_token_123' },
  });
  await assert.rejects(
    async () => {
      await extensionProfile(invalidReq);
    },
    (err) => {
      assert.equal(err.status, 401, 'Should fail closed with status 401 on invalid token');
      return true;
    }
  );
});

test('VULN-04: generate-answer route does not leak hardcoded OpenAI API key fallback', async () => {
  const fs = await import('node:fs');
  const content = fs.readFileSync('src/app/api/extension/generate-answer/route.ts', 'utf8');
  assert.doesNotMatch(content, /sk-xt-feb0878843bac616bf98f1a1797820ed06b863167626066d/);
  assert.doesNotMatch(content, /process\.env\.OPENAI_API_KEY\s*\|\|\s*['"]sk-/);
});
