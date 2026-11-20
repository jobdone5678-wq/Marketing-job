import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';
import { registerHooks } from 'node:module';
import { applicationUrlKey } from '../src/lib/jobs/application-state.ts';

// Next.js resolves this extensionless TypeScript import. Resolve it in Node's test runner too.
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(specifier === '../jobs/application-state' ? specifier + '.ts' : specifier, context);
  },
});
const { allowedCaptureUrl, validateObservation } = await import('../src/lib/capture/validation.ts');
hooks.deregister();

function loadSource(path, dependencies) {
  const file = new URL('../src/' + path + '.ts', import.meta.url);
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  runInNewContext(code, { exports, URL, Response, Buffer, crypto, console, require: name => dependencies[name] });
  return exports;
}

const loadRoute = (path, dependencies) => loadSource('app/api/' + path + '/route', dependencies);

test('Submission Events: POST /api/applications/submission-events writes atomically and enforces candidate ownership', async () => {
  const actor = { id: '00000000-0000-4000-8000-000000000001', role: 'candidate', status: 'active' };
  const candidateId = '11111111-1111-4000-8000-111111111111';
  const eventKey = '22222222-2222-4000-8000-222222222222';
  const jobUrl = 'https://jobs.lever.co/acme/software-engineer';
  const confirmationUrl = 'https://jobs.lever.co/acme/software-engineer/thanks';

  let rpcCalledWith = null;

  const db = {
    from(table) {
      return {
        select() { return this; },
        eq(col, val) {
          if (table === 'candidates' && col === 'id') {
            assert.equal(val, candidateId);
          }
          return this;
        },
        order() { return this; },
        limit() { return this; },
        async maybeSingle() {
          if (table === 'candidates') {
            return { data: { id: candidateId, version: 1, user_id: actor.id } };
          }
          return { data: null };
        },
        then(resolve) { resolve({ data: [] }); },
      };
    },
    async rpc(fn, args) {
      if (fn === 'record_extension_submission') {
        rpcCalledWith = args;
        return {
          data: {
            submission: {
              id: args.p_event_key,
              candidate_id: args.p_candidate,
              company_name: args.p_fields.companyName,
              job_title: args.p_fields.jobTitle,
              job_url: args.p_fields.jobUrl,
              status: 'Applied',
              capture_status: 'submitted',
            },
            duplicate: false,
            code: null,
            replayed: false,
            job_id: 'job-123',
          },
          error: null,
        };
      }
      return { data: null, error: null };
    },
  };

  const { POST } = loadRoute('applications/submission-events', {
    '@/lib/capture/server': {
      extensionProfile: async () => actor,
      extensionRoute: async (_request, work) => {
        try { return Response.json(await work()); }
        catch (error) { return Response.json({ error: error.message }, { status: error.status || 500 }); }
      },
      cors: (_req, res) => res,
      markOutsideJobsApplied: async () => {},
    },
    '@/lib/db/admin': {
      database: () => db, checkDb: assert.ifError,
      CaptureError: class extends Error { constructor(message, status) { super(message); this.status = status; } },
    },
    '@/lib/capture/snapshot': { validateApplicationAnswers: a => a },
    '@/lib/capture/validation': { allowedCaptureUrl, validateObservation },
    '@/lib/capture/applied-resume': { appliedResumeSchema: z.unknown(), saveAppliedResume: async () => null },
    '@/lib/jobs/application-state': { applicationUrlKey },
    zod: { z },
    '@/app/api/extension/auto-submit/route': loadRoute('extension/auto-submit', {
      '@/lib/capture/server': {
        extensionProfile: async () => actor,
        extensionRoute: async (_request, work) => {
          try { return Response.json(await work()); }
          catch (error) { return Response.json({ error: error.message }, { status: error.status || 500 }); }
        },
        cors: (_req, res) => res,
        markOutsideJobsApplied: async () => {},
      },
      '@/lib/db/admin': {
        database: () => db, checkDb: assert.ifError,
        CaptureError: class extends Error { constructor(message, status) { super(message); this.status = status; } },
      },
      '@/lib/capture/snapshot': { validateApplicationAnswers: a => a },
      '@/lib/capture/validation': { allowedCaptureUrl, validateObservation },
      '@/lib/capture/applied-resume': { appliedResumeSchema: z.unknown(), saveAppliedResume: async () => null },
      '@/lib/jobs/application-state': { applicationUrlKey },
      zod: { z },
    }),
  });

  const response = await POST(new Request('https://www.nextkinhr.com/api/applications/submission-events', {
    method: 'POST',
    body: JSON.stringify({
      candidateId,
      eventKey,
      companyName: 'Acme Corp',
      jobTitle: 'Software Engineer',
      jobUrl,
      confirmationUrl,
      evidence: 'Application submitted successfully',
      manualAttestation: false,
    }),
  }));

  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.success, true);
  assert.equal(data.submission.status, 'Applied');
  assert.equal(data.replayed, false);

  // Verify RPC was called with trusted actor.id (never client-supplied user)
  assert.equal(rpcCalledWith.p_actor, actor.id);
  assert.equal(rpcCalledWith.p_candidate, candidateId);
  assert.equal(rpcCalledWith.p_event_key, eventKey);
  assert.equal(rpcCalledWith.p_fields.companyName, 'Acme Corp');
  assert.equal(rpcCalledWith.p_fields.jobTitle, 'Software Engineer');
});

