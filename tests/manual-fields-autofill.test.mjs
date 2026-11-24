import test from 'node:test';
import assert from 'node:assert';
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
    URL: URL,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.URL = URL;
  vm.createContext(sandbox);
  vm.runInContext(bundleCode, sandbox);
  return sandbox;
}

test('Autofill uses manual profile details: gender, veteran, work auth, linkedin, and location', () => {
  const sandbox = createTestSandbox();
  const mapping = sandbox.NextkinFieldMapping;

  const candidateJane = {
    id: 'cand_jane_101',
    full_name: 'Jane Smith',
    email: 'jane.smith@example.com',
    phone: '4155551234',
    current_city: 'San Francisco',
    current_state: 'CA',
    linkedin_url: 'https://www.linkedin.com/in/janesmith',
    gender: 'Female',
    veteran_status: 'I am not a protected veteran',
    veteran: 'I am not a protected veteran',
    disability_status: 'No, I do not have a disability',
    disability: 'No, I do not have a disability',
    visa_status: 'H-1B',
    work_authorization: 'H-1B',
    authorized_in_usa: true,
    need_sponsorship_now: false,
    need_sponsorship_future: true,
    primary_skills: 'React, TypeScript, Node.js',
    current_job_title: 'Staff Software Engineer',
    current_employer: 'Fintech Corp'
  };

  const values = mapping.buildValues(candidateJane);

  assert.strictEqual(values.full_name, 'Jane Smith');
  assert.strictEqual(values.linkedin_url, 'https://www.linkedin.com/in/janesmith');
  assert.strictEqual(values.current_city, 'San Francisco');
  assert.strictEqual(values.current_state, 'CA');
  assert.strictEqual(values.current_location, 'San Francisco, CA');
  assert.strictEqual(values.gender, 'Female');
  assert.strictEqual(values.veteran, 'I am not a protected veteran');
  assert.strictEqual(values.disability, 'No, I do not have a disability');
  assert.strictEqual(values.visa_status, 'H-1B');
  assert.strictEqual(values.work_authorization, 'H-1B');

  // Test field planning across common ATS fields
  const fields = [
    { label: 'Full Name', kind: 'text' },
    { label: 'LinkedIn Profile', kind: 'text' },
    { label: 'Current Location', kind: 'text' },
    { label: 'Gender', kind: 'choice', options: ['Female', 'Male', 'Non-Binary', 'Decline to self-identify'] },
    { label: 'Veteran Status', kind: 'choice', options: [
      'I am not a protected veteran',
      'I identify as one or more classifications of protected veteran',
      'I do not wish to answer'
    ] },
    { label: 'Disability Status', kind: 'choice', options: [
      'No, I do not have a disability',
      'Yes, I have a disability',
      'I do not wish to answer'
    ] },
    { label: 'Work authorization status', kind: 'choice', options: [
      'US Citizen',
      'Permanent Resident (Green Card)',
      'H-1B',
      'STEM OPT',
      'Requires Sponsorship'
    ] },
    { label: 'Are you legally authorized to work in the United States?', kind: 'choice', options: ['Yes', 'No'] },
    { label: 'Will you require visa sponsorship now or in the future?', kind: 'choice', options: ['Yes', 'No'] }
  ];

  const plan = mapping.planFill(fields, candidateJane);

  const linkedinPlan = plan.find(p => p.field.label === 'LinkedIn Profile');
  assert.strictEqual(linkedinPlan.value, 'https://www.linkedin.com/in/janesmith');

  const locationPlan = plan.find(p => p.field.label === 'Current Location');
  assert.strictEqual(locationPlan.value, 'San Francisco, CA');

  const genderPlan = plan.find(p => p.field.label === 'Gender');
  assert.strictEqual(genderPlan.value, 'Female');

  const veteranPlan = plan.find(p => p.field.label === 'Veteran Status');
  assert.strictEqual(veteranPlan.value, 'I am not a protected veteran');

  const disabilityPlan = plan.find(p => p.field.label === 'Disability Status');
  assert.strictEqual(disabilityPlan.value, 'No, I do not have a disability');

  const visaPlan = plan.find(p => p.field.label.toLowerCase().includes('work authorization status'));
  assert.strictEqual(visaPlan.value, 'H-1B');

  const authPlan = plan.find(p => p.field.label.includes('legally authorized'));
  assert.strictEqual(authPlan.value, 'Yes');

  const sponsorPlan = plan.find(p => p.field.label.includes('require visa sponsorship'));
  assert.strictEqual(sponsorPlan.value, 'Yes');
});

