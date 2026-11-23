import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';

const candidateId = '11111111-1111-4000-8000-111111111111';
const otherCandidateId = '22222222-2222-4000-8000-222222222222';
const actorId = 'aaaaaaaa-aaaa-4000-8000-aaaaaaaaaaaa';
const otherActorId = 'bbbbbbbb-bbbb-4000-8000-bbbbbbbbbbbb';

const activeToken = 'fixture-active-token-answer-bank-12345';
const revokedToken = 'fixture-revoked-token-answer-bank-12345';
const hash = (value) => createHash('sha256').update(value).digest('hex');

function loadSource(path, dependencies, globals = {}) {
  const file = new URL('../src/' + path + '.ts', import.meta.url);
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  runInNewContext(code, {
    exports,
    URL,
    Response,
    Request,
    Buffer,
    crypto,
    console,
    ...globals,
    require: (name) => dependencies[name],
  });
  return exports;
}

function createTestHarness() {
  const expiry = '2100-01-01T00:00:00.000Z';
  const tables = {
    candidates: [
      { id: candidateId, user_id: actorId, full_name: 'Test Candidate', version: 1 },
      { id: otherCandidateId, user_id: otherActorId, full_name: 'Other Candidate', version: 1 },
    ],
    extension_credentials: [
      { token_hash: hash(activeToken), owner_id: actorId, expires_at: expiry, revoked_at: null },
      { token_hash: hash(revokedToken), owner_id: actorId, expires_at: expiry, revoked_at: '2026-01-01T00:00:00.000Z' },
    ],
    profiles: [
      { id: actorId, status: 'active', role: 'candidate' },
      { id: otherActorId, status: 'active', role: 'candidate' },
    ],
    candidate_answer_bank: [],
  };

  class CaptureError extends Error {
    constructor(message, status = 400) {
      super(message);
      this.status = status;
    }
  }

  const database = () => ({
    from(tableName) {
      const filters = {};
      const nullFilters = {};
      const notNullFilters = {};
      let selectedFields = null;
      let orderCol = null;
      let orderAsc = true;
      let limitCount = null;

      const query = {
        select(fields = '*') {
          selectedFields = fields;
          return query;
        },
        eq(col, val) {
          filters[col] = val;
          return query;
        },
        is(col, val) {
          if (val === null) nullFilters[col] = true;
          return query;
        },
        not(col, op, val) {
          if (op === 'is' && val === null) notNullFilters[col] = true;
          return query;
        },
        order(col, { ascending = true } = {}) {
          orderCol = col;
          orderAsc = ascending;
          return query;
        },
        limit(n) {
          limitCount = n;
          return query;
        },
        async maybeSingle() {
          const list = tables[tableName] || [];
          const match = list.find((row) => {
            for (const [k, v] of Object.entries(filters)) {
              if (row[k] !== v) return false;
            }
            for (const k of Object.keys(nullFilters)) {
              if (row[k] !== null && row[k] !== undefined) return false;
            }
            for (const k of Object.keys(notNullFilters)) {
              if (row[k] === null || row[k] === undefined) return false;
            }
            return true;
          });
          return { data: match ? { ...match } : null, error: null };
        },
        async single() {
          return query.maybeSingle();
        },
        then(resolve, reject) {
          const list = (tables[tableName] || []).filter((row) => {
            for (const [k, v] of Object.entries(filters)) {
              if (row[k] !== v) return false;
            }
            for (const k of Object.keys(nullFilters)) {
              if (row[k] !== null && row[k] !== undefined) return false;
            }
            for (const k of Object.keys(notNullFilters)) {
              if (row[k] === null || row[k] === undefined) return false;
            }
            return true;
          });
          let result = [...list];
          if (orderCol) {
            result.sort((a, b) => {
              if (a[orderCol] < b[orderCol]) return orderAsc ? -1 : 1;
              if (a[orderCol] > b[orderCol]) return orderAsc ? 1 : -1;
              return 0;
            });
          }
          if (limitCount != null) {
            result = result.slice(0, limitCount);
          }
          return Promise.resolve({ data: result.map((r) => ({ ...r })), error: null }).then(resolve, reject);
        },
        insert(values) {
          const rowsToInsert = Array.isArray(values) ? values : [values];
          const inserted = [];
          for (const item of rowsToInsert) {
            const row = {
              id: item.id || crypto.randomUUID(),
              use_count: 1,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              last_used_at: new Date().toISOString(),
              ...item,
            };

            // Enforce partial unique indexes
            const existingUniversal = tables[tableName].find(
              (r) =>
                r.candidate_id === row.candidate_id &&
                r.question_normalized === row.question_normalized &&
                (r.company_scope === null || r.company_scope === undefined) &&
                (row.company_scope === null || row.company_scope === undefined)
            );
            if (existingUniversal) {
              const err = new Error('duplicate key value violates unique constraint "uq_candidate_answer_universal"');
              err.code = '23505';
              return {
                select() {
                  return {
                    single: async () => ({ data: null, error: err }),
                    maybeSingle: async () => ({ data: null, error: err }),
                  };
                },
              };
            }

            const existingCompany = tables[tableName].find(
              (r) =>
                r.candidate_id === row.candidate_id &&
                r.question_normalized === row.question_normalized &&
                r.company_scope !== null &&
                r.company_scope !== undefined &&
                r.company_scope === row.company_scope
            );
            if (existingCompany) {
              const err = new Error('duplicate key value violates unique constraint "uq_candidate_answer_company"');
              err.code = '23505';
              return {
                select() {
                  return {
                    single: async () => ({ data: null, error: err }),
                    maybeSingle: async () => ({ data: null, error: err }),
                  };
                },
              };
            }

            tables[tableName].push(row);
            inserted.push(row);
          }

          return {
            select() {
              return {
                single: async () => ({ data: { ...inserted[0] }, error: null }),
                maybeSingle: async () => ({ data: { ...inserted[0] }, error: null }),
              };
            },
          };
        },
        update(patch) {
          const list = tables[tableName] || [];
          let updatedRow = null;
          for (const row of list) {
            let matches = true;
            for (const [k, v] of Object.entries(filters)) {
              if (row[k] !== v) {
                matches = false;
                break;
              }
            }
            if (matches) {
              Object.assign(row, patch, { updated_at: new Date().toISOString() });
              updatedRow = { ...row };
              break;
            }
          }
          return {
            eq(col, val) {
              filters[col] = val;
              return query.update(patch);
            },
            select() {
              return {
                single: async () => ({ data: updatedRow ? { ...updatedRow } : null, error: null }),
                maybeSingle: async () => ({ data: updatedRow ? { ...updatedRow } : null, error: null }),
              };
            },
            then(resolve, reject) {
              return Promise.resolve({ data: updatedRow ? [{ ...updatedRow }] : [], error: null }).then(resolve, reject);
            },
          };
        },
        delete() {
          return {
            eq(col, val) {
              filters[col] = val;
              return this;
            },
            is(col, val) {
              if (val === null) nullFilters[col] = true;
              return this;
            },
            then(resolve, reject) {
              const beforeCount = (tables[tableName] || []).length;
              tables[tableName] = (tables[tableName] || []).filter((row) => {
                for (const [k, v] of Object.entries(filters)) {
                  if (row[k] !== v) return true;
                }
                for (const k of Object.keys(nullFilters)) {
                  if (row[k] !== null && row[k] !== undefined) return true;
                }
                return false;
              });
              const deletedCount = beforeCount - tables[tableName].length;
              return Promise.resolve({ data: null, error: null, count: deletedCount }).then(resolve, reject);
            },
          };
        },
      };
      return query;
    },
  });

  const admin = {
    database,
    CaptureError,
    checkDb(error) {
      if (error) {
        const err = new CaptureError(error.message, error.status || 500);
        err.code = error.code;
        throw err;
      }
    },
    errorResponse(error) {
      return Response.json({ error: error.message }, { status: error.status || 500 });
    },
  };

  const capture = loadSource('lib/capture/server', {
    'node:crypto': { createHash },
    '@/lib/db/admin': admin,
    zod: { z },
  });

  const route = loadSource('app/api/extension/answer-bank/route', {
    '@/lib/capture/server': capture,
    '@/lib/db/admin': admin,
    zod: { z },
  });

  return { tables, route };
}

