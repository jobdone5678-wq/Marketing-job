import test from 'node:test';
import assert from 'node:assert/strict';
import { moduleLoader } from './helpers/load-ts-module.mjs';

const CANDIDATE_ID = '550e8400-e29b-41d4-a716-446655440000';
const PROFILE = { id: '550e8400-e29b-41d4-a716-446655440001', role: 'recruiter', status: 'active', email: 'staff@example.test', full_name: 'Staff' };

class CaptureError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// A small stand in for the PostgREST query builder that records every write.
function createFakeDb(tables, options = {}) {
  const writes = { insert: [], update: [], upsert: [] };
  function build(table) {
    const filters = [];
    let action = null;
    async function run() {
      const matched = (tables[table] || []).filter(row => filters.every(filter => filter(row)));
      if (!action) return { data: matched, error: null };
      if (action.type === 'insert') {
        writes.insert.push({ table, row: action.row });
        if (options.failInsert && options.failInsert.includes(table)) {
          return { data: null, error: { code: '23505', message: 'duplicate key' } };
        }
        const saved = { id: action.row.id || 'generated-id', ...action.row };
        (tables[table] ||= []).push(saved);
        return { data: [saved], error: null };
      }
      if (action.type === 'upsert') {
        writes.upsert.push({ table, row: action.row });
        if (options.failUpsert && options.failUpsert.includes(table)) {
          return { data: null, error: { code: '42501', message: 'permission denied' } };
        }
        const existing = (tables[table] || []).find(item => item.id === action.row.id);
        if (existing) Object.assign(existing, action.row);
        else (tables[table] ||= []).push({ ...action.row });
        return { data: [action.row], error: null };
      }
      writes.update.push({ table, patch: action.patch });
      for (const row of matched) Object.assign(row, action.patch);
      return { data: matched, error: null };
    }
    const query = {
      select: () => query,
      eq: (key, value) => { filters.push(row => row[key] === value); return query; },
      in: (key, values) => { filters.push(row => values.includes(row[key])); return query; },
      ilike: (key, value) => { filters.push(row => String(row[key] || '').toLowerCase().includes(String(value).toLowerCase())); return query; },
      order: () => query,
      limit: () => query,
      insert: row => { action = { type: 'insert', row }; return query; },
      upsert: row => { action = { type: 'upsert', row }; return query; },
      update: patch => { action = { type: 'update', patch }; return query; },
      single: async () => { const result = await run(); return { data: result.data?.[0] || null, error: result.error }; },
      maybeSingle: async () => { const result = await run(); return { data: result.data?.[0] || null, error: result.error }; },
      then: (resolve, reject) => run().then(resolve, reject),
    };
    return query;
  }
  return { db: { from: build }, writes };
}

function loadRoute(overrides) {
  const load = moduleLoader({
    '@/lib/http/protected-route': {
      protectedRoute: async (_request, _access, work) => {
        try {
          return Response.json(await work(PROFILE));
        } catch (error) {
          if (error instanceof CaptureError) {
            return Response.json({ error: error.message }, { status: error.status });
          }
          return Response.json({ error: 'The request could not be completed.' }, { status: 500 });
        }
      },
    },
    '@/lib/db/admin': {
      database: () => overrides.db,
      CaptureError,
    },
    '@/lib/resumes/repository': { candidateAccess: async () => {} },
    '@/lib/auth/candidate-ownership': {
      ownedCandidates: async () => [{ id: CANDIDATE_ID, full_name: 'Chandra Reddy', user_id: null, email: null }],
      ensureOwnedCandidate: async () => ({ id: CANDIDATE_ID, full_name: 'Chandra Reddy', user_id: null, email: null }),
    },
  });
  return load('src/app/api/rtr/route.ts');
}

function payload(overrides = {}) {
  return {
    candidate_id: CANDIDATE_ID,
    candidate_name: 'Chandra Reddy',
    filename: 'RTR.pdf',
    mime_type: 'application/pdf',
    rtr_type: 'vendor_rtr',
    rtr_status: 'signed',
    rtr_date: '2026-11-09',
    company_name: 'Globex',
    job_title: 'Engineer',
    create_submission: true,
    ...overrides,
  };
}

test('saving an agreement records the application and stores the document', async () => {
  const tables = {
    candidates: [{ id: CANDIDATE_ID, full_name: 'Chandra Reddy' }],
    job_submissions: [],
    rtr_documents: [],
  };
  const { db, writes } = createFakeDb(tables);
  const route = loadRoute({ db });

  const res = await route.POST(
    new Request('https://portal.test/api/rtr', { method: 'POST', body: JSON.stringify(payload()) })
  );
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(body.success, true);
  assert.equal(tables.job_submissions.length, 1);
  assert.equal(tables.rtr_documents.length, 1);
  assert.equal(tables.rtr_documents[0].submission_id, body.submission_id);
  assert.equal(tables.rtr_documents[0].filename, 'RTR.pdf');
  // The agreement metadata is stored on the application so the badge can render it.
  assert.equal(tables.job_submissions[0].rtr_document.id, body.id);
  assert.ok(tables.job_submissions[0].notes.includes('RTR_METADATA'));
  assert.equal(writes.upsert.length, 1);
});

