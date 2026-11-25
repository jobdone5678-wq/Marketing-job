import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { PGlite } from '@electric-sql/pglite';
import ts from 'typescript';
import { z } from 'zod';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const actorId = 'aaaaaaaa-aaaa-4000-8000-aaaaaaaaaaaa';
const otherActorId = 'bbbbbbbb-bbbb-4000-8000-bbbbbbbbbbbb';
const activeToken = 'fixture-active-token-answer-bank-12345';
const revokedToken = 'fixture-revoked-token-answer-bank-12345';
const hash = (value) => createHash('sha256').update(value).digest('hex');

const migrationSql = readFileSync(
  resolve(repoRoot, 'supabase/migrations/20261125000100_freehire_profile_experience_screening.sql'),
  'utf8'
);
const alignMigrationSql = readFileSync(
  resolve(repoRoot, 'supabase/migrations/20261125000300_align_freehire_1to1_schema.sql'),
  'utf8'
);

async function createTestHarness() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;
    CREATE SCHEMA IF NOT EXISTS auth;
    CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY, email text);
    CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    CREATE SCHEMA IF NOT EXISTS storage;
    CREATE TABLE IF NOT EXISTS storage.buckets (id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    CREATE TABLE IF NOT EXISTS storage.objects (id uuid DEFAULT gen_random_uuid(), bucket_id text, name text);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE TABLE IF NOT EXISTS public.profiles (
      id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      email text NOT NULL, full_name text, role text NOT NULL DEFAULT 'candidate',
      status text NOT NULL DEFAULT 'active', phone text, company_name text,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, 'a@test.dev'), ($2, 'b@test.dev')`, [actorId, otherActorId]);
  await db.query(`INSERT INTO public.profiles (id, email, full_name) VALUES ($1, 'a@test.dev', 'A'), ($2, 'b@test.dev', 'B')`, [actorId, otherActorId]);
  await db.exec(migrationSql);
  await db.exec(alignMigrationSql);

  const credentials = new Map([
    [hash(activeToken), { owner_id: actorId, expires_at: '2100-01-01T00:00:00.000Z', revoked_at: null }],
    [hash(revokedToken), { owner_id: actorId, expires_at: '2100-01-01T00:00:00.000Z', revoked_at: '2026-01-01T00:00:00.000Z' }],
  ]);

  class CaptureError extends Error {
    constructor(message, status = 400) {
      super(message);
      this.status = status;
    }
  }

  const rawCountries = JSON.parse(readFileSync(resolve(repoRoot, 'src/lib/profile-countries.json'), 'utf8'));
  const cache = new Map();

  function loadAbs(absPath, overrides = {}) {
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
      Buffer,
      console,
      process,
      require: (spec) => {
        if (overrides[spec]) return overrides[spec];
        if (spec === 'zod') return { z };
        if (spec === 'node:crypto') return { createHash };
        if (spec.includes('profile-countries.json')) return rawCountries;
        if (spec === '@/lib/db/admin' || spec.endsWith('/db/admin')) {
          return {
            database: () => db,
            CaptureError,
            checkDb(err) { if (err) throw new CaptureError(err.message, 500); },
            errorResponse: (err) => Response.json({ error: err.message }, { status: err.status || 500 }),
          };
        }
        if (spec === '@/lib/capture/server') {
          return {
            cors: (_req, res) => res,
            extensionProfile: async (req) => {
              const auth = req.headers.get('authorization') || '';
              if (!auth.startsWith('Bearer ')) throw new CaptureError('Unauthorized', 401);
              const cred = credentials.get(hash(auth.slice(7)));
              if (!cred || cred.revoked_at) throw new CaptureError('Unauthorized', 401);
              return { id: cred.owner_id, status: 'active', role: 'candidate' };
            },
            extensionRoute: async (_req, work) => {
              try {
                return Response.json(await work());
              } catch (err) {
                if (err instanceof z.ZodError) return Response.json({ error: 'Invalid request' }, { status: 400 });
                return Response.json({ error: err.message }, { status: err.status || 500 });
              }
            },
          };
        }
        let target = spec.startsWith('@/')
          ? resolve(repoRoot, 'src', spec.slice(2))
          : resolve(dir, spec);
        if (!target.endsWith('.ts')) target += '.ts';
        return loadAbs(target, overrides);
      },
    });
    return module.exports;
  }

  const route = loadAbs(resolve(repoRoot, 'src/app/api/extension/answer-bank/route.ts'));
  return { db, route };
}

test('Extension Answer Bank API uses screening_answer_bank with topic normalization, provenance, and exclusions', async (t) => {
  const { db, route } = await createTestHarness();
  t.after(() => db.close());

  const unauth = await route.GET(new Request('http://localhost/api/extension/answer-bank'));
  assert.equal(unauth.status, 401);

  const revoked = await route.GET(
    new Request('http://localhost/api/extension/answer-bank', {
      headers: { Authorization: `Bearer ${revokedToken}` },
    })
  );
  assert.equal(revoked.status, 401);

  // Save candidate answer -> maps to topic 'salary_expectation'
  const resPost = await route.POST(
    new Request('http://localhost/api/extension/answer-bank', {
      method: 'POST',
      headers: { Authorization: `Bearer ${activeToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: 'Please tell us your expected salary?',
        answer: '$180,000 USD per year',
      }),
    })
  );
  assert.equal(resPost.status, 200);
  const posted = await resPost.json();
  assert.equal(posted.answer.topic, 'salary_expectation');
  assert.equal(posted.answer.provenance, 'candidate');

  // Different phrasing resolves to same (user_id, topic)
  const resUpsert = await route.POST(
    new Request('http://localhost/api/extension/answer-bank', {
      method: 'POST',
      headers: { Authorization: `Bearer ${activeToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: 'What is your compensation expectation?',
        answer: '$195,000 USD per year',
      }),
    })
  );
  assert.equal(resUpsert.status, 200);
  const upserted = await resUpsert.json();
  assert.equal(upserted.answer.id, posted.answer.id);
  assert.equal(upserted.answer.topic, 'salary_expectation');
  assert.equal(upserted.answer.answer, '$195,000 USD per year');
  assert.equal(upserted.answer.question, 'What is your compensation expectation?');

  // Blocks EEO and cross-country work-auth yes/no questions
  const resEeo = await route.POST(
    new Request('http://localhost/api/extension/answer-bank', {
      method: 'POST',
      headers: { Authorization: `Bearer ${activeToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'What is your gender?', answer: 'Male' }),
    })
  );
  assert.equal(resEeo.status, 422);

  const resWorkAuth = await route.POST(
    new Request('http://localhost/api/extension/answer-bank', {
      method: 'POST',
      headers: { Authorization: `Bearer ${activeToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'Are you legally authorized to work in this country?', answer: 'Yes' }),
    })
  );
  assert.equal(resWorkAuth.status, 422);

  // Delete by topic
  const resDel = await route.DELETE(
    new Request('http://localhost/api/extension/answer-bank?topic=salary_expectation', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${activeToken}` },
    })
  );
  assert.equal(resDel.status, 200);
  assert.equal((await resDel.json()).deleted, true);
});
