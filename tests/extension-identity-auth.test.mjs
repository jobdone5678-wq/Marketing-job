import { baseCountry } from '../src/lib/profile/base-country.ts';
import { z } from 'zod';
import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { NextResponse } from 'next/server.js';
import ts from 'typescript';
import { EXTENSION_CONNECT_PATH, extensionConnectNext } from '../src/lib/auth/extension-connect.ts';
import { profileAccess } from '../src/lib/auth/profile-access.ts';
import * as confirmedFacts from '../src/lib/candidate/confirmed-facts.ts';
import { cors } from '../src/lib/http/cors.ts';

const origin = 'http://localhost:3000';
const chrome = 'https://ebhfafmnihndlaoibgjnfjhkjlnaencj.chromiumapp.org/';
const firefox = 'https://13f2644fb08a641dc52d5b7c11faf2fb9775ee26.extensions.allizom.org/';
const store = 'https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.chromiumapp.org/';
const state = crypto.randomUUID();
const profile = {
  id: crypto.randomUUID(),
  email: 'candidate@example.com',
  role: 'candidate',
  status: 'active',
};

function connectRequest(redirect = chrome, nonce = state) {
  const query = new URLSearchParams({ redirect_uri: redirect, state: nonce });
  return new Request(`${origin}${EXTENSION_CONNECT_PATH}?${query}`);
}

