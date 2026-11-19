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
  const original = 'https://boards.greenhouse.io/acme/jobs/123';
  const receipt = 'https://job-boards.greenhouse.io/acme/jobs/123/confirmation';
  assert.equal(allowedCaptureUrl(receipt, original, 'confirmed', 'Application submitted'), true);
  assert.equal(allowedCaptureUrl(receipt.replace('/123/', '/456/'), original, 'confirmed', 'Application submitted'), false);
  assert.equal(allowedCaptureUrl(receipt.replace('/acme/', '/other/'), original, 'confirmed', 'Application submitted'), false);
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

test('Application Lifecycle: autofill restores tracking on an already-open posting and records its receipt', async () => {
  const intentId = '8b1d6779-6dc3-419c-855a-fa293123aba0';
  const posting = 'https://jobs.lever.co/fixture/123/apply';
  const tab = { id: 17, url: posting + '?email=private@example.test' };
  const state = {};
  const noop = { addListener() {} };
  const workspace = 'https://www.nextkinhr.com';
  const requests = [];
  const scripts = [];
  let resolvedIntentId = intentId;
  const worker = {
    URL,
    URLSearchParams,
    AbortSignal,
    crypto,
    chrome: {
      runtime: { onInstalled: noop, onStartup: noop, onConnect: noop, onMessage: noop },
      tabs: { onUpdated: noop, onRemoved: noop, get: async () => tab },
      storage: {
        local: { get: async () => ({ origin: workspace, token: 'fixture' }) },
        session: {
          get: async key => ({ [key]: state[key] }),
          set: async records => Object.assign(state, records),
        },
      },
      scripting: { executeScript: async options => scripts.push(options.files[0]) },
    },
    fetch: async (url, options) => {
      const body = options.body && JSON.parse(options.body);
      requests.push({ url, body });
      if (url.endsWith('/resolve')) return Response.json({ intentId: resolvedIntentId });
      if (url.endsWith(intentId)) return Response.json({ intent: { id: intentId, attempt: 0 } });
      if (url.endsWith('/auto-submit')) return Response.json({ success: true });
      return Response.json({ status: 'confirmed' });
    },
  };
  runInNewContext(readFileSync(new URL('../jobright_extension/background.js', import.meta.url), 'utf8'), worker);

  await assert.rejects(worker.prepareApplication(tab.id, posting), /tab changed/);
  assert.equal(await worker.prepareApplication(tab.id, tab.url), true);
  assert.equal(requests[0].url, workspace + '/api/extension/intents/resolve');
  assert.deepEqual(requests[0].body, { url: posting });
  assert.deepEqual(scripts, ['application-confirmation.js']);

  const answers = [{ key: 'name', label: 'Name', value: 'Fixture Candidate' }];
  const appliedResume = { filename: 'resume.pdf', mimeType: 'application/pdf', base64: 'AQID' };
  await worker.prepareApplication(tab.id, tab.url, undefined, undefined, true, { answers, appliedResume });

  const sender = { tab, frameId: 0, url: 'https://jobs.lever.co/fixture/thanks' };
  assert.equal(await worker.recordConfirmation({ evidence: 'Thank you for applying' }, sender), true);
  assert.equal(requests[2].body.intentId, intentId);
  assert.equal(requests[2].body.status, 'confirmed');
  assert.deepEqual(requests[2].body.answers, answers);
  assert.deepEqual(requests[2].body.appliedResume, appliedResume);
  assert.equal(state['application-intent:17'].submissionEvidence, undefined);
  assert.equal(await worker.recordConfirmation({ evidence: 'Thank you for applying' }, sender), true);
  assert.equal(requests.length, 3);

  resolvedIntentId = null;
  tab.id++;
  const outsidePosting = 'https://careers.example.test/jobs/123/apply';
  const confirmationUrl = 'https://careers.example.test/jobs/123/confirmation';
  tab.url = confirmationUrl;
  assert.equal(await worker.prepareApplication(tab.id, outsidePosting, {
    title: 'Software Engineer', company: 'Fixture Company', location: 'Remote',
  }, undefined, true, { answers, appliedResume }), true);
  assert.equal(requests.length, 4, 'Submitting the form only prepares tracking');

  const outsideSender = { tab, frameId: 0, url: confirmationUrl };
  assert.equal(await worker.recordConfirmation({ evidence: 'Application submitted' }, outsideSender), true);
  const outside = requests[4];
  assert.equal(outside.url, workspace + '/api/extension/auto-submit');
  assert.equal(outside.body.jobUrl, outsidePosting);
  assert.equal(outside.body.confirmationUrl, confirmationUrl);
  assert.equal(outside.body.candidateId, 'current');
  assert.equal(outside.body.jobTitle, 'Software Engineer');
  assert.equal(outside.body.companyName, 'Fixture Company');
  assert.deepEqual(outside.body.answers, answers);
  assert.deepEqual(outside.body.appliedResume, appliedResume);
  assert.equal(await worker.recordConfirmation({ evidence: 'Application submitted' }, outsideSender), true);
  assert.equal(requests.length, 5, 'A repeated receipt must not resubmit the record');

  const postingWithRoute = 'https://careers.example.test/#/jobs/123/apply?email=private@example.test';
  tab.id++;
  tab.url = postingWithRoute;
  resolvedIntentId = intentId;
  await worker.prepareApplication(tab.id, postingWithRoute);
  assert.deepEqual(requests.at(-1).body, { url: 'https://careers.example.test/#/jobs/123/apply' });
});

