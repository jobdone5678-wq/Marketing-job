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

function fixture({
  mode = 'server', uploads = [{ frame: 3, form: 1 }], abortOnPlan = false, timeoutOnBatch, planError = 504,
  includeDemographics = false, demographicsEnabled = false,
} = {}) {
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
  if (timeoutOnBatch) {
    fields.push(
      field(7, 'How did you hear about us?', { tag: 'select', options: ['Other'] }),
      field(8, 'Preferred schedule', { tag: 'select', options: ['Full time'] }),
      field(9, 'Preferred work arrangement', { tag: 'select', options: ['On site'] }),
    );
  }
  if (includeDemographics) {
    fields.push(
      field(10, 'Race or ethnicity', { type: 'checkbox', multiple: true, options: ['Asian', 'White', 'Black or African American'] }),
      field(11, 'Are you Hispanic or Latino?', { type: 'radio', options: ['Yes', 'No'] }),
      field(12, 'Protected veteran status', { combo: true }),
      field(13, 'Religion or belief', { tag: 'select', options: ['Other', 'Prefer not to say'], value: 'Other' }),
      field(14, 'Do you certify your disability status?', { type: 'checkbox', options: ['Yes', 'No'] }),
      field(15, 'Medical information'),
    );
  }
  const events = [];
  const notices = [];
  let planRequests = 0;
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
          reply: {
            status: states[action],
            options: label === 'Protected veteran status'
              ? ['I am a protected veteran', 'I am not a protected veteran', 'I do not wish to answer'] : ['Yes', 'No'],
          },
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
      planRequests++;
      assert.equal(body.context.jobDescription, undefined);
      assert.equal(body.context.url, 'https://jobs.example.test/apply');
      const expected = fields.filter((f) =>
        [2, 3, 5, ...(timeoutOnBatch ? [7, 8, 9] : []), ...(includeDemographics ? [10, 11, 12, 15] : [])].includes(f.index),
      );
      assert.deepEqual(body.fields.map(({ label }) => label),
        expected.slice((planRequests - 1) * 5, planRequests * 5).map(({ label }) => label));
      if (timeoutOnBatch === planRequests) {
        return Response.json({ error: 'Plan request failed' }, { status: planError });
      }
      if (abortOnPlan) controller.abort();
      if (includeDemographics) {
        if (planRequests === 1) {
          return Response.json({
            ok: true,
            executableFills: [
              { fieldId: '3:1:2', value: 'Bachelor', grounded: true },
              { fieldId: '3:1:1', value: 'Unrequested overwrite', grounded: true },
              ...(demographicsEnabled
                ? [
                    { fieldId: '3:1:10', value: 'Asian, Black or African American', grounded: true },
                    { fieldId: '3:1:11', value: 'No', grounded: true },
                  ]
                : []),
            ],
            deferredFieldIds: ['3:1:3'],
          });
        }
        return Response.json({
          ok: true,
          executableFills: [],
          deferredFieldIds: demographicsEnabled ? ['3:1:12'] : [],
        });
      }
      return Response.json({
        ok: true,
        executableFills: [
          { fieldId: '3:1:2', value: 'Bachelor', grounded: true },
          { fieldId: '3:1:1', value: 'Unrequested overwrite', grounded: true },
          { fieldId: '3:1:9', value: 'On site', grounded: true },
        ],
        deferredFieldIds: ['3:1:3'],
      });
    }
    if (path.endsWith('/choose')) {
      events.push('choose');
      if (body.question.label === 'Protected veteran status') {
        assert.deepEqual(body.options, [
          'I am a protected veteran',
          'I am not a protected veteran',
          'I do not wish to answer',
        ]);
        return Response.json({ ok: true, choice: 'I do not wish to answer' });
      }
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
        const resolved = resolve(dirname(file), name);
        if (name.endsWith('.json')) return JSON.parse(readFileSync(resolved, 'utf8'));
        return load(resolved.endsWith('.ts') ? resolved : resolved + '.ts');
      },
    });
    return exports;
  }
  const { runAutofill } = load(resolve(root, 'extension/lib/formFill.ts'));
  const panel = {
    notice: (message) => notices.push(message),
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
    notices,
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

test('retains completed fills and handles deferred choices after a later plan batch times out', async () => {
  const app = fixture({ timeoutOnBatch: 2 });
  await app.run();
  assert.deepEqual(app.events.slice(0, 9), [
    'Email', 'plan', 'Highest qualification', 'open', 'options', 'choose', 'select', 'verify', 'plan',
  ]);
  assert.equal(app.fields[0].value, 'fixture@example.test');
  assert.equal(app.fields[2].value, 'Bachelor');
  assert.equal(app.fields[3].value, 'No');
  assert.equal(app.fields[7].value, '');
  assert.equal(app.fields[8].value, '');
  assert.equal(app.fields[9].value, '');
  assert.ok(app.notices.some((notice) => notice.includes('AI planning timed out (HTTP 504)')));
});

test('continues planning and checks live combobox options after the first batch times out', async () => {
  const app = fixture({ timeoutOnBatch: 1 });
  await app.run();
  assert.deepEqual(app.events.slice(0, 9), [
    'Email', 'plan', 'open', 'options', 'choose', 'select', 'verify', 'plan', 'Preferred work arrangement',
  ]);
  assert.equal(app.fields[2].value, '');
  assert.equal(app.fields[3].value, 'No');
  assert.equal(app.fields[9].value, 'On site');
});

test('still fills a live dropdown and generates prose after a non-timeout planning error', async () => {
  const app = fixture({ timeoutOnBatch: 1, planError: 502 });
  await app.run();
  assert.equal(app.fields[3].value, 'No');
  assert.equal(app.fields[9].value, 'On site');
  assert.equal(app.fields[4].value, 'I enjoy building products.');
  assert.ok(app.notices.some((notice) => notice.includes('HTTP 502')));
});

test('routes demographic and self-ID questions through Phase B and leaves existing or blocked answers alone', async () => {
  for (const demographicsEnabled of [false, true]) {
    const app = fixture({ includeDemographics: true, demographicsEnabled });
    await app.run();
    const values = app.fields.filter(({ index }) => index >= 10).map(({ value }) => value);
    assert.deepEqual(values, demographicsEnabled
      ? ['Asian, Black or African American', 'No', 'I do not wish to answer', 'Other', '', '']
      : ['', '', '', 'Other', '', '']);
    assert.equal(app.events.filter((event) => event === 'choose').length, demographicsEnabled ? 2 : 1);
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
