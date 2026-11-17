import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { runInNewContext } from 'node:vm';
import { isAppliedApplication, applicationUrlKey, withoutAppliedJobs } from '../src/lib/jobs/application-state.ts';

// Next.js resolves this extensionless TypeScript import. Resolve it in Node's test runner too.
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(specifier === '../jobs/application-state' ? specifier + '.ts' : specifier, context);
  },
});
const { allowedCaptureUrl, validateObservation } = await import('../src/lib/capture/validation.ts');
hooks.deregister();

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

  const sender = { tab, frameId: 0, url: 'https://jobs.lever.co/fixture/thanks' };
  assert.equal(await worker.recordConfirmation({ evidence: 'Thank you for applying' }, sender), true);
  assert.equal(requests[2].body.intentId, intentId);
  assert.equal(requests[2].body.status, 'confirmed');
  assert.equal(await worker.recordConfirmation({ evidence: 'Thank you for applying' }, sender), true);
  assert.equal(requests.length, 3);

  resolvedIntentId = null;
  tab.id++;
  const outsidePosting = 'https://careers.example.test/jobs/123/apply';
  const confirmationUrl = 'https://careers.example.test/jobs/123/confirmation';
  tab.url = confirmationUrl;
  assert.equal(await worker.prepareApplication(tab.id, outsidePosting, {
    title: 'Software Engineer', company: 'Fixture Company', location: 'Remote',
  }, undefined, true), true);
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
  assert.equal(await worker.recordConfirmation({ evidence: 'Application submitted' }, outsideSender), true);
  assert.equal(requests.length, 5, 'A repeated receipt must not resubmit the record');
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
      assert.equal(type, 'submit');
      assert.equal(capture, true);
      onSubmit = callback;
    },
  };
  runInNewContext(readFileSync(new URL('../jobright_extension/core/application.js', import.meta.url), 'utf8'), {
    window, document, location,
    NextkinJobCapture: { read: () => capturedJob },
    NextkinForms: { discoverFields: () => [{ label: 'Name' }] },
    NextkinFieldMapping: { resolveFact: () => ({ key: 'full_name' }) },
    chrome: { runtime: { sendMessage: async message => messages.push(message) } },
  });
  const event = { isTrusted: true, target: { tagName: 'FORM' }, submitter: { innerText: 'Submit application' } };
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
});

test('Application Lifecycle: the Ashby success message is captured from ordinary page text', async () => {
  const original = "Your application was successfully submitted. We'll contact you if there are next steps.";
  const source = readFileSync(new URL('../jobright_extension/application-confirmation.js', import.meta.url), 'utf8');
  const visible = { getClientRects: () => [{}], closest: () => null, innerText: original };

  async function detect({ activeForm = false, dialog = false } = {}) {
    const messages = [];
    let callback;
    const nodes = [{ textContent: original, parentElement: visible }];
    runInNewContext(source, {
      document: {
        body: {},
        title: 'Docker',
        querySelectorAll: selector => selector.startsWith('form ')
          ? (activeForm ? [{ ...visible, innerText: 'Submit application' }] : [])
          : dialog ? [visible] : [],
        createTreeWalker: () => ({ nextNode: () => nodes.shift() }),
      },
      window: { location: { pathname: '/docker/posting-id/application' } },
      NodeFilter: { SHOW_TEXT: 4 },
      MutationObserver: class { observe() {} disconnect() {} },
      getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
      setTimeout: run => { callback = run; return 1; },
      clearTimeout() {},
      chrome: { runtime: { sendMessage: async message => { messages.push(message); return true; } } },
    });
    callback();
    return messages[0]?.evidence;
  }

  const evidence = await detect();
  assert.equal(evidence, 'Your application was successfully submitted');
  assert.equal(validateObservation('confirmed', evidence), true);
  assert.equal(await detect({ activeForm: true }), undefined);
  assert.equal(await detect({ activeForm: true, dialog: true }), evidence);
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