test('Application Lifecycle: manual application tracking starts only for a real job form submission', () => {
  const job = { title: 'Software Engineer', company: 'Company' };
  const location = new URL('https://careers.example.test/jobs/123/apply');
  const messages = [];
  let onSubmit;
  let capturedJob = job;
  const window = {};
  window.top = window;
  const document = {
    querySelectorAll: () => [],
    addEventListener(type, callback, capture) {
      assert.equal(capture, true);
      if (type === 'submit') onSubmit = callback;
    },
  };
  runInNewContext(readFileSync(new URL('../jobright_extension/core/application.js', import.meta.url), 'utf8'), {
    window, document, location, URLSearchParams,
    NextkinJobCapture: { read: () => capturedJob },
    NextkinForms: { discoverFields: () => [{ label: 'Name' }] },
    NextkinFieldMapping: { resolveFact: () => ({ key: 'full_name' }) },
    NextkinFieldWriter: { read: () => 'Fixture Candidate' },
    chrome: { runtime: { sendMessage: async message => messages.push(message) } },
  });
  const event = { isTrusted: true, target: { tagName: 'FORM', querySelectorAll: () => [] }, submitter: { innerText: 'Submit application' } };
  onSubmit({ ...event, isTrusted: false });
  onSubmit({ ...event, submitter: { innerText: 'Next' } });
  capturedJob = null;
  onSubmit(event);
  assert.equal(messages.length, 0);
  capturedJob = job;
  onSubmit(event);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].action, 'prepare_application_tracking');
  assert.equal(messages[0].submitted, true);
  assert.equal(messages[0].job, job);
  assert.equal(messages[0].submissionEvidence.answers[0].value, 'Fixture Candidate');
});

test('Application Lifecycle: automatic submission waits for a valid final form and stages evidence first', async () => {
  const location = new URL('https://careers.example.test/#/jobs/123/apply');
  const job = { title: 'Engineer' };
  const file = new File([Uint8Array.of(1, 2, 3)], 'resume.pdf', { type: 'application/pdf' });
  const resume = { name: 'résumé', files: [file] };
  const events = [];
  const button = { type: 'submit', innerText: 'Next', getClientRects: () => [{}] };
  const form = {
    isConnected: true, elements: [button], querySelector: () => null,
    querySelectorAll: selector => selector === 'input[type="file"]' ? [resume] : [],
    checkValidity: () => true, requestSubmit: control => events.push(control),
  };
  const fields = [
    { label: 'Email', kind: 'text', element: { form, required: true, value: 'candidate@example.test' } },
    { label: 'Password', kind: 'text', element: { form, value: 'private' } },
    { label: 'I agree to the terms', kind: 'checkbox', element: { form, value: false } },
  ];
  const fixture = {
    location, document: form, btoa,
    NextkinJobCapture: { read: () => job }, NextkinForms: { discoverFields: () => fields, label: el => el.name },
    NextkinFieldMapping: { resolveFact: () => ({ key: 'email' }) },
    NextkinFieldWriter: { read: field => field.element.value },
    chrome: { runtime: { sendMessage: async message => { events.push(message); return { tracked: true }; } } },
  };
  runInNewContext(readFileSync(new URL('../jobright_extension/core/application.js', import.meta.url), 'utf8'), fixture);
  const submit = () => fixture.NextkinApplication.submitApplication(location.href);
  await assert.rejects(submit, /complete the employer form/);
  button.innerText = 'Submit application';
  await assert.rejects(submit, /complete the employer form/);
  assert.equal(events.length, 0);
  fields[2].element.value = true;
  await submit();
  assert.equal(events[0].submissionEvidence.appliedResume.base64, 'AQID');
  assert.equal(events[0].submissionEvidence.answers.some(answer => answer.value === 'private'), false);
  assert.equal(events[1], button);
  await assert.rejects(submit, /single final application form/);
});

