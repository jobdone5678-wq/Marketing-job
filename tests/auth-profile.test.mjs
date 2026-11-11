import test from 'node:test';
import assert from 'node:assert/strict';
import { moduleLoader } from './helpers/load-ts-module.mjs';
const oauthRegistration = moduleLoader()('src/lib/auth/oauth-registration.ts');

function signedIntent(startedAt = new Date().toISOString()) {
  const previous = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-registration-secret';
  try { return oauthRegistration.signOAuthRegistration(startedAt); }
  finally {
    if (previous === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previous;
  }
}

// Run the actual callback; replace only the Supabase session/database boundary.
function callbackFixture({ profile = null, readError = null, writeError = null, metadata = {}, intent } = {}) {
  const writes = [];
  const registrationCalls = [];
  const cookieWrites = [];
  const user = { id: 'actor', email: 'candidate@example.test', user_metadata: metadata };
  const database = { auth: {
    getUser: async () => ({ data: { user }, error: null }),
    exchangeCodeForSession: async () => ({ data: { user, session: { user } }, error: null }),
  }, from(table) {
    assert.equal(table, 'profiles');
    let write;
    const query = {
      select() { return query; }, eq() { return query; },
      single() { return query; }, maybeSingle() { return query; },
      insert(value) { writes.push(value); write = value; return query; },
      upsert(value) { writes.push(value); write = value; return query; },
      update(value) { writes.push(value); write = value; return query; },
      then(resolve, reject) { return Promise.resolve(write
        ? { data: writeError ? null : { ...write, created_at: '2026-10-12', updated_at: '2026-10-12' }, error: writeError }
        : { data: profile, error: readError }).then(resolve, reject); },
    };
    return query;
  } };
  const GET = moduleLoader({ '@/lib/server': { createClient: async () => database },
    'next/headers': { cookies: async () => ({ get: () => intent ? { value: intent } : undefined, set: (...args) => cookieWrites.push(args) }) },
    '@/lib/db/admin': { database: () => ({ rpc: async (_name, params) => {
      registrationCalls.push(params);
      return { data: true, error: null };
    } }) },
    '@/lib/auth/oauth-registration': { ...oauthRegistration, readOAuthRegistration: token => {
      const previous = process.env.SUPABASE_SERVICE_ROLE_KEY;
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-registration-secret';
      try { return oauthRegistration.readOAuthRegistration(token); }
      finally {
        if (previous === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
        else process.env.SUPABASE_SERVICE_ROLE_KEY = previous;
      }
    } },
    'next/server': { NextResponse: { redirect: url => new Response(null, { status: 307, headers: { location: String(url) } }) } },
  })('src/app/auth/callback/route.ts').GET;
  let intentId = '';
  try { intentId = JSON.parse(Buffer.from((intent || '').split('.')[0], 'base64url').toString()).id; } catch {}
  return { writes, GET, database, user, registrationCalls, cookieWrites,
    callbackUrl: `https://portal.test/auth/callback?oauth_registration=1&code=valid-pkce-code&registration_id=${intentId}` };
}

test('a new registration always creates an active candidate profile', async () => {
  const fixture = callbackFixture({ metadata: { full_name: 'Casey Candidate' } });
  const response = await fixture.GET(new Request('https://portal.test/auth/callback'));
  assert.equal(response.headers.get('location'), 'https://portal.test/dashboard');
  assert.equal(fixture.writes[0]?.role, 'client');
  assert.equal(fixture.writes[0]?.status, 'active');
});

test('a registration that tries to ask for a staff role still becomes a candidate', async () => {
  const fixture = callbackFixture({ metadata: { role: 'super_admin' } });
  const response = await fixture.GET(new Request('https://portal.test/auth/callback?role=super_admin'));
  assert.equal(response.headers.get('location'), 'https://portal.test/dashboard');
  assert.equal(fixture.writes[0]?.role, 'client');
  assert.equal(fixture.writes[0]?.status, 'active');
});

test('an existing candidate keeps their stored profile without a role write', async () => {
  const fixture = callbackFixture({ profile: { id: 'actor', role: 'client', status: 'active' }, metadata: { role: 'recruiter' } });
  const response = await fixture.GET(new Request('https://portal.test/auth/callback?role=recruiter'));
  assert.equal(response.headers.get('location'), 'https://portal.test/dashboard');
  assert.deepEqual(fixture.writes, []);
});

test('profile lookup failure does not open the dashboard', async () => {
  const fixture = callbackFixture({ readError: { message: 'Database unavailable' } });
  const response = await fixture.GET(new Request('https://portal.test/auth/callback'));
  const destination = new URL(response.headers.get('location'));
  assert.equal(destination.pathname, '/');
  assert.match(destination.searchParams.get('error'), /profile/i);
  assert.deepEqual(fixture.writes, []);
});

test('profile creation failure stays on sign-in with an actionable error', async () => {
  const fixture = callbackFixture({ writeError: { message: 'Profile insert denied' } });
  const response = await fixture.GET(new Request('https://portal.test/auth/callback'));
  const destination = new URL(response.headers.get('location'));
  assert.equal(destination.pathname, '/');
  assert.match(destination.searchParams.get('error'), /profile/i);
});

test('auth callback refuses external destinations', async () => {
  const fixture = callbackFixture({ profile: { id: 'actor', role: 'client', status: 'active' } });
  const response = await fixture.GET(new Request('https://portal.test/auth/callback?next=https://attacker.test'));
  assert.equal(response.headers.get('location'), 'https://portal.test/dashboard');
});

test('expired or tampered Google registration intent cannot silently open the candidate portal', async () => {
  const fixture = callbackFixture({ intent: 'tampered.signature', profile: { id: 'actor', role: 'client', status: 'active' } });
  const response = await fixture.GET(new Request('https://portal.test/auth/callback?oauth_registration=1'));
  const destination = new URL(response.headers.get('location'));
  assert.equal(destination.pathname, '/');
  assert.match(destination.searchParams.get('error'), /registration.*expired|expired.*registration/i);
});

test('a new Google account completes the signed registration and opens the candidate dashboard', async () => {
  const fixture = callbackFixture({ intent: signedIntent(), profile: { id: 'actor', role: 'client', status: 'active' } });
  const response = await fixture.GET(new Request(fixture.callbackUrl));
  assert.equal(response.headers.get('location'), 'https://portal.test/dashboard');
});

test('expired signed Google intent asks the user to restart sign-in', async () => {
  const fixture = callbackFixture({ intent: signedIntent('2026-01-01T00:00:00Z') });
  const response = await fixture.GET(new Request(fixture.callbackUrl));
  assert.match(new URL(response.headers.get('location')).searchParams.get('error'), /expired/i);
});

test('Google intent requires its own callback nonce and PKCE code before any registration', async () => {
  for (const url of [
    'https://portal.test/auth/callback?oauth_registration=1',
    'https://portal.test/auth/callback?oauth_registration=1&code=valid-pkce-code&registration_id=wrong-intent',
    'https://portal.test/auth/callback',
  ]) {
    const fixture = callbackFixture({ intent: signedIntent(), profile: { id: 'actor', role: 'client', status: 'active' } });
    await fixture.GET(new Request(url));
    assert.deepEqual(fixture.registrationCalls, []);
    assert.equal(fixture.cookieWrites[0][2].maxAge, 0);
  }
});

test('Google initiation signs the registration intent and binds its nonce to the PKCE callback', async () => {
  const cookies = [];
  let oauthOptions;
  const startedAt = new Date(Date.now() - 1000).toISOString();
  const GET = moduleLoader({
    'next/headers': { cookies: async () => ({ set: (...args) => cookies.push(args) }) },
    'next/server': { NextResponse: { redirect: url => new Response(null, { status: 307, headers: { location: String(url) } }) } },
    '@/lib/server': { createClient: async () => ({ auth: { signInWithOAuth: async options => {
      oauthOptions = options; return { data: { url: 'https://accounts.google.test/authorize' }, error: null };
    } } }) },
  })('src/app/auth/google/route.ts').GET;
  const previous = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-registration-secret';
  try {
    const response = await GET(new Request('https://portal.test/auth/google?next=/dashboard'));
    assert.equal(response.headers.get('location'), 'https://accounts.google.test/authorize');
    const cookie = oauthRegistration.readOAuthRegistration(cookies[0][1]);
    assert.equal(typeof cookie.id, 'string');
    assert.ok(Date.parse(cookie.startedAt) <= Date.now());
    assert.equal(new URL(oauthOptions.options.redirectTo).searchParams.get('registration_id'), cookie.id);
    assert.equal(new URL(oauthOptions.options.redirectTo).searchParams.get('next'), '/dashboard');
    assert.equal(oauthOptions.options.skipBrowserRedirect, true);
    assert.equal(cookies[0][2].httpOnly, true);
    assert.equal(cookies[0][2].secure, true);
  } finally {
    if (previous === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previous;
  }
});

test('Google registration cannot sign an intent without the server secret', () => {
  const previous = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try { assert.throws(() => oauthRegistration.signOAuthRegistration(), /server configuration/i); }
  finally { if (previous !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = previous; }
});

test('the signed registration intent carries no role', () => {
  const token = signedIntent();
  const payload = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString());
  assert.equal(payload.role, undefined);
  assert.equal(typeof payload.id, 'string');
});
