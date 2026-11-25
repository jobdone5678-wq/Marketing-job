import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';
import * as aiPkg from 'ai';
import * as openaiCompatiblePkg from '@ai-sdk/openai-compatible';
import { approvedSavedAnswers } from '../src/lib/extension-answers/saved-answers.ts';
import { isUrlField } from '../jobright_extension/core/field-mapping.js';

const candidateId = '075cec76-7467-4bc9-be0d-14ed732690ff';
const otherId = '18ec672b-4cb9-4c3a-a027-f71fec96a6ad';
const activeToken = 'fixture-active-token-1234';
const revokedToken = 'fixture-revoked-token-1234';
const inactiveToken = 'fixture-inactive-token-1234';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const question = 'Why are you interested in this role?';
const job = { companyName: 'Fixture Company', jobTitle: 'Engineer' };

function loadSource(path, dependencies, globals) {
  const source = readFileSync(new URL(`../src/${path}.ts`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  runInNewContext(outputText, {
    exports,
    Response,
    URL,
    console,
    ...globals,
    require: (name) => dependencies[name],
  });
  return exports;
}

function fixture({ failWrite = false, changeBeforeWrite = false } = {}) {
  const calls = [];
  const candidate = {
    id: candidateId,
    user_id: 'owner',
    full_name: 'Own Candidate',
    updated_at: '2026-01-01T00:00:00.000Z',
    confirmed_facts: {},
  };
  const candidates = [candidate, { id: otherId, user_id: 'other', full_name: 'Other Candidate' }];
  const expiry = '2100-01-01T00:00:00.000Z';
  const tables = {
    candidates,
    extension_credentials: [
      { token_hash: hash(activeToken), owner_id: 'owner', expires_at: expiry },
      {
        token_hash: hash(revokedToken),
        owner_id: 'owner',
        expires_at: expiry,
        revoked_at: '2026-01-01',
      },
      { token_hash: hash(inactiveToken), owner_id: 'inactive', expires_at: expiry },
    ],
    profiles: [
      { id: 'owner', status: 'active', role: 'candidate' },
      { id: 'inactive', status: 'suspended', role: 'candidate' },
    ],
  };
  const database = () => ({
    from(table) {
      const filters = {};
      let update;
      const query = {
        select: () => query,
        eq(column, value) {
          filters[column] = value;
          return query;
        },
        update(value) {
          update = value;
          return query;
        },
        maybeSingle() {
          calls.push({ table, filters, update });
          if (update && failWrite)
            return { data: null, error: { message: 'fixture write failed' } };
          if (update && changeBeforeWrite) {
            candidate.updated_at = '2026-01-02T00:00:00.000Z';
            candidate.confirmed_facts = { summary: 'A concurrently updated summary.' };
          }
          const row = tables[table].find((r) =>
            Object.entries(filters).every(([key, value]) => r[key] === value)
          );
          if (row && update) Object.assign(row, update);
          return { data: row ?? null, error: null };
        },
        single() {
          return query.maybeSingle();
        },
        then(resolve, reject) {
          return Promise.resolve(query.maybeSingle()).then(resolve, reject);
        },
      };
      return query;
    },
  });
  class CaptureError extends Error {
    constructor(message, status = 400) {
      super(message);
      this.status = status;
    }
  }
  const admin = {
    database,
    CaptureError,
    checkDb(error) {
      if (error) throw new CaptureError(error.message, 500);
    },
    errorResponse: (error) =>
      Response.json({ error: error.message }, { status: error.status || 500 }),
  };
  const globals = { process: { env: { OPENAI_API_KEY: 'fixture' } } };
  const capture = loadSource(
    'lib/capture/server',
    {
      'node:crypto': { createHash },
      '@/lib/db/admin': admin,
      zod: { z },
    },
    globals
  );
  const candidateContext = loadSource(
    'lib/extension-answers/candidate-context',
    {
      '@/lib/capture/server': capture,
      '@/lib/db/admin': admin,
      zod: { z },
    },
    globals
  );
  const providerCalls = [];
  const route = loadSource(
    'app/api/extension/generate-answer/route',
    {
      '@/lib/capture/server': capture,
      '@/lib/db/admin': admin,
      '@/lib/extension-answers/candidate-context': candidateContext,
      '@/lib/extension-answers/saved-answers': { approvedSavedAnswers },
      '../../../../../jobright_extension/core/field-mapping.js': { isUrlField },
      '@/lib/rate-limit': { checkRateLimit: () => ({ allowed: true }) },
      zod: { z },
      ai: aiPkg,
      '@ai-sdk/openai-compatible': openaiCompatiblePkg,
    },
    {
      ...globals,
      fetch: async (_url, request) => {
        providerCalls.push(JSON.parse(request.body));
        return Response.json({ choices: [{ message: { content: 'A generated draft.' } }] });
      },
    }
  );
  const call = (method, token, body = {}) =>
    route[method](
      new Request('http://localhost.test', {
        method,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: JSON.stringify({
          ...job,
          candidateId,
          question,
          fieldLabel: question,
          answer: 'My reviewed answer.',
          ...body,
        }),
      })
    );
  return { call, calls, candidate, providerCalls };
}

test('generation uses the account-scoped candidate and leaves reusable answers untouched', async () => {
  const { call, calls, candidate, providerCalls } = fixture();
  const result = await call('POST', activeToken);
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { ok: true, answer: 'A generated draft.', stored: false });
  assert.deepEqual(
    calls.filter(({ table }) => table === 'candidates'),
    [{ table: 'candidates', filters: { id: candidateId, user_id: 'owner' }, update: undefined }]
  );
  assert.match(providerCalls[0].messages[0].content, /Own Candidate/);
  assert.equal(candidate.confirmed_facts.saved_answers, undefined);
});

for (const method of ['POST', 'PUT']) {
  for (const [label, token, status] of [
    ['missing', null, 401],
    ['invalid', 'fixture-unknown-token-1234', 401],
    ['revoked', revokedToken, 401],
    ['inactive', inactiveToken, 403],
  ]) {
    test(`${method} rejects ${label} credentials before candidate access`, async () => {
      const { call, calls, providerCalls } = fixture();
      assert.equal((await call(method, token)).status, status);
      assert.equal(
        calls.some(({ table }) => table === 'candidates'),
        false
      );
      assert.equal(providerCalls.length, 0);
    });
  }

  test(`${method} rejects cross-account candidate access after a single scoped lookup`, async () => {
    const { call, calls, providerCalls } = fixture();
    assert.equal((await call(method, activeToken, { candidateId: otherId })).status, 404);
    assert.deepEqual(
      calls.filter(({ table }) => table === 'candidates'),
      [{ table: 'candidates', filters: { id: otherId, user_id: 'owner' }, update: undefined }]
    );
    assert.equal(providerCalls.length, 0);
  });
}

test('explicit approval stores an answer for this candidate and job', async () => {
  const { call, providerCalls } = fixture();
  const result = await call('PUT', activeToken);
  assert.equal(result.status, 200);
  assert.equal((await result.json()).saved, true);
  assert.deepEqual(await (await call('POST', activeToken)).json(), {
    ok: true,
    answer: 'My reviewed answer.',
    stored: true,
  });
  assert.equal(providerCalls.length, 0);
  assert.equal(
    (await (await call('POST', activeToken, { jobTitle: 'Writer' })).json()).stored,
    false
  );
  assert.equal(providerCalls.length, 1);
});

test('legacy answers without proof of approval stay stored and are excluded from reuse', async () => {
  const { call, candidate, providerCalls } = fixture();
  const savedAnswers = {
    'why are you interested in this role|fixture company|engineer': { answer: 'A legacy answer.' },
  };
  candidate.confirmed_facts.saved_answers = savedAnswers;
  const result = await call('POST', activeToken);
  assert.equal((await result.json()).stored, false);
  assert.equal(providerCalls.length, 1);
  assert.deepEqual(candidate.confirmed_facts.saved_answers, savedAnswers);
});

test('contextual approval requires the job scope and a question', async () => {
  const { call, candidate } = fixture();
  assert.equal((await (await call('PUT', activeToken, { jobTitle: '' })).json()).saved, false);
  const keyOnly = await call('PUT', activeToken, { question: undefined, key: 'client-key' });
  assert.equal(keyOnly.status, 400);
  assert.equal(candidate.confirmed_facts.saved_answers, undefined);
});

test('contextual approval is scoped to the exact company and role', async () => {
  const { call } = fixture();
  await call('PUT', activeToken, { companyName: 'A|B', jobTitle: 'C' });
  const differentJob = await call('POST', activeToken, { companyName: 'A', jobTitle: 'B|C' });
  assert.equal((await differentJob.json()).stored, false);
  const originalJob = await call('POST', activeToken, { companyName: 'A|B', jobTitle: 'C' });
  assert.equal((await originalJob.json()).stored, true);
});

test('an approved choice is reused only when it matches a current option', async () => {
  const { call } = fixture();
  await call('PUT', activeToken, { answer: 'Not authorized' });
  const changed = await call('POST', activeToken, { options: ['Authorized', 'Unauthorized'] });
  assert.equal((await changed.json()).stored, false);
  const unchanged = await call('POST', activeToken, { options: ['Authorized', 'Not authorized'] });
  assert.equal((await unchanged.json()).stored, true);
});

test('URL questions cannot reach the provider or reusable answer store', async () => {
  const { call, candidate, providerCalls } = fixture();
  const typed = await call('POST', activeToken, { fieldLabel: 'Other', fieldType: 'url' });
  const named = await call('POST', activeToken, { fieldLabel: 'Other', questionId: 'urls[Other]' });
  const save = await call('PUT', activeToken, { question: 'GitHub URL' });
  assert.equal(typed.status, 422);
  assert.equal(named.status, 422);
  assert.equal(save.status, 422);
  assert.equal(providerCalls.length, 0);
  assert.equal(candidate.confirmed_facts.saved_answers, undefined);
});

test('explicit approval reports a failed write', async () => {
  const { call, candidate } = fixture({ failWrite: true });
  const result = await call('PUT', activeToken);
  assert.equal(result.status, 500);
  assert.equal((await result.json()).saved, undefined);
  assert.equal(candidate.confirmed_facts.saved_answers, undefined);
});

test('explicit approval preserves concurrent changes and reports a conflict', async () => {
  const { call, candidate } = fixture({ changeBeforeWrite: true });
  const result = await call('PUT', activeToken);
  assert.equal(result.status, 409);
  assert.deepEqual(candidate.confirmed_facts, { summary: 'A concurrently updated summary.' });
});
