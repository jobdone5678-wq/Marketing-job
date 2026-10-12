import "server-only";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { registrationRole } from "@/lib/auth/session-profile";

export const OAUTH_REGISTRATION_COOKIE = "portal_oauth_registration";
export const OAUTH_REGISTRATION_MAX_AGE = 15 * 60;

function signingKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("Google staff registration is unavailable. Contact an administrator to check server configuration.");
  return key;
}

export function signOAuthRegistration(role: string, startedAt = new Date().toISOString(), id = randomUUID()): string {
  if (!registrationRole(role)) throw new Error("Choose a valid account role.");
  const payload = Buffer.from(JSON.stringify({ id, role, startedAt })).toString("base64url");
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
    const role = registrationRole(parsed.role);
    const started = Date.parse(parsed.startedAt);
    if (!role || typeof parsed.id !== "string" || !/^[0-9a-f-]{36}$/.test(parsed.id) || !Number.isFinite(started) || started > now || now - started > OAUTH_REGISTRATION_MAX_AGE * 1000) return null;
    return { id: parsed.id, role, startedAt: new Date(started).toISOString() };
  } catch { return null; }
}
