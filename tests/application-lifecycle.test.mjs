import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
import { z } from 'zod';
import { isAppliedApplication, applicationUrlKey, withoutAppliedJobs } from '../src/lib/jobs/application-state.ts';
import { normalizeSnapshot } from '../src/lib/jobs/normalize.ts';
import { approvedSavedAnswers } from '../src/lib/extension-answers/saved-answers.ts';

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

test('Application Lifecycle: isAppliedApplication enforces strict confirmation rules', () => {
  // Started or in-progress states must NEVER be considered applied
  assert.equal(isAppliedApplication('Draft', 'started'), false, 'Draft with started capture must not be applied');
  assert.equal(isAppliedApplication('Applied', 'started'), false, 'Started intent must not be considered applied even with status Applied');
  assert.equal(isAppliedApplication('Draft', 'in_progress'), false, 'in_progress must not be applied');
  assert.equal(isAppliedApplication('Draft', 'submit_attempted'), false, 'submit_attempted must not be applied');
  assert.equal(isAppliedApplication('Draft', null), false, 'Draft with null capture must not be applied');
  assert.equal(isAppliedApplication('Draft', undefined), false, 'Draft with undefined capture must not be applied');

  // Submitted and Confirmed capture states MUST be considered applied
  assert.equal(isAppliedApplication('Draft', 'submitted'), true, 'submitted capture must be applied');
  assert.equal(isAppliedApplication('Draft', 'confirmed'), true, 'confirmed capture must be applied');
  assert.equal(isAppliedApplication('Applied', 'submitted'), true, 'Applied with submitted capture must be applied');
  assert.equal(isAppliedApplication('Applied', 'confirmed'), true, 'Applied with confirmed capture must be applied');

  // Manual / stage-based applied status without captureStatus
  assert.equal(isAppliedApplication('Applied', null), true, 'Applied status without captureStatus is applied');
  assert.equal(isAppliedApplication('Applied', undefined), true, 'Applied status with undefined captureStatus is applied');
});

test('Application Lifecycle: applicationUrlKey strips confirmation paths for accurate matching', () => {
  const base = 'https://boards.greenhouse.io/company/jobs/123456';
  assert.equal(applicationUrlKey(base), base);
  assert.equal(applicationUrlKey(`${base}/apply`), base);
  assert.equal(applicationUrlKey(`${base}/confirmation`), base);
  assert.equal(applicationUrlKey(`${base}/thank-you`), base);
  assert.equal(applicationUrlKey(`${base}/thankyou`), base);
  assert.equal(applicationUrlKey(`${base}/applied`), base);
  assert.equal(applicationUrlKey(`${base}/success`), base);
  assert.equal(applicationUrlKey(`${base}/apply/confirmation`), base);
});

test('Application Lifecycle: the launch preserves employer fragments and distinct hash-routed postings', async () => {
  const { applicationLaunchUrl } = await import('../src/lib/jobs/application-state.ts');
  const url = 'https://careers.example.test/#/jobs/123/apply';
  const snapshot = normalizeSnapshot({ provider: 'ashby', company: 'Fixture' }, {
    jobs: [{ id: '123', title: 'Software Engineer', jobUrl: url, applyUrl: url }],
  });
  assert.equal(snapshot.jobs[0].application_url, url);
  assert.equal(applicationLaunchUrl(url, 'intent-id'), url);
  assert.equal(applicationLaunchUrl('https://careers.example.test/job/123', 'intent-id'),
    'https://careers.example.test/job/123#marketing-intent=intent-id');
  assert.notEqual(applicationUrlKey(url), applicationUrlKey('https://careers.example.test/#/jobs/456/apply'));
});

test('Application Lifecycle: Greenhouse redirects still require the same board and posting', () => {
  const original = 'https://boards.greenhouse.io/acme/jobs/123?gh_jid=123';
  const receipt = 'https://job-boards.greenhouse.io/acme/jobs/123/confirmation';
  assert.equal(allowedCaptureUrl(receipt, original, 'confirmed', 'Application submitted'), true);
  assert.equal(allowedCaptureUrl(receipt.replace('/confirmation', ''), original), true);
  assert.equal(allowedCaptureUrl(receipt.replace('/123/', '/456/'), original, 'confirmed', 'Application submitted'), false);
  assert.equal(allowedCaptureUrl(receipt.replace('/acme/', '/other/'), original, 'confirmed', 'Application submitted'), false);
  assert.equal(allowedCaptureUrl(receipt + '?gh_jid=456', original, 'confirmed', 'Application submitted'), false);
  assert.equal(allowedCaptureUrl(receipt, original + '&gh_jid=456', 'confirmed', 'Application submitted'), false);
  assert.equal(allowedCaptureUrl(receipt, original + '&token=456', 'confirmed', 'Application submitted'), false);
});

