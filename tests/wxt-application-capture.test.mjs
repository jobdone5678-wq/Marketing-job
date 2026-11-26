import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { handleApplicationReceipt } from '../supabase/functions/application-receipt/index.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const jobUrl = 'https://careers.example.test/jobs/123';
const candidateId = '6074b440-3a8e-4ba1-b797-bc4d4643587b';
const tick = () => new Promise((done) => setImmediate(done));
const field = (label, value, name = label) => ({
  label,
  name,
  value,
  frame: 0,
  form: 0,
  type: 'text',
});

function fixture({ failOnce = false, webhook = false } = {}) {
  const notices = [];
  const posts = [];
  const endpoints = [];
  const webhookUrl = 'https://project.supabase.co/functions/v1/application-receipt';
  const tab = { id: 4, url: jobUrl + '/apply?tracking=excluded' };
  const form = {
    plan: { items: [{ answered: true }] },
    formFields: [field('Email', 'before@example.test'), field('Credit card', 'redacted')],
    uploads: [{ frame: 0, form: 0 }],
    applicationPages: [
      { frame: 0, url: jobUrl + '/apply', jobUrl, jobTitle: 'Engineer', companyName: 'Example' },
    ],
    easyApply: false,
    formFilled: false,
    sent: false,
  };
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    cache.set(file, exports);
    const code = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    runInNewContext(code, {
      exports,
      URL,
      URLSearchParams,
      AbortController,
      crypto: webcrypto,
      $state: (value) => value,
      async fetch(url, request) {
        assert.equal(request.credentials, 'omit');
        assert.equal(request.headers.Authorization, 'Bearer fixture-token');
        if (url.endsWith('/autofill-profile'))
          return Response.json({ data: {}, meta: { candidateId } });
        assert.ok(url === webhookUrl || url.endsWith('/api/extension/auto-submit'));
        assert.equal(request.method, 'POST');
        endpoints.push(url);
        posts.push(JSON.parse(request.body));
        if (failOnce && posts.length === 1)
          return Response.json({ error: 'Temporary failure' }, { status: 500 });
        return Response.json({ success: true, duplicate: posts.length > 1 });
      },
      require(name) {
        if (/(?:^|\/)auth$/.test(name))
          return {
            getToken: async () => 'fixture-token',
            HIRE_ORIGIN: 'https://portal.example.test',
            APPLICATION_RECEIPT_WEBHOOK: webhook ? webhookUrl : undefined,
          };
        if (/(?:^|\/)analytics$/.test(name)) return { track() {} };
        return load(resolve(dirname(file), name + '.ts'));
      },
    });
    return exports;
  }
  const capture = load(resolve(root, 'extension/lib/applicationCapture.ts'));
  const validation = load(resolve(root, 'src/lib/capture/validation.ts'));
  const { AppliedTracker } = load(
    resolve(root, 'extension/entrypoints/sidepanel/applied.svelte.ts')
  );
  const tracker = new AppliedTracker(
    form,
    () => tab,
    (notice) => notices.push(notice)
  );
  function leave(page) {
    tab.url = page.url;
    form.plan = { items: [] };
    form.formFields = [];
    form.uploads = [];
    form.applicationPages = [{ frame: 0, ...page }];
    tracker.note();
  }
  return { tracker, form, tab, leave, posts, notices, capture, validation, endpoints, webhookUrl };
}

test('captures Lever’s visible non-heading confirmation and sends the posting to the Supabase webhook', async () => {
  const app = fixture({ webhook: true });
  const url = 'https://jobs.lever.co/employ/a4ec1fd5-d606-4995-a745-5a8b7848937c/apply';
  const visible = (textContent) => ({ textContent, closest: () => null, getClientRects: () => [1] });
  const doc = {
    location: new URL(url),
    title: 'Employ - Senior Partnership Manager',
    querySelector(selector) {
      if (selector.includes('.posting-headline h2')) return visible('Senior Partnership Manager');
      if (selector.includes('.posting-categories .location')) return visible('Remote, USA');
      if (selector.includes('.posting-categories .commitment')) return visible('Full-Time');
      if (selector.includes('.posting-categories .team')) return visible('Sales – Strategic Partnerships');
      return null;
    },
    querySelectorAll: (selector) => selector.includes('.application-confirmation')
      ? [visible('Application submitted!')] : [],
  };
  const receipt = app.capture.observeApplicationPage(doc);
  assert.match(receipt.evidence ?? '', /application submitted/i);
  app.leave(receipt);
  await tick();
  assert.deepEqual(app.endpoints, [app.webhookUrl]);
  const [posted] = app.posts;
  assert.equal(posted.jobUrl, url.replace(/\/apply$/, ''));
  assert.equal(posted.companyName.toLowerCase(), 'employ');
  assert.equal(posted.jobTitle, 'Senior Partnership Manager');
  assert.equal(posted.jobLocation, 'Remote, USA');
  assert.equal(posted.employmentType, 'Full-Time');
  assert.equal(posted.department, 'Sales – Strategic Partnerships');
  assert.equal(app.validation.allowedCaptureUrl(posted.confirmationUrl, posted.jobUrl, 'submitted', posted.evidence), true);
});

