import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const root = fileURLToPath(new URL('..', import.meta.url));
const tab = { id: 7, url: 'https://jobs.example.test/apply?session=private' };
const target = { tabId: tab.id, url: tab.url };
const candidateId = '6074b440-3a8e-4ba1-b797-bc4d4643587b';
const field = (index, label, extra = {}) => ({
  index,
  label,
  frame: 3,
  form: 1,
  tag: 'input',
  type: 'text',
  value: '',
  ...extra,
});
const profile = Object.fromEntries(
  [
    'full_name',
    'first_name',
    'last_name',
    'phone',
    'location',
    'linkedin',
    'github',
    'portfolio',
    'authorized_countries',
    'visa_sponsorship_needed',
    'desired_salary',
    'notice_period',
    'willing_to_relocate',
    'age_18_or_older',
  ].map((key) => [key, ''])
);
profile.email = 'fixture@example.test';

function fixture({ mode = 'server', uploads = [{ frame: 3, form: 1 }], abortOnPlan = false } = {}) {
  const controller = new AbortController();
  const fields = [
    field(0, 'Email'),
    field(1, 'First name', { value: 'Existing' }),
    field(2, 'Highest qualification', { tag: 'select', options: ['Bachelor'] }),
    field(3, 'Do you require sponsorship?', { combo: true }),
    field(4, 'Why are you interested in this role?', { tag: 'textarea' }),
    field(5, 'How many years of experience?', { tag: 'textarea' }),
    field(6, 'Password', { type: 'password' }),
  ];
  const events = [];
  const write = (label, value) => {
    const item = fields.find((entry) => entry.label === label);
    assert.equal(item.value, '');
    item.value = value;
  };
  const browser = {
    tabs: { query: async () => [tab] },
    runtime: {
      async sendMessage(message) {
        assert.equal(message.target.tabId, target.tabId);
        assert.equal(message.target.url, target.url);
        if (message.kind === 'GET_FRAMED_FORM') return { kind: 'FRAMED_FORM', fields, uploads };
        if (message.kind === 'GET_PAGE_SNAPSHOT')
          return {
            kind: 'PAGE_SNAPSHOT',
            snapshot: {
              url: tab.url,
              title: 'Jobs',
              headline: 'Developer',
              text: '',
              jobPosting: { company: 'Example', description: 'Build the product.' },
            },
          };
        if (message.kind === 'FILL_BY_LABEL') {
          const [fill] = message.fills;
          assert.equal(fill.frame, 3);
          assert.equal(fill.form, 1);
          assert.equal(fill.onlyEmpty, true);
          events.push(fill.label);
          write(fill.label, fill.value);
          return { kind: 'FILL_OUTCOMES', outcomes: [{ status: 'filled' }] };
        }
        const { action, label, value, frame, form } = message.step;
        assert.equal(frame, 3);
        assert.equal(form, 1);
        events.push(action);
        const states = { open: 'opened', options: 'open', select: 'selected', verify: 'verified' };
        if (action === 'select') write(label, value);
        return {
          kind: 'COMBOBOX_REPLY',
          reply: { status: states[action], options: ['Yes', 'No'] },
        };
      },
    },
  };
  async function fetch(url, init) {
    assert.equal(init.credentials, 'omit');
    assert.equal(init.headers.Authorization, 'Bearer token');
    const path = new URL(url).pathname;
    if (path.endsWith('/autofill-profile'))
      return Response.json({ data: profile, meta: { candidateId } });
    if (path.endsWith('/settings')) return Response.json({ mode, configVersion: 1 });
    const body = JSON.parse(init.body);
    assert.equal(body.candidateId, candidateId);
    if (path.endsWith('/plan')) {
      events.push('plan');
      assert.equal(body.context.jobDescription, 'Build the product.');
      assert.equal(body.context.url, 'https://jobs.example.test/apply');
      assert.deepEqual(
        body.fields.map(({ label }) => label),
        fields.slice(2, 6).map(({ label }) => label)
      );
      if (abortOnPlan) controller.abort();
      return Response.json({
        ok: true,
        executableFills: [
          { fieldId: '3:1:2', value: 'Bachelor', grounded: true },
          { fieldId: '3:1:1', value: 'Unrequested overwrite', grounded: true },
        ],
        deferredFieldIds: ['3:1:3'],
      });
    }
    if (path.endsWith('/choose')) {
      events.push('choose');
      assert.deepEqual(body.options, ['Yes', 'No']);
      return Response.json({ ok: true, choice: 'No' });
    }
    assert.ok(path.endsWith('/generate-answer'));
    events.push('generate');
    assert.equal(body.fieldLabel, fields[4].label);
    assert.equal(body.jobDescription, 'Build the product.');
    return Response.json({ ok: true, answer: 'I enjoy building products.' });
  }
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
      fetch,
      URL,
      Response,
      setTimeout: (fn) => fn(),
      require(name) {
        if (name === 'wxt/browser') return { browser };
        if (name === './auth') return { HIRE_ORIGIN: 'https://portal.example.test' };
        if (name === './analytics') return { track() {} };
        return load(resolve(dirname(file), name + '.ts'));
      },
    });
    return exports;
  }
  const { runAutofill } = load(resolve(root, 'extension/lib/formFill.ts'));
  const panel = {
    notice: () => {},
    offerOverride: (run) => {
      panel.override = run;
    },
    refreshPlan: async () => {},
    known: () => {},
    refused: (error) => {
      throw error;
    },
    walk: { filling() {}, stopped: () => false, wrote() {}, answered() {} },
  };
  return {
    run: () => runAutofill('token', panel, controller.signal),
    events,
    fields,
    panel,
    controller,
  };
}

test('runs all four passes in order with scoped writes and verified live choices', async () => {
  const app = fixture();
  await app.run();
  assert.deepEqual(app.events, [
    'Email',
    'plan',
    'Highest qualification',
    'open',
    'options',
    'choose',
    'select',
    'verify',
    'generate',
    'Why are you interested in this role?',
  ]);
  assert.deepEqual(
    app.fields.map(({ value }) => value),
    ['fixture@example.test', 'Existing', 'Bachelor', 'No', 'I enjoy building products.', '', '']
  );
});

test('keeps local fills when direct provider mode is selected or a pending plan is cancelled', async () => {
  for (const options of [{ mode: 'local' }, { abortOnPlan: true }]) {
    const app = fixture(options);
    await app.run();
    assert.deepEqual(app.events, options.abortOnPlan ? ['Email', 'plan'] : ['Email']);
  }
});

test('requires confirmation before autofilling a form without application markers', async () => {
  const app = fixture({ uploads: [] });
  await app.run();
  assert.deepEqual(app.events, []);
  assert.equal(typeof app.panel.override, 'function');
  await app.panel.override(app.controller.signal);
  assert.equal(app.events[0], 'Email');
});
