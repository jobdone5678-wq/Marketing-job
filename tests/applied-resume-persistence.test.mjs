import test from 'node:test';
import assert from 'node:assert/strict';
import { recruitingDatabase } from './helpers/recruiting-db.mjs';
import { readdir, readFile } from 'node:fs/promises';

test('database migration adds applied_resume column and record_extension_submission persists it', async () => {
  const files = (await readdir(new URL('../supabase/migrations/', import.meta.url)))
    .filter(n => (/^20261009\d{6}_|^20261011\d{6}_/.test(n)) && !n.includes('foundation')).sort();
  const db = await recruitingDatabase([
    ...files,
    '20261019000100_application_resume_versions.sql',
    '20261019000200_job_submission_applied_resumes.sql',
  ]);
  try {
    const actor = '20000000-0000-4000-8000-000000000001';
    const candidate = '20000000-0000-4000-8000-000000000002';
    const eventKey = '20000000-0000-4000-8000-000000000003';

    await db.query("INSERT INTO auth.users VALUES($1,'recruiter@example.test','{}')", [actor]);
    await db.query("UPDATE profiles SET role='recruiter',status='active' WHERE id=$1", [actor]);
    await db.query("INSERT INTO candidates(id,user_id,assigned_recruiter_id,full_name,provenance_status) VALUES($1,$2,$2,'Arjun Mehta','confirmed')", [candidate, actor]);

    const appliedResumeData = {
      filename: 'Arjun_Mehta_IT_Support_Tailored.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      base64: 'UEsDBBQAAAAIA...',
      markdown: '# ARJUN MEHTA\nProduction Support Analyst',
      isTailored: true,
      matchScore: 88,
      appliedAt: '2026-10-19T12:00:00Z',
    };

    const res = await db.query(
      `SELECT public.record_extension_submission(
        $1::uuid,
        $2::uuid,
        $3::uuid,
        1,
        $4::jsonb
      ) AS result`,
      [
        actor,
        candidate,
        eventKey,
        JSON.stringify({
          companyName: 'Acme Health',
          jobTitle: 'Production Support Specialist',
          jobUrl: 'https://careers.acme.test/jobs/123',
          portalSource: 'Workday',
          appliedResume: appliedResumeData,
        }),
      ]
    );

    const result = res.rows[0].result;
    assert.equal(result.duplicate, false);
    assert.equal(result.replayed, false);
    assert.ok(result.submission);
    assert.equal(result.submission.company_name, 'Acme Health');
    assert.equal(result.submission.job_title, 'Production Support Specialist');
    assert.deepEqual(result.submission.applied_resume, appliedResumeData);

    // Verify row directly in job_submissions
    const rowRes = await db.query('SELECT applied_resume FROM public.job_submissions WHERE id = $1', [result.submission.id]);
    assert.equal(rowRes.rows.length, 1);
    assert.deepEqual(rowRes.rows[0].applied_resume, appliedResumeData);
  } finally {
    await db.close();
  }
});

test('submissionStore includes applied_resume in editableFields and writeFields', async () => {
  const { submissionStore } = await import('../src/lib/submission-store.ts');
  const { createClient } = await import('@supabase/supabase-js');

  let insertedPayload = null;
  const mockClient = createClient('https://test.supabase.co', 'fake-anon-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (_url, options) => {
        if (options?.method === 'POST') {
          insertedPayload = JSON.parse(options.body);
          return Response.json({
            id: 'sub-1',
            candidate_id: 'cand-1',
            company_name: 'Tech Corp',
            job_title: 'Senior Developer',
            status: 'Applied',
            applied_resume: insertedPayload.applied_resume,
            duplicate_flag: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
        return Response.json([]);
      },
    },
  });

  const store = submissionStore(mockClient);
  const sampleResume = {
    filename: 'Test_Candidate_Resume.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    base64: 'dGVzdA==',
    isTailored: true,
    matchScore: 92,
  };

  const writeRes = await store.createSubmission({
    candidate_id: 'cand-1',
    company_name: 'Tech Corp',
    job_title: 'Senior Developer',
    status: 'Applied',
    applied_resume: sampleResume,
  });

  assert.ok(writeRes.data);
  assert.deepEqual(insertedPayload?.applied_resume, sampleResume);
});

