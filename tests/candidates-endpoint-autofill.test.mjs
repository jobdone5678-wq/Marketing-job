import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';
import { textFields, booleanFields } from '../src/lib/ai/schemas.ts';
import { approvedSavedAnswers } from '../src/lib/extension-answers/saved-answers.ts';

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

test('GET /api/extension/candidates with savedOnly=true projects EEOC columns and merges row with confirmed_facts', async () => {
  const actor = { id: 'candidate-user', role: 'candidate' };
  let selectedFields = '';
  const candidate = {
    id: 'candidate-eeoc-1',
    version: 1,
    provenance_status: 'confirmed',
    full_name: 'Alex Morgan',
    gender: 'Non-binary',
    race: 'Two or More Races',
    race_ethnicity: 'Two or More Races',
    veteran: 'No',
    veteran_status: 'No',
    disability: 'No',
    disability_status: 'No',
    work_authorization: 'Authorized to work in the US',
    confirmed_facts: {
      full_name: 'Alex Morgan',
      open_to_relocation: true,
    },
  };

  const query = {
    select(fields) {
      selectedFields = fields;
      return this;
    },
    eq() { return this; },
    or() { return this; },
    order() { return this; },
    async limit() { return { data: [candidate] }; },
  };

  const { GET } = loadRoute('extension/candidates', {
    '@/lib/capture/server': { extensionRoute: (_request, work) => work(), extensionProfile: async () => actor },
    '@/lib/db/admin': { database: () => ({ from: () => query }), checkDb: assert.ifError },
    '@/lib/ai/schemas': { textFields, booleanFields },
    '@/lib/extension-answers/saved-answers': { approvedSavedAnswers },
    zod: { z },
  });

  const response = await GET(new Request('https://www.nextkinhr.com/api/extension/candidates?savedOnly=true'));

  // CANDIDATE_FIELDS query must select demographic and EEOC columns
  assert.ok(selectedFields.includes('gender'), 'select must include gender');
  assert.ok(selectedFields.includes('race'), 'select must include race');
  assert.ok(selectedFields.includes('race_ethnicity'), 'select must include race_ethnicity');
  assert.ok(selectedFields.includes('veteran'), 'select must include veteran');
  assert.ok(selectedFields.includes('veteran_status'), 'select must include veteran_status');
  assert.ok(selectedFields.includes('disability'), 'select must include disability');
  assert.ok(selectedFields.includes('disability_status'), 'select must include disability_status');
  assert.ok(selectedFields.includes('work_authorization'), 'select must include work_authorization');

  assert.equal(response.candidates.length, 1);
  const result = response.candidates[0];
  assert.equal(result.id, 'candidate-eeoc-1');
  assert.equal(result.provenance_status, 'confirmed');

  // Verify demographic/EEOC columns projected onto candidate root
  assert.equal(result.gender, 'Non-binary');
  assert.equal(result.race, 'Two or More Races');
  assert.equal(result.race_ethnicity, 'Two or More Races');
  assert.equal(result.veteran, 'No');
  assert.equal(result.veteran_status, 'No');
  assert.equal(result.disability, 'No');
  assert.equal(result.disability_status, 'No');
  assert.equal(result.work_authorization, 'Authorized to work in the US');

  // Verify demographic/EEOC columns merged into confirmed_facts
  assert.equal(result.confirmed_facts.gender, 'Non-binary');
  assert.equal(result.confirmed_facts.race, 'Two or More Races');
  assert.equal(result.confirmed_facts.race_ethnicity, 'Two or More Races');
  assert.equal(result.confirmed_facts.veteran, 'No');
  assert.equal(result.confirmed_facts.veteran_status, 'No');
  assert.equal(result.confirmed_facts.disability, 'No');
  assert.equal(result.confirmed_facts.disability_status, 'No');
  assert.equal(result.confirmed_facts.work_authorization, 'Authorized to work in the US');
});

test('GET /api/extension/candidates with savedOnly=true accepts candidate with full_name on record even if omitted from confirmed_facts', async () => {
  const actor = { id: 'candidate-user', role: 'candidate' };
  const candidate = {
    id: 'candidate-name-in-row',
    version: 2,
    provenance_status: 'confirmed',
    full_name: 'Row Name Candidate',
    confirmed_facts: {
      open_to_relocation: false,
      phone: '555-0199',
    },
  };

  const query = {
    select() { return this; },
    eq() { return this; },
    or() { return this; },
    order() { return this; },
    async limit() { return { data: [candidate] }; },
  };

  const { GET } = loadRoute('extension/candidates', {
    '@/lib/capture/server': { extensionRoute: (_request, work) => work(), extensionProfile: async () => actor },
    '@/lib/db/admin': { database: () => ({ from: () => query }), checkDb: assert.ifError },
    '@/lib/ai/schemas': { textFields, booleanFields },
    '@/lib/extension-answers/saved-answers': { approvedSavedAnswers },
    zod: { z },
  });

  const response = await GET(new Request('https://www.nextkinhr.com/api/extension/candidates?savedOnly=true'));

  assert.equal(response.candidates.length, 1);
  const result = response.candidates[0];
  assert.equal(result.id, 'candidate-name-in-row');
  assert.equal(result.full_name, 'Row Name Candidate');
  assert.equal(result.confirmed_facts.full_name, 'Row Name Candidate');
  assert.equal(result.provenance_status, 'confirmed');
});
