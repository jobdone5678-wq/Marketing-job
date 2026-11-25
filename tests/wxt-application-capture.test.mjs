import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

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

function fixture({ failOnce = false } = {}) {
  const notices = [];
  const posts = [];
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
        assert.ok(url.endsWith('/api/extension/auto-submit'));
        assert.equal(request.method, 'POST');
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
  return { tracker, form, tab, leave, posts, notices, capture, validation };
}

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