function fixture({ candidates = [], screening = {}, account = profile } = {}) {
  class CaptureError extends Error {
    constructor(status) {
      super();
      this.status = status;
    }
  }
  let sessionStatus = 200;
  let credential;
  let cookieReads = 0;
  const database = () => ({
    from(table) {
      const filters = {};
      return {
        async insert(row) {
          assert.equal(table, 'extension_credentials');
          credential = { ...row, expires_at: '2100-01-01', revoked_at: null };
          return {};
        },
        select() {
          return this;
        },
        eq(column, value) {
          filters[column] = value;
          return this;
        },
        order() {
          return this;
        },
        async limit() {
          assert.equal(table, 'candidates');
          return {
            data: candidates.filter((row) =>
              Object.entries(filters).every(([key, value]) => row[key] === value)
            ),
          };
        },
        async maybeSingle() {
          const row = table === 'profiles' ? account : credential;
          return {
            data: Object.entries(filters).every(([key, value]) => row?.[key] === value)
              ? row
              : null,
          };
        },
      };
    },
  });
  const dependencies = {
    'node:crypto': crypto,
    zod: { z },
    '../identity/userprofile': { normalizeCountryCode: (code) => code.toLowerCase() },
    'next/server': { NextResponse },
    '@/lib/auth/extension-connect': { EXTENSION_CONNECT_PATH },
    '@/lib/auth/profile-access': { profileAccess },
    '@/lib/candidate/confirmed-facts': confirmedFacts,
    '@/lib/candidate/resumeextract': {
      splitFullName: (name) => {
        const [first_name, ...rest] = name.split(' ');
        return { first_name, last_name: rest.join(' ') };
      },
    },
    '@/lib/http/cors': { cors },
    '@/lib/profile/base-country': { baseCountry },
    '@/lib/ingest/screeninganswers': {
      getScreeningAnswers: async (id) => {
        assert.equal(id, account.id);
        return {
          visa_sponsorship_needed: null,
          willing_to_relocate: null,
          age_18_or_older: null,
          ...screening,
        };
      },
    },
    '@/lib/auth/require-profile': {
      requireProfile: async () => {
        if (sessionStatus !== 200) throw new CaptureError(sessionStatus);
        return profile;
      },
    },
    '@/lib/db/admin': { CaptureError, database, checkDb: assert.ifError },
    '../db/admin': { database },
    '../server': {
      createClient: async () => {
        cookieReads++;
        return { auth: { getUser: async () => ({ data: { user: profile } }) } };
      },
    },
    '@/lib/capture/server': { cors: (_, response) => response },
    '@/lib/rate-limit': { checkRateLimit: () => ({ allowed: true }), getClientIp: () => 'local' },
  };
  function load(path) {
    const source = readFileSync(new URL(`../src/${path}.ts`, import.meta.url), 'utf8');
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    const exports = {};
    runInNewContext(outputText, {
      exports,
      URL,
      URLSearchParams,
      Response,
      process: { env: { EXTENSION_REDIRECT_ALLOWLIST: store } },
      require: (name) => dependencies[name],
    });
    return exports;
  }
  dependencies['@/lib/v1/auth'] = load('lib/v1/auth');
  Object.assign(dependencies['@/lib/ingest/screeninganswers'], {
    resolveAutofillScreening: load('lib/ingest/screeninganswers').resolveAutofillScreening,
  });
  const connect = load('app/api/v1/auth/extension/connect/route');
  const me = load('app/api/v1/auth/me/route');
  const autofill = load('app/api/v1/me/autofill-profile/route');
  return {
    connect: connect.GET,
    autofill,
    me: (token) =>
      me.GET(
        new Request(`${origin}/api/v1/auth/me`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
      ),
    setSessionStatus: (status) => {
      sessionStatus = status;
    },
    get credential() {
      return credential;
    },
    get cookieReads() {
      return cookieReads;
    },
  };
}

test('signed-out connect preserves state and the browser callback through portal login', async () => {
  const app = fixture();
  app.setSessionStatus(401);
  const request = connectRequest(chrome);
  const response = await app.connect(request);
  const login = new URL(response.headers.get('location'));
  assert.equal(response.status, 307);
  assert.equal(login.origin + login.pathname, origin + '/');
  assert.equal(
    extensionConnectNext(login.searchParams.get('next')),
    request.url.slice(origin.length)
  );
  assert.equal(extensionConnectNext('//example.com/'), null);
  assert.equal(app.credential, undefined);
});

test('autofill profile reads only the bearer owner’s reviewed facts and typed screening fields', async () => {
  const candidateId = crypto.randomUUID();
  const match = { id: candidateId, user_id: profile.id, provenance_status: 'confirmed' };
  const app = fixture({
    candidates: [
      { ...match, user_id: crypto.randomUUID(), full_name: 'Other candidate' },
      { ...match, provenance_status: 'legacy_unconfirmed', full_name: 'Unconfirmed' },
      {
        ...match,
        full_name: 'Upload draft',
        confirmed_facts: { notes: confirmedFacts.UNSAVED_RESUME_NOTE },
      },
      {
        ...match,
        full_name: 'Confirmed Candidate',
        confirmed_facts: {
          notes: confirmedFacts.UNSAVED_RESUME_NOTE,
          uploadedAt: '2026-11-25T10:00:00Z',
          email: '',
          location: { whereBased: 'Berlin, Germany', countries: ['de'] },
          intended_work_country: 'ca',
          github_url: 'https://github.com/candidate',
          raw_text: 'private resume',
          race: 'private demographic',
        },
      },
    ],
    screening: {
      authorized_countries: ['us', 'de'],
      visa_sponsorship_needed: false,
      willing_to_relocate: true,
      desired_salary_amount: 100000,
      desired_salary_currency: 'USD',
      desired_salary_period: 'year',
      notice_period_days: 0,
      privacy_consent: true,
    },
  });
  const url = `${origin}/api/v1/me/autofill-profile`;
  const extensionOrigin = 'chrome-extension://ebhfafmnihndlaoibgjnfjhkjlnaencj';
  assert.equal((await app.autofill.GET(new Request(url))).status, 401);
  assert.equal(app.cookieReads, 0);

  const connected = await app.connect(connectRequest());
  const token = new URLSearchParams(new URL(connected.headers.get('location')).hash.slice(1)).get(
    'token'
  );
  const request = new Request(url, {
    headers: { Authorization: `Bearer ${token}`, Origin: extensionOrigin },
  });
  const result = await app.autofill.GET(request);
  assert.equal(result.status, 200);
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.equal(result.headers.get('access-control-allow-origin'), extensionOrigin);
  assert.equal(result.headers.get('access-control-allow-credentials'), null);
  assert.deepEqual(await result.json(), {
    meta: {
      candidateId,
      screening: {
        age_18_or_older: null,
        notice_period_days: 0,
        willing_to_relocate: true,
        visa_sponsorship_needed: false,
        desired_salary_amount: 100000,
        desired_salary_currency: 'USD',
        desired_salary_period: 'year',
      },
    },
    data: {
      full_name: 'Confirmed Candidate',
      first_name: 'Confirmed',
      last_name: 'Candidate',
      email: '',
      phone: '',
      location: 'Berlin, Germany',
      state: '',
      country: 'Germany',
      postal_code: '',
      intended_work_country: 'Canada',
      linkedin: '',
      github: 'https://github.com/candidate',
      portfolio: '',
      authorized_countries: 'US, DE',
      visa_sponsorship_needed: 'No',
      desired_salary: '100000 USD per year',
      notice_period: '0 days',
      willing_to_relocate: 'Yes',
      age_18_or_older: '',
    },
  });
  assert.equal(
    app.autofill.OPTIONS(request).headers.get('access-control-allow-methods'),
    'GET, OPTIONS'
  );
});

test('only allowlisted browser callbacks and valid states can reach credential issuance', async () => {
  const app = fixture();
  assert.equal((await app.connect(connectRequest('https://example.com/'))).status, 400);
  assert.equal((await app.connect(connectRequest(chrome, 'invalid'))).status, 400);
  assert.equal(
    (await app.connect(new Request(connectRequest().url + '&state=' + state))).status,
    400
  );
  assert.equal(app.credential, undefined);

  app.setSessionStatus(403);
  const denied = await app.connect(connectRequest());
  assert.match(new URL(denied.headers.get('location')).hash, /error=/);
  assert.equal(app.credential, undefined);
});

test('Chrome, Firefox and configured store callbacks mint hashed, verifiable credentials', async () => {
  for (const redirect of [chrome, firefox, store]) {
    const app = fixture();
    const response = await app.connect(connectRequest(redirect));
    const callback = new URL(response.headers.get('location'));
    const fragment = new URLSearchParams(callback.hash.slice(1));
    const token = fragment.get('token');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(callback.origin + callback.pathname, redirect);
    assert.equal(callback.search, '');
    assert.equal(fragment.get('state'), state);
    assert.equal(app.credential.owner_id, profile.id);
    assert.equal(
      app.credential.token_hash,
      crypto.createHash('sha256').update(token).digest('hex')
    );
    assert.deepEqual(await (await app.me(token)).json(), {
      data: { id: profile.id, email: profile.email },
    });

    app.credential.expires_at = '2000-01-01';
    assert.equal((await app.me(token)).status, 401);
    app.credential.expires_at = '2100-01-01';
    app.credential.revoked_at = new Date().toISOString();
    assert.equal((await app.me(token)).status, 401);
    assert.equal((await app.me()).status, 401);
    assert.equal(app.cookieReads, 0);
  }
});

test('autofill profile resolves base country and falls back only when the typed screening row is absent', async () => {
  const candidate = {
    id: crypto.randomUUID(),
    user_id: profile.id,
    provenance_status: 'confirmed',
    current_city: 'Austin',
    current_state: 'TX',
    confirmed_facts: {
      location: { whereBased: 'Austin, TX', countries: ['in'] },
      screeningAnswers: {
        authorized_countries: ['US'],
        visa_sponsorship_needed: 'no',
        notice_period_days: '0',
        desired_salary_amount: '120000',
        desired_salary_currency: 'usd',
        desired_salary_period: 'year',
      },
    },
  };
  for (const typedRow of [false, true]) {
    const { connect, autofill } = fixture({
      candidates: [candidate],
      screening: typedRow ? { updated_at: '2026-01-01', notice_period_days: null } : {},
    });
    const redirect = await connect(connectRequest());
    const token = new URLSearchParams(new URL(redirect.headers.get('location')).hash.slice(1)).get('token');
    const response = await autofill.GET(new Request(`${origin}/api/v1/me/autofill-profile`, {
      headers: { Authorization: `Bearer ${token}` },
    }));
    assert.equal(response.status, 200);
    const { data, meta } = await response.json();
    assert.equal(data.country, 'United States');
    assert.equal(data.visa_sponsorship_needed, typedRow ? '' : 'No');
    assert.equal(meta.screening.notice_period_days, typedRow ? null : 0);
    assert.equal(data.authorized_countries, typedRow ? '' : 'US');
  }
});
