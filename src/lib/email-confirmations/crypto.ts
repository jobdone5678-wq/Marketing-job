import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

function readKey(encoded: string): Buffer {
  const key = Buffer.from(encoded,'base64');
  if (key.length !== 32 || key.toString('base64') !== encoded) throw new Error('EMAIL_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
  return key;
}
export function encryptToken(value: string, encodedKey: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm',readKey(encodedKey),iv);
  const body = Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),body]).toString('base64url');
}
export function decryptToken(value: string, encodedKey: string): string {
  const data = Buffer.from(value,'base64url');
  if (data.length < 29) throw new Error('Invalid encrypted token.');
  const decipher = createDecipheriv('aes-256-gcm',readKey(encodedKey),data.subarray(0,12));
  decipher.setAuthTag(data.subarray(12,28));
  return Buffer.concat([decipher.update(data.subarray(28)),decipher.final()]).toString('utf8');
}
export function equalSecret(a: string, b: string): boolean {
  const left=Buffer.from(a); const right=Buffer.from(b);
  return left.length===right.length && timingSafeEqual(left,right);
}