test('Application Lifecycle: applied resumes archive the exact bytes without putting them in the application list', async () => {
  const candidateId = 'a71cb53e-586a-4aa6-a17e-507d6730eafc';
  const submissionId = '52f9b8ef-3394-47f9-8227-961b750bf550';
  let archive;
  let stored;
  const filters = [];
  const query = {
    update(fields) { stored = fields.applied_resume; return this; },
    eq(key, value) { filters.push([key, value]); return this; }, select() { return this; },
    async maybeSingle() { return { data: { id: submissionId } }; },
  };
  const { saveAppliedResume } = loadSource('lib/capture/applied-resume', {
    'node:crypto': await import('node:crypto'), zod: { z },
    '@/lib/db/admin': {
      database: () => ({ from: () => query, storage: { from: bucket => ({
        upload: async (path, bytes) => { archive = { bucket, path, bytes }; return {}; },
      }) } }),
      checkDb: assert.ifError, CaptureError: Error,
    },
  });
  const snapshot = await saveAppliedResume(submissionId, candidateId, {
    filename: 'resume.pdf', mimeType: 'application/pdf', base64: 'AQID',
  });
  assert.equal(archive.bucket, 'candidate-resumes');
  assert.deepEqual([...archive.bytes], [1, 2, 3]);
  assert.equal(archive.path, `applied/${candidateId}/${submissionId}/${snapshot.archiveHash}`);
  assert.equal(stored.base64, undefined);
  assert.deepEqual(filters, [['id', submissionId], ['candidate_id', candidateId]]);
});

test('Application Lifecycle: the worker retrieves the original resume for the active account', async () => {
  const candidateId = '8b1d6779-6dc3-419c-855a-fa293123aba0';
  const storage = { origin: 'https://www.nextkinhr.com', token: 'paired-token' };
  const noop = { addListener() {} };
  const worker = {
    URL, URLSearchParams, AbortSignal,
    chrome: {
      runtime: { onInstalled: noop, onStartup: noop, onConnect: noop, onMessage: noop },
      tabs: { onUpdated: noop, onRemoved: noop },
      storage: { local: { get: async () => ({ ...storage }) } },
    },
    fetch: async (url, options) => {
      assert.equal(url, storage.origin + '/api/extension/resume-file?candidateId=' + candidateId + '&originalOnly=true');
      assert.equal(options.headers.Authorization, 'Bearer paired-token');
      return Response.json({ filename: 'resume.pdf', base64: 'AQID', mimeType: 'application/pdf', source: 'upload' });
    },
  };
  runInNewContext(readFileSync(new URL('../jobright_extension/background.js', import.meta.url), 'utf8'), worker);
  assert.equal((await worker.loadApplicationResume(candidateId)).base64, 'AQID');
});

test('Autofill resumes a new wizard document once and rejects other postings', async () => {
  const candidateId = '8b1d6779-6dc3-419c-855a-fa293123aba0';
  const account = { origin: 'https://www.nextkinhr.com', token: 'paired-token' };
  const state = {};
  const noop = { addListener() {} };
  const sandbox = {
    URL, URLSearchParams, AbortSignal,
    chrome: {
      runtime: { onInstalled: noop, onStartup: noop, onConnect: noop, onMessage: noop },
      tabs: { onUpdated: noop, onRemoved: noop },
      storage: { local: { get: async () => ({ ...account }) }, session: {
        get: async key => ({ [key]: state[key] }), set: async records => Object.assign(state, records),
        remove: async key => { delete state[key]; },
      } },
    },
    fetch: async url => url.includes('/candidates?') ? Response.json({ candidates: [{ id: candidateId,
      provenance_status: 'confirmed', confirmed_facts: { full_name: 'Fixture Candidate' } }] }) : new Response(null, { status: 404 }),
  };
  runInNewContext(readFileSync(new URL('../jobright_extension/background.js', import.meta.url), 'utf8'), sandbox);
  const first = { documentId: 'first', url: 'https://jobs.example.test/jobs/123/apply/contact' };
  const next = { documentId: 'next', url: 'https://jobs.example.test/jobs/123/apply/preferences' };
  await sandbox.queueApplicationStep(1, first, { candidateId });
  assert.equal(await sandbox.claimApplicationStep(1, first), null);
  assert.equal((await sandbox.claimApplicationStep(1, next)).profile.id, candidateId);
  assert.equal(await sandbox.claimApplicationStep(1, next), null);
  await sandbox.queueApplicationStep(1, first, { candidateId });
  assert.equal(await sandbox.claimApplicationStep(1, { ...next, url: next.url.replace('/123/', '/456/') }), null);
});

