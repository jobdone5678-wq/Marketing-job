import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { PGlite } from '@electric-sql/pglite';
import ts from 'typescript';
import { z } from 'zod';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const USER_1 = '11111111-1111-4000-8000-111111111111';
const USER_2 = '22222222-2222-4000-8000-222222222222';

const baseMigrationSql = readFileSync(
  resolve(repoRoot, 'supabase/migrations/20261125000100_freehire_profile_experience_screening.sql'),
  'utf8'
);
const demoMigrationSql = readFileSync(
  resolve(repoRoot, 'supabase/migrations/20261126000100_demographic_preferences.sql'),
  'utf8'
);

function createLoader() {
  const cache = new Map();
  const rawCountries = JSON.parse(
    readFileSync(resolve(repoRoot, 'src/lib/profile-countries.json'), 'utf8')
  );

  function loadAbs(absPath) {
    if (cache.has(absPath)) return cache.get(absPath);
    const code = ts.transpileModule(readFileSync(absPath, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    }).outputText;
    const exports = {};
    const module = { exports };
    cache.set(absPath, exports);
    const dir = dirname(absPath);
    runInNewContext(code, {
      exports,
      module,
      URL,
      Request,
      Response,
      console,
      process,
      require: (spec) => {
        if (spec === 'zod') return { z };
        if (spec === 'node:crypto') return { createHash };
        if (spec.includes('profile-countries.json')) return rawCountries;
        let target = spec.startsWith('@/') ? resolve(repoRoot, 'src', spec.slice(2)) : resolve(dir, spec);
        if (!target.endsWith('.ts')) target += '.ts';
        return loadAbs(target);
      },
    });
    return module.exports;
  }

  return {
    loadTs: (relFromSrc) => loadAbs(resolve(repoRoot, 'src', relFromSrc)),
  };
}

