import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  encryptSecret,
  decryptSecret,
  AuthenticationError,
} from '../../src/lib/ai/encryption.ts';

const VALID_KEY_HEX = crypto.randomBytes(32).toString('hex');
const VALID_KEY_BASE64 = crypto.randomBytes(32).toString('base64');
const VALID_KEY_RAW = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6'; // 32 characters

test('encryption module: AAD-bound AES-256-GCM secret encryption', async (t) => {
  const originalEnv = { ...process.env };

  t.beforeEach(() => {
    process.env.AI_PROVIDER_ENCRYPTION_KEY = VALID_KEY_HEX;
    delete process.env.EMAIL_TOKEN_ENCRYPTION_KEY;
  });

  t.afterEach(() => {
    process.env = { ...originalEnv };
  });

  await t.test('encryptSecret creates payload with 12-byte IV and 16-byte auth tag', () => {
    const userId = '11111111-1111-4000-8000-111111111111';
    const origin = 'https://openrouter.ai/api/v1';
    const secret = 'sk-or-v1-abcdef1234567890';

    const payload = encryptSecret(secret, userId, origin);

    assert.ok(payload.encrypted, 'payload.encrypted must be defined');
    assert.ok(payload.iv, 'payload.iv must be defined');
    assert.ok(payload.authTag, 'payload.authTag must be defined');

    // IV must be 12 bytes (24 hex or 16 base64 chars)
    const ivBytes = Buffer.from(payload.iv, payload.iv.length === 24 ? 'hex' : 'base64');
    assert.equal(ivBytes.length, 12, 'IV must be exactly 12 bytes');

    // Auth tag must be 16 bytes (32 hex or 24 base64 chars)
    const authTagBytes = Buffer.from(payload.authTag, payload.authTag.length === 32 ? 'hex' : 'base64');
    assert.equal(authTagBytes.length, 16, 'authTag must be exactly 16 bytes');
  });

  await t.test('encryptSecret generates unique IV per write even for identical input', () => {
    const userId = '11111111-1111-4000-8000-111111111111';
    const origin = 'https://api.openai.com/v1';
    const secret = 'sk-same-secret-across-calls';

    const payload1 = encryptSecret(secret, userId, origin);
    const payload2 = encryptSecret(secret, userId, origin);

    assert.notEqual(payload1.iv, payload2.iv, 'IV must be unique per write');
    assert.notEqual(payload1.encrypted, payload2.encrypted, 'Ciphertext must differ with different IV');
  });

  await t.test('decryptSecret recovers original secret when userId and origin match', () => {
    const userId = 'usr-test-456';
    const origin = 'https://api.deepseek.com/v1';
    const secret = 'sk-dsk-live-0987654321-!@#$%^&*()_+-=~';

    const payload = encryptSecret(secret, userId, origin);
    const decrypted = decryptSecret(payload, userId, origin);

    assert.equal(decrypted, secret, 'Decrypted value must match original plaintext');
  });

  await t.test('decryptSecret supports base64 encoded AI_PROVIDER_ENCRYPTION_KEY', () => {
    process.env.AI_PROVIDER_ENCRYPTION_KEY = VALID_KEY_BASE64;
    const userId = 'usr-b64-test';
    const origin = 'https://api.groq.com/openai/v1';
    const secret = 'gsk-key-test-value-12345';

    const payload = encryptSecret(secret, userId, origin);
    const decrypted = decryptSecret(payload, userId, origin);

    assert.equal(decrypted, secret);
  });

  await t.test('decryptSecret supports 32-character raw string AI_PROVIDER_ENCRYPTION_KEY', () => {
    process.env.AI_PROVIDER_ENCRYPTION_KEY = VALID_KEY_RAW;
    const userId = 'usr-raw-test';
    const origin = 'https://api.mistral.ai/v1';
    const secret = 'mistral-api-key-test';

    const payload = encryptSecret(secret, userId, origin);
    const decrypted = decryptSecret(payload, userId, origin);

    assert.equal(decrypted, secret);
  });

  await t.test('decryptSecret fails with AuthenticationError if userId differs (AAD mismatch)', () => {
    const userId = 'victim-user-id';
    const attackerId = 'attacker-user-id';
    const origin = 'https://api.openai.com/v1';
    const secret = 'sk-sensitive-victim-api-key';

    const payload = encryptSecret(secret, userId, origin);

    assert.throws(
      () => decryptSecret(payload, attackerId, origin),
      (err) => {
        return (
          err instanceof AuthenticationError ||
          err.name === 'AuthenticationError' ||
          /auth|tamper/i.test(err.message)
        );
      },
      'Decryption with wrong userId must throw AuthenticationError'
    );
  });

  await t.test('decryptSecret fails with AuthenticationError if origin differs (AAD origin mismatch)', () => {
    const userId = 'usr-test-123';
    const targetOrigin = 'https://api.openai.com/v1';
    const maliciousOrigin = 'https://evil.proxy.com/v1';
    const secret = 'sk-openai-key-bound-to-origin';

    const payload = encryptSecret(secret, userId, targetOrigin);

    assert.throws(
      () => decryptSecret(payload, userId, maliciousOrigin),
      (err) => {
        return (
          err instanceof AuthenticationError ||
          err.name === 'AuthenticationError' ||
          /auth|tamper/i.test(err.message)
        );
      },
      'Decryption with wrong origin must throw AuthenticationError'
    );
  });

  await t.test('decryptSecret fails with AuthenticationError if ciphertext is tampered', () => {
    const userId = 'usr-test-123';
    const origin = 'https://api.openai.com/v1';
    const secret = 'sk-test-secret';

    const payload = encryptSecret(secret, userId, origin);

    // Flip last character of encrypted ciphertext
    const tamperedChar = payload.encrypted.slice(-1) === 'a' ? 'b' : 'a';
    const tamperedPayload = {
      ...payload,
      encrypted: payload.encrypted.slice(0, -1) + tamperedChar,
    };

    assert.throws(
      () => decryptSecret(tamperedPayload, userId, origin),
      (err) => {
        return (
          err instanceof AuthenticationError ||
          err.name === 'AuthenticationError' ||
          /auth|tamper/i.test(err.message)
        );
      },
      'Tampered ciphertext must fail authentication'
    );
  });

  await t.test('decryptSecret fails with AuthenticationError if authTag is tampered', () => {
    const userId = 'usr-test-123';
    const origin = 'https://api.openai.com/v1';
    const secret = 'sk-test-secret';

    const payload = encryptSecret(secret, userId, origin);

    // Flip last character of authTag
    const tamperedChar = payload.authTag.slice(-1) === '0' ? '1' : '0';
    const tamperedPayload = {
      ...payload,
      authTag: payload.authTag.slice(0, -1) + tamperedChar,
    };

    assert.throws(
      () => decryptSecret(tamperedPayload, userId, origin),
      (err) => {
        return (
          err instanceof AuthenticationError ||
          err.name === 'AuthenticationError' ||
          /auth|tamper/i.test(err.message)
        );
      },
      'Tampered authTag must fail authentication'
    );
  });

  await t.test('decryptSecret fails with AuthenticationError if iv is tampered', () => {
    const userId = 'usr-test-123';
    const origin = 'https://api.openai.com/v1';
    const secret = 'sk-test-secret';

    const payload = encryptSecret(secret, userId, origin);

    const tamperedChar = payload.iv.slice(-1) === '0' ? '1' : '0';
    const tamperedPayload = {
      ...payload,
      iv: payload.iv.slice(0, -1) + tamperedChar,
    };

    assert.throws(
      () => decryptSecret(tamperedPayload, userId, origin),
      (err) => {
        return (
          err instanceof AuthenticationError ||
          err.name === 'AuthenticationError' ||
          /auth|tamper/i.test(err.message)
        );
      },
      'Tampered IV must fail authentication'
    );
  });

  await t.test('throws when AI_PROVIDER_ENCRYPTION_KEY reuses EMAIL_TOKEN_ENCRYPTION_KEY', () => {
    const sharedKey = Buffer.from(VALID_KEY_HEX, 'hex').toString('base64');
    process.env.EMAIL_TOKEN_ENCRYPTION_KEY = sharedKey;
    process.env.AI_PROVIDER_ENCRYPTION_KEY = sharedKey;

    assert.throws(
      () => encryptSecret('sk-test', 'user-1', 'https://api.openai.com/v1'),
      /EMAIL_TOKEN_ENCRYPTION_KEY|reuse/i,
      'Must reject reuse of EMAIL_TOKEN_ENCRYPTION_KEY'
    );
  });

  await t.test('throws descriptive error if AI_PROVIDER_ENCRYPTION_KEY is missing or invalid length', () => {
    delete process.env.AI_PROVIDER_ENCRYPTION_KEY;
    assert.throws(
      () => encryptSecret('sk-test', 'user-1', 'https://api.openai.com/v1'),
      /AI_PROVIDER_ENCRYPTION_KEY/i,
      'Must throw when key is missing'
    );

    process.env.AI_PROVIDER_ENCRYPTION_KEY = 'too-short';
    assert.throws(
      () => encryptSecret('sk-test', 'user-1', 'https://api.openai.com/v1'),
      /32.*byte|length/i,
      'Must throw when key length is invalid'
    );
  });
});