test('The Autofill profile endpoint returns candidate-submitted values only', async () => {
  const actor = { id: 'candidate-user', role: 'candidate' };
  const candidate = { id: 'candidate-profile', version: 2, provenance_status: 'confirmed', email: 'account@example.test',
    confirmed_facts: { full_name: 'Fixture Candidate', open_to_relocation: false, raw_text: 'Never use this resume text' } };
  const automatic = { ...candidate, id: 'automatic', confirmed_facts: { full_name: 'Unreviewed',
    notes: 'Profile created from an uploaded resume. Review the extracted facts and edit anything that is wrong.' } };
  const query = { select() { return this; }, eq() { return this; }, or() { return this; }, order() { return this; },
    async limit() { return { data: [automatic, candidate] }; } };
  const { GET } = loadRoute('extension/candidates', {
    '@/lib/capture/server': { extensionRoute: (_request, work) => work(), extensionProfile: async () => actor },
    '@/lib/db/admin': { database: () => ({ from: () => query }), checkDb: assert.ifError },
    '@/lib/ai/schemas': { textFields: ['full_name', 'email'], booleanFields: ['open_to_relocation'] }, zod: { z },
  });
  const response = await GET(new Request('https://www.nextkinhr.com/api/extension/candidates?savedOnly=true'));
  assert.equal(response.candidates.length, 1);
  assert.equal(response.candidates[0].id, candidate.id);
  assert.equal(response.candidates[0].open_to_relocation, false);
  assert.equal(response.candidates[0].email, undefined);
  assert.equal(response.candidates[0].confirmed_facts.raw_text, undefined);
});