test('Submission Events: Idempotent replay returns HTTP 200 with { duplicate: true, code: IDEMPOTENT_SUBMISSION_EXISTS }', async () => {
  const actor = { id: '00000000-0000-4000-8000-000000000001', role: 'candidate', status: 'active' };
  const candidateId = '11111111-1111-4000-8000-111111111111';
  const eventKey = '22222222-2222-4000-8000-222222222222';
  const jobUrl = 'https://jobs.lever.co/acme/software-engineer';
  const confirmationUrl = 'https://jobs.lever.co/acme/software-engineer/thanks';

  const db = {
    from(table) {
      return {
        select() { return this; },
        eq() { return this; },
        order() { return this; },
        limit() { return this; },
        async maybeSingle() {
          if (table === 'candidates') {
            return { data: { id: candidateId, version: 1, user_id: actor.id } };
          }
          return { data: null };
        },
        then(resolve) { resolve({ data: [] }); },
      };
    },
    async rpc(fn, args) {
      if (fn === 'record_extension_submission') {
        // Return idempotent replay result
        return {
          data: {
            submission: {
              id: args.p_event_key,
              candidate_id: args.p_candidate,
              company_name: args.p_fields.companyName,
              job_title: args.p_fields.jobTitle,
              status: 'Applied',
              capture_status: 'submitted',
            },
            duplicate: true,
            code: 'IDEMPOTENT_SUBMISSION_EXISTS',
            replayed: true,
            job_id: 'job-123',
          },
          error: null,
        };
      }
      return { data: null, error: null };
    },
  };

  const autoSubmitRoute = loadRoute('extension/auto-submit', {
    '@/lib/capture/server': {
      extensionProfile: async () => actor,
      extensionRoute: async (_request, work) => {
        try { return Response.json(await work()); }
        catch (error) { return Response.json({ error: error.message }, { status: error.status || 500 }); }
      },
      cors: (_req, res) => res,
      markOutsideJobsApplied: async () => {},
    },
    '@/lib/db/admin': {
      database: () => db, checkDb: assert.ifError,
      CaptureError: class extends Error { constructor(message, status) { super(message); this.status = status; } },
    },
    '@/lib/capture/snapshot': { validateApplicationAnswers: a => a },
    '@/lib/capture/validation': { allowedCaptureUrl, validateObservation },
    '@/lib/capture/applied-resume': { appliedResumeSchema: z.unknown(), saveAppliedResume: async () => null },
    '@/lib/jobs/application-state': { applicationUrlKey },
    zod: { z },
  });

  const { POST } = loadRoute('applications/submission-events', {
    '@/app/api/extension/auto-submit/route': autoSubmitRoute,
  });

  const response = await POST(new Request('https://www.nextkinhr.com/api/applications/submission-events', {
    method: 'POST',
    body: JSON.stringify({
      candidateId,
      eventKey,
      companyName: 'Acme Corp',
      jobTitle: 'Software Engineer',
      jobUrl,
      confirmationUrl,
      evidence: 'Application submitted successfully',
      manualAttestation: false,
    }),
  }));

  // Assert HTTP 200 OK
  assert.equal(response.status, 200);
  const data = await response.json();
  // Assert idempotency payload requirements
  assert.equal(data.duplicate, true);
  assert.equal(data.code, 'IDEMPOTENT_SUBMISSION_EXISTS');
  assert.equal(data.replayed, true);
  assert.equal(data.success, true);
  assert.ok(data.submission);
});

