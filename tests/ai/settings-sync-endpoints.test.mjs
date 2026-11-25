import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import {
  encryptSecret,
  decryptSecret,
  getEncryptionKey,
} from '../../src/lib/ai/encryption.ts';
import {
  GET as getSettings,
  PUT as putSettings,
  maskApiKey,
} from '../../src/app/api/extension/ai/settings/route.ts';
import { POST as testConnection } from '../../src/app/api/extension/ai/test-connection/route.ts';

const migrationSql = readFileSync(
  new URL('../../supabase/migrations/20261124000200_user_ai_provider_configs.sql', import.meta.url),
  'utf8'
);

const TEST_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.AI_PROVIDER_ENCRYPTION_KEY = TEST_KEY;

const USER_1 = '11111111-1111-4000-8000-111111111111';
const USER_2 = '22222222-2222-4000-8000-222222222222';

async function createTestDb() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;

    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE IF NOT EXISTS auth.users (
      id uuid PRIMARY KEY,
      email text,
      created_at timestamptz DEFAULT now()
    );

    CREATE OR REPLACE FUNCTION auth.uid()
    RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;

    CREATE OR REPLACE FUNCTION public.handle_updated_at()
    RETURNS trigger AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'user1@example.com')`, [USER_1]);
  await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'user2@example.com')`, [USER_2]);
  await db.exec(migrationSql);

  return db;
}

