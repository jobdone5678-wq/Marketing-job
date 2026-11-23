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
      getElementById: () => null,
    },
    location: {
      href: 'https://boards.greenhouse.io/acme/jobs/12345',
      pathname: '/acme/jobs/12345',
      search: '',
    },
    navigator: { userAgent: 'test-agent' },
    console,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(bundleCode, sandbox);
  return sandbox;
}

test('End-to-End Profile State -> Backend Candidate Facts -> Extension Field Mapping Autofill', () => {
  const sandbox = createTestSandbox();
  const mapping = sandbox.NextkinFieldMapping;
  assert.ok(mapping, 'NextkinFieldMapping must be loaded in the test environment');

  // 1. Profile State configured in Web Profile tab
  const profileState = {
    contacts: {
      fullName: 'Bhargav Reddy',
      email: 'bhargav.reddy.sample@example.com',
      phone: '(512) 555-0187',
      location: 'Austin, TX',
      links: ['https://linkedin.com/in/bhargav-reddy-sample'],
    },
    headline: 'Full Stack Developer - G2I Talent Pool',
    summary: 'Full Stack Developer with 7+ years of software engineering experience building scalable apps.',
    location: {
      workFormat: ['Remote', 'Hybrid', 'On-site'],
      whereBased: 'Austin, United States',
      regions: ['Worldwide'],
      countries: ['in'],
      openToRelocation: true,
      timezone: 'Asia/Calcutta',
    },
    demographics: {
      gender: 'Male',
      raceEthnicity: 'Asian',
      veteranStatus: 'I am not a veteran',
      disabilityStatus: 'No, I do not have a disability',
      race_ethnicity: 'Asian',
      veteran_status: 'I am not a veteran',
      disability_status: 'No, I do not have a disability',
    },
  };

  // 2. Server-side transformation (matches /api/jobseeker/resume and /api/extension/candidates)
  const nameParts = profileState.contacts.fullName.trim().split(/\s+/);
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';

  const confirmedFacts = {
    first_name: firstName,
    last_name: lastName,
    full_name: profileState.contacts.fullName,
    name: profileState.contacts.fullName,
    email: profileState.contacts.email,
    phone: profileState.contacts.phone,
    phone_number: profileState.contacts.phone,
    city: profileState.contacts.location,
    location: profileState.contacts.location,
    headline: profileState.headline,
    summary: profileState.summary,
    gender: profileState.demographics.gender,
    race: profileState.demographics.raceEthnicity,
    race_ethnicity: profileState.demographics.race_ethnicity,
    veteran: profileState.demographics.veteranStatus,
    veteran_status: profileState.demographics.veteran_status,
    disability: profileState.demographics.disabilityStatus,
    disability_status: profileState.demographics.disability_status,
  };

  const candidate = {
    id: 'cand_123',
    full_name: profileState.contacts.fullName,
    confirmed_facts: confirmedFacts,
  };

  // 3. Simulated ATS Application Form (Greenhouse, Lever, Ashby, Workday styles)
  const formFields = [
    { key: 'first_name', label: 'First Name', kind: 'text' },
    { key: 'last_name', label: 'Last Name', kind: 'text' },
    { key: 'email', label: 'Email Address', kind: 'text' },
    { key: 'phone', label: 'Phone', kind: 'text' },
    { key: 'headline', label: 'Headline', kind: 'text' },
    { key: 'summary', label: 'Summary', kind: 'text' },
    // Demographic selects & radios
    {
      key: 'gender_select',
      label: 'Gender',
      kind: 'select',
      options: [
        { text: 'Select Gender' },
        { text: 'Female' },
        { text: 'Male' },
        { text: 'Decline to state' },
      ],
    },
    {
      key: 'race_select',
      label: 'Race / Ethnicity',
      kind: 'select',
      options: [
        { text: 'White' },
        { text: 'Black or African American' },
        { text: 'Asian' },
        { text: 'Hispanic or Latino' },
        { text: 'I choose not to self-identify' },
      ],
    },
    {
      key: 'veteran_select',
      label: 'Veteran Status',
      kind: 'select',
      options: [
        { text: 'I am a protected veteran' },
        { text: 'I am not a protected veteran' },
        { text: 'I choose not to answer' },
      ],
    },
    {
      key: 'disability_select',
      label: 'Disability Status',
      kind: 'select',
      options: [
        { text: 'Yes, I have a disability' },
        { text: 'No, I do not have a disability' },
        { text: 'I do not wish to answer' },
      ],
    },
  ];

  // 4. Plan Fill through Extension Mapping Engine
  const plans = mapping.planFill(formFields, candidate);
  assert.equal(plans.length, formFields.length, 'Plan fill must return a decision for every field');

  // Verify Standard Text Fields
  const planMap = Object.fromEntries(plans.map((p) => [p.field.key, p]));

  assert.equal(planMap.first_name.value, 'Bhargav');
  assert.equal(planMap.first_name.status, 'supported');

  assert.equal(planMap.last_name.value, 'Reddy');
  assert.equal(planMap.last_name.status, 'supported');

  assert.equal(planMap.email.value, 'bhargav.reddy.sample@example.com');
  assert.equal(planMap.email.status, 'supported');

  assert.equal(planMap.phone.value, '5125550187');
  assert.equal(planMap.phone.status, 'supported');

  assert.equal(planMap.headline.value, 'Full Stack Developer - G2I Talent Pool');
  assert.equal(planMap.headline.status, 'supported');

  assert.equal(planMap.summary.value, 'Full Stack Developer with 7+ years of software engineering experience building scalable apps.');
  assert.equal(planMap.summary.status, 'supported');

  // Verify Demographics Select Fields
  assert.equal(planMap.gender_select.value, 'Male');
  assert.equal(planMap.gender_select.status, 'supported');

  assert.equal(planMap.race_select.value, 'Asian');
  assert.equal(planMap.race_select.status, 'supported');

  assert.equal(planMap.veteran_select.value, 'I am not a protected veteran');
  assert.equal(planMap.veteran_select.status, 'supported');

  assert.equal(planMap.disability_select.value, 'No, I do not have a disability');
  assert.equal(planMap.disability_select.status, 'supported');
});