test('Supabase webhook requires a pairing token and preserves the authenticated save response', async () => {
  const url = 'https://project.supabase.co/functions/v1/application-receipt';
  const body = { eventKey: 'fixture', jobTitle: 'Engineer' };
  const authorization = 'Bearer this-is-a-paired-token-fixture';
  let forwards = 0;
  const forward = async (target, request) => {
    forwards++;
    assert.equal(target, 'https://www.nextkinhr.com/api/webhooks/application-submitted');
    assert.equal(request.headers.Authorization, authorization);
    assert.equal(request.redirect, 'error');
    assert.deepEqual(JSON.parse(new TextDecoder().decode(request.body)), body);
    return Response.json({ error: 'Receipt could not be matched.' }, { status: 422 });
  };
  const denied = await handleApplicationReceipt(new Request(url, { method: 'POST' }), forward);
  assert.equal(denied.status, 401);
  assert.equal(forwards, 0);

  const response = await handleApplicationReceipt(new Request(url, {
    method: 'POST',
    headers: { Authorization: authorization, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }), forward);
  assert.equal(forwards, 1);
  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), { error: 'Receipt could not be matched.' });
});

test('captures an external ATS receipt once with its scoped answers and explicit candidate ID', async () => {
  const app = fixture();
  app.tracker.note();
  const page = app.form.applicationPages[0];
  app.tracker.noteSubmitting(
    4,
    0,
    0,
    page,
    app.capture.collectApplicationAnswers(
      [field('Email', 'latest@example.test'), field('Credit card', 'redacted')],
      true
    )
  );
  const confirmationUrl = 'https://careers.example.test/thank-you';
  app.leave({
    url: confirmationUrl,
    jobUrl: 'https://careers.example.test/',
    evidence: 'Thank you for applying',
  });
  app.tracker.note();
  await tick();
  app.tracker.note();
  assert.equal(app.posts.length, 1);
  const receipt = app.posts[0];
  assert.equal(receipt.jobUrl, jobUrl);
  assert.equal(receipt.companyName, 'Example');
  assert.equal(receipt.jobTitle, 'Engineer');
  assert.equal(receipt.confirmationUrl, confirmationUrl);
  assert.equal(receipt.candidateId, candidateId);
  assert.match(receipt.eventKey, /^[a-f0-9-]{36}$/);
  assert.equal(receipt.manualAttestation, false);
  assert.equal(receipt.evidence, 'Thank you for applying');
  assert.equal(app.validation.validateObservation('submitted', receipt.evidence), true);
  assert.equal(app.validation.allowedCaptureUrl(receipt.confirmationUrl, receipt.jobUrl, 'submitted', receipt.evidence), true);
  assert.deepEqual(
    receipt.answers.map(({ label, value }) => [label, value]),
    [['Email', 'latest@example.test']]
  );
});

test('manual confirmation stays with the original posting and reuses its event after a failed save', async () => {
  const app = fixture({ failOnce: true });
  app.tracker.note();
  app.leave({ url: 'https://other.example.test/jobs/678' });
  assert.equal(app.tracker.asks(false), true);
  assert.equal(app.posts.length, 0);
  app.tracker.confirm('Engineer', 'Example');
  await tick();
  assert.equal(app.tracker.asks(false), true);
  app.tracker.confirm('Engineer', 'Example');
  await tick();
  assert.equal(app.posts.length, 2);
  assert.deepEqual(app.posts[0], app.posts[1]);
  assert.equal(app.posts[0].manualAttestation, true);
  assert.equal(app.posts[0].confirmationUrl, jobUrl);
  assert.equal(app.tracker.asks(false), false);
});

test('rejects uncertain page text and keeps LinkedIn posting identity without session parameters', () => {
  const { capture } = fixture();
  const doc = {
    location: new URL('https://careers.example.test/jobs/123'),
    querySelectorAll: () => [
      {
        closest: () => null,
        getClientRects: () => [1],
        textContent: 'Thank you for applying once you submit your application.',
      },
    ],
  };
  assert.equal(capture.applicationReceiptEvidence(doc), undefined);
  assert.equal(
    capture.applicationPageUrl(
      'https://www.linkedin.com/jobs/search/?currentJobId=1234&session=secret',
      true
    ),
    'https://www.linkedin.com/jobs/view/1234'
  );
});

test('saves LinkedIn confirmation on a noncatalog posting and asks for missing receipt metadata', async () => {
  const linkedin = fixture();
  const job = 'https://www.linkedin.com/jobs/view/1234';
  linkedin.leave({ url: job, jobUrl: job, jobTitle: 'Engineer', companyName: 'Example', evidence: 'Your application was sent' });
  await tick();
  assert.equal(linkedin.posts[0].jobUrl, job);
  assert.equal(linkedin.posts[0].manualAttestation, false);

  const incomplete = fixture();
  incomplete.leave({ url: jobUrl + '/confirmation', jobUrl, evidence: 'Thank you for applying' });
  assert.equal(incomplete.tracker.asks(false), true);
  assert.equal(incomplete.posts.length, 0);
  incomplete.tracker.confirm('Engineer', 'Example');
  await tick();
  assert.equal(incomplete.posts[0].manualAttestation, true);
});