test('Answer Bank API: 5. Unauthenticated requests are rejected with 401 across all methods', async () => {
  const { route } = createTestHarness();

  // GET: Missing Authorization header
  const res1 = await route.GET(new Request('http://localhost.test/api/extension/answer-bank'));
  assert.equal(res1.status, 401, 'missing token should be 401');

  // GET: Malformed header
  const res2 = await route.GET(
    new Request('http://localhost.test/api/extension/answer-bank', {
      headers: { authorization: 'Basic 12345' },
    })
  );
  assert.equal(res2.status, 401, 'malformed token should be 401');

  // GET: Revoked token
  const res3 = await route.GET(
    new Request('http://localhost.test/api/extension/answer-bank', {
      headers: { authorization: `Bearer ${revokedToken}` },
    })
  );
  assert.equal(res3.status, 401, 'revoked token should be 401');

  // POST: Unauthenticated
  const resPost = await route.POST(
    new Request('http://localhost.test/api/extension/answer-bank', {
      method: 'POST',
      body: JSON.stringify({ question: 'test', answer: 'test' }),
    })
  );
  assert.equal(resPost.status, 401);

  // PUT: Unauthenticated
  const resPut = await route.PUT(
    new Request('http://localhost.test/api/extension/answer-bank', {
      method: 'PUT',
      body: JSON.stringify({ id: '11111111-1111-4000-8000-111111111111', answer: 'test' }),
    })
  );
  assert.equal(resPut.status, 401);

  // DELETE: Unauthenticated
  const resDelete = await route.DELETE(
    new Request('http://localhost.test/api/extension/answer-bank?id=11111111-1111-4000-8000-111111111111', {
      method: 'DELETE',
    })
  );
  assert.equal(resDelete.status, 401);
});