async function createDb() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE IF NOT EXISTS auth.users (
      id uuid PRIMARY KEY,
      email text,
      raw_user_meta_data jsonb,
      created_at timestamptz DEFAULT now()
    );
    CREATE OR REPLACE FUNCTION auth.uid()
    RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    CREATE SCHEMA IF NOT EXISTS storage;
    CREATE TABLE IF NOT EXISTS storage.buckets (
      id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]
    );
    CREATE TABLE IF NOT EXISTS storage.objects (id uuid DEFAULT gen_random_uuid(), bucket_id text, name text);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE TABLE IF NOT EXISTS public.profiles (
      id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      email text NOT NULL,
      full_name text,
      role text NOT NULL DEFAULT 'candidate',
      status text NOT NULL DEFAULT 'active',
      phone text,
      company_name text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    INSERT INTO auth.users (id, email) VALUES ('${USER_1}', 'alice@example.com');
    INSERT INTO auth.users (id, email) VALUES ('${USER_2}', 'bob@example.com');
  `);
  await db.exec(baseMigrationSql);
  await db.exec(demoMigrationSql);
  return db;
}

test('demographic preferences options, matching, Supabase RLS, and /api/v1/me/demographic-preferences CRUD', async (t) => {
  const db = await createDb();
  t.after(async () => {
    await db.close();
  });

  const { loadTs } = createLoader();
  const prefsLib = loadTs('lib/profile/demographic-preferences.ts');
  const optionsLib = loadTs('lib/profile/demographic-options.ts');
  const route = loadTs('app/api/v1/me/demographic-preferences/route.ts');

  // 1. Dropdown options cover every demographic key
  for (const key of prefsLib.demographicKeys) {
    const opts = optionsLib.DEMOGRAPHIC_FIELD_OPTIONS[key];
    assert.ok(Array.isArray(opts) && opts.length >= 3, `expected dropdown options for ${key}`);
    assert.ok(opts.some((o) => o.value === 'Prefer not to say'), `expected opt-out option for ${key}`);
  }

  // 2. Choice matching & ambiguity safety (migrated from demographicStorage.test.ts + dropdown synonyms)
  const clone = (value) => JSON.parse(JSON.stringify(value));
  assert.deepEqual(
    clone(prefsLib.demographicChoices('disability', ['Yes'], ['Yes, I have a disability, or have had one in the past', 'No'])),
    ['Yes, I have a disability, or have had one in the past']
  );
  assert.deepEqual(
    clone(prefsLib.demographicChoices('gender', ['Decline'], ['Woman', 'Prefer not to say', 'Decline to answer'])),
    []
  );
  assert.deepEqual(
    clone(prefsLib.demographicChoices('raceEthnicity', ['Asian', 'White'], ['Asian', 'Decline'])),
    []
  );
  assert.deepEqual(
    clone(prefsLib.demographicChoices('raceEthnicity', ['Asian', 'Decline'], ['Asian', 'Decline'])),
    []
  );
  assert.deepEqual(
    clone(prefsLib.demographicChoices('gender', ['Male'], ['Man', 'Woman', 'Prefer not to say'])),
    ['Man']
  );
  assert.deepEqual(
    clone(prefsLib.demographicChoices('raceEthnicity', ['Asian'], ['Asian (Not Hispanic or Latino)', 'White (Not Hispanic or Latino)'])),
    ['Asian (Not Hispanic or Latino)']
  );
  assert.deepEqual(
    clone(prefsLib.demographicChoices('protectedVeteran', ['No'], ['I am a protected veteran', 'I am not a protected veteran'])),
    ['I am not a protected veteran']
  );
  assert.equal(prefsLib.demographicKey('What is your current age?'), 'ageRange');
  assert.deepEqual(
    clone(prefsLib.demographicChoices('raceEthnicity', ['Asian'], ['Asian or Asian American', 'Black or African American', 'Hispanic or Latine', 'Indigenous or Native American', 'White', 'I prefer not to answer'])),
    ['Asian or Asian American']
  );
  assert.deepEqual(
    clone(prefsLib.demographicChoices('raceEthnicity', ['Hispanic or Latino'], ['Asian or Asian American', 'Hispanic or Latine', 'White'])),
    ['Hispanic or Latine']
  );
  assert.deepEqual(
    clone(prefsLib.mixedDemographicChoices(
      { disability: ['Yes'], veteran: ['No'], parentalStatus: ['Yes'] },
      ['Person with disability', 'Neurodivergent', 'Veteran', 'Parent', 'Refugee or immigrant', 'None of the above']
    )),
    ['Person with disability', 'Parent']
  );

  // 3. Route rejects unauthenticated callers
  const unauth = await route.GET(new Request('http://localhost/api/v1/me/demographic-preferences'), { db });
  assert.equal(unauth.status, 401);

  // 4. Default empty state before saving
  const emptyRes = await route.GET(
    new Request('http://localhost/api/v1/me/demographic-preferences', {
      headers: { Authorization: `Bearer ${USER_1}` },
    }),
    { db }
  );
  assert.equal(emptyRes.status, 200);
  assert.deepEqual((await emptyRes.json()).demographic_preferences, { enabled: false, answers: {} });

  // 5. Rejects unknown demographic keys
  const badRes = await route.PUT(
    new Request('http://localhost/api/v1/me/demographic-preferences', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${USER_1}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true, answers: { unknownField: ['Yes'] } }),
    }),
    { db }
  );
  assert.equal(badRes.status, 400);

  // 6. Stores dropdown selections in Supabase with CORS support for extension
  const extOrigin = 'chrome-extension://ebhfafmnihndlaoibgjnfjhkjlnaencj';
  const putRes = await route.PUT(
    new Request('http://localhost/api/v1/me/demographic-preferences', {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${USER_1}`,
        Origin: extOrigin,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        enabled: true,
        answers: {
          gender: ['Male'],
          raceEthnicity: [' Asian ', 'Asian'],
          protectedVeteran: ['No'],
          disability: ['No'],
        },
      }),
    }),
    { db }
  );
  assert.equal(putRes.status, 200);
  assert.equal(putRes.headers.get('access-control-allow-origin'), extOrigin);
  assert.deepEqual((await putRes.json()).demographic_preferences, {
    enabled: true,
    answers: {
      gender: ['Male'],
      raceEthnicity: ['Asian'],
      protectedVeteran: ['No'],
      disability: ['No'],
    },
  });

  // 7. Scoped per user + RLS isolates rows
  const user2Get = await route.GET(
    new Request('http://localhost/api/v1/me/demographic-preferences', {
      headers: { Authorization: `Bearer ${USER_2}`, Origin: extOrigin },
    }),
    { db }
  );
  assert.equal(user2Get.status, 200);
  assert.equal(user2Get.headers.get('access-control-allow-origin'), extOrigin);
  assert.deepEqual((await user2Get.json()).demographic_preferences, { enabled: false, answers: {} });

  await db.exec('BEGIN');
  await db.exec('SET LOCAL ROLE authenticated');
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${USER_2}', true)`);
  const rlsRows = await db.query('SELECT * FROM public.demographic_preferences');
  assert.equal(rlsRows.rows.length, 0);
  await db.exec('ROLLBACK');

  // 8. Delete clears preferences
  const delRes = await route.DELETE(
    new Request('http://localhost/api/v1/me/demographic-preferences', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${USER_1}` },
    }),
    { db }
  );
  assert.equal(delRes.status, 200);
  const afterDel = await route.GET(
    new Request('http://localhost/api/v1/me/demographic-preferences', {
      headers: { Authorization: `Bearer ${USER_1}` },
    }),
    { db }
  );
  assert.deepEqual((await afterDel.json()).demographic_preferences, { enabled: false, answers: {} });
});