test('Submission Events: Client-supplied userId mismatch is rejected with 403', async () => {
  const actor = { id: '00000000-0000-4000-8000-000000000001', role: 'candidate', status: 'active' };
  const candidateId = '11111111-1111-4000-8000-111111111111';
  const eventKey = '22222222-2222-4000-8000-222222222222';

  const db = {
    from() { return { select() { return this; }, eq() { return this; }, maybeSingle() { return { data: null }; } }; },
  };

  const autoSubmitRoute = loadRoute('extension/auto-submit', {
    '@/lib/capture/server': {
      extensionProfile: async () => actor,
      extensionRoute: async (_request, work) => {
        try { return Response.json(await work()); }
        catch (error) { return Response.json({ error: error.message }, { status: error.status || 500 }); }
      },
      cors: (_req, res) => res,
      markOutsideJobsApplied: async () => {},
    },
    '@/lib/db/admin': {
      database: () => db, checkDb: assert.ifError,
      CaptureError: class extends Error { constructor(message, status) { super(message); this.status = status; } },
    },
    '@/lib/capture/snapshot': {},
    '@/lib/capture/validation': { allowedCaptureUrl, validateObservation },
    '@/lib/capture/applied-resume': { appliedResumeSchema: z.unknown(), saveAppliedResume: async () => null },
    '@/lib/jobs/application-state': { applicationUrlKey },
    zod: { z },
  });

  const { POST } = loadRoute('applications/submission-events', {
    '@/app/api/extension/auto-submit/route': autoSubmitRoute,
  });

  const response = await POST(new Request('https://www.nextkinhr.com/api/applications/submission-events', {
    method: 'POST',
    body: JSON.stringify({
      userId: 'spoofed-attacker-user-id',
      candidateId,
      eventKey,
      companyName: 'Acme Corp',
      jobTitle: 'Software Engineer',
      jobUrl: 'https://jobs.lever.co/acme/software-engineer',
      confirmationUrl: 'https://jobs.lever.co/acme/software-engineer/thanks',
      evidence: 'Application submitted successfully',
      manualAttestation: false,
    }),
  }));

  assert.equal(response.status, 403);
  const data = await response.json();
  assert.ok(data.error.includes('Client-supplied user ID does not match authenticated user'));
});

test('Submission Events: Candidate not owned by actor is rejected with 403', async () => {
  const actor = { id: '00000000-0000-4000-8000-000000000001', role: 'candidate', status: 'active' };
  const candidateId = '11111111-1111-4000-8000-111111111111';
  const otherUserId = '99999999-9999-4000-8000-999999999999';

  const db = {
    from(table) {
      return {
        select() { return this; },
        eq() { return this; },
        order() { return this; },
        limit() { return this; },
        async maybeSingle() {
          if (table === 'candidates') {
            // Candidate owned by someone else!
            return { data: { id: candidateId, version: 1, user_id: otherUserId } };
          }
          return { data: null };
        },
        then(resolve) { resolve({ data: [] }); },
      };
    },
    async rpc(fn) {
      if (fn === 'candidate_actor_can_access') {
        return { data: false, error: null };
      }
      return { data: null, error: null };
    },
  };

  const autoSubmitRoute = loadRoute('extension/auto-submit', {
    '@/lib/capture/server': {
      extensionProfile: async () => actor,
      extensionRoute: async (_request, work) => {
        try { return Response.json(await work()); }
        catch (error) { return Response.json({ error: error.message }, { status: error.status || 500 }); }
      },
      cors: (_req, res) => res,
      markOutsideJobsApplied: async () => {},
    },
    '@/lib/db/admin': {
      database: () => db, checkDb: assert.ifError,
      CaptureError: class extends Error { constructor(message, status) { super(message); this.status = status; } },
    },
    '@/lib/capture/snapshot': {},
    '@/lib/capture/validation': { allowedCaptureUrl, validateObservation },
    '@/lib/capture/applied-resume': { appliedResumeSchema: z.unknown(), saveAppliedResume: async () => null },
    '@/lib/jobs/application-state': { applicationUrlKey },
    zod: { z },
  });

  const { POST } = loadRoute('applications/submission-events', {
    '@/app/api/extension/auto-submit/route': autoSubmitRoute,
  });

  const response = await POST(new Request('https://www.nextkinhr.com/api/applications/submission-events', {
    method: 'POST',
    body: JSON.stringify({
      candidateId,
      eventKey: '22222222-2222-4000-8000-222222222222',
      companyName: 'Acme Corp',
      jobTitle: 'Software Engineer',
      jobUrl: 'https://jobs.lever.co/acme/software-engineer',
      confirmationUrl: 'https://jobs.lever.co/acme/software-engineer/thanks',
      evidence: 'Application submitted successfully',
      manualAttestation: false,
    }),
  }));

  assert.equal(response.status, 403);
  const data = await response.json();
  assert.ok(data.error.includes('Candidate access denied'));
});