test('AI Settings Sync & Test Connection Endpoints', async (t) => {
  const db = await createTestDb();
  t.after(async () => {
    await db.close();
  });

  await t.test('maskApiKey formats sensitive tokens correctly', () => {
    assert.equal(maskApiKey('sk-or-v1-abcdef0123456789102'), 'sk-or-••••9102');
    assert.equal(maskApiKey('sk-or-9102'), 'sk-or-••••9102');
    assert.equal(maskApiKey('sk-abcdef1234'), 'sk-abc••••1234');
    assert.equal(maskApiKey('short'), '••••rt');
    assert.equal(maskApiKey(''), '');
  });

  await t.test('Authentication: rejects unauthenticated requests with 401', async () => {
    const unauthReq = new Request('http://localhost/api/extension/ai/settings');
    const resGet = await getSettings(unauthReq, { db });
    assert.equal(resGet.status, 401);

    const resPut = await putSettings(unauthReq, { db });
    assert.equal(resPut.status, 401);

    const resTest = await testConnection(unauthReq, { db });
    assert.equal(resTest.status, 401);
  });

  await t.test('GET /api/extension/ai/settings returns defaults when no configuration exists', async () => {
    const req = new Request('http://localhost/api/extension/ai/settings', {
      headers: { Authorization: `Bearer ${USER_1}` },
    });
    const res = await getSettings(req, { db });
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.mode, 'server');
    assert.equal(body.provider, 'server');
    assert.equal(body.hasApiKey, false);
    assert.equal(body.maskedApiKey, null);
    assert.equal(body.configVersion, 1);
  });

  await t.test('PUT /api/extension/ai/settings validates payload with Zod', async () => {
    // Invalid URL for baseUrl
    const badUrlReq = new Request('http://localhost/api/extension/ai/settings', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${USER_1}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mode: 'portal_byok',
        baseUrl: 'invalid-url-not-http',
      }),
    });
    const badUrlRes = await putSettings(badUrlReq, { db });
    assert.equal(badUrlRes.status, 400);

    // Invalid mode
    const badModeReq = new Request('http://localhost/api/extension/ai/settings', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${USER_1}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mode: 'invalid_mode_xyz',
      }),
    });
    const badModeRes = await putSettings(badModeReq, { db });
    assert.equal(badModeRes.status, 400);
  });

  await t.test('PUT /api/extension/ai/settings encrypts API key with AAD and saves config', async () => {
    const plainApiKey = 'sk-or-v1-abcdef0123456789102';
    const baseUrl = 'https://openrouter.ai/api/v1';

    const req = new Request('http://localhost/api/extension/ai/settings', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${USER_1}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mode: 'portal_byok',
        provider: 'openrouter',
        baseUrl,
        modelId: 'deepseek/deepseek-chat',
        apiKey: plainApiKey,
        configVersion: 1,
      }),
    });

    const res = await putSettings(req, { db });
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.configVersion, 2, 'configVersion must be incremented to 2');
    assert.equal(body.mode, 'portal_byok');
    assert.equal(body.provider, 'openrouter');
    assert.equal(body.hasApiKey, true);

    // Verify database row in private.user_ai_provider_secrets
    const secretRow = await db.query(
      `SELECT * FROM private.user_ai_provider_secrets WHERE user_id = $1`,
      [USER_1]
    );
    assert.equal(secretRow.rows.length, 1);
    const row = secretRow.rows[0];
    assert.notEqual(row.encrypted_api_key, plainApiKey, 'Plaintext secret must never be stored');
    assert.ok(row.iv);
    assert.ok(row.auth_tag);
    assert.ok(row.key_origin);

    // Verify secret decrypts with AAD (userId:origin)
    const decrypted = decryptSecret(
      {
        encrypted: row.encrypted_api_key,
        iv: row.iv,
        authTag: row.auth_tag,
      },
      USER_1,
      row.key_origin
    );
    assert.equal(decrypted, plainApiKey, 'Decrypted secret must match original key');
  });

  await t.test('GET /api/extension/ai/settings returns masked key and never exposes plaintext', async () => {
    const req = new Request('http://localhost/api/extension/ai/settings', {
      headers: { Authorization: `Bearer ${USER_1}` },
    });
    const res = await getSettings(req, { db });
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.hasApiKey, true);
    assert.equal(body.maskedApiKey, 'sk-or-••••9102');
    assert.equal(body.configVersion, 2);
    assert.equal(body.baseUrl, 'https://openrouter.ai/api/v1');
    assert.equal(body.modelId, 'deepseek/deepseek-chat');

    // Ensure plaintext key is never in the response
    const rawJson = JSON.stringify(body);
    assert.equal(rawJson.includes('abcdef0123456789102'), false);
    assert.equal(body.apiKey, undefined);
  });

  await t.test('Optimistic locking: PUT fails with 409 if config_version does not match', async () => {
    // Current database version is 2. Client sends stale version 1.
    const staleReq = new Request('http://localhost/api/extension/ai/settings', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${USER_1}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mode: 'portal_byok',
        configVersion: 1, // Stale version!
        modelId: 'openai/gpt-4o',
      }),
    });

    const res = await putSettings(staleReq, { db });
    assert.equal(res.status, 409, 'Must return HTTP 409 on optimistic locking conflict');

    const body = await res.json();
    assert.equal(body.currentVersion, 2);
  });

  await t.test('PUT without apiKey retains existing encrypted secret without overwriting', async () => {
    // Read existing encrypted secret before update
    const beforeRow = await db.query(
      `SELECT * FROM private.user_ai_provider_secrets WHERE user_id = $1`,
      [USER_1]
    );
    const originalCipher = beforeRow.rows[0].encrypted_api_key;

    // Update settings with configVersion: 2, but NO apiKey (or masked apiKey)
    const updateReq = new Request('http://localhost/api/extension/ai/settings', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${USER_1}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mode: 'portal_byok',
        configVersion: 2,
        modelId: 'deepseek/deepseek-coder',
        apiKey: 'sk-or-••••9102', // Sending masked key should NOT overwrite secret
      }),
    });

    const res = await putSettings(updateReq, { db });
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.configVersion, 3);
    assert.equal(body.hasApiKey, true);

    // Verify secret in database is still intact
    const afterRow = await db.query(
      `SELECT * FROM private.user_ai_provider_secrets WHERE user_id = $1`,
      [USER_1]
    );
    assert.equal(afterRow.rows[0].encrypted_api_key, originalCipher, 'Original encrypted key must be retained');

    const decrypted = decryptSecret(
      {
        encrypted: afterRow.rows[0].encrypted_api_key,
        iv: afterRow.rows[0].iv,
        authTag: afterRow.rows[0].auth_tag,
      },
      USER_1,
      afterRow.rows[0].key_origin
    );
    assert.equal(decrypted, 'sk-or-v1-abcdef0123456789102');
  });

  await t.test('POST /api/extension/ai/test-connection blocks loopback and metadata IPs via SSRF guard', async () => {
    const blockedUrls = [
      'http://127.0.0.1:11434',
      'http://localhost:11434',
      'http://169.254.169.254/latest/meta-data/',
      'http://metadata.google.internal',
      'http://10.0.0.1/v1',
      'http://[::1]:8080',
    ];

    for (const url of blockedUrls) {
      const req = new Request('http://localhost/api/extension/ai/test-connection', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${USER_1}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          baseUrl: url,
          apiKey: 'test-key',
        }),
      });

      const res = await testConnection(req, { db });
      assert.equal(res.status, 400, `Expected HTTP 400 for blocked SSRF URL: ${url}`);
      const body = await res.json();
      assert.equal(body.ok, false);
      assert.ok(
        ['BLOCKED_IP', 'BLOCKED_HOST', 'DISALLOWED_PORT', 'DISALLOWED_HOST'].includes(body.code),
        `Unexpected code: ${body.code} for URL: ${url}`
      );
    }
  });

  await t.test('POST /api/extension/ai/test-connection succeeds when provider responds with 200', async () => {
    const mockFetch = async (url, options) => {
      return new Response(JSON.stringify({ data: [{ id: 'deepseek-chat' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const req = new Request('http://localhost/api/extension/ai/test-connection', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${USER_1}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: 'test-key',
      }),
    });

    const res = await testConnection(req, { db, fetchFn: mockFetch });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.message, 'Connection successful');
  });

  await t.test('POST /api/extension/ai/test-connection returns 401 when provider rejects credentials', async () => {
    const mockFetch = async () => {
      return new Response(JSON.stringify({ error: { message: 'Invalid API key' } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const req = new Request('http://localhost/api/extension/ai/test-connection', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${USER_1}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: 'invalid-key',
      }),
    });

    const res = await testConnection(req, { db, fetchFn: mockFetch });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.ok, false);
  });

  await t.test('POST /api/extension/ai/test-connection rejects image generation models with HTTP 422', async () => {
    const mockFetch = async () => {
      return new Response(JSON.stringify({ data: [{ id: 'recraft/recraft-v4.1-flash-v2:free' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const req = new Request('http://localhost/api/extension/ai/test-connection', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${USER_1}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: 'test-key',
        modelId: 'recraft/recraft-v4.1-flash-v2:free',
      }),
    });

    const res = await testConnection(req, { db, fetchFn: mockFetch });
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.match(body.error, /image generation model/i);
  });

  await t.test("PUT with mode: 'portal_byok' and no apiKey for USER_2 (no stored secret) returns 400", async () => {
    const req = new Request('http://localhost/api/extension/ai/settings', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${USER_2}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mode: 'portal_byok',
        provider: 'openrouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        modelId: 'deepseek/deepseek-chat',
      }),
    });

    const res = await putSettings(req, { db });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.match(body.error, /API key is required/i);

    const configRow = await db.query(
      `SELECT * FROM public.user_ai_provider_configs WHERE user_id = $1`,
      [USER_2]
    );
    assert.equal(configRow.rows.length, 0, 'Keyless portal_byok config must not be saved');
  });

  await t.test("PUT with mode: 'portal_byok' and apiKey: null or '' for USER_1 returns 400 and preserves existing secret", async () => {
    const beforeSecret = await db.query(
      `SELECT * FROM private.user_ai_provider_secrets WHERE user_id = $1`,
      [USER_1]
    );
    assert.equal(beforeSecret.rows.length, 1);

    for (const emptyApiKey of [null, '', '   ']) {
      const req = new Request('http://localhost/api/extension/ai/settings', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${USER_1}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mode: 'portal_byok',
          configVersion: 3,
          apiKey: emptyApiKey,
        }),
      });

      const res = await putSettings(req, { db });
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.ok, false);
      assert.match(body.error, /API key is required/i);

      const afterSecret = await db.query(
        `SELECT * FROM private.user_ai_provider_secrets WHERE user_id = $1`,
        [USER_1]
      );
      assert.equal(afterSecret.rows.length, 1, 'Existing secret must not be deleted');
      assert.equal(
        afterSecret.rows[0].encrypted_api_key,
        beforeSecret.rows[0].encrypted_api_key,
        'Existing secret cipher must be preserved'
      );

      const decrypted = decryptSecret(
        {
          encrypted: afterSecret.rows[0].encrypted_api_key,
          iv: afterSecret.rows[0].iv,
          authTag: afterSecret.rows[0].auth_tag,
        },
        USER_1,
        afterSecret.rows[0].key_origin
      );
      assert.equal(decrypted, 'sk-or-v1-abcdef0123456789102');
    }
  });
});
