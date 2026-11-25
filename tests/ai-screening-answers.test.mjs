import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// Loads the real shipped extension source (not the generated test bundle) so the
// AI-answer path in jobright_extension/core/application.js stays covered.
function engine(plans, read = () => '', readChoices = async () => []) {
  const source = readFileSync(new URL('../jobright_extension/core/application.js', import.meta.url), 'utf8');
  const applied = [];
  const sandbox = {
    console,
    crypto,
    location: new URL('https://boards.greenhouse.io/acme/jobs/123'),
    document: { querySelectorAll: () => [], addEventListener() {} },
    globalThis: null,
    NextkinJobCapture: { read: () => ({ title: 'Engineer', company: 'Acme' }) },
    NextkinForms: {
      discoverFields: () => [
        { key: 'contact-1', label: 'Full Name', kind: 'text', element: {} },
        { key: 'contact-2', label: 'Email', kind: 'text', element: {} },
      ],
      label: () => '',
    },
    NextkinFieldMapping: {
      resolveFact: label => ({ 'Full Name': { key: 'full_name' }, Email: { key: 'email' } })[label] || null,
      planFill: () => plans.map(plan => ({ ...plan, field: { ...plan.field } })),
      buildValues: candidate => ({ full_name: candidate.full_name, primary_skills: candidate.primary_skills }),
      isChoiceKind: kind => ['choice', 'radio', 'select', 'combobox'].includes(kind),
      isMultiKind: kind => ['checkbox-group', 'multi-select', 'multi-combobox'].includes(kind),
      normalizeBoolean: value => {
        if (typeof value === 'boolean') return value;
        const text = String(value ?? '').trim().toLowerCase();
        if (/^(yes|y|true|1)$/.test(text)) return true;
        if (/^(no|n|false|0)$/.test(text)) return false;
        return null;
      },
    },
    NextkinFieldWriter: {
      read,
      readChoices,
      applyFill: async received => {
        applied.push(...received.filter(plan => plan.status === 'supported'));
        return received.filter(plan => plan.status === 'supported').map(plan => ({
          field: plan.field, writtenValue: plan.value, ai: !!plan.ai, learned: !!plan.learned,
        }));
      },
    },
  };
  sandbox.globalThis = sandbox;
  runInNewContext(source, sandbox);
  return { api: sandbox.NextkinApplication, applied };
}

const candidate = { id: 'candidate-1', provenance_status: 'confirmed', confirmed_facts: {
  full_name: 'Fixture Candidate', primary_skills: 'React, TypeScript',
} };
const url = 'https://boards.greenhouse.io/acme/jobs/123';

test('an answered form is evidence of an application; an empty one is not', () => {
  assert.equal(engine([]).api.hasAnswers(), false);
  assert.equal(engine([], field => field.label === 'Email' ? 'candidate@example.test' : '').api.hasAnswers(), true);
});

test('AI drafts are applied to screening questions and reported as AI-written', async () => {
  const { api, applied } = engine([{
    field: { key: 'q1', label: 'Why do you want to join our company?', kind: 'text' },
    status: 'ai', reason: 'Write a concise first-person answer grounded in the resume.',
  }]);
  const result = await api.fill(url, candidate, null, false, null, null,
    { 'why do you want to join our company': 'I want to build products with React and TypeScript.' });

  assert.equal(result.filled.length, 1);
  assert.equal(result.filled[0].value, 'I want to build products with React and TypeScript.');
  assert.equal(result.filled[0].ai, true);
  assert.equal(applied[0].status, 'supported');
  assert.equal(result.questions.length, 0);
});

test('unanswered screening questions are returned for the AI draft task', async () => {
  const { api } = engine([{
    field: { key: 'q2', label: 'Describe a project you are proud of', kind: 'textarea' },
    status: 'ai', reason: 'Write a concise first-person answer grounded in the resume.',
  }]);
  const result = await api.fill(url, candidate, null, false, null, null, {});

  assert.equal(result.filled.length, 0);
  assert.equal(result.questions.length, 1);
  const question = JSON.parse(JSON.stringify(result.questions[0]));
  assert.deepEqual(question, {
    id: 'describe a project you are proud of',
    label: 'Describe a project you are proud of',
    type: 'textarea',
    options: [],
  });
  assert.match(result.unfilled[0].reason, /first-person answer/);
});

test('saved reusable answers are replayed and flagged as learned, never as profile facts', async () => {
  const { api, applied } = engine([{
    field: { key: 'q3', label: 'Preferred pronouns', kind: 'choice', options: [{ label: 'they/them' }] },
    status: 'needs_review', reason: 'No unambiguous profile fact.',
  }]);
  const result = await api.fill(url, candidate, null, false, null,
    { 'preferred pronouns': { type: 'choice', value: 'they/them' } }, null);

  assert.equal(result.filled[0].value, 'they/them');
  assert.equal(result.filled[0].learned, true);
  assert.equal(result.filled[0].ai, false);
  assert.equal(applied[0].status, 'supported');
});