test('Submission Events: Webhook alias /api/webhooks/application-submitted forwards to submission-events', async () => {
  const actor = { id: '00000000-0000-4000-8000-000000000001', role: 'candidate', status: 'active' };
  const candidateId = '11111111-1111-4000-8000-111111111111';
  const eventKey = '22222222-2222-4000-8000-222222222222';
  const jobUrl = 'https://jobs.lever.co/acme/software-engineer';
  const confirmationUrl = 'https://jobs.lever.co/acme/software-engineer/thanks';

  const db = {
    from(table) {
      return {
        select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return this; },
        async maybeSingle() {
          if (table === 'candidates') return { data: { id: candidateId, version: 1, user_id: actor.id } };
          return { data: null };
        },
        then(resolve) { resolve({ data: [] }); },
      };
    },
    async rpc(fn, args) {
      if (fn === 'record_extension_submission') {
        return {
          data: {
            submission: { id: args.p_event_key, candidate_id: args.p_candidate, status: 'Applied' },
            duplicate: false, code: null, replayed: false, job_id: 'job-123',
          },
          error: null,
        };
      }
      return { data: null, error: null };
    },
  };

  const autoSubmitRoute = loadRoute('extension/auto-submit', {
    '@/lib/capture/server': {
      extensionProfile: async () => actor,
      extensionRoute: async (_request, work) => {
        try { return Response.json(await work()); }
        catch (error) { return Response.json({ error: error.message }, { status: error.status || 500 }); }
      },
      cors: (_req, res) => res,
      markOutsideJobsApplied: async () => {},
    },
    '@/lib/db/admin': {
      database: () => db, checkDb: assert.ifError,
      CaptureError: class extends Error { constructor(message, status) { super(message); this.status = status; } },
    },
    '@/lib/capture/snapshot': { validateApplicationAnswers: a => a },
    '@/lib/capture/validation': { allowedCaptureUrl, validateObservation },
    '@/lib/capture/applied-resume': { appliedResumeSchema: z.unknown(), saveAppliedResume: async () => null },
    '@/lib/jobs/application-state': { applicationUrlKey },
    zod: { z },
  });

  const submissionEventsRoute = loadRoute('applications/submission-events', {
    '@/app/api/extension/auto-submit/route': autoSubmitRoute,
  });

  const { POST } = loadRoute('webhooks/application-submitted', {
    '@/app/api/applications/submission-events/route': submissionEventsRoute,
  });

  const response = await POST(new Request('https://www.nextkinhr.com/api/webhooks/application-submitted', {
    method: 'POST',
    body: JSON.stringify({
      candidateId,
      eventKey,
      companyName: 'Acme Corp',
      jobTitle: 'Software Engineer',
      jobUrl,
      confirmationUrl,
      evidence: 'Application submitted successfully',
      manualAttestation: false,
    }),
  }));

  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.success, true);
  assert.equal(data.submission.status, 'Applied');
});