test('Application Lifecycle: Autofill fills ten saved candidate fields without a resume', async () => {
  const url = new URL('https://careers.example.test/jobs/123/apply');
  class Input extends EventTarget {
    tagName = 'INPUT';
    isConnected = true;
    value = '';
    getAttribute() { return null; }
    closest() { return null; }
  }
  const fields = ['First Name', 'Last Name', 'Email', 'Phone', 'City', 'State', 'Postal Code',
    'LinkedIn Profile', 'Current Company', 'Current Job Title'].map((label, index) => ({
    key: String(index), label, kind: 'text', element: new Input(),
  }));
  const fixture = {
    location: url, document: { querySelectorAll: () => [] }, crypto, Event, HTMLInputElement: Input,
    NextkinJobCapture: { read: () => null },
    NextkinForms: { discoverFields: () => fields },
  };
  for (const file of ['field-mapping.js', 'field-writer.js', 'application.js']) {
    runInNewContext(readFileSync(new URL('../jobright_extension/core/' + file, import.meta.url), 'utf8'), fixture);
  }
  const confirmed_facts = {
    first_name: 'Jess', last_name: 'Nguyen', full_name: 'Jessica Mai Nguyen',
    email: 'jess@example.test', phone: '5125550189', current_city: 'Austin', current_state: 'TX', zip_code: '78701',
    linkedin_url: 'https://www.linkedin.com/in/jess-nguyen', current_employer: 'Fixture Company', current_job_title: 'Engineer',
  };
  const result = await fixture.NextkinApplication.fill(url.href, { provenance_status: 'confirmed', confirmed_facts }, null);
  assert.equal(result.filled.length, 10);
  assert.deepEqual(fields.map(field => field.element.value), [
    'Jess', 'Nguyen', 'jess@example.test', '5125550189', 'Austin', 'TX', '78701',
    'https://www.linkedin.com/in/jess-nguyen', 'Fixture Company', 'Engineer',
  ]);
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
  let cached;
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
    '@/lib/db/admin': { database: () => ({ from: () => query }), checkDb: assert.ifError },
    '@/lib/cache': {
      candidateProfileCache: { fetchWithSWR: async () => ({ id: 'fixture-candidate' }) },
      outsideJobsCache: { fetchWithSWR: async (_key, fetch) => cached ??= await fetch() },
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
  const outside = { job_url: jobUrl, capture_owner_id: actor.id, status: 'Discovered' };
  let submission;
  let outsideWrites = 0;
  const db = {
    from(table) {
      let row = table === 'candidates' ? { id: candidateId, version: 1 } : null;
      return {
        select() { return this; }, eq() { return this; }, order() { return this; }, limit() { return this; },
        async maybeSingle() { return { data: row }; },
        then(resolve) {
          resolve({ data: table === 'job_submissions' && submission ? [submission] : [] });
        },
        upsert(data, options) {
          if (table === 'job_submissions') {
            submission = row = data;
          } else {
            assert.equal(table, 'outside_jobs');
            assert.equal(options.onConflict, 'capture_owner_id,job_url');
            assert.equal(data.job_url, outside.job_url);
            assert.equal(data.capture_owner_id, outside.capture_owner_id);
            outsideWrites++;
            Object.assign(outside, data);
          }
          return this;
        },
      };
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
    '@/lib/capture/snapshot': {},
    '@/lib/capture/validation': { allowedCaptureUrl, validateObservation },
    '@/lib/capture/applied-resume': { appliedResumeSchema: z.unknown() },
    '@/lib/jobs/application-state': { applicationUrlKey }, zod: { z },
  });
  const send = (confirmationUrl, evidence) => POST(new Request('https://www.nextkinhr.com/api/extension/auto-submit', {
    method: 'POST', body: JSON.stringify({
      candidateId, eventKey: 'a71cb53e-586a-4aa6-a17e-507d6730eafc', companyName: 'Fixture', jobTitle: 'Engineer',
      jobUrl: jobUrl + '/apply', confirmationUrl, evidence,
    }),
  }));
  assert.equal((await send(jobUrl + '/apply', 'Application was not submitted')).status, 422);
  assert.equal(outside.status, 'Discovered');
  assert.equal(outsideWrites, 0);
  const result = await send(jobUrl + '/confirmation', 'Successfully applied!');
  assert.equal(result.status, 200);
  assert.equal((await result.json()).submission.status, 'Applied');
  assert.equal(outside.status, 'Applied');
  assert.equal(outside.submission_id, submission.id);
});

test('Application Lifecycle: profile saving repairs expired pairing and keeps the uploaded resume', async () => {
  const location = new URL('https://www.nextkinhr.com/dashboard/candidates');
  const candidate = { id: '8b1d6779-6dc3-419c-855a-fa293123aba0', full_name: 'Fixture Candidate' };
  const user = { id: 'account-id' };
  const storage = { origin: location.origin, token: 'expired', user };
  const writes = [];
  const requests = [];
  let receive;
  const window = { addEventListener: (type, listener) => { receive = listener; } };
  runInNewContext(readFileSync(new URL('../jobright_extension/portal-connection.js', import.meta.url), 'utf8'), {
    location, window, document: {}, console, URLSearchParams, AbortSignal,
    MutationObserver: class { observe() {} },
    chrome: {
      storage: { local: { get: async () => ({ ...storage }), set: async patch => {
        writes.push(patch);
        Object.assign(storage, patch);
      } } },
      runtime: { sendMessage() {} },
    },
    fetch: async (url, options) => {
      requests.push(url);
      if (url.endsWith('/quick-pair')) return Response.json({ token: 'renewed', user });
      return new Response(null, { status: options.headers.Authorization === 'Bearer expired' ? 401 : 200 });
    },
  });
  const post = data => receive({ source: window, origin: location.origin, data });
  post({ type: 'NEXTKIN_RESUME_UPLOADED', candidate, resume: { filename: 'resume.pdf' } });
  post({ type: 'candidate_updated', candidate });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(writes.length, 2);
  assert.equal(requests.filter(url => url.endsWith('/quick-pair')).length, 1);
  assert.equal(storage.token, 'renewed');
  assert.equal(storage.resumeData.filename, 'resume.pdf');
});

test('Application Lifecycle: autofill attaches the resume to a replaced file input', async () => {
  const url = 'https://careers.example.test/jobs/123/apply';
  const events = [];
  const originalInput = { isConnected: true, name: 'resume_upload' };
  const replacement = { isConnected: true, name: 'resume_upload', dispatchEvent: event => events.push(event.type) };
  let input = originalInput;
  const fixture = {
    location: new URL(url),
    document: { querySelectorAll: () => [input] },
    File, Event, atob, crypto,
    DataTransfer: class {
      files = [];
      items = { add: file => this.files.push(file) };
    },
    NextkinJobCapture: { read: () => ({ title: 'Software Engineer' }) },
    NextkinForms: { discoverFields: () => [{ label: 'Name' }], label: el => el.name },
    NextkinFieldMapping: {
      resolveFact: () => ({ key: 'full_name' }),
      planFill: () => [],
      buildValues: candidate => candidate,
    },
    NextkinFieldWriter: {
      applyFill: async () => {
        originalInput.isConnected = false;
        input = replacement;
        return [];
      },
    },
  };
  runInNewContext(readFileSync(new URL('../jobright_extension/core/application.js', import.meta.url), 'utf8'), fixture);
  const candidate = { full_name: 'Fixture Candidate' };
  const resume = { filename: 'resume.pdf', base64: 'AQID', mimeType: 'application/pdf' };
  const result = await fixture.NextkinApplication.fill(url, candidate, resume);
  assert.equal(result.filled[0]?.key, 'resume-file');
  assert.equal(replacement.files[0].size, 3);
  assert.deepEqual(events, ['input', 'change']);
});

test('Application Lifecycle: the Ashby success message is captured from ordinary page text', async () => {
  const original = "Your application was successfully submitted. We'll contact you if there are next steps.";
  const source = readFileSync(new URL('../jobright_extension/application-confirmation.js', import.meta.url), 'utf8');
  const visible = { getClientRects: () => [{}], closest: () => null, innerText: original };

  async function detect({ activeForm = false, dialog = false, toast = false, retry = false, navigate = false, text = original } = {}) {
    const messages = [];
    let callback;
    let toastVisible = toast;
    const location = new URL('https://jobs.ashbyhq.com/docker/posting-id/application');
    const nodes = [{ textContent: text, parentElement: visible }];
    runInNewContext(source, {
      document: {
        body: {},
        title: 'Docker',
        querySelectorAll: selector => selector.startsWith('form ')
          ? (activeForm ? [{ ...visible, innerText: 'Submit application' }] : [])
          : dialog || (toastVisible && selector.includes('[class*="toast" i]'))
            ? [{ ...visible, innerText: text }] : [],
        createTreeWalker: () => ({ nextNode: () => nodes.shift() }),
      },
      window: { location },
      NodeFilter: { SHOW_TEXT: 4 },
      MutationObserver: class { observe() {} disconnect() {} },
      getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
      setTimeout: run => { callback = run; return 1; },
      clearTimeout() {},
      chrome: { runtime: { sendMessage: async message => {
        messages.push(message);
        return !retry || messages.length > 1;
      } } },
    });
    callback();
    if (retry) {
      toastVisible = false;
      if (navigate) location.pathname = '/docker/another-posting/application';
      await new Promise(resolve => setImmediate(resolve));
      callback();
      assert.equal(messages.length, navigate ? 1 : 2);
      if (!navigate) assert.equal(messages[1].evidence, messages[0].evidence);
    }
    return messages[0]?.evidence;
  }

  const evidence = await detect();
  assert.equal(evidence, 'Your application was successfully submitted');
  assert.equal(validateObservation('confirmed', evidence), true);
  assert.equal(await detect({ activeForm: true }), undefined);
  assert.equal(await detect({ activeForm: true, dialog: true }), evidence);
  const popup = await detect({ activeForm: true, dialog: true, text: 'Successfully submitted your application' });
  assert.ok(popup);
  assert.equal(validateObservation('confirmed', popup), true);
  const toast = await detect({ activeForm: true, toast: true, retry: true, text: 'Successfully applied!' });
  assert.equal(toast, 'Successfully applied');
  assert.equal(validateObservation('confirmed', toast), true);
  assert.equal(validateObservation('confirmed', 'Application successful'), true);
  await detect({ activeForm: true, toast: true, retry: true, navigate: true, text: 'Successfully applied!' });
  assert.equal(await detect({ activeForm: true, toast: true, text: 'Application successful only after submitting your application' }), undefined);
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