test('a saved answer that is not among the options is never applied', async () => {
  const { api, applied } = engine([{
    field: { key: 'q4', label: 'Preferred pronouns', kind: 'choice', options: [{ label: 'they/them' }] },
    status: 'needs_review', reason: 'No unambiguous profile fact.',
  }]);
  const result = await api.fill(url, candidate, null, false, null,
    { 'preferred pronouns': { type: 'choice', value: 'something else' } }, null);

  assert.equal(result.filled.length, 0);
  assert.equal(applied.length, 0);
});

test('protected and job-specific questions are not reusable', () => {
  const { api } = engine([]);
  // savedAnswers reads the DOM plan, so protect the rules through the exported helper's
  // observable behaviour: a consent answer must not be replayed.
  const { api: api2, applied } = engine([{
    field: { key: 'q5', label: 'I agree to the terms', kind: 'checkbox' },
    status: 'manual', reason: 'Candidate consent is required.',
  }]);
  assert.equal(typeof api.savedAnswers, 'function');
  return api2.fill(url, candidate, null, false, null, { 'i agree to the terms': { value: true } }, null)
    .then(result => {
      assert.equal(result.filled.length, 0);
      assert.equal(applied.length, 0);
    });
});

test('Pass 2 matches dropdown options case-insensitively and trimmed', async () => {
  const { api, applied } = engine([{
    field: { key: 'q-auth', label: 'Work authorization', kind: 'select' },
    options: ['Yes', 'No'],
    status: 'needs_review',
    reason: 'Missing work authorization fact.',
  }]);
  const result = await api.fill(url, candidate, null, false, null, null, {
    'work authorization': ' yes ',
  });

  assert.equal(result.filled.length, 1);
  assert.equal(result.filled[0].value, 'Yes');
  assert.equal(result.filled[0].ai, true);
  assert.equal(applied[0].status, 'supported');
  assert.equal(applied[0].value, 'Yes');
  assert.equal(result.questions.length, 0);
});

test('Pass 2 resolves question labels longer than 200 chars using id = key.slice(0, 200)', async () => {
  const longLabel = 'Please describe in thorough detail your prior experience designing distributed backend services and customer-facing web applications across multiple cloud regions including how you handled reliability monitoring incident response and cross-team technical leadership';
  assert.ok(longLabel.length > 200 && longLabel.length <= 300);

  const plan = {
    field: { key: 'q-long', label: longLabel, kind: 'textarea' },
    status: 'ai',
    reason: 'Write a concise first-person answer.',
  };

  const pass1 = await engine([plan]).api.fill(url, candidate, null, false, null, null, {});
  assert.equal(pass1.questions.length, 1);
  assert.equal(pass1.questions[0].id.length, 200);

  const { api, applied } = engine([plan]);
  const pass2 = await api.fill(url, candidate, null, false, null, null, {
    [pass1.questions[0].id]: 'I led multi-region service migrations with SLO alerting.',
  });

  assert.equal(pass2.filled.length, 1);
  assert.equal(pass2.filled[0].value, 'I led multi-region service migrations with SLO alerting.');
  assert.equal(pass2.filled[0].ai, true);
  assert.equal(applied[0].status, 'supported');
  assert.equal(pass2.questions.length, 0);
});

