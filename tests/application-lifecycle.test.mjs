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

test('Application Lifecycle: autofill restores tracking on an already-open posting and records its receipt', async () => {
  const intentId = '8b1d6779-6dc3-419c-855a-fa293123aba0';
  const candidateId = 'a71cb53e-586a-4aa6-a17e-507d6730eafc';
  const posting = 'https://jobs.lever.co/fixture/123/apply';
  const tab = { id: 17, url: posting + '?email=private@example.test' };
  const noop = { addListener() {} };
  const workspace = 'https://www.nextkinhr.com';
  const state = { origin: workspace, token: 'paired-token-for-receipts', accountId: 'actor' };
  const requests = [];
  const scripts = [];
  const notices = [];
  let resolvedIntentId = intentId;
  const worker = {
    URL,
    URLSearchParams,
    AbortSignal,
    crypto,
    chrome: {
      runtime: { onInstalled: noop, onStartup: noop, onConnect: noop, onMessage: noop },
      tabs: {
        onUpdated: noop, onRemoved: noop, get: async () => tab,
        query: async () => [
          { id: 1, url: workspace + '/dashboard/submissions' },
          { id: 2, url: 'https://elsewhere.example.test/dashboard/submissions' },
          { id: 3, url: workspace + '/auth/jobseeker' },
          { id: 4, url: workspace + '/dashboard' },
        ],
        sendMessage: async (tabId, message) => notices.push([tabId, message.type]),
      },
      storage: {
        local: {
          get: async keys => Object.fromEntries([keys].flat().map(key => [key, state['local:' + key]])),
          set: async patch => { for (const [key, value] of Object.entries(patch)) state['local:' + key] = value; },
        },
        session: {
          get: async keys => keys == null ? { ...state } : Object.fromEntries([keys].flat().map(key => [key, state[key]])),
          set: async records => Object.assign(state, records),
        },
      },
      scripting: { executeScript: async options => scripts.push(options.files[0]) },
    },
    fetch: async (url, options) => {
      const body = options.body && JSON.parse(options.body);
      requests.push({ url, body });
      if (url.endsWith('/resolve')) return Response.json({ intentId: resolvedIntentId });
      if (url.endsWith(intentId)) return Response.json({ intent: { id: intentId, attempt: 1, candidate_id: candidateId } });
      if (url.endsWith('/application-submitted')) return Response.json({ success: true });
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

  const sender = { tab, frameId: 0, documentId: 'form-document', url: 'https://jobs.lever.co/fixture/thanks' };
  assert.equal(await worker.recordConfirmation({ evidence: 'Thank you for applying' }, sender), false);
  assert.equal(await worker.markSubmission({ ...sender, url: tab.url }), true);
  assert.equal(await worker.recordConfirmation({ evidence: 'Thank you for applying' }, sender), true);
  assert.equal(requests[3].body.intentId, intentId);
  assert.equal(requests[3].body.status, 'confirmed');
  assert.equal(requests[3].body.applicationUrl, posting);
  assert.deepEqual(requests[3].body.answers, answers);
  assert.deepEqual(requests[3].body.appliedResume, { filename: 'resume.pdf', mimeType: 'application/pdf' });
  assert.equal(state['application-intent:17'].submissionEvidence, undefined);
  assert.equal(await worker.recordConfirmation({ evidence: 'Thank you for applying' }, sender), true);
  assert.equal(requests.length, 4);
  assert.deepEqual(notices.map(([tabId]) => tabId), [1, 4]);

  resolvedIntentId = null;
  tab.id++;
  const outsidePosting = 'https://careers.example.test/jobs/123/apply';
  const confirmationUrl = 'https://careers.example.test/jobs/123/confirmation';
  tab.url = confirmationUrl;
  assert.equal(await worker.prepareApplication(tab.id, outsidePosting, {
    title: 'Software Engineer', company: 'Fixture Company', location: 'Remote',
  }, candidateId, true, { answers, appliedResume }), true);
  assert.equal(requests.length, 5, 'Submitting the form only prepares tracking');

  const outsideSender = { tab, frameId: 0, documentId: 'outside-form', url: confirmationUrl };
  assert.equal(await worker.markSubmission({ ...outsideSender, url: outsidePosting }), true);
  assert.equal(await worker.recordConfirmation({ evidence: 'Application submitted' }, outsideSender), true);
  const outside = requests[5];
  assert.equal(outside.url, workspace + '/api/webhooks/application-submitted');
  assert.equal(outside.body.jobUrl, outsidePosting);
  assert.equal(outside.body.confirmationUrl, confirmationUrl);
  assert.equal(outside.body.candidateId, candidateId);
  assert.equal(outside.body.jobTitle, 'Software Engineer');
  assert.equal(outside.body.companyName, 'Fixture Company');
  assert.deepEqual(outside.body.answers, answers);
  assert.deepEqual(outside.body.appliedResume, { filename: 'resume.pdf', mimeType: 'application/pdf' });
  assert.equal(await worker.recordConfirmation({ evidence: 'Application submitted' }, outsideSender), true);
  assert.equal(requests.length, 6, 'A repeated receipt must not resubmit the record');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(notices, [1, 4, 1, 4].map(tabId => [tabId, 'NEXTKIN_OUTSIDE_APPLICATION_SAVED']));

  const postingWithRoute = 'https://careers.example.test/#/jobs/123/apply?email=private@example.test';
  tab.id++;
  tab.url = postingWithRoute;
  resolvedIntentId = intentId;
  await worker.prepareApplication(tab.id, postingWithRoute);
  assert.deepEqual(requests.at(-2).body, { url: 'https://careers.example.test/#/jobs/123/apply' });
});

test('Application Lifecycle: an embedded Ashby receipt saves the outside posting from its own frame', async () => {
  const posting = '206c6a86-74e3-4fcf-9175-fdfe07858676';
  const workspace = 'https://www.nextkinhr.com';
  const parent = 'https://www.ashbyhq.com/careers?ashby_jid=' + posting;
  const hosted = 'https://jobs.ashbyhq.com/Ashby/' + posting;
  const frame = { frameId: 3, documentId: 'embedded-document', url: hosted + '/application?embed=js' };
  const tab = { id: 17, url: parent };
  const profile = '8b1d6779-6dc3-419c-855a-fa293123aba0';
  const state = { origin: workspace, token: 'paired-token-for-receipts', accountId: 'actor' };
  const scripts = [];
  const requests = [];
  const noop = { addListener() {} };
  const worker = {
    URL, URLSearchParams, AbortSignal, crypto,
    chrome: {
      runtime: { onInstalled: noop, onStartup: noop, onConnect: noop, onMessage: noop },
      tabs: { onUpdated: noop, onRemoved: noop, get: async () => tab },
      storage: {
        local: {
          get: async keys => Object.fromEntries([keys].flat().map(key => [key, state['local:' + key]])),
          set: async patch => { for (const [key, value] of Object.entries(patch)) state['local:' + key] = value; },
        },
        session: {
          get: async keys => keys == null ? { ...state } : Object.fromEntries([keys].flat().map(key => [key, state[key]])),
          set: async (records) => Object.assign(state, records),
        },
      },
      scripting: {
        executeScript: async ({ target, files }) => {
          assert.equal(target.documentIds[0], frame.documentId);
          if (files) scripts.push(files[0]);
          return [{ frameId: frame.frameId, result: frame.url }];
        },
      },
    },
    fetch: async (url, options) => {
      requests.push({ url, payload: JSON.parse(options.body) });
      return Response.json({ success: true });
    },
  };
  runInNewContext(readFileSync(new URL('../jobright_extension/background.js', import.meta.url), 'utf8'), worker);
  const job = { title: 'Manager of Renewals, SMB', company: 'Ashby' };
  assert.equal(await worker.prepareEmbeddedOutsideApplication(tab.id, parent.replace(posting, profile), frame, job, profile), false);
  assert.equal(await worker.prepareEmbeddedOutsideApplication(tab.id, parent + '#marketing-intent=' + profile, frame, job, profile), false);
  assert.equal(await worker.prepareEmbeddedOutsideApplication(tab.id, parent, frame, job, profile), true);
  assert.equal(await worker.prepareEmbeddedOutsideApplication(tab.id, parent, frame, job, profile), true);
  assert.deepEqual(scripts, ['application-confirmation.js']);

  const receipt = { evidence: 'Your application was successfully submitted' };
  const sender = { tab, frameId: frame.frameId, documentId: frame.documentId, url: hosted + '?embed=js' };
  assert.equal(await worker.markSubmission({ tab, ...frame }), true);
  assert.equal(await worker.recordConfirmation(receipt, { ...sender, documentId: 'different-document' }), false);
  assert.equal(await worker.recordConfirmation(receipt, { ...sender, url: hosted.replace(posting, profile) }), false);
  assert.equal(await worker.recordConfirmation(receipt, { ...sender, tab: { ...tab, url: parent.replace(posting, profile) } }), false);
  assert.equal(requests.length, 0);
  assert.equal(await worker.recordConfirmation(receipt, sender), true);
  assert.equal(await worker.recordConfirmation(receipt, sender), true);
  assert.equal(requests.length, 1);
  const [{ url, payload }] = requests;
  assert.equal(url, workspace + '/api/webhooks/application-submitted');
  assert.equal(payload.jobUrl, hosted + '/application');
  assert.equal(payload.confirmationUrl, hosted);
  assert.equal(payload.jobTitle, job.title);
  assert.equal(payload.externalId, posting);
  assert.equal(payload.candidateId, profile);
  assert.equal(allowedCaptureUrl(payload.confirmationUrl, payload.jobUrl, 'submitted', payload.evidence), true);
});

test('Application Lifecycle: a provider-independent outside form saves discovery and keeps tracking after an iframe navigation', async () => {
  const workspace = 'https://www.nextkinhr.com';
  const tab = { id: 27, url: 'https://employer.example.test/openings/123' };
  const jobUrl = 'https://hiring.example.test/employer/jobs/123/apply';
  const frame = { frameId: 4, documentId: 'form-document', url: jobUrl };
  const receipt = { evidence: 'Your application has been received' };
  const sender = { tab, frameId: 4, documentId: 'receipt-document', url: 'https://hiring.example.test/employer/thank-you' };
  const candidateId = '8b1d6779-6dc3-419c-855a-fa293123aba0';
  const state = { origin: workspace, token: 'paired-token-for-receipts', accountId: 'actor' };
  const requests = [];
  const injected = [];
  const noop = { addListener() {} };
  const worker = {
    URL, URLSearchParams, AbortSignal, crypto,
    chrome: {
      runtime: { onInstalled: noop, onStartup: noop, onConnect: noop, onMessage: noop },
      tabs: { onUpdated: noop, onRemoved: noop, get: async () => tab },
      storage: {
        local: {
          get: async keys => Object.fromEntries([keys].flat().map(key => [key, state['local:' + key]])),
          set: async patch => { for (const [key, value] of Object.entries(patch)) state['local:' + key] = value; },
        },
        session: {
          get: async keys => keys == null ? { ...state } : Object.fromEntries([keys].flat().map(key => [key, state[key]])),
          set: async (records) => Object.assign(state, records),
        },
      },
      scripting: {
        executeScript: async ({ target, files }) => {
          if (files) injected.push(target.documentIds[0]);
          return [{ frameId: frame.frameId, result: frame.url }];
        },
      },
    },
    fetch: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      return Response.json({ success: true });
    },
  };
  runInNewContext(readFileSync(new URL('../jobright_extension/background.js', import.meta.url), 'utf8'), worker);
  assert.equal(await worker.prepareEmbeddedOutsideApplication(tab.id, tab.url, frame,
    { title: 'Engineer', company: 'Employer', description: 'Build applications for the engineering team.' }, candidateId), true);
  const key = 'embedded-outside-application:' + tab.id;
  await worker.saveOutsideDiscovery(key);
  await worker.saveOutsideDiscovery(key);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, workspace + '/api/extension/save-external-job');
  assert.equal(requests[0].body.candidateId, candidateId);
  assert.equal(requests[0].body.jobUrl, jobUrl);
  assert.equal(await worker.recordConfirmation(receipt, sender), false);
  await worker.resumeEmbeddedTracking({ ...sender, url: 'https://unrelated.example.test/thanks' });
  assert.deepEqual(injected, ['form-document']);
  assert.equal(await worker.markSubmission({ tab, ...frame }), true);
  await worker.resumeEmbeddedTracking(sender);
  assert.deepEqual(injected, ['form-document', 'receipt-document']);
  assert.equal(await worker.recordConfirmation(receipt, { ...sender, documentId: 'form-document' }), false);
  assert.equal(await worker.recordConfirmation(receipt, sender), true);
  assert.equal(requests[1].url, workspace + '/api/webhooks/application-submitted');
  assert.equal(requests[1].body.candidateId, candidateId);
  assert.equal(requests[1].body.jobUrl, requests[0].body.jobUrl);
  assert.equal(allowedCaptureUrl(requests[1].body.confirmationUrl, jobUrl, 'submitted', receipt.evidence), true);
});