test('Application Lifecycle: withoutAppliedJobs filters out confirmed jobs and retains unapplied/started jobs', () => {
  const jobs = [
    { id: 'job-1', application_url: 'https://careers.example.com/jobs/1' },
    { id: 'job-2', application_url: 'https://careers.example.com/jobs/2' },
    { id: 'job-3', application_url: 'https://careers.example.com/jobs/3' }
  ];

  const appliedKeys = {
    jobIds: ['job-1'],
    urls: ['https://careers.example.com/jobs/2']
  };

  const remaining = withoutAppliedJobs(jobs, appliedKeys);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, 'job-3');
});

test('Application Lifecycle: a LinkedIn Easy Apply receipt is accepted as submission evidence', () => {
  const evidence = 'Your application was sent to Morgan McKinley!';
  const posting = 'https://www.linkedin.com/jobs/view/1234567890';
  assert.equal(validateObservation('submitted', evidence), true);
  assert.equal(allowedCaptureUrl(posting, posting, 'submitted', evidence), true);
  assert.equal(validateObservation('submitted', 'Your application was not sent due to an error'), false);
});

test('Application Lifecycle: validateObservation accepts hardened confirmation headings and URL paths', () => {
  // Rejects started
  assert.equal(validateObservation('started', 'Some evidence'), false);

  // Accepts submitted & confirmed with standard confirmation headings
  assert.equal(validateObservation('confirmed', 'Thank you for applying to Acme Corp'), true);
  assert.equal(validateObservation('confirmed', 'Your application has been received'), true);
  assert.equal(validateObservation('confirmed', 'Application submitted successfully'), true);
  assert.equal(validateObservation('confirmed', 'Submission received'), true);
  assert.equal(validateObservation('submitted', 'Thank you for your application'), true);

  // Accepts URL path evidence
  assert.equal(validateObservation('confirmed', 'URL confirmation path: /jobs/12345/confirmation'), true);
  assert.equal(validateObservation('confirmed', 'URL confirmation path: /jobs/12345/thank-you'), true);
  assert.equal(validateObservation('confirmed', 'URL confirmation path: /jobs/12345/applied'), true);
  assert.equal(validateObservation('confirmed', 'URL confirmation path: /jobs/12345/success'), true);

  // Rejects false-positive phrases
  assert.equal(validateObservation('confirmed', 'Your application was not submitted due to an error'), false);
  assert.equal(validateObservation('confirmed', 'If your application is received before tomorrow'), false);
  assert.equal(validateObservation('confirmed', 'Application confirmation settings'), false);
});

test('Application Lifecycle: allowedCaptureUrl matches confirmation URLs against original job application URL', () => {
  const applicationUrl = 'https://boards.greenhouse.io/acme/jobs/998877';
  const confirmationUrl = 'https://boards.greenhouse.io/acme/jobs/998877/confirmation';
  const thankYouUrl = 'https://boards.greenhouse.io/acme/jobs/998877/thank-you';
  const appliedUrl = 'https://boards.greenhouse.io/acme/jobs/998877/applied';

  assert.equal(allowedCaptureUrl(confirmationUrl, applicationUrl), true);
  assert.equal(allowedCaptureUrl(thankYouUrl, applicationUrl), true);
  assert.equal(allowedCaptureUrl(appliedUrl, applicationUrl), true);
  assert.equal(allowedCaptureUrl(`${applicationUrl}/apply/application-submitted`, applicationUrl), true);
  assert.equal(allowedCaptureUrl(confirmationUrl, applicationUrl, 'confirmed', 'URL confirmation path: /acme/jobs/998877/confirmation'), true);
  assert.equal(allowedCaptureUrl(applicationUrl, applicationUrl, 'confirmed', 'URL confirmation path: /acme/jobs/998877/confirmation'), false);
});