test('unresolved work-auth/sponsorship and unrecognized checkboxes enter questions[] with questionMeta while date_of_birth stays excluded', async () => {
  const { api, applied } = engine([
    {
      field: { key: 'q-auth-usa', id: 'auth_usa_input', label: 'Are you legally authorized to work in the USA?', kind: 'combobox', required: true },
      factKey: 'authorized_in_usa',
      status: 'needs_review',
      reason: 'Missing work authorization fact.',
    },
    {
      field: { key: 'q-sponsor', label: 'Will you now or in the future require sponsorship?', kind: 'select', required: false },
      factKey: 'needs_sponsorship',
      options: ['Yes', 'No'],
      status: 'needs_review',
      reason: 'Missing sponsorship fact.',
    },
    {
      field: { key: 'q-travel-checkbox', label: 'I am willing to travel up to 25% for client meetings', kind: 'checkbox' },
      status: 'unknown',
      reason: 'No matching saved candidate detail.',
    },
    {
      field: { key: 'q-dob', label: 'Date of Birth', kind: 'text' },
      factKey: 'date_of_birth',
      status: 'needs_review',
      reason: 'Missing date of birth.',
    },
  ]);

  const result = await api.fill(url, candidate, null, false, null, null, {});

  assert.equal(applied.length, 0);
  assert.equal(result.filled.length, 0);

  const ids = JSON.parse(JSON.stringify(result.questions.map(q => q.id)));
  assert.deepEqual(ids, [
    'are you legally authorized to work in the usa',
    'will you now or in the future require sponsorship',
    'i am willing to travel up to 25% for client meetings',
  ]);

  // Verify 4-key shape preserved on questions[]
  for (const q of result.questions) {
    assert.deepEqual(Object.keys(q).sort(), ['id', 'label', 'options', 'type']);
  }

  // Verify questionMeta entries
  const meta = JSON.parse(JSON.stringify(result.questionMeta));
  assert.deepEqual(meta['are you legally authorized to work in the usa'], {
    fieldId: 'auth_usa_input',
    combo: true,
    required: true,
    planStatus: 'needs_review',
    factKey: 'authorized_in_usa',
  });
  assert.deepEqual(meta['will you now or in the future require sponsorship'], {
    fieldId: 'q-sponsor',
    combo: false,
    required: false,
    planStatus: 'needs_review',
    factKey: 'needs_sponsorship',
  });
  assert.deepEqual(meta['i am willing to travel up to 25% for client meetings'], {
    fieldId: 'q-travel-checkbox',
    combo: false,
    required: false,
    planStatus: 'unknown',
    factKey: null,
  });
  assert.equal(meta['date of birth'], undefined);
});

test('Pass 1 with aiAnswers = {} does not invoke readChoices() for combobox fields', async () => {
  let readChoicesCalls = 0;
  const readChoicesSpy = async () => {
    readChoicesCalls += 1;
    return [{ label: 'Yes' }, { label: 'No' }];
  };

  const comboPlan = {
    field: { key: 'q-combo', label: 'Are you comfortable working hybrid?', kind: 'combobox' },
    status: 'needs_review',
    reason: 'Requires AI answer.',
  };

  const pass1 = await engine([comboPlan], () => '', readChoicesSpy).api.fill(url, candidate, null, false, null, null, {});
  assert.equal(readChoicesCalls, 0, 'Pass 1 probe must skip readChoices() for combobox');
  assert.equal(pass1.questions.length, 1);
  assert.deepEqual([...pass1.questions[0].options], []);
  assert.equal(pass1.questionMeta['are you comfortable working hybrid'].combo, true);

  // Pass 2 with explicit aiAnswers invokes readChoices() once and matches option
  const { api: pass2Api, applied } = engine([comboPlan], () => '', readChoicesSpy);
  const pass2 = await pass2Api.fill(url, candidate, null, false, null, null, {
    'are you comfortable working hybrid': 'yes',
  });
  assert.equal(readChoicesCalls, 1, 'Pass 2 must invoke readChoices() once to resolve options');
  assert.equal(pass2.filled.length, 1);
  assert.equal(pass2.filled[0].value, 'Yes');
  assert.equal(applied[0].value, 'Yes');
});

test('duplicate-label comboboxes disambiguate qid deterministically across Pass 1 and Pass 2 without leakage', async () => {
  const dupPlans = [
    { field: { key: 'c1', label: 'Country', kind: 'combobox' }, status: 'needs_review', reason: 'Requires AI.' },
    { field: { key: 'c2', label: 'Country', kind: 'combobox' }, status: 'needs_review', reason: 'Requires AI.' },
  ];
  const readChoicesByKey = async (field) => {
    if (field.key === 'c1') return [{ label: 'United States' }, { label: 'Mexico' }];
    if (field.key === 'c2') return [{ label: 'Canada' }, { label: 'Germany' }];
    return [];
  };

  // Pass 1 produces distinct deterministic qids and questionMeta entries
  const pass1 = await engine(dupPlans, () => '', readChoicesByKey).api.fill(url, candidate, null, false, null, null, {});
  assert.deepEqual(
    JSON.parse(JSON.stringify(pass1.questions)).map(q => q.id),
    ['country::1', 'country::2'],
  );
  assert.equal(pass1.questionMeta['country::1'].fieldId, 'c1');
  assert.equal(pass1.questionMeta['country::2'].fieldId, 'c2');

  // Pass 2 with distinct answers fills each combobox with its own answer
  const { api: apiBoth } = engine(dupPlans, () => '', readChoicesByKey);
  const pass2Both = await apiBoth.fill(url, candidate, null, false, null, null, {
    'country::1': 'United States',
    'country::2': 'Canada',
  });
  assert.deepEqual(
    pass2Both.filled.map(f => ({ key: f.key, value: f.value })),
    [
      { key: 'c1', value: 'United States' },
      { key: 'c2', value: 'Canada' },
    ],
  );

  // Single-answered duplicate-label combobox must NOT leak answer to its sibling
  const { api: apiSingle } = engine(dupPlans, () => '', readChoicesByKey);
  const pass2Single = await apiSingle.fill(url, candidate, null, false, null, null, {
    'country::1': 'United States',
  });
  assert.deepEqual(
    pass2Single.filled.map(f => ({ key: f.key, value: f.value })),
    [{ key: 'c1', value: 'United States' }],
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(pass2Single.questions)).map(q => q.id),
    ['country::2'],
  );

  // Even when sibling 1 is already filled in DOM during Pass 2, sibling 2 still gets occurrence #2 ('country::2')
  const { api: apiPrefilled } = engine(
    dupPlans,
    (f) => (f.key === 'c1' ? 'United States' : ''),
    readChoicesByKey,
  );
  const pass2Prefilled = await apiPrefilled.fill(url, candidate, null, false, null, null, {
    'country::2': 'Canada',
  });
  assert.deepEqual(
    pass2Prefilled.filled.map(f => ({ key: f.key, value: f.value })),
    [{ key: 'c2', value: 'Canada' }],
  );
});