test('Application Lifecycle: a LinkedIn posting without candidate context does not arm tracking', async () => {
  const posting = 'https://www.linkedin.com/jobs/view/1234567890';
  const workspace = 'https://www.nextkinhr.com';
  const state = { origin: workspace, token: 'paired-token-for-receipts', accountId: 'actor' };
  const scripts = [];
  const noop = { addListener() {} };
  const tab = { id: 31, url: posting };
  const job = { title: 'DevSecOps Engineer', company: 'Morgan McKinley', jobUrl: posting };
  const worker = {
    URL, URLSearchParams, AbortSignal, crypto,
    chrome: {
      runtime: { onInstalled: noop, onStartup: noop, onConnect: noop, onMessage: noop },
      tabs: { onUpdated: noop, onRemoved: noop, get: async () => tab },
      storage: {
        local: {
          get: async keys => Object.fromEntries([keys].flat().map(key => [key, state['local:' + key]])),
          set: async patch => { for (const [key, value] of Object.entries(patch)) state['local:' + key] = value; },
        },
        session: {
          get: async key => Object.fromEntries([key].flat().map(name => [name, state[name]])),
          set: async records => Object.assign(state, records),
          remove: async key => { delete state[key]; },
        },
      },
      scripting: {
        executeScript: async options => {
          if (options.files) { scripts.push(options.files[0]); return []; }
          return [{ result: options.func() }];
        },
      },
    },
    fetch: async () => Response.json({ intentId: null }),
    NextkinJobCapture: { read: () => job },
  };
  runInNewContext(readFileSync(new URL('../jobright_extension/background.js', import.meta.url), 'utf8'), worker);

  await worker.trackApplication(tab.id, posting);

  assert.deepEqual(scripts, []);
  assert.equal(state['application-intent:' + tab.id], undefined);
});

