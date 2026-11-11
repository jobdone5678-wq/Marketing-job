import "server-only";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";

export const OAUTH_REGISTRATION_COOKIE = "portal_oauth_registration";
export const OAUTH_REGISTRATION_MAX_AGE = 15 * 60;

function signingKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Google registration is unavailable. Contact an administrator to check server configuration.");
  return key;
}

// The signed intent proves the callback belongs to a registration this server started.
export function signOAuthRegistration(startedAt = new Date().toISOString(), id = randomUUID()): string {
  const payload = Buffer.from(JSON.stringify({ id, startedAt })).toString("base64url");
  const signature = createHmac("sha256", signingKey()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function readOAuthRegistration(token: string | undefined, now = Date.now()) {
  if (!token) return null;
  try {
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra) return null;
    const expected = createHmac("sha256", signingKey()).update(payload).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const started = Date.parse(parsed.startedAt);
    if (typeof parsed.id !== "string" || !/^[0-9a-f-]{36}$/.test(parsed.id) || !Number.isFinite(started) || started > now || now - started > OAUTH_REGISTRATION_MAX_AGE * 1000) return null;
    return { id: parsed.id, startedAt: new Date(started).toISOString() };
  } catch { return null; }
}
