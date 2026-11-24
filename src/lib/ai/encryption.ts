import * as crypto from 'node:crypto';

export interface EncryptedSecretPayload {
  encrypted: string; // hex or base64
  iv: string;        // 12 bytes hex or base64
  authTag: string;   // 16 bytes hex or base64
}

export class AuthenticationError extends Error {
  constructor(message = 'Decryption failed: secret authentication or AAD mismatch') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export { AuthenticationError as SecretAuthenticationError };

function timingSafeCheck(keyBuf: Buffer, emailKeyRaw: string): boolean {
  try {
    const emailBuf = Buffer.from(emailKeyRaw, 'base64');
    if (emailBuf.length === keyBuf.length && crypto.timingSafeEqual(emailBuf, keyBuf)) {
      return true;
    }
  } catch {}
  try {
    const emailUtf8 = Buffer.from(emailKeyRaw, 'utf8');
    if (emailUtf8.length === keyBuf.length && crypto.timingSafeEqual(emailUtf8, keyBuf)) {
      return true;
    }
  } catch {}
  try {
    const emailHex = Buffer.from(emailKeyRaw, 'hex');
    if (emailHex.length === keyBuf.length && crypto.timingSafeEqual(emailHex, keyBuf)) {
      return true;
    }
  } catch {}
  return false;
}

export function getEncryptionKey(keyOverride?: string | Buffer): Buffer {
  if (Buffer.isBuffer(keyOverride)) {
    if (keyOverride.length !== 32) {
      throw new Error('AI_PROVIDER_ENCRYPTION_KEY must be a 32-byte key.');
    }
    return keyOverride;
  }

  const rawKey = keyOverride ?? process.env.AI_PROVIDER_ENCRYPTION_KEY;

  if (!rawKey || typeof rawKey !== 'string') {
    throw new Error('AI_PROVIDER_ENCRYPTION_KEY environment variable is not configured.');
  }

  const emailKey = process.env.EMAIL_TOKEN_ENCRYPTION_KEY;
  if (emailKey && (rawKey === emailKey || rawKey.trim() === emailKey.trim())) {
    throw new Error('AI_PROVIDER_ENCRYPTION_KEY cannot reuse EMAIL_TOKEN_ENCRYPTION_KEY.');
  }

  const trimmed = rawKey.trim();

  // 1. 64-character hex string (32 bytes)
  if (trimmed.length === 64 && /^[0-9a-fA-F]{64}$/.test(trimmed)) {
    const buf = Buffer.from(trimmed, 'hex');
    if (emailKey && timingSafeCheck(buf, emailKey)) {
      throw new Error('AI_PROVIDER_ENCRYPTION_KEY cannot reuse EMAIL_TOKEN_ENCRYPTION_KEY.');
    }
    return buf;
  }

  // 2. Base64 (44 chars) that decodes to 32 bytes
  if (trimmed.length === 44 && /^[A-Za-z0-9+/=]+$/.test(trimmed)) {
    const buf = Buffer.from(trimmed, 'base64');
    if (buf.length === 32) {
      if (emailKey && timingSafeCheck(buf, emailKey)) {
        throw new Error('AI_PROVIDER_ENCRYPTION_KEY cannot reuse EMAIL_TOKEN_ENCRYPTION_KEY.');
      }
      return buf;
    }
  }

  // 3. Raw 32-character string
  const rawBuf = Buffer.from(rawKey, 'utf8');
  if (rawBuf.length === 32) {
    if (emailKey && timingSafeCheck(rawBuf, emailKey)) {
      throw new Error('AI_PROVIDER_ENCRYPTION_KEY cannot reuse EMAIL_TOKEN_ENCRYPTION_KEY.');
    }
    return rawBuf;
  }

  throw new Error(
    'AI_PROVIDER_ENCRYPTION_KEY must be a 32-byte key (64 hex characters, 44 base64 characters, or 32 raw bytes).'
  );
}

function parseBuffer(val: string, name: string, expectedLength?: number): Buffer {
  if (typeof val !== 'string' || !val) {
    throw new AuthenticationError(`Invalid ${name}: expected non-empty string`);
  }
  let buf: Buffer | null = null;
  if (expectedLength) {
    if (val.length === expectedLength * 2 && /^[0-9a-fA-F]+$/.test(val)) {
      buf = Buffer.from(val, 'hex');
    } else {
      const b64 = Buffer.from(val, 'base64');
      if (b64.length === expectedLength) {
        buf = b64;
      }
    }
  } else {
    if (val.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(val)) {
      buf = Buffer.from(val, 'hex');
    } else {
      buf = Buffer.from(val, 'base64');
    }
  }
  if (!buf || (expectedLength && buf.length !== expectedLength)) {
    throw new AuthenticationError(`Invalid ${name}: invalid encoding or length mismatch`);
  }
  return buf;
}

export function encryptSecret(
  plain: string,
  userId: string,
  origin: string,
  keyOverride?: string | Buffer
): EncryptedSecretPayload {
  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    throw new Error('userId is required for secret encryption');
  }
  if (!origin || typeof origin !== 'string' || !origin.trim()) {
    throw new Error('origin is required for secret encryption');
  }
  if (plain === undefined || plain === null) {
    throw new Error('plain secret value is required');
  }

  const key = getEncryptionKey(keyOverride);
  const iv = crypto.randomBytes(12); // 12-byte IV for AES-256-GCM
  const aad = Buffer.from(`${userId}:${origin}`, 'utf8');

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aad);

  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag(); // 16-byte authentication tag

  return {
    encrypted: encrypted.toString('hex'),
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
  };
}

export function decryptSecret(
  payload: EncryptedSecretPayload,
  userId: string,
  expectedOrigin: string,
  keyOverride?: string | Buffer
): string {
  if (!payload || typeof payload !== 'object') {
    throw new AuthenticationError('Invalid payload: expected EncryptedSecretPayload object');
  }
  if (!userId || typeof userId !== 'string' || !userId.trim()) {
    throw new AuthenticationError('userId is required for secret decryption');
  }
  if (!expectedOrigin || typeof expectedOrigin !== 'string' || !expectedOrigin.trim()) {
    throw new AuthenticationError('expectedOrigin is required for secret decryption');
  }

  const key = getEncryptionKey(keyOverride);
  const iv = parseBuffer(payload.iv, 'iv', 12);
  const authTag = parseBuffer(payload.authTag, 'authTag', 16);
  const encrypted = parseBuffer(payload.encrypted, 'encrypted');
  const aad = Buffer.from(`${userId}:${expectedOrigin}`, 'utf8');

  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    decipher.setAAD(aad);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    if (err instanceof AuthenticationError) {
      throw err;
    }
    throw new AuthenticationError('Decryption failed: secret authentication or AAD mismatch');
  }
}