test('Answer Bank API: 1. GET /api/extension/answer-bank returns candidate saved answers', async () => {
  const { tables, route } = createTestHarness();

  // Populate fixture answers
  tables.candidate_answer_bank.push({
    id: '33333333-3333-4000-8000-333333333333',
    candidate_id: candidateId,
    question: 'How many years of experience do you have with React?',
    question_normalized: 'how many years of experience do you have with react',
    answer: '5 years',
    company_scope: null,
    use_count: 3,
    last_used_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // Answer for another candidate (must not be visible)
  tables.candidate_answer_bank.push({
    id: '44444444-4444-4000-8000-444444444444',
    candidate_id: otherCandidateId,
    question: 'Secret question',
    question_normalized: 'secret question',
    answer: 'Other candidate secret',
    company_scope: null,
    use_count: 1,
    last_used_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const res = await route.GET(
    new Request('http://localhost.test/api/extension/answer-bank', {
      headers: { authorization: `Bearer ${activeToken}` },
    })
  );

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data.answers), 'should return an answers array');
  assert.equal(data.answers.length, 1, 'should only return candidate own answers');
  assert.equal(data.answers[0].answer, '5 years');
  assert.equal(data.answers[0].candidate_id, candidateId);
});

test('Answer Bank API: 2. POST /api/extension/answer-bank upserts universal vs company-scoped answers without collisions', async () => {
  const { tables, route } = createTestHarness();

  // 1. Post a universal answer (company_scope is null)
  const universalPayload = {
    question: 'Why do you want to join our engineering team?',
    answer: 'I love building distributed systems at scale.',
    companyScope: null,
  };

  const res1 = await route.POST(
    new Request('http://localhost.test/api/extension/answer-bank', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${activeToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(universalPayload),
    })
  );

  assert.equal(res1.status, 200);
  const data1 = await res1.json();
  assert.ok(data1.answer, 'returns saved answer');
  assert.equal(data1.answer.company_scope, null);
  assert.equal(data1.answer.use_count, 1);
  const universalId = data1.answer.id;

  // 2. Post the same question universally again -> should UPSERT (increment use_count, update answer)
  const universalUpdatedPayload = {
    question: 'Why do you want to join our engineering team?',
    answer: 'I love building resilient distributed systems and mentorship.',
    companyScope: null,
  };

  const res2 = await route.POST(
    new Request('http://localhost.test/api/extension/answer-bank', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${activeToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(universalUpdatedPayload),
    })
  );

  assert.equal(res2.status, 200);
  const data2 = await res2.json();
  assert.equal(data2.answer.id, universalId, 'should update existing universal answer');
  assert.equal(data2.answer.answer, 'I love building resilient distributed systems and mentorship.');
  assert.equal(data2.answer.use_count, 2, 'use_count incremented');

  // 3. Post company-scoped answer with SAME question -> must NOT collide with universal answer
  const companyPayload = {
    question: 'Why do you want to join our engineering team?',
    answer: 'I have followed Stripe API developer tools for years and admire the developer ergonomics.',
    companyScope: 'stripe',
  };

  const res3 = await route.POST(
    new Request('http://localhost.test/api/extension/answer-bank', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${activeToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(companyPayload),
    })
  );

  assert.equal(res3.status, 200);
  const data3 = await res3.json();
  assert.notEqual(data3.answer.id, universalId, 'company answer must have distinct id from universal answer');
  assert.equal(data3.answer.company_scope, 'stripe');
  assert.equal(data3.answer.use_count, 1);
  const stripeId = data3.answer.id;

  // 4. Post same company-scoped answer again -> upserts stripe answer
  const companyUpdatedPayload = {
    question: 'Why do you want to join our engineering team?',
    answer: 'Updated Stripe specific motivation.',
    companyScope: 'stripe',
  };

  const res4 = await route.POST(
    new Request('http://localhost.test/api/extension/answer-bank', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${activeToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(companyUpdatedPayload),
    })
  );

  assert.equal(res4.status, 200);
  const data4 = await res4.json();
  assert.equal(data4.answer.id, stripeId, 'should update existing company-scoped answer');
  assert.equal(data4.answer.answer, 'Updated Stripe specific motivation.');
  assert.equal(data4.answer.use_count, 2);

  // Total answers for candidate should be 2: one universal, one company-scoped
  const candidateRows = tables.candidate_answer_bank.filter((r) => r.candidate_id === candidateId);
  assert.equal(candidateRows.length, 2, 'should contain exactly 1 universal and 1 stripe answer');
});

test('Answer Bank API: 3. PUT /api/extension/answer-bank updates existing answer', async () => {
  const { tables, route } = createTestHarness();

  const existingId = '55555555-5555-4000-8000-555555555555';
  tables.candidate_answer_bank.push({
    id: existingId,
    candidate_id: candidateId,
    question: 'What is your current notice period?',
    question_normalized: 'what is your current notice period',
    answer: '2 weeks',
    company_scope: null,
    use_count: 5,
    last_used_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // Update answer text and use count
  const res = await route.PUT(
    new Request('http://localhost.test/api/extension/answer-bank', {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${activeToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        id: existingId,
        answer: 'Immediately available',
        useCount: 6,
      }),
    })
  );

  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.answer.id, existingId);
  assert.equal(data.answer.answer, 'Immediately available');
  assert.equal(data.answer.use_count, 6);

  // Attempting to update another candidate answer should be rejected with 404
  const otherId = '66666666-6666-4000-8000-666666666666';
  tables.candidate_answer_bank.push({
    id: otherId,
    candidate_id: otherCandidateId,
    question: 'Other question',
    question_normalized: 'other question',
    answer: 'Other answer',
    company_scope: null,
    use_count: 1,
    last_used_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const resOther = await route.PUT(
    new Request('http://localhost.test/api/extension/answer-bank', {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${activeToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        id: otherId,
        answer: 'Hacked answer',
      }),
    })
  );

  assert.equal(resOther.status, 404, 'cannot update answer not owned by candidate');
});

test('Answer Bank API: 4. DELETE /api/extension/answer-bank removes answer by ID or query', async () => {
  const { tables, route } = createTestHarness();

  const idToDelete = '77777777-7777-4000-8000-777777777777';
  tables.candidate_answer_bank.push({
    id: idToDelete,
    candidate_id: candidateId,
    question: 'Are you open to relocation?',
    question_normalized: 'are you open to relocation',
    answer: 'Yes, anywhere on West Coast',
    company_scope: null,
    use_count: 2,
    last_used_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // Delete by query param ?id=...
  const res1 = await route.DELETE(
    new Request(`http://localhost.test/api/extension/answer-bank?id=${idToDelete}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${activeToken}` },
    })
  );

  assert.equal(res1.status, 200);
  const data1 = await res1.json();
  assert.equal(data1.deleted, true);

  const found = tables.candidate_answer_bank.find((r) => r.id === idToDelete);
  assert.equal(found, undefined, 'record was deleted');

  // Add another and delete by question normalized + company scope
  tables.candidate_answer_bank.push({
    id: '88888888-8888-4000-8000-888888888888',
    candidate_id: candidateId,
    question: 'Target compensation?',
    question_normalized: 'target compensation',
    answer: '$180,000',
    company_scope: 'meta',
    use_count: 1,
    last_used_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const res2 = await route.DELETE(
    new Request('http://localhost.test/api/extension/answer-bank', {
      method: 'DELETE',
      headers: {
        authorization: `Bearer ${activeToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        questionNormalized: 'target compensation',
        companyScope: 'meta',
      }),
    })
  );

  assert.equal(res2.status, 200);
  const data2 = await res2.json();
  assert.equal(data2.deleted, true);

  const found2 = tables.candidate_answer_bank.find((r) => r.id === '88888888-8888-4000-8000-888888888888');
  assert.equal(found2, undefined, 'record was deleted by question/scope');
});

test('Answer Bank API: Candidate ownership isolation and validation', async () => {
  const { route } = createTestHarness();

  // POST with candidateId not owned by actor -> rejected with 404
  const resForbidden = await route.POST(
    new Request('http://localhost.test/api/extension/answer-bank', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${activeToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        candidateId: otherCandidateId, // Belongs to otherActorId
        question: 'Any question',
        answer: 'Any answer',
      }),
    })
  );
  assert.equal(resForbidden.status, 404, 'cannot post for candidate not owned by actor');

  // POST with empty answer -> rejected with 400
  const resEmptyAnswer = await route.POST(
    new Request('http://localhost.test/api/extension/answer-bank', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${activeToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        question: 'Any question',
        answer: '   ',
      }),
    })
  );
  assert.equal(resEmptyAnswer.status, 400, 'empty answer rejected with 400');

  // POST with empty question -> rejected with 400
  const resEmptyQuestion = await route.POST(
    new Request('http://localhost.test/api/extension/answer-bank', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${activeToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        question: '   ',
        answer: 'Valid answer',
      }),
    })
  );
  assert.equal(resEmptyQuestion.status, 400, 'empty question rejected with 400');
});

test('Answer Bank API: GET filtering by companyScope', async () => {
  const { tables, route } = createTestHarness();

  tables.candidate_answer_bank.push(
    {
      id: 'a1111111-1111-4000-8000-111111111111',
      candidate_id: candidateId,
      question: 'Universal question',
      question_normalized: 'universal question',
      answer: 'Universal answer',
      company_scope: null,
      use_count: 1,
      last_used_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'a2222222-2222-4000-8000-222222222222',
      candidate_id: candidateId,
      question: 'Company specific question',
      question_normalized: 'company specific question',
      answer: 'Figma specific answer',
      company_scope: 'figma',
      use_count: 2,
      last_used_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
  );

  // GET without filter -> returns all candidate answers (2)
  const resAll = await route.GET(
    new Request('http://localhost.test/api/extension/answer-bank', {
      headers: { authorization: `Bearer ${activeToken}` },
    })
  );
  const dataAll = await resAll.json();
  assert.equal(dataAll.answers.length, 2);

  // GET with ?companyScope=figma -> returns only figma answer (1)
  const resFigma = await route.GET(
    new Request('http://localhost.test/api/extension/answer-bank?companyScope=figma', {
      headers: { authorization: `Bearer ${activeToken}` },
    })
  );
  const dataFigma = await resFigma.json();
  assert.equal(dataFigma.answers.length, 1);
  assert.equal(dataFigma.answers[0].company_scope, 'figma');

  // GET with ?companyScope=null -> returns only universal answer (1)
  const resUniversal = await route.GET(
    new Request('http://localhost.test/api/extension/answer-bank?companyScope=null', {
      headers: { authorization: `Bearer ${activeToken}` },
    })
  );
  const dataUniversal = await resUniversal.json();
  assert.equal(dataUniversal.answers.length, 1);
  assert.equal(dataUniversal.answers[0].company_scope, null);
});

