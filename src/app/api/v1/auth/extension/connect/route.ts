import { createHash, randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { EXTENSION_CONNECT_PATH } from '@/lib/auth/extension-connect';
import { requireProfile } from '@/lib/auth/require-profile';
import { CaptureError, checkDb, database } from '@/lib/db/admin';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

const PINNED_REDIRECTS = [
  'https://ebhfafmnihndlaoibgjnfjhkjlnaencj.chromiumapp.org/',
  'https://13f2644fb08a641dc52d5b7c11faf2fb9775ee26.extensions.allizom.org/',
];
const CALLBACK_PATTERN =
  /^https:\/\/(?:[a-p]{32}\.chromiumapp\.org|[0-9a-f]{40}\.extensions\.allizom\.org)\/$/;
const STATE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };

export function HEAD() {
  return new Response(null, { status: 405, headers: { ...headers, Allow: 'GET' } });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const redirects = [
    ...PINNED_REDIRECTS,
    ...(process.env.EXTENSION_REDIRECT_ALLOWLIST ?? '').split(',').map((value) => value.trim()),
  ];
  const [redirectUri, ...otherRedirects] = url.searchParams.getAll('redirect_uri');
  const [state, ...otherStates] = url.searchParams.getAll('state');
  if (
    !redirectUri ||
    otherRedirects.length ||
    otherStates.length ||
    !CALLBACK_PATTERN.test(redirectUri) ||
    !redirects.includes(redirectUri) ||
    !state ||
    !STATE_PATTERN.test(state)
  ) {
    return Response.json({ error: 'Invalid extension sign-in request.' }, { status: 400, headers });
  }

  const callback = new URL(redirectUri);
  const fragment = new URLSearchParams({ state });
  const finish = (key: 'token' | 'error', value: string) => {
    fragment.set(key, value);
    callback.hash = fragment.toString();
    return NextResponse.redirect(callback, { headers });
  };

  const limit = checkRateLimit(`extension-connect:${getClientIp(request)}`, {
    windowMs: 60000,
    max: 20,
  });
  if (!limit.allowed) return finish('error', 'Too many sign-in attempts. Try again in a minute.');

  try {
    const profile = await requireProfile();
    const token = randomBytes(32).toString('base64url');
    const { error } = await database()
      .from('extension_credentials')
      .insert({
        owner_id: profile.id,
        token_hash: createHash('sha256').update(token).digest('hex'),
      });
    checkDb(error);
    return finish('token', token);
  } catch (error) {
    if (error instanceof CaptureError && error.status === 401) {
      const login = new URL('/', url);
      const query = new URLSearchParams({ redirect_uri: redirectUri, state });
      login.searchParams.set('next', `${EXTENSION_CONNECT_PATH}?${query}`);
      return NextResponse.redirect(login, { headers });
    }
    if (error instanceof CaptureError && error.status === 403) {
      return finish('error', 'An active candidate account is required to use the extension.');
    }
    return finish('error', 'Could not create an extension session. Please try again.');
  }
}
