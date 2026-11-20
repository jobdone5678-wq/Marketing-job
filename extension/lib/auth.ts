import { browser } from 'wxt/browser';

/** Origin for the legacy API clients. The active side panel uses local form messages. */
export const HIRE_ORIGIN = import.meta.env.WXT_HIRE_ORIGIN ?? 'http://localhost:5173';

const TOKEN_KEY = 'hireToken';

/** The signed-in user as /auth/me reports it (only what the panel shows). */
export interface HireUser {
  id: number;
  email: string;
}

/** The stored token, or null if not signed in. */
export async function getToken(): Promise<string | null> {
  const stored = await browser.storage.local.get(TOKEN_KEY);
  return (stored[TOKEN_KEY] as string) ?? null;
}

/**
 * Resolves the signed-in user for a token, or null if the token is missing or no
 * longer valid (e.g. revoked). The extension's host_permissions exempt this
 * cross-origin Bearer call from CORS.
 */
export async function fetchMe(token: string): Promise<HireUser | null> {
  const res = await fetch(`${HIRE_ORIGIN}/api/v1/auth/me`, {
    credentials: 'omit',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { data: HireUser };
  return body.data;
}
