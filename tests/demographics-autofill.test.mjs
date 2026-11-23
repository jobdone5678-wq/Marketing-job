import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const bundleCode = fs.readFileSync('tests/autofill-bundle.js', 'utf8');

function createTestSandbox() {
  const sandbox = {
    window: {},
    document: {
      querySelectorAll: () => [],
      querySelector: () => null,
      getElementById: () => null
    },
    location: {
      href: 'https://boards.greenhouse.io/testco/jobs/12345',
      pathname: '/testco/jobs/12345',
      search: ''
    },
    navigator: { userAgent: 'test' },
    console: console,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(bundleCode, sandbox);
  return sandbox;
}

test('demographics autofill resolves Gender, Race, Veteran, and Disability across diverse ATS options', () => {
  const sandbox = createTestSandbox();
  const mapping = sandbox.NextkinFieldMapping;

  const candidate = {
    full_name: 'Bhargav Reddy',
    confirmed_facts: {
      gender: 'Male',
      race: 'Asian (Not Hispanic or Latino)',
      veteran: 'I am not a protected veteran',
      disability: 'No, I do not have a disability'
    }
  };

  const fields = [
    { key: 'f1', label: 'Gender', kind: 'select', options: [{ text: 'Select Gender' }, { text: 'Male' }, { text: 'Female' }] },
    { key: 'f2', label: 'What is your gender?', kind: 'choice', options: [{ text: 'Male / Man' }, { text: 'Female / Woman' }, { text: 'Non-Binary' }] },
    { key: 'f3', label: 'Race/Ethnicity', kind: 'select', options: [{ text: 'White (Not Hispanic or Latino)' }, { text: 'Asian (Not Hispanic or Latino)' }] },
    { key: 'f4', label: 'Voluntary Self-Identification of Veteran Status', kind: 'select', options: [{ text: 'I am not a protected veteran' }, { text: 'I identify as one or more classifications of protected veteran' }] },
    { key: 'f5', label: 'Veteran Status', kind: 'choice', options: [{ text: 'Not a veteran' }, { text: 'Veteran' }] },
    { key: 'f6', label: 'Disability Status', kind: 'select', options: [{ text: 'No, I do not have a disability' }, { text: 'Yes, I have a disability' }] }
  ];

  const plans = mapping.planFill(fields, candidate);
  
  // f1: Gender select
  assert.equal(plans[0].value, 'Male');
  assert.equal(plans[0].status, 'supported');

  // f2: Gender choice (Male / Man)
  assert.equal(plans[1].value, 'Male / Man');
  assert.equal(plans[1].status, 'supported');

  // f3: Race select
  assert.equal(plans[2].value, 'Asian (Not Hispanic or Latino)');
  assert.equal(plans[2].status, 'supported');

  // f4: Veteran status select
  assert.equal(plans[3].value, 'I am not a protected veteran');
  assert.equal(plans[3].status, 'supported');

  // f5: Veteran choice (Not a veteran)
  assert.equal(plans[4].value, 'Not a veteran');
  assert.equal(plans[4].status, 'supported');

  // f6: Disability select
  assert.equal(plans[5].value, 'No, I do not have a disability');
  assert.equal(plans[5].status, 'supported');
});

test('demographics autofill leaves empty profile facts untouched', () => {
  const sandbox = createTestSandbox();
  const mapping = sandbox.NextkinFieldMapping;

  const candidate = {
    full_name: 'Jane Doe',
    confirmed_facts: {
      gender: '',
      race: '',
      veteran: '',
      disability: ''
    }
  };

  const fields = [
    { key: 'f1', label: 'Gender', kind: 'select', options: [{ text: 'Select' }, { text: 'Male' }, { text: 'Female' }] },
    { key: 'f2', label: 'Veteran Status', kind: 'select', options: [{ text: 'Not a veteran' }, { text: 'Veteran' }] }
  ];

  const plans = mapping.planFill(fields, candidate);
  assert.equal(plans[0].status, 'unknown');
  assert.equal(plans[1].status, 'unknown');
});