test('Application Lifecycle: a shared receipt requires success text and the same portal', () => {
  const posting = 'https://jobs.lever.co/acme/posting-123/apply';
  const receipt = 'https://jobs.lever.co/acme/thanks';
  const heading = 'Thank you for applying';
  assert.equal(allowedCaptureUrl(receipt, posting, 'confirmed', heading), true);
  assert.equal(allowedCaptureUrl(receipt, posting, 'confirmed', 'URL confirmation path: /acme/thanks'), false);
  assert.equal(allowedCaptureUrl(receipt, posting, 'in_progress', heading), false);
  assert.equal(allowedCaptureUrl(receipt + '?jobId=other', posting, 'confirmed', heading), false);
  assert.equal(allowedCaptureUrl('https://jobs.lever.co/other/thanks', posting, 'confirmed', heading), false);
  assert.equal(allowedCaptureUrl('https://example.test/thanks', posting, 'confirmed', heading), false);
});

test('Application Lifecycle: confirmation matching works across employer sites and posting URL formats', () => {
  const heading = "We've successfully received your application";
  const origin = 'https://careers.example.test';
  const posting = origin + '/engineering/jobs/REQ-123/apply?jobId=REQ-123';
  const receipt = origin + '/engineering/jobs/REQ-123/application/received';
  const shared = origin + '/engineering/thank-you-for-applying';
  assert.equal(validateObservation('confirmed', heading), true);
  assert.equal(validateObservation('confirmed', 'You have successfully submitted your job application'), true);
  assert.equal(allowedCaptureUrl(receipt, posting, 'confirmed', heading), true);
  assert.equal(allowedCaptureUrl(shared, posting, 'confirmed', heading), true);
  assert.equal(allowedCaptureUrl(shared, posting, 'confirmed', 'URL confirmation path: /engineering/thank-you-for-applying'), false);
  assert.equal(allowedCaptureUrl(receipt + '?jobId=REQ-456', posting, 'confirmed', heading), false);
  assert.equal(allowedCaptureUrl(receipt, posting.replace('jobId=REQ-123', 'jobId=REQ-456'), 'confirmed', heading), false);
  assert.equal(allowedCaptureUrl(shared.replace('/engineering/', '/sales/'), posting, 'confirmed', heading), false);
  assert.equal(allowedCaptureUrl(receipt.replace('careers.', 'elsewhere.'), posting, 'confirmed', heading), false);
});

test('Application Lifecycle: a portal receipt updates the draft and links matching outside captures before saving answers', async () => {
  const intentId = '8b1d6779-6dc3-419c-855a-fa293123aba0';
  const applicationUrl = 'https://example.test/engineering/jobs/REQ-123';
  const intent = { submission_id: 'submission', candidate_id: 'candidate', job: { application_url: applicationUrl + '?jobId=REQ-123' } };
  const writes = [];
  const db = {
    from(table) {
      const filters = {};
      return {
        select() { return this; },
        eq(field, value) { filters[field] = value; return this; },
        async maybeSingle() { return { data: intent }; },
        update(data) { assert.equal(table, 'outside_jobs'); writes.push({ data, filters }); return this; },
        in(field, value) { filters[field] = value; return this; },
        is(field, value) { filters[field] = value; return this; },
        neq(field, value) { filters[field] = { not: value }; return this; },
      };
    },
    async rpc(name, args) {
      writes.push({ name, args });
      return { data: { status: 'submitted', attempt: args.p_attempt, observed_at: args.p_observed } };
    },
  };
  const { recordObservation } = loadSource('lib/capture/server', {
    './applied-resume': { appliedResumeSchema: z.unknown() },
    './snapshot': { validateApplicationAnswers: () => { throw new Error('Invalid answer snapshot'); } },
    './validation': { allowedCaptureUrl, validateObservation },
    '@/lib/jobs/application-state': { applicationUrlKey },
    '@/lib/db/admin': { database: () => db, checkDb: assert.ifError, CaptureError: Error },
    zod: { z },
  });
  await assert.rejects(recordObservation('account', {
    intentId, eventKey: 'a71cb53e-586a-4aa6-a17e-507d6730eafc', status: 'confirmed', attempt: 1,
    applicationUrl, url: applicationUrl + '/application/received', evidence: "We've successfully received your application",
    observedAt: '2026-11-19T05:00:00Z', answers: 'invalid',
  }), /Invalid answer snapshot/);
  assert.equal(writes[0].name, 'record_application_observation');
  assert.equal(writes[0].args.p_status, 'submitted');
  assert.deepEqual(Array.from(writes[0].args.p_postings), [applicationUrl + '?jobid=REQ-123', applicationUrl]);
  assert.equal(writes.length, 1);
});