test('Wrapbook/Greenhouse labels map deterministically in planFill and multi-combobox supports comma-separated Pass 2 replies', async () => {
  const { planFill } = await import('../jobright_extension/core/field-mapping.js');
  const fields = [
    { key: 'f1', label: 'Legal First Name', kind: 'text' },
    { key: 'f2', label: 'Legal Last Name', kind: 'text' },
    { key: 'f3', label: 'Preferred First Name & Last Name', kind: 'text' },
    { key: 'f4', label: 'Please provide the city and state/province you anticipate working in for the role in which you are applying', kind: 'text' },
    { key: 'f5', label: 'Please provide your current ZIP or Postal Code to determine appropriate pay band', kind: 'text' },
    { key: 'f6', label: 'What are your salary expectations?', kind: 'text' },
    { key: 'f7', label: 'Do you require Wrapbook to sponsor you for a work permit now or in the future?', kind: 'combobox', options: [] },
    { key: 'f8', label: 'What are your pronouns? (Optional)', kind: 'combobox', options: [] },
    { key: 'f9', label: 'Which ethnicity(ies) do you identify with? Please select all that apply.', kind: 'multi-combobox', options: [] },
  ];
  const fullCand = {
    ...candidate,
    full_name: 'Jane Doe',
    current_city: 'Austin',
    current_state: 'Texas',
    zip_code: '78701',
    expected_salary: '120000',
    authorized_in_usa: true,
    need_sponsorship_now: false,
    need_sponsorship_future: false,
    pronouns: 'She/Her',
    race: 'Asian',
    confirmed_facts: {
      full_name: 'Jane Doe',
      current_city: 'Austin',
      current_state: 'Texas',
      zip_code: '78701',
      expected_salary: '120000',
      authorized_in_usa: true,
      need_sponsorship_now: false,
      need_sponsorship_future: false,
      pronouns: 'She/Her',
      race: 'Asian',
    },
  };
  const planned = planFill(fields, fullCand);
  const byKey = Object.fromEntries(planned.map((p) => [p.field.key, p]));
  assert.equal(byKey.f1.status, 'supported');
  assert.equal(byKey.f1.value, 'Jane');
  assert.equal(byKey.f2.status, 'supported');
  assert.equal(byKey.f2.value, 'Doe');
  assert.equal(byKey.f3.status, 'supported');
  assert.equal(byKey.f3.value, 'Jane Doe');
  assert.equal(byKey.f4.status, 'supported');
  assert.equal(byKey.f4.value, 'Austin, Texas');
  assert.equal(byKey.f5.status, 'supported');
  assert.equal(byKey.f5.value, '78701');
  assert.equal(byKey.f6.status, 'supported');
  assert.equal(byKey.f6.value, '120000');
  assert.equal(byKey.f7.status, 'supported');
  assert.equal(byKey.f7.factKey, 'needs_sponsorship');
  assert.equal(byKey.f7.value, false);
  assert.equal(byKey.f8.status, 'supported');
  assert.equal(byKey.f8.value, 'She/Her');
  assert.equal(byKey.f9.status, 'supported');
  assert.deepEqual([...byKey.f9.value], ['Asian']);

  const { api } = engine(
    [{ field: { key: 'mc1', label: 'Which communities do you belong to?', kind: 'multi-combobox' }, status: 'unknown' }],
    () => '',
    async () => [{ label: 'First-Generation' }, { label: 'Veteran' }],
  );
  const res = await api.fill(url, fullCand, null, false, null, null, {
    'which communities do you belong to': 'First-Generation, Veteran',
  });
  assert.equal(res.filled.length, 1);
  assert.equal(res.filled[0].value, 'First-Generation, Veteran');
});