test('Autofill works for candidate with confirmed_facts from database', () => {
  const sandbox = createTestSandbox();
  const mapping = sandbox.NextkinFieldMapping;

  const candidateBob = {
    id: 'cand_bob_202',
    provenance_status: 'confirmed',
    full_name: 'Bob Miller',
    confirmed_facts: {
      full_name: 'Bob Miller',
      email: 'bob@example.com',
      linkedin_url: 'https://linkedin.com/in/bobmiller',
      current_city: 'New York',
      current_state: 'NY',
      gender: 'Male',
      veteran_status: 'I identify as one or more classifications of protected veteran',
      disability_status: 'No, I do not have a disability',
      visa_status: 'US Citizen',
      work_authorization: 'US Citizen',
      authorized_in_usa: true,
      need_sponsorship_now: false,
      need_sponsorship_future: false
    }
  };

  const values = mapping.buildValues(candidateBob);

  assert.strictEqual(values.full_name, 'Bob Miller');
  assert.strictEqual(values.linkedin_url, 'https://linkedin.com/in/bobmiller');
  assert.strictEqual(values.current_city, 'New York');
  assert.strictEqual(values.current_state, 'NY');
  assert.strictEqual(values.current_location, 'New York, NY');
  assert.strictEqual(values.gender, 'Male');
  assert.strictEqual(values.veteran, 'I identify as one or more classifications of protected veteran');
  assert.strictEqual(values.visa_status, 'US Citizen');

  const fields = [
    { label: 'LinkedIn Profile URL', kind: 'text' },
    { label: 'City', kind: 'text' },
    { label: 'Gender', kind: 'choice', options: ['Female', 'Male', 'Decline'] },
    { label: 'Veteran Status', kind: 'choice', options: [
      'I am not a protected veteran',
      'I identify as one or more classifications of protected veteran',
      'Decline'
    ] },
    { label: 'Current Work Authorization', kind: 'choice', options: [
      'US Citizen',
      'Permanent Resident',
      'H-1B',
      'Other'
    ] }
  ];

  const plan = mapping.planFill(fields, candidateBob);

  assert.strictEqual(plan.find(p => p.field.label.includes('LinkedIn')).value, 'https://linkedin.com/in/bobmiller');
  assert.strictEqual(plan.find(p => p.field.label === 'City').value, 'New York');
  assert.strictEqual(plan.find(p => p.field.label === 'Gender').value, 'Male');
  assert.strictEqual(plan.find(p => p.field.label === 'Veteran Status').value, 'I identify as one or more classifications of protected veteran');
  assert.strictEqual(plan.find(p => p.field.label.includes('Work Authorization')).value, 'US Citizen');
});