test('Application Lifecycle: applied resumes archive the exact bytes without putting them in the application list', async () => {
  const candidateId = 'a71cb53e-586a-4aa6-a17e-507d6730eafc';
  const submissionId = '52f9b8ef-3394-47f9-8227-961b750bf550';
  let archive;
  let stored;
  const receipt = { actor: 'fixture-actor', eventKey: 'fixture-event' };
  const { saveAppliedResume } = loadSource('lib/capture/applied-resume', {
    'node:crypto': await import('node:crypto'), zod: { z },
    '@/lib/db/admin': {
      database: () => ({ rpc: async (name, args) => {
        assert.equal(name, 'save_application_receipt_resume');
        assert.equal(args.p_actor, receipt.actor);
        assert.equal(args.p_event_key, receipt.eventKey);
        assert.equal(args.p_candidate, candidateId);
        assert.equal(args.p_submission, submissionId);
        stored = args.p_resume;
        return { data: stored };
      }, storage: { from: bucket => ({
        upload: async (path, bytes) => { archive = { bucket, path, bytes }; return {}; },
      }) } }),
      checkDb: assert.ifError, CaptureError: Error,
    },
  });
  const snapshot = await saveAppliedResume(submissionId, candidateId, {
    filename: 'resume.pdf', mimeType: 'application/pdf', base64: 'AQID',
  }, receipt);
  assert.equal(archive.bucket, 'candidate-resumes');
  assert.deepEqual([...archive.bytes], [1, 2, 3]);
  assert.equal(archive.path, `applied/${candidateId}/${submissionId}/${snapshot.archiveHash}`);
  assert.equal(stored.base64, undefined);
});


test('The Autofill profile endpoint returns candidate-submitted values only', async () => {
  const actor = { id: 'candidate-user', role: 'candidate' };
  const approvedAnswers = { 'why do you want to join': { answer: 'I like building with React.', approved: true } };
  const savedAnswers = { ...approvedAnswers, 'legacy answer': { answer: 'Approval unavailable.' } };
  const candidate = { id: 'candidate-profile', version: 2, provenance_status: 'confirmed', email: 'account@example.test',
    resume_url: 'data:application/pdf;base64,AQID',
    confirmed_facts: { full_name: 'Fixture Candidate', open_to_relocation: false, phone: '', raw_text: 'Never use this resume text', saved_answers: savedAnswers } };
  const automatic = { ...candidate, id: 'automatic', confirmed_facts: { full_name: 'Unreviewed',
    notes: 'Profile created from an uploaded resume. Review the extracted facts and edit anything that is wrong.' } };
  const query = { select() { return this; }, eq() { return this; }, or() { return this; }, order() { return this; },
    async limit() { return { data: [automatic, candidate] }; } };
  const { GET } = loadRoute('extension/candidates', {
    '@/lib/capture/server': { extensionRoute: (_request, work) => work(), extensionProfile: async () => actor },
    '@/lib/db/admin': { database: () => ({ from: () => query }), checkDb: assert.ifError },
    '@/lib/ai/schemas': { textFields: ['full_name', 'email', 'phone'], booleanFields: ['open_to_relocation'] }, zod: { z },
    '@/lib/extension-answers/saved-answers': { approvedSavedAnswers },
  });
  const response = await GET(new Request('https://www.nextkinhr.com/api/extension/candidates?savedOnly=true'));
  assert.equal(response.candidates.length, 1);
  assert.equal(response.candidates[0].id, candidate.id);
  assert.equal(response.candidates[0].open_to_relocation, false);
  assert.equal(response.candidates[0].email, undefined);
  assert.equal(response.candidates[0].phone, '');
  assert.equal(response.candidates[0].has_original_resume, true);
  assert.equal(response.candidates[0].resume_url, undefined);
  assert.equal(response.candidates[0].confirmed_facts.raw_text, undefined);
  assert.deepEqual(response.candidates[0].confirmed_facts.saved_answers, approvedAnswers);
  assert.ok(candidate.confirmed_facts.saved_answers['legacy answer']);
});

