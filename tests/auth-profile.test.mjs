import test from 'node:test';
import assert from 'node:assert/strict';
import { moduleLoader } from './helpers/load-ts-module.mjs';
const oauthRegistration = moduleLoader()('src/lib/auth/oauth-registration.ts');

function signedIntent(role, startedAt = new Date().toISOString()) {
  const previous = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-registration-secret';
  try { return oauthRegistration.signOAuthRegistration(role, startedAt); }
  finally {
    if (previous === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previous;
  }
}

// Run the actual callback; replace only the Supabase session/database boundary.
function callbackFixture({ profile = null, readError = null, writeError = null, metadata = {}, intent, registrationError = null, newGoogleAccount = false } = {}) {
  const writes = [];
  const registrationCalls = [];
  const cookieWrites = [];
  const user = { id: 'actor', email: 'staff@example.test', user_metadata: metadata };
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
      if (newGoogleAccount && !registrationError) profile = { ...profile, role: params.p_role, status: 'pending' };
      return { data: newGoogleAccount, error: registrationError };
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

test('existing candidate selecting technical recruiter gets an explicit mismatch without a role write', async () => {
  const fixture = callbackFixture({ profile: { id: 'actor', role: 'client', status: 'active' } });
  const response = await fixture.GET(new Request('https://portal.test/auth/callback?role=technical_recruiter'));
  const destination = new URL(response.headers.get('location'));
  assert.equal(destination.pathname, '/');
  assert.equal(destination.searchParams.get('role_notice'), 'existing_role');
  assert.equal(destination.searchParams.get('current_role'), 'client');
  assert.equal(destination.searchParams.get('attempted_role'), 'technical_recruiter');
  assert.deepEqual(fixture.writes, []);
});

test('an approved technical recruiter keeps their stored role when callback has no role selection', async () => {
  const fixture = callbackFixture({ profile: { id: 'actor', role: 'technical_recruiter', status: 'active' }, metadata: { role: 'client' } });
  const response = await fixture.GET(new Request('https://portal.test/auth/callback'));
  assert.equal(response.headers.get('location'), 'https://portal.test/dashboard');
  assert.deepEqual(fixture.writes, []);
});

for (const role of ['recruiter', 'technical_recruiter']) {
  test(`new ${role} registration stays pending before workspace access`, async () => {
    const fixture = callbackFixture({ metadata: { role } });
    const response = await fixture.GET(new Request(`https://portal.test/auth/callback?role=${role}`));
    assert.equal(new URL(response.headers.get('location')).pathname, '/');
    assert.equal(fixture.writes[0]?.role, role);
    assert.equal(fixture.writes[0]?.status, 'pending');
  });
}

test('profile lookup failure does not invent a new role or open the dashboard', async () => {
  const fixture = callbackFixture({ readError: { message: 'Database unavailable' } });
  const response = await fixture.GET(new Request('https://portal.test/auth/callback?role=technical_recruiter'));
  const destination = new URL(response.headers.get('location'));
  assert.equal(destination.pathname, '/');
  assert.match(destination.searchParams.get('error'), /profile/i);
  assert.deepEqual(fixture.writes, []);
});

test('profile creation failure stays on sign-in with an actionable error', async () => {
  const fixture = callbackFixture({ writeError: { message: 'Profile insert denied' } });
  const response = await fixture.GET(new Request('https://portal.test/auth/callback?role=technical_recruiter'));
  const destination = new URL(response.headers.get('location'));
  assert.equal(destination.pathname, '/');
  assert.match(destination.searchParams.get('error'), /profile/i);
});

test('auth callback refuses external destinations', async () => {
  const fixture = callbackFixture({ profile: { id: 'actor', role: 'technical_recruiter', status: 'active' } });
  const response = await fixture.GET(new Request('https://portal.test/auth/callback?next=https://attacker.test'));
  assert.equal(response.headers.get('location'), 'https://portal.test/dashboard');
});

test('expired or tampered Google registration intent cannot silently open a candidate portal', async () => {
  const fixture = callbackFixture({ intent: 'tampered.signature', profile: { id: 'actor', role: 'client', status: 'active' } });
  const response = await fixture.GET(new Request('https://portal.test/auth/callback?oauth_registration=1'));
  const destination = new URL(response.headers.get('location'));
  assert.equal(destination.pathname, '/');
  assert.match(destination.searchParams.get('error'), /registration.*expired|expired.*registration/i);
});

test('new Google technical staff completes signed registration and stays on approval screen', async () => {
  const fixture = callbackFixture({ intent: signedIntent('technical_recruiter'), profile: { id: 'actor', role: 'client', status: 'active' }, newGoogleAccount: true });
  const response = await fixture.GET(new Request(fixture.callbackUrl));
  assert.equal(response.headers.get('location'), 'https://portal.test/');
});

test('existing Google candidate keeps its role even with a valid signed technical registration', async () => {
  const fixture = callbackFixture({ intent: signedIntent('technical_recruiter'), profile: { id: 'actor', role: 'client', status: 'active' } });
  const response = await fixture.GET(new Request(fixture.callbackUrl));
  const destination = new URL(response.headers.get('location'));
  assert.equal(destination.searchParams.get('role_notice'), 'existing_role');
  assert.equal(destination.searchParams.get('current_role'), 'client');
  assert.deepEqual(fixture.writes, []);
});

test('missing Google staff database registration reports setup failure without opening a candidate portal', async () => {
  const fixture = callbackFixture({ intent: signedIntent('technical_recruiter'), profile: { id: 'actor', role: 'client', status: 'active' }, registrationError: { message: 'RPC does not exist' } });
  const response = await fixture.GET(new Request(fixture.callbackUrl));
  const destination = new URL(response.headers.get('location'));
  assert.equal(destination.pathname, '/');
  assert.match(destination.searchParams.get('error'), /database update/i);
});

test('expired signed Google intent asks the user to restart role selection', async () => {
  const fixture = callbackFixture({ intent: signedIntent('technical_recruiter', '2026-01-01T00:00:00Z') });
  const response = await fixture.GET(new Request(fixture.callbackUrl));
  assert.match(new URL(response.headers.get('location')).searchParams.get('error'), /expired/i);
});

test('Google intent requires its own callback nonce and PKCE code before any registration', async () => {
  for (const url of [
    'https://portal.test/auth/callback?oauth_registration=1',
    'https://portal.test/auth/callback?oauth_registration=1&code=valid-pkce-code&registration_id=wrong-intent',
    'https://portal.test/auth/callback',
  ]) {
    const fixture = callbackFixture({ intent: signedIntent('technical_recruiter'), profile: { id: 'actor', role: 'client', status: 'active' } });
    await fixture.GET(new Request(url));
    assert.deepEqual(fixture.registrationCalls, []);
    assert.equal(fixture.cookieWrites[0][2].maxAge, 0);
  }
});

test('Google initiation signs the database intent and binds its nonce to the PKCE callback', async () => {
  const cookies = [], savedIntents = [];
  let oauthOptions;
  const startedAt = new Date(Date.now() - 1000).toISOString();
  const GET = moduleLoader({
    'next/headers': { cookies: async () => ({ set: (...args) => cookies.push(args) }) },
    'next/server': { NextResponse: { redirect: url => new Response(null, { status: 307, headers: { location: String(url) } }) } },
    '@/lib/server': { createClient: async () => ({ auth: { signInWithOAuth: async options => {
      oauthOptions = options; return { data: { url: 'https://accounts.google.test/authorize' }, error: null };
    } } }) },
    '@/lib/db/admin': { database: () => ({ from: () => ({ insert(value) { savedIntents.push(value); return this; }, select() { return this; }, single: async () => ({ data: { started_at: startedAt }, error: null }) }) }) },
  })('src/app/auth/google/route.ts').GET;
  const previous = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-registration-secret';
  try {
    const response = await GET(new Request('https://portal.test/auth/google?role=technical_recruiter'));
    assert.equal(response.headers.get('location'), 'https://accounts.google.test/authorize');
    const cookie = oauthRegistration.readOAuthRegistration(cookies[0][1]);
    assert.equal(cookie.id, savedIntents[0].id);
    assert.equal(cookie.role, 'technical_recruiter');
    assert.equal(cookie.startedAt, startedAt);
    assert.equal(new URL(oauthOptions.options.redirectTo).searchParams.get('registration_id'), cookie.id);
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
  try { assert.throws(() => oauthRegistration.signOAuthRegistration('technical_recruiter'), /server configuration/i); }
  finally { if (previous !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = previous; }
});

test('administrator correction sends the authenticated actor and keeps approval a separate operation', async () => {
  const calls = [];
  const PATCH = moduleLoader({
    '@/lib/http/protected-route': { protectedRoute: async (_request, access, work) => {
      assert.equal(access, 'admin');
      return Response.json(await work({ id: 'authenticated-admin', role: 'super_admin', status: 'active' }));
    } },
    '@/lib/db/admin': { database: () => ({ rpc: async (name, params) => { calls.push({ name, params }); return { data: null, error: null }; } }), checkDb() {} },
  })('src/app/api/admin/profiles/route.ts').PATCH;
  const response = await PATCH(new Request('https://portal.test/api/admin/profiles', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: '10000000-0000-4000-8000-000000000202', role: 'technical_recruiter', reason: 'Correct prior Google registration', actor: 'forged-actor' }) }));
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [{ name: 'correct_staff_account_role', params: {
    p_actor: 'authenticated-admin', p_profile: '10000000-0000-4000-8000-000000000202', p_role: 'technical_recruiter', p_reason: 'Correct prior Google registration',
  } }]);
  await assert.rejects(PATCH(new Request('https://portal.test/api/admin/profiles', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: '10000000-0000-4000-8000-000000000202', role: 'technical_recruiter', status: 'active' }) })));
  assert.equal(calls.length, 1);
  await PATCH(new Request('https://portal.test/api/admin/profiles', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: '10000000-0000-4000-8000-000000000202', status: 'active' }) }));
  assert.deepEqual(calls[1], { name: 'set_staff_account_status', params: { p_actor: 'authenticated-admin', p_profile: '10000000-0000-4000-8000-000000000202', p_status: 'active' } });
});

