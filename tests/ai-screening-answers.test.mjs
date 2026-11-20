import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// Loads the real shipped extension source (not the generated test bundle) so the
// AI-answer path in jobright_extension/core/application.js stays covered.
function engine(plans, read = () => '') {
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
      readChoices: async () => [],
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