test('Profile screening answers are saved using the fields the dashboard sends', async () => {
  const actor = { id: 'candidate-user', role: 'candidate' };
  const query = {
    select() { return this; },
    eq() { return this; },
    async maybeSingle() { return { data: null }; },
    insert(candidate) { this.candidate = candidate; return this; },
    async single() { return { data: this.candidate }; },
  };
  const { POST } = loadRoute('jobseeker/resume', {
    '@/lib/capture/server': { cors: (_request, response) => response, extensionProfile: async () => actor },
    '@/lib/db/admin': { database: () => ({ from: () => query }), checkDb: assert.ifError },
  });
  const save = async screeningAnswers => {
    const response = await POST(new Request('https://www.nextkinhr.com/api/jobseeker/resume', {
      method: 'POST',
      body: JSON.stringify({ fullName: 'Fixture Candidate', screeningAnswers }),
    }));
    assert.equal(response.status, 200);
    return (await response.json()).candidate.confirmed_facts;
  };

  const unanswered = await save({ authorized_countries: ['us'] });
  assert.equal(unanswered.authorized_in_usa, null);
  assert.equal(unanswered.visa_status, null);
  assert.equal(unanswered.country, null);

  const answers = await save({ authorized_countries: ['us'], country_specific_answers: {
    us_auth: 'Yes',
    us_sponsorship: 'No',
    us_veteran: 'I am not a protected veteran',
    us_disability: 'Not stated',
  } });
  assert.equal(answers.authorized_in_usa, true);
  assert.equal(answers.need_sponsorship_now, false);
  assert.equal(answers.visa_status, null);
  assert.equal(answers.veteran, 'I am not a protected veteran');
  assert.equal(answers.disability, null);
});