test('administrator can page beyond the first 500 profiles without losing older staff', async () => {
  const rows = Array.from({ length: 650 }, (_, index) => ({ id: `profile-${index}`, role: index === 649 ? 'technical_recruiter' : 'client' }));
  const GET = moduleLoader({
    '@/lib/http/protected-route': { protectedRoute: async (_request, access, work) => { assert.equal(access, 'admin'); return Response.json(await work({ id: 'admin' })); } },
    '@/lib/db/admin': { checkDb() {}, database: () => ({ from: () => {
      let start = 0, end = rows.length - 1;
      const query = { select() { return query; }, order() { return query; }, limit(amount) { end = amount - 1; return query; },
        range(a, b) { start = a; end = b; return query; }, then(resolve, reject) { return Promise.resolve({ data: rows.slice(start, end + 1), error: null }).then(resolve, reject); } };
      return query;
    } }) },
  })('src/app/api/admin/profiles/route.ts').GET;
  const first = await (await GET(new Request('https://portal.test/api/admin/profiles'))).json();
  assert.equal(first.profiles.length, 500);
  assert.equal(first.hasMore, true);
  assert.equal(first.nextOffset, 500);
  const second = await (await GET(new Request('https://portal.test/api/admin/profiles?offset=500'))).json();
  assert.equal(second.profiles.length, 150);
  assert.equal(second.hasMore, false);
  assert.equal(second.nextOffset, null);
  assert.equal(second.profiles.at(-1).role, 'technical_recruiter');
  await assert.rejects(GET(new Request('https://portal.test/api/admin/profiles?offset=-1')));
});