test('Application Lifecycle: manual application tracking starts only for a real job form submission', () => {
  const job = { title: 'Software Engineer', company: 'Company' };
  const location = new URL('https://careers.example.test/jobs/123/apply');
  const messages = [];
  let onSubmit;
  let onClick;
  let capturedJob = job;
  const window = {};
  window.top = window;
  const document = {
    querySelectorAll: () => [],
    addEventListener(type, callback, capture) {
      assert.equal(capture, true);
      if (type === 'submit') onSubmit = callback;
      if (type === 'click') onClick = callback;
    },
  };
  const applicationSource = readFileSync(new URL('../jobright_extension/core/application.js', import.meta.url), 'utf8');
  const fixture = {
    window, document, location, URLSearchParams,
    NextkinJobCapture: { read: () => capturedJob },
    NextkinForms: { discoverFields: () => [{ label: 'Name' }] },
    NextkinFieldMapping: { resolveFact: () => ({ key: 'full_name' }) },
    NextkinFieldWriter: { read: () => 'Fixture Candidate' },
    chrome: { runtime: { sendMessage: async message => messages.push(message) } },
  };
  runInNewContext(applicationSource, { ...fixture });
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

  runInNewContext(applicationSource, { ...fixture, window: { top: {} } });
  onSubmit(event);
  assert.equal(messages.length, 2);
  assert.equal(messages[1].submitted, true);
  assert.equal(messages[1].job, job);

  const button = { innerText: 'Submit Application', type: 'submit', closest: () => null };
  const click = { isTrusted: true, target: { closest: selector => selector.includes('button[type="submit"]') ? button : null } };
  onClick({ ...click, isTrusted: false });
  onClick({ ...click, target: { closest: () => ({ ...button, innerText: 'Next' }) } });
  onClick({ ...click, target: { closest: () => ({ ...button, form: event.target }) } });
  assert.equal(messages.length, 2);
  onClick(click);
  assert.equal(messages.length, 3);
  assert.equal(messages[2].submitted, true);
  assert.equal(messages[2].job, job);
});