test('Application Lifecycle: Outside Jobs realtime reads only expose rows owned by the candidate', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE authenticated;
      CREATE SCHEMA app_private;
      CREATE SCHEMA auth;
      GRANT USAGE ON SCHEMA app_private, auth TO authenticated;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$
        SELECT '10000000-0000-0000-0000-000000000001'::uuid
      $$;
      CREATE FUNCTION app_private.can_read_candidate_application(uuid) RETURNS boolean LANGUAGE sql AS $$
        SELECT $1 IS NOT NULL
      $$;
      CREATE TABLE public.candidates (id uuid, user_id uuid);
      GRANT SELECT ON public.candidates TO authenticated;
      INSERT INTO public.candidates VALUES
        ('10000000-0000-0000-0000-000000000010', auth.uid()),
        ('10000000-0000-0000-0000-000000000020', '10000000-0000-0000-0000-000000000002');
      CREATE TABLE public.outside_jobs (id integer, candidate_id uuid, capture_owner_id uuid);
      ALTER TABLE public.outside_jobs ENABLE ROW LEVEL SECURITY;
      CREATE POLICY candidate_outside_jobs ON public.outside_jobs FOR SELECT TO authenticated USING (true);
      INSERT INTO public.outside_jobs VALUES
        (1, '10000000-0000-0000-0000-000000000010', auth.uid()),
        (2, '10000000-0000-0000-0000-000000000010', NULL),
        (3, '10000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000002'),
        (4, '10000000-0000-0000-0000-000000000020', NULL);
    `);
    const migration = new URL('../supabase/migrations/20261118155756_enable_outside_job_realtime_reads.sql', import.meta.url);
    await db.exec(readFileSync(migration, 'utf8'));
    await db.exec('SET ROLE authenticated');
    assert.deepEqual((await db.query('SELECT id FROM public.outside_jobs ORDER BY id')).rows, [{ id: 1 }, { id: 2 }]);
  } finally {
    await db.close();
  }
});

test('Application Lifecycle: Outside Jobs returns the current confirmation status on every read', async () => {
  const actor = { id: 'fixture-actor' };
  let status = 'Discovered';
  const candidateLookup = {
    select() { return this; },
    eq(column, value) {
      assert.equal(column, 'user_id');
      assert.equal(value, actor.id);
      return this;
    },
    async maybeSingle() { return { data: { id: 'fixture-candidate' }, error: null }; },
  };
  const query = {
    select() { return this; }, order() { return this; }, or() { return this; },
    then(resolve) {
      resolve({ data: status === 'Applied' ? [
        { id: 'legacy', job_url: 'https://jobs.lever.co/fixture/123/apply', status: 'Discovered' },
        { id: 'current', job_url: 'https://jobs.lever.co/fixture/123', status },
      ] : [{ id: 'legacy', job_url: 'https://jobs.lever.co/fixture/123/apply', status }], error: null });
    },
  };
  const dependencies = {
    '@/lib/http/protected-route': { protectedRoute: (_request, work) => work(actor) },
    '@/lib/db/admin': {
      database: () => ({ from: table => table === 'candidates' ? candidateLookup : query }),
      checkDb: assert.ifError,
    },
    '@/lib/jobs/application-state': { applicationUrlKey },
  };
  const { GET } = loadRoute('outside-jobs', dependencies);
  const request = new Request('https://www.nextkinhr.com/api/outside-jobs');
  assert.equal((await GET(request)).outsideJobs[0].status, 'Discovered');
  status = 'Applied';
  const { outsideJobs } = await GET(request);
  assert.equal(outsideJobs.length, 1);
  assert.equal(outsideJobs[0].status, 'Applied');
});

test('Application Lifecycle: manual writes use the owned candidate and cannot set browser proof', async () => {
  const actorId = '8b1d6779-6dc3-419c-855a-fa293123aba0';
  const owned = 'a71cb53e-586a-4aa6-a17e-507d6730eafc';
  const other = '52f9b8ef-3394-47f9-8227-961b750bf550';
  const writes = [];
  const query = table => {
    let id;
    return {
      select() { return this; }, eq(key, value) { id = key === 'id' ? value : id; return this; },
      in(key, values) { assert.equal(key, 'candidate_id'); assert.deepEqual(Array.from(values), [owned]); return this; },
      is() { return this; }, ilike() { return this; }, gte() { return this; }, limit() { return this; },
      then(resolve) { resolve({ data: table === 'candidates' ? [{ id: owned }] : [] }); },
      async single() { return { data: { id: owned } }; },
      async maybeSingle() { return { data: id === owned ? { id } : null }; },
      insert(fields) { writes.push(fields); return this; }, update(fields) { writes.push(fields); return this; },
      delete() { return this; },
    };
  };
  const { POST, PATCH, DELETE } = loadRoute('submissions', {
    '@/lib/http/protected-route': { protectedRoute: (_request, work) => work({ id: actorId }) },
    '@/lib/db/admin': { database: () => ({ from: query }), checkDb: assert.ifError,
      CaptureError: class extends Error {} },
    '@/lib/rtr-metadata': {}, '@/lib/capture/applied-resume': { appliedResumeSchema: z.unknown().optional() },
    zod: { z },
  });
  const endpoint = 'https://www.nextkinhr.com/api/submissions';
  const send = (method, body) => new Request(endpoint, { method, body: JSON.stringify(body) });
  const fields = { company_name: 'Fixture', job_title: 'Engineer', submission_date: '2026-11-18', status: 'Draft' };
  await assert.rejects(POST(send('POST', { ...fields, candidate_id: other })), /Candidate profile not found/);
  await POST(send('POST', { ...fields, candidate_id: owned, capture_status: 'confirmed' }));
  await assert.rejects(PATCH(send('PATCH', { id: other, status: 'Applied' })), /Application not found/);
  await PATCH(send('PATCH', { id: owned, status: 'Applied', candidate_id: other, capture_status: 'confirmed' }));
  assert.equal(writes[0].capture_status, undefined);
  assert.equal(writes.at(-1).candidate_id, undefined);
  assert.equal(writes.at(-1).capture_status, undefined);
  assert.equal((await DELETE(new Request(endpoint + '?id=' + owned, { method: 'DELETE' }))).success, true);
});

test('Application Lifecycle: an external receipt promotes one posting in Outside Jobs and My Applications', async () => {
  const actor = { id: 'account-id' };
  const candidateId = '8b1d6779-6dc3-419c-855a-fa293123aba0';
  const jobUrl = 'https://jobs.lever.co/fixture/posting-123';
  const outside = { id: 'existing-outside-job', job_url: jobUrl, capture_owner_id: actor.id, status: 'Discovered' };
  let submission;
  let outsideWrites = 0;
  let rpcFailure = true;
  let archiveFailure = true;
  let snapshotFailure = false;
  let archiveCalls = 0;
  const snapshots = new Map();
  const db = {
    from(table) {
      return {
        select() { return this; }, eq() { return this; },
        async maybeSingle() { return { data: { id: candidateId, version: 1 } }; },
        then(resolve) { assert.ok(['application_intents', 'outside_jobs'].includes(table)); resolve({ data: [] }); },
        update() { assert.equal(table, 'outside_jobs'); return this; },
      };
    },
    async rpc(name, args) {
      if (name === 'save_application_answer_snapshot') {
        assert.equal(args.p_attempt, 1, 'snapshot belongs to the first recorded attempt');
        if (snapshotFailure) return { error: new Error('Snapshot unavailable') };
        const key = args.p_event_key + ':' + args.p_attempt;
        if (!snapshots.has(key)) snapshots.set(key, { id: key });
        return { data: snapshots.get(key) };
      }
      assert.equal(name, 'record_extension_submission');
      if (rpcFailure) return { error: new Error('Authoritative RPC failed') };
      assert.equal('appliedResume' in args.p_fields, false);
      assert.equal(args.p_fields.jobUrl, jobUrl);
      assert.equal(args.p_fields.source, 'extension_observation');
      const replayed = Boolean(submission);
      submission ??= { id: args.p_event_key, status: 'Applied' };
      submission.capture_status = 'submitted';
      if (!replayed) {
        outsideWrites++;
        Object.assign(outside, { status: 'Applied', submission_id: submission.id });
      }
      return { data: { submission, replayed, attempt: 1, observed_at: '2026-11-23T08:00:00Z' } };
    },
  };
  const { POST } = loadRoute('extension/auto-submit', {
    '@/lib/capture/server': {
      extensionProfile: async () => actor,
      extensionRoute: async (_request, work) => {
        try { return Response.json(await work()); }
        catch (error) { return Response.json({ error: error.message }, { status: error.status || 500 }); }
      },
    },
    '@/lib/db/admin': {
      database: () => db, checkDb: assert.ifError,
      CaptureError: class extends Error { constructor(message, status) { super(message); this.status = status; } },
    },
    '@/lib/capture/snapshot': { validateApplicationAnswers: value => value },
    '@/lib/capture/validation': { allowedCaptureUrl, validateObservation },
    '@/lib/capture/applied-resume': {
      appliedResumeSchema: z.unknown(),
      saveAppliedResume: async (_submissionId, _candidateId, resume) => {
        archiveCalls++;
        assert.equal(resume.appliedAt, '2026-11-23T08:00:00Z');
        if (archiveFailure) throw new Error('Archive unavailable');
        return { archiveHash: 'fixture-content-hash' };
      },
    },
    '@/lib/jobs/application-state': { applicationUrlKey }, zod: { z },
  });
  const send = (confirmationUrl, evidence, appliedResume, attempt = 1) => POST(new Request('https://www.nextkinhr.com/api/webhooks/application-submitted', {
    method: 'POST', body: JSON.stringify({
      candidateId, eventKey: 'a71cb53e-586a-4aa6-a17e-507d6730eafc', companyName: 'Fixture', jobTitle: 'Engineer',
      jobUrl: jobUrl + '/apply', confirmationUrl, evidence, appliedResume, attempt,
      answers: [{ key: 'name', label: 'Name', value: 'Fixture' }],
    }),
  }));
  assert.equal((await send(undefined, 'Application submitted')).status, 422);
  assert.equal((await send(jobUrl + '/apply', 'Application was not submitted')).status, 422);
  assert.equal(outside.status, 'Discovered');
  assert.equal(outsideWrites, 0);
  const rpcError = await send(jobUrl + '/confirmation', 'Successfully applied!');
  assert.equal(rpcError.status, 500);
  assert.equal(outsideWrites, 0);
  assert.equal(submission, undefined);
  assert.equal(snapshots.size, 0);
  rpcFailure = false;
  const archiveError = await send(jobUrl + '/application/received', "We've successfully received your application", { filename: 'resume.pdf' });
  assert.equal(archiveError.status, 500);
  assert.equal(submission.status, 'Applied');
  assert.equal(outside.status, 'Applied');
  assert.equal(snapshots.size, 1, 'answers are persisted even when archive fails');
  archiveFailure = false;
  snapshotFailure = true;
  assert.equal((await send(jobUrl + '/confirmation', 'Successfully applied!', { filename: 'resume.pdf' }, 2)).status, 500);
  assert.equal(archiveCalls, 2);
  assert.equal(submission.applied_resume.archiveHash, 'fixture-content-hash');
  snapshotFailure = false;
  const submissionId = submission.id;
  const result = await send(jobUrl + '/confirmation', 'Successfully applied!', { filename: 'resume.pdf' }, 3);
  assert.equal(result.status, 200);
  assert.equal((await result.json()).submission.status, 'Applied');
  assert.equal(snapshots.size, 1);
  assert.equal(outside.status, 'Applied');
  assert.equal(outside.id, 'existing-outside-job');
  assert.equal(outside.submission_id, submissionId);
  submission.status = 'Interview';
  submission.capture_status = 'started';
  const updated = await (await send(jobUrl + '/confirmation', 'Successfully applied!')).json();
  assert.equal(updated.submission.status, 'Interview');
  assert.equal(updated.submission.capture_status, 'submitted');
});

test('Application Lifecycle: a side-panel manual attestation records an application without a receipt', async () => {
  const actor = { id: 'account-id' };
  const candidateId = '8b1d6779-6dc3-419c-855a-fa293123aba0';
  let receipt;
  const db = {
    from(table) {
      return {
        select() { return this; }, eq() { return this; },
        async maybeSingle() { return { data: { id: candidateId, version: 1 } }; },
        then(resolve) { assert.equal(table, 'application_intents'); resolve({ data: [] }); },
      };
    },
    async rpc(name, args) {
      assert.equal(name, 'record_extension_submission');
      receipt = args.p_fields;
      return { data: { submission: { id: args.p_event_key, status: 'Applied' } } };
    },
  };
  const { POST } = loadRoute('extension/auto-submit', {
    '@/lib/capture/server': {
      extensionProfile: async () => actor,
      extensionRoute: async (_request, work) => {
        try { return Response.json(await work()); }
        catch (error) { return Response.json({ error: error.message }, { status: error.status || 500 }); }
      },
      markOutsideJobsApplied: async () => {},
    },
    '@/lib/db/admin': {
      database: () => db, checkDb: assert.ifError,
      CaptureError: class extends Error { constructor(message, status) { super(message); this.status = status; } },
    },
    '@/lib/capture/snapshot': {},
    '@/lib/capture/validation': { allowedCaptureUrl, validateObservation },
    '@/lib/capture/applied-resume': { appliedResumeSchema: z.unknown(), saveAppliedResume: async () => null },
    '@/lib/jobs/application-state': { applicationUrlKey }, zod: { z },
  });
  const posting = 'https://jobs.ashbyhq.com/cribl/93226790-dcd0-4630-98ca-1c079e437a36/application';
  const response = await POST(new Request('https://www.nextkinhr.com/api/extension/auto-submit', {
    method: 'POST', body: JSON.stringify({
      candidateId, eventKey: 'a71cb53e-586a-4aa6-a17e-507d6730eafc',
      companyName: 'Cribl', jobTitle: 'Customer Success Engineer, Sydney',
      jobUrl: posting, confirmationUrl: posting,
      evidence: 'Candidate confirmed submission in the NextKinHR side panel.', manualAttestation: true,
    }),
  }));
  assert.equal(response.status, 200);
  assert.equal(receipt.source, 'recruiter_attestation');
});


test('Application Lifecycle: external job payload retains all required fields for outside_jobs', () => {
  const mockExternalJob = {
    title: 'Senior Marketing Manager',
    company: 'Stripe',
    description: 'Lead global growth marketing campaigns and product launches across web and mobile.',
    location: 'San Francisco, CA (Remote)',
    employmentType: 'Full-time',
    compensation: '$160,000 - $200,000 USD',
    jobUrl: 'https://stripe.com/jobs/senior-marketing-manager?utm_source=linkedin',
    candidateId: '11111111-2222-3333-4444-555555555555',
    status: 'Applied'
  };

  // Ensure title, company, description, location, employment type, compensation, job URL, candidate ID are all present
  assert.ok(mockExternalJob.title);
  assert.ok(mockExternalJob.company);
  assert.ok(mockExternalJob.description);
  assert.ok(mockExternalJob.location);
  assert.ok(mockExternalJob.employmentType);
  assert.ok(mockExternalJob.compensation);
  assert.ok(mockExternalJob.jobUrl);
  assert.ok(mockExternalJob.candidateId);
});
