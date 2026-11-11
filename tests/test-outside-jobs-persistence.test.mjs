import test from 'node:test';
import assert from 'node:assert/strict';
import { moduleLoader, fixtureDatabase } from './helpers/load-ts-module.mjs';
import { randomUUID } from 'node:crypto';

class CaptureError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function setupOutsideJobsTest() {
  const actorId = '10000000-0000-4000-8000-000000000101';
  const candidateId = '10000000-0000-4000-8000-000000000301';
  
  const tables = {
    profiles: [
      { id: actorId, role: 'client', email: 'bhargavreddy.m@gmail.com', status: 'active' }
    ],
    candidates: [
      {
        id: candidateId,
        user_id: actorId,
        full_name: 'Bhargav Reddy',
        email: 'bhargavreddy.m@gmail.com',
        primary_skills: 'Python, TypeScript, React, Full Stack',
        version: 1
      }
    ],
    jobs: [],
    outside_jobs: [],
    job_submissions: [],
    extension_submission_events: [],
    application_intents: []
  };

  const fixture = fixtureDatabase(tables);

  const db = {
    from(tableName) {
      const q = fixture.from(tableName);
      q.insert = (record) => {
        const id = record.id || randomUUID();
        const row = { id, ...record };
        tables[tableName].push(row);
        return {
          select: () => ({
            single: async () => ({ data: row, error: null }),
            maybeSingle: async () => ({ data: row, error: null })
          })
        };
      };
      q.update = (updates) => {
        const query = {
          filters: {},
          eq(field, val) {
            query.filters[field] = val;
            return query;
          },
          select() {
            return {
              single: async () => {
                const rows = tables[tableName].filter(r => Object.entries(query.filters).every(([k, v]) => r[k] === v));
                rows.forEach(r => Object.assign(r, updates));
                return { data: rows[0] || null, error: null };
              },
              maybeSingle: async () => {
                const rows = tables[tableName].filter(r => Object.entries(query.filters).every(([k, v]) => r[k] === v));
                rows.forEach(r => Object.assign(r, updates));
                return { data: rows[0] || null, error: null };
              }
            };
          },
          then(resolve) {
            const rows = tables[tableName].filter(r => {
              return Object.entries(query.filters).every(([k, v]) => r[k] === v);
            });
            rows.forEach(r => Object.assign(r, updates));
            return resolve({ data: rows[0] || null, error: null });
          }
        };
        return query;
      };
      return q;
    },
    async rpc(name, args) {
      if (name === 'record_extension_submission') {
        const jobId = randomUUID();
        const job = {
          id: jobId,
          title: args.p_fields.jobTitle,
          company: args.p_fields.companyName,
          application_url: args.p_fields.jobUrl,
          description: args.p_fields.jobDescription,
          portal_source: args.p_fields.portalSource,
          is_external: true
        };
        tables.jobs.push(job);

        const submissionId = randomUUID();
        const submission = {
          id: submissionId,
          candidate_id: args.p_candidate,
          job_id: jobId,
          status: 'Applied',
          notes: args.p_fields.notes,
          applied_resume: args.p_fields.appliedResume,
          duplicate_flag: false
        };
        tables.job_submissions.push(submission);

        tables.extension_submission_events.push({
          event_key: args.p_event_key,
          actor_id: args.p_actor,
          candidate_id: args.p_candidate,
          submission_id: submissionId
        });

        return {
          data: {
            submission,
            duplicate: false,
            replayed: false
          },
          error: null
        };
      }
      return { data: null, error: null };
    }
  };

  const loadModule = moduleLoader({
    '@/lib/db/admin': {
      database: () => db,
      CaptureError,
      checkDb: e => { if (e) throw new CaptureError(e.message, 500); }
    },
    '@/lib/capture/server': {
      extensionProfile: async () => ({ id: actorId, role: 'client', email: 'bhargavreddy.m@gmail.com', status: 'active' }),
      cors: (_r, res) => res,
      extensionRoute: async (_r, work) => {
        try {
          return Response.json(await work());
        } catch (e) {
          return Response.json({ error: e.message }, { status: e.status || 400 });
        }
      }
    }
  });

  const saveJobRoute = loadModule('src/app/api/extension/save-external-job/route.ts');
  const autoSubmitRoute = loadModule('src/app/api/extension/auto-submit/route.ts');

  return { tables, saveJobRoute, autoSubmitRoute, actorId, candidateId };
}

test('Outside Job Pipeline: save-external-job stores outside job posting into database', async () => {
  const { tables, saveJobRoute } = setupOutsideJobsTest();

  const req = new Request('https://portal.test/api/extension/save-external-job', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Senior Software Developer (Full Stack) - Python',
      company: 'Foxsense Innovations',
      jobUrl: 'https://foxsense.keka.com/careers/applyjob/128660?source=linkedin',
      location: 'Coimbatore, Tamil Nadu, India',
      description: 'We are seeking a Senior Full Stack Python Developer with React and PostgreSQL experience.',
      portalSource: 'Foxsense Careers'
    })
  });

  const res = await saveJobRoute.POST(req);
  const data = await res.json();
  if (res.status !== 200) console.log('saveJobRoute error:', data);
  assert.equal(res.status, 200);
  assert.equal(data.success, true);
  assert.ok(data.jobId);

  // Check jobs table
  assert.equal(tables.jobs.length, 1);
  const savedJob = tables.jobs[0];
  assert.equal(savedJob.title, 'Senior Software Developer (Full Stack) - Python');
  assert.equal(savedJob.company, 'Foxsense Innovations');
  assert.equal(savedJob.is_external, true);
});

test('Outside Job Pipeline: auto-submit stores outside application into public.job_submissions as Applied', async () => {
  const { tables, autoSubmitRoute, candidateId } = setupOutsideJobsTest();

  const req = new Request('https://portal.test/api/extension/auto-submit', {
    method: 'POST',
    body: JSON.stringify({
      candidateId: candidateId,
      eventKey: '10000000-0000-4000-8000-000000000999',
      attempt: 1,
      companyName: 'Foxsense Innovations',
      jobTitle: 'Senior Software Developer (Full Stack) - Python',
      jobUrl: 'https://foxsense.keka.com/careers/applyjob/128660?source=linkedin',
      portalSource: 'Foxsense Careers',
      jobDescription: 'Full Stack Python Developer with React and PostgreSQL experience.',
      status: 'Applied',
      evidence: 'Application submitted successfully on foxsense.keka.com',
      appliedResume: {
        filename: 'Bhargav_Reddy_Resume.pdf',
        mimeType: 'application/pdf',
        isTailored: false,
        matchScore: 100,
        appliedAt: new Date().toISOString()
      }
    })
  });

  const res = await autoSubmitRoute.POST(req);
  const data = await res.json();
  if (res.status !== 200) console.log('autoSubmitRoute error:', data);
  assert.equal(res.status, 200);
  assert.equal(data.success, true);
  assert.equal(data.submission.status, 'Applied');

  // Verify submission in table
  assert.equal(tables.job_submissions.length, 1);
  const submission = tables.job_submissions[0];
  assert.equal(submission.status, 'Applied');
  assert.equal(submission.candidate_id, candidateId);
});