test('browser extension content.js defines appliedResume payload in logSubmission', async () => {
  const contentJs = await readFile(new URL('../browser-extension/content.js', import.meta.url), 'utf8');

  // Verify appliedResume is constructed and attached to payload in logSubmission
  assert.ok(contentJs.includes('let appliedResume = null;'));
  assert.ok(contentJs.includes('tailoredResumeFile && (tailoredResumeFile.base64 || tailoredResumeFile.docxBase64)'));
  assert.ok(contentJs.includes('appliedResume = {'));
  assert.ok(contentJs.includes('candidate?.resume_file && candidate.resume_file.base64'));
  assert.ok(contentJs.includes('appliedResume\n      };') || contentJs.includes('appliedResume,') || contentJs.includes('appliedResume\r\n      };'));
});

test('GET /api/submissions/[id]/applied-resume returns JSON snapshot and supports direct file download', async () => {
  const { moduleLoader, fixtureDatabase } = await import('./helpers/load-ts-module.mjs');
  const submissionId = '30000000-0000-4000-8000-000000000001';
  const candidateId = '30000000-0000-4000-8000-000000000002';

  const sampleApplied = {
    filename: 'Arjun_Mehta_Applied_Resume.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    base64: Buffer.from('Synthetic DOCX binary content').toString('base64'),
    markdown: '# Arjun Mehta\nSoftware Engineer',
    isTailored: true,
    matchScore: 89,
    appliedAt: '2026-10-19T12:00:00Z',
  };

  const tables = {
    job_submissions: [
      {
        id: submissionId,
        candidate_id: candidateId,
        company_name: 'Acme Health',
        job_title: 'Software Engineer',
        applied_resume: sampleApplied,
      },
    ],
    application_resume_versions: [],
    candidate_documents: [],
  };

  const fixture = fixtureDatabase(tables);
  const load = moduleLoader({
    '@/lib/db/admin': {
      database: () => fixture,
      checkDb: err => { if (err) throw new Error(err.message); },
      CaptureError: class extends Error { constructor(m, s = 400) { super(m); this.status = s; } },
    },
    '@/lib/http/protected-route': {
      protectedRoute: async (_req, _role, handler) => {
        const result = await handler({ id: 'actor-1', role: 'recruiter', status: 'active' });
        if (result instanceof Response) return result;
        return Response.json(result);
      },
    },
    '@/lib/resumes/repository': {
      candidateAccess: async () => ({ id: candidateId, full_name: 'Arjun Mehta' }),
    },
  });

  const route = load('src/app/api/submissions/[id]/applied-resume/route.ts');

  // 1. JSON Snapshot request
  const jsonReq = new Request(`https://portal.test/api/submissions/${submissionId}/applied-resume`);
  const jsonRes = await route.GET(jsonReq, { params: Promise.resolve({ id: submissionId }) });
  assert.equal(jsonRes.status, 200);
  const jsonData = await jsonRes.json();
  assert.equal(jsonData.success, true);
  assert.equal(jsonData.submissionId, submissionId);
  assert.deepEqual(jsonData.appliedResume, sampleApplied);

  // 2. Binary Download request (?download=1)
  const dlReq = new Request(`https://portal.test/api/submissions/${submissionId}/applied-resume?download=1`);
  const dlRes = await route.GET(dlReq, { params: Promise.resolve({ id: submissionId }) });
  assert.equal(dlRes.status, 200);
  assert.equal(dlRes.headers.get('Content-Type'), sampleApplied.mimeType);
  assert.ok(dlRes.headers.get('Content-Disposition')?.includes('Arjun_Mehta_Applied_Resume.docx'));
  const bodyText = await dlRes.text();
  assert.equal(bodyText, 'Synthetic DOCX binary content');
});