test('uploading the same agreement again updates the record instead of duplicating it', async () => {
  const tables = {
    candidates: [{ id: CANDIDATE_ID, full_name: 'Chandra Reddy' }],
    job_submissions: [],
    rtr_documents: [],
  };
  const { db } = createFakeDb(tables);
  const route = loadRoute({ db });

  const first = await (await route.POST(new Request('https://portal.test/api/rtr', { method: 'POST', body: JSON.stringify(payload()) }))).json();
  const second = await (await route.POST(new Request('https://portal.test/api/rtr', { method: 'POST', body: JSON.stringify(payload({ filename: 'RTR-v2.pdf' })) }))).json();

  assert.equal(tables.job_submissions.length, 1, 'a re-upload must not create a second application');
  assert.equal(first.submission_id, second.submission_id);
  assert.equal(second.submission_reused, true);
  assert.equal(tables.rtr_documents.length, 1);
  assert.equal(tables.rtr_documents[0].filename, 'RTR-v2.pdf');
});

test('a failed write is reported instead of being reported as saved', async () => {
  const tables = {
    candidates: [{ id: CANDIDATE_ID, full_name: 'Chandra Reddy' }],
    job_submissions: [],
    rtr_documents: [],
  };
  const { db } = createFakeDb(tables, { failInsert: ['job_submissions'] });
  const route = loadRoute({ db });

  const res = await route.POST(
    new Request('https://portal.test/api/rtr', { method: 'POST', body: JSON.stringify(payload()) })
  );
  const body = await res.json();

  assert.equal(res.status, 500);
  assert.ok(body.error, 'the caller must be told that nothing was saved');
  assert.equal(tables.job_submissions.length, 0);
});

test('a failed document write is reported instead of being reported as saved', async () => {
  const tables = {
    candidates: [{ id: CANDIDATE_ID, full_name: 'Chandra Reddy' }],
    job_submissions: [],
    rtr_documents: [],
  };
  const { db } = createFakeDb(tables, { failUpsert: ['rtr_documents'] });
  const route = loadRoute({ db });

  const res = await route.POST(
    new Request('https://portal.test/api/rtr', { method: 'POST', body: JSON.stringify(payload()) })
  );
  const body = await res.json();

  assert.equal(res.status, 500);
  assert.ok(body.error);
});

test('an agreement date that is not a calendar date is normalised before it is stored', async () => {
  const tables = {
    candidates: [{ id: CANDIDATE_ID, full_name: 'Chandra Reddy' }],
    job_submissions: [],
    rtr_documents: [],
  };
  const { db } = createFakeDb(tables);
  const route = loadRoute({ db });

  await route.POST(
    new Request('https://portal.test/api/rtr', { method: 'POST', body: JSON.stringify(payload({ rtr_date: '11/09/2026' })) })
  );

  assert.equal(tables.job_submissions[0].submission_date, '2026-11-09');
  assert.equal(tables.rtr_documents[0].rtr_date, '2026-11-09');
});

test('an invalid vendor recruiter email is rejected with a clear message', async () => {
  const tables = {
    candidates: [{ id: CANDIDATE_ID, full_name: 'Chandra Reddy' }],
    job_submissions: [],
    rtr_documents: [],
  };
  const { db } = createFakeDb(tables);
  const route = loadRoute({ db });

  const res = await route.POST(
    new Request('https://portal.test/api/rtr', {
      method: 'POST',
      body: JSON.stringify(payload({ vendor_contact_email: 'not-an-email' })),
    })
  );
  const body = await res.json();

  assert.equal(res.status, 400);
  assert.match(body.error, /email/i);
  assert.equal(tables.job_submissions.length, 0);
});

test('a valid vendor recruiter email is stored with the agreement', async () => {
  const tables = {
    candidates: [{ id: CANDIDATE_ID, full_name: 'Chandra Reddy' }],
    job_submissions: [],
    rtr_documents: [],
  };
  const { db } = createFakeDb(tables);
  const route = loadRoute({ db });

  await route.POST(
    new Request('https://portal.test/api/rtr', {
      method: 'POST',
      body: JSON.stringify(payload({ vendor_contact_email: 'recruiter@agency.com' })),
    })
  );

  assert.equal(tables.rtr_documents[0].vendor_contact_email, 'recruiter@agency.com');
  assert.equal(tables.job_submissions[0].vendor_contact_email, 'recruiter@agency.com');
});

test('the agreement file travels as multipart form data and is stored on the record', async () => {
  const tables = {
    candidates: [{ id: CANDIDATE_ID, full_name: 'Chandra Reddy' }],
    job_submissions: [],
    rtr_documents: [],
  };
  const { db } = createFakeDb(tables);
  const route = loadRoute({ db });

  const form = new FormData();
  form.append('payload', JSON.stringify(payload({ filename: 'scan.png', mime_type: 'image/png' })));
  form.append('file', new File([new Uint8Array([1, 2, 3, 4])], 'scan.png', { type: 'image/png' }));

  const res = await route.POST(new Request('https://portal.test/api/rtr', { method: 'POST', body: form }));
  const body = await res.json();

  assert.equal(res.status, 200);
  assert.equal(tables.rtr_documents[0].filename, 'scan.png');
  assert.equal(tables.rtr_documents[0].mime_type, 'image/png');
  assert.equal(tables.rtr_documents[0].base64, Buffer.from([1, 2, 3, 4]).toString('base64'));
  assert.ok(body.submission_id);
});