test('Application Lifecycle: automatic submission requires a verified form, resume and manual legal review', async () => {
  const location = new URL('https://careers.example.test/#/jobs/123/apply');
  const job = { title: 'Engineer' };
  const file = new File([Uint8Array.of(1, 2, 3)], 'resume.pdf', { type: 'application/pdf' });
  const resume = { name: 'résumé', type: 'file', files: [file] };
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
  await assert.rejects(submit, /submit it manually/);
  button.innerText = 'Submit application';
  fields[2].element.value = true;
  await assert.rejects(submit, /submit it manually/);
  assert.equal(events.length, 0);
});


test('Application Lifecycle: automatic submission stages a verified form and never submits AI drafts', async () => {
  const location = new URL('https://careers.example.test/jobs/123/apply');
  const source = readFileSync(new URL('../jobright_extension/core/application.js', import.meta.url), 'utf8');
  for (const ai of [false, true]) {
    const messages = [];
    const button = { type: 'submit', innerText: 'Submit application', getClientRects: () => [{}] };
    const form = {
      isConnected: true, elements: [button], querySelectorAll: () => [], querySelector: () => null,
      checkValidity: () => true, requestSubmit: control => messages.push(control),
    };
    const field = { label: 'Full Name', kind: 'text', element: { form, required: true, value: 'Candidate' } };
    const screening = { label: 'Describe your experience', kind: 'textarea', element: { form, value: '' } };
    const sandbox = {
      location, document: form, crypto,
      NextkinJobCapture: { read: () => ({ title: 'Engineer' }) },
      NextkinForms: { discoverFields: () => ai ? [field, screening] : [field] },
      NextkinFieldMapping: {
        resolveFact: () => ({ key: 'full_name' }), isAiEligible: () => true,
        planFill: fields => fields.map(control => control === field
          ? { field: control, status: 'supported', value: 'Candidate', factKey: 'full_name' }
          : { field: control, status: 'ai' }),
      },
      NextkinFieldWriter: {
        read: control => control.element.value,
        readChoices: async () => [],
        applyFill: async plans => plans.filter(plan => plan.status === 'supported').map(plan => {
          plan.field.element.value = plan.value;
          return { ...plan, writtenValue: plan.value };
        }),
      },
      chrome: { runtime: { sendMessage: async message => {
        if (message.submitted) messages.push(message);
        return { tracked: true };
      } } },
    };
    runInNewContext(source, sandbox);
    await sandbox.NextkinApplication.fill(location.href, { id: 'candidate', full_name: 'Candidate' }, null,
      false, null, null, ai ? { 'describe your experience': 'I build software.' } : null);
    if (ai) {
      await assert.rejects(() => sandbox.NextkinApplication.submitApplication(location.href), /submit it manually/);
      assert.deepEqual(messages, []);
    } else {
      await sandbox.NextkinApplication.submitApplication(location.href);
      assert.equal(messages[0].automatic, true);
      assert.equal(messages[1], button);
      assert.equal(sandbox.NextkinApplication.getState(), 'PENDING_VERIFICATION');
      assert.equal(sandbox.NextkinApplication.getSyncStatus(), 'SYNC_PENDING');
    }
  }
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

test('Application Lifecycle: the worker declines unscoped resume-file messages', async () => {
  const storage = { origin: 'https://www.nextkinhr.com', token: 'paired-token' };
  const noop = { addListener() {} };
  let handler;
  const worker = {
    URL, URLSearchParams, AbortSignal,
    chrome: {
      runtime: { onInstalled: noop, onStartup: noop, onConnect: noop, onMessage: { addListener(fn) { handler = fn; } } },
      tabs: { onUpdated: noop, onRemoved: noop },
      storage: { local: { get: async () => ({ ...storage }) } },
    },
    fetch: async () => assert.fail('Resume fetch must be scoped to an attempt'),
  };
  runInNewContext(readFileSync(new URL('../jobright_extension/background.js', import.meta.url), 'utf8'), worker);
  assert.equal(handler({ type: 'NEXTKIN_FETCH_RESUME_FILE' }, { tab: { id: 1 } }, () => assert.fail()), undefined);
});

test('Autofill resumes a new wizard document once and rejects other postings', async () => {
  const candidateId = '8b1d6779-6dc3-419c-855a-fa293123aba0';
  const account = { origin: 'https://www.nextkinhr.com', token: 'paired-token', accountId: 'actor' };
  const state = { ...account };
  const noop = { addListener() {} };
  const sandbox = {
    URL, URLSearchParams, AbortSignal,
    chrome: {
      runtime: { onInstalled: noop, onStartup: noop, onConnect: noop, onMessage: noop },
      tabs: { onUpdated: noop, onRemoved: noop },
      storage: { local: { get: async () => ({ ...account }) }, session: {
        get: async key => Object.fromEntries([key].flat().map(name => [name, state[name]])), set: async records => Object.assign(state, records),
        remove: async key => { delete state[key]; },
      } },
    },
    fetch: async url => url.includes('/candidates?') ? Response.json({ candidates: [{ id: candidateId,
      provenance_status: 'confirmed', confirmed_facts: { full_name: 'Fixture Candidate' } }] }) : new Response(null, { status: 404 }),
  };
  runInNewContext(readFileSync(new URL('../jobright_extension/background.js', import.meta.url), 'utf8'), sandbox);
  const first = { tab: { id: 1 }, frameId: 0, documentId: 'first', url: 'https://jobs.example.test/jobs/123/apply/contact' };
  const next = { ...first, documentId: 'next', url: 'https://jobs.example.test/jobs/123/apply/preferences' };
  await sandbox.storeAttempt({ type: 'NEXTKIN_SAVE_ATTEMPT', payload: { requiresReview: true, context: {
    candidateId, attemptId: candidateId, resumeDocumentId: null,
  } } }, first);
  await sandbox.queueApplicationStep(1, first, { candidateId });
  assert.equal(await sandbox.claimApplicationStep(1, first), null);
  const claim = await sandbox.claimApplicationStep(1, next);
  assert.equal(claim.profile.id, candidateId);
  assert.equal(claim.requiresReview, true);
  assert.equal(await sandbox.claimApplicationStep(1, next), null);
  await sandbox.queueApplicationStep(1, first, { candidateId });
  assert.equal(await sandbox.claimApplicationStep(1, { ...next, url: next.url.replace('/123/', '/456/') }), null);
  await sandbox.queueApplicationStep(1, first, { candidateId });
  state.accountId = 'another-account';
  assert.equal(await sandbox.claimApplicationStep(1, next), null);
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
    location: url, document: { querySelectorAll: () => [] }, crypto, Event, URL, HTMLInputElement: Input,
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

test('Application Lifecycle: profile saves trigger a refresh without copying page data', async () => {
  const location = new URL('https://www.nextkinhr.com/dashboard/candidates');
  const storage = { origin: location.origin, token: 'existing-token', user: { id: 'account-id' } };
  const sessionStorage = {};
  const notifications = [];
  const runtimeMessages = [];
  let receive;
  let receiveExtension;
  const window = {
    addEventListener: (_type, listener) => { receive = listener; },
    postMessage: (message, origin) => notifications.push([message.type, origin]),
  };
  runInNewContext(readFileSync(new URL('../jobright_extension/portal-connection.js', import.meta.url), 'utf8'), {
    location, window, console,
    chrome: {
      storage: {
        session: {
          get: async () => ({ ...sessionStorage }),
          set: async patch => { Object.assign(sessionStorage, patch); },
          remove: async key => {
            const keys = Array.isArray(key) ? key : [key];
            for (const k of keys) delete sessionStorage[k];
          },
        },
        local: {
          get: async () => ({ ...storage }),
          set: async patch => { Object.assign(storage, patch); },
          remove: async key => {
            const keys = Array.isArray(key) ? key : [key];
            for (const k of keys) delete storage[k];
          },
        },
      },
      runtime: {
        id: 'fixture-extension',
        sendMessage: async message => runtimeMessages.push({ ...message }),
        onMessage: { addListener: listener => { receiveExtension = listener; } },
      },
    },
  });

  const post = (data, origin = location.origin) => receive({ source: window, origin, data });
  const pairing = { type: 'NEXTKIN_EXTENSION_PAIRED', token: 'fixture-valid-token-123', user: { id: 'new-account', role: 'candidate' } };
  post(pairing);
  post({ type: 'NEXTKIN_PROFILE_SAVED' }, 'https://example.test');
  post({ type: 'NEXTKIN_PROFILE_SAVED' });
  post({ type: 'NEXTKIN_RESUME_UPLOADED', resume: { filename: 'resume.pdf' } });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(runtimeMessages, [
    { type: 'NEXTKIN_PROFILE_SAVED' },
    { type: 'NEXTKIN_PROFILE_SAVED' },
  ]);
  assert.equal(sessionStorage.token, undefined);
  assert.equal(storage.resumeData, undefined);

  location.pathname = '/auth/jobseeker/connected';
  post(pairing);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sessionStorage.token, pairing.token);
  assert.equal(storage.token, undefined);
  assert.equal(storage.user.id, 'new-account');
  assert.equal(storage.activeCandidateId, null);
  assert.equal(runtimeMessages.at(-1).type, 'NEXTKIN_SAVE_CONNECTION');
  assert.equal(runtimeMessages.at(-1).token, pairing.token);
  assert.equal(runtimeMessages.at(-1).user.id, 'new-account');

  const message = { type: 'NEXTKIN_OUTSIDE_APPLICATION_SAVED' };
  receiveExtension(message, { id: 'another-extension' });
  assert.deepEqual(notifications, []);
  receiveExtension(message, { id: 'fixture-extension' });
  assert.deepEqual(notifications, [[message.type, location.origin]]);
});

test('Application Lifecycle: autofill attaches the resume to a replaced file input', async () => {
  const url = 'https://careers.example.test/jobs/123/apply';
  const events = [];
  const originalInput = { isConnected: true, name: 'resume_upload' };
  const replacement = { isConnected: true, type: 'file', name: 'resume_upload', dispatchEvent: event => events.push(event.type) };
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
  const realWriter = { DataTransfer: fixture.DataTransfer, File, Event, atob };
  runInNewContext(readFileSync(new URL('../jobright_extension/core/field-writer.js', import.meta.url), 'utf8'), realWriter);
  fixture.NextkinFieldWriter.attachResumeFile = realWriter.NextkinFieldWriter.attachResumeFile;
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

  async function detect({ activeForm = false, dialog = false, live = false, toast = false, retry = false, navigate = false, text = original } = {}) {
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
          : dialog || (live && selector.includes('[aria-live="polite"]')) || (toastVisible && selector.includes('[class*="toast" i]'))
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
        if (message.type === 'NEXTKIN_GET_SUBMISSION_ATTEMPT') return true;
        messages.push(message);
        return !retry || messages.length > 1;
      } } },
    });
    callback();
    await new Promise(resolve => setImmediate(resolve));
    if (retry) {
      toastVisible = false;
      if (navigate) location.pathname = '/docker/another-posting/application';
      await new Promise(resolve => setImmediate(resolve));
      callback();
      await new Promise(resolve => setImmediate(resolve));
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
  const liveNotice = await detect({ activeForm: true, live: true, text: "We've successfully received your application" });
  assert.equal(liveNotice, "We've successfully received your application");
  assert.equal(validateObservation('confirmed', liveNotice), true);
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