test('Autofill maps and selects all 8 Race / Ethnicity categories accurately', () => {
  const sandbox = createTestSandbox();
  const mapping = sandbox.NextkinFieldMapping;

  const ashbyRaceOptions = [
    'Hispanic or Latino',
    'White (Not Hispanic or Latino)',
    'Black or African American (Not Hispanic or Latino)',
    'Native Hawaiian or Other Pacific Islander (Not Hispanic or Latino)',
    'Asian (Not Hispanic or Latino)',
    'American Indian or Alaska Native (Not Hispanic or Latino)',
    'Two or More Races (Not Hispanic or Latino)',
    'Decline to self-identify'
  ];

  const categories = [
    { input: 'Hispanic or Latino', expected: 'Hispanic or Latino' },
    { input: 'White (Not Hispanic or Latino)', expected: 'White (Not Hispanic or Latino)' },
    { input: 'Black or African American (Not Hispanic or Latino)', expected: 'Black or African American (Not Hispanic or Latino)' },
    { input: 'Native Hawaiian or Other Pacific Islander (Not Hispanic or Latino)', expected: 'Native Hawaiian or Other Pacific Islander (Not Hispanic or Latino)' },
    { input: 'Asian (Not Hispanic or Latino)', expected: 'Asian (Not Hispanic or Latino)' },
    { input: 'American Indian or Alaska Native (Not Hispanic or Latino)', expected: 'American Indian or Alaska Native (Not Hispanic or Latino)' },
    { input: 'Two or More Races (Not Hispanic or Latino)', expected: 'Two or More Races (Not Hispanic or Latino)' },
    { input: 'Decline to self-identify', expected: 'Decline to self-identify' }
  ];

  for (const { input, expected } of categories) {
    const candidate = {
      id: 'cand_test',
      full_name: 'Test Candidate',
      race: input
    };
    const values = mapping.buildValues(candidate);
    assert.strictEqual(values.race, input);

    const plan = mapping.planFill([
      { label: 'Race', kind: 'choice', options: ashbyRaceOptions }
    ], candidate);
    assert.strictEqual(plan[0].value, expected, `Failed for race category ${input}`);
  }

  // Also test short options on other ATS portals
  const shortRaceOptions = [
    'Hispanic or Latino',
    'White',
    'Black or African American',
    'Native Hawaiian / Pacific Islander',
    'Asian',
    'American Indian or Alaska Native',
    'Two or More Races',
    'I choose not to disclose'
  ];

  const shortCategories = [
    { input: 'Hispanic or Latino', expected: 'Hispanic or Latino' },
    { input: 'White (Not Hispanic or Latino)', expected: 'White' },
    { input: 'Black or African American (Not Hispanic or Latino)', expected: 'Black or African American' },
    { input: 'Native Hawaiian or Other Pacific Islander (Not Hispanic or Latino)', expected: 'Native Hawaiian / Pacific Islander' },
    { input: 'Asian (Not Hispanic or Latino)', expected: 'Asian' },
    { input: 'American Indian or Alaska Native (Not Hispanic or Latino)', expected: 'American Indian or Alaska Native' },
    { input: 'Two or More Races (Not Hispanic or Latino)', expected: 'Two or More Races' },
    { input: 'Decline to self-identify', expected: 'I choose not to disclose' }
  ];

  for (const { input, expected } of shortCategories) {
    const candidate = {
      id: 'cand_test_short',
      full_name: 'Test Candidate',
      confirmed_facts: { race: input }
    };
    const plan = mapping.planFill([
      { label: 'Race / Ethnicity', kind: 'choice', options: shortRaceOptions }
    ], candidate);
    assert.strictEqual(plan[0].value, expected, `Failed for short race category ${input}`);
  }
});

test('planFill auto-checks privacy/terms legal acknowledgement checkboxes', () => {
  const sandbox = createTestSandbox();
  const mapping = sandbox.NextkinFieldMapping;

  const candidate = { id: 'cand_123', full_name: 'Test Candidate' };
  const fields = [
    { label: 'I agree to the Terms of Service and Privacy Policy', kind: 'checkbox' }
  ];

  const plan = mapping.planFill(fields, candidate);
  assert.strictEqual(plan.length, 1);
  assert.strictEqual(plan[0].status, 'supported');
  assert.strictEqual(plan[0].factKey, 'consent');
  assert.strictEqual(plan[0].value, true);
});

test('planFill rejects marketing, SMS, and promotional checkboxes from auto-checking', () => {
  const sandbox = createTestSandbox();
  const mapping = sandbox.NextkinFieldMapping;

  const candidate = { id: 'cand_123', full_name: 'Test Candidate' };
  const fields = [
    { label: 'I agree to receive promotional SMS messages and job alerts', kind: 'checkbox' },
    { label: 'Join our talent network for marketing newsletters', kind: 'checkbox' }
  ];

  const plan = mapping.planFill(fields, candidate);
  assert.strictEqual(plan.length, 2);
  assert.strictEqual(plan[0].status, 'manual');
  assert.strictEqual(plan[0].factKey, 'consent');
  assert.notStrictEqual(plan[0].status, 'supported');
  assert.strictEqual(plan[1].status, 'manual');
  assert.strictEqual(plan[1].factKey, 'consent');
  assert.notStrictEqual(plan[1].status, 'supported');
});

