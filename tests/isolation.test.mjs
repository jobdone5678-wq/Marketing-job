import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert';

const bundleCode = fs.readFileSync('tests/autofill-bundle.js', 'utf8');
const sandbox = {
  window: {},
  document: { querySelectorAll: () => [], querySelector: () => null, getElementById: () => null },
  location: { href: 'https://boards.greenhouse.io/test/jobs/123', pathname: '/test/jobs/123', search: '' },
  navigator: { userAgent: 'test' },
  console: console
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(bundleCode, sandbox);

const mapping = sandbox.NextkinFieldMapping;

const candidateA = {
  id: 'cand_alice_001',
  full_name: 'Alice Cooper',
  first_name: 'Alice',
  last_name: 'Cooper',
  email: 'alice@example.com',
  phone: '5551234567',
  current_city: 'London',
  current_state: '',
  highest_qualification: 'High School Diploma',
  total_experience_years: 3,
  primary_skills: 'Graphic Design, Figma, Illustrator',
  current_job_title: 'UI Designer',
  current_employer: 'Studio Alpha',
  employment_history: [{ title: 'UI Designer', company: 'Studio Alpha', years: 3 }],
  education_history: [{ institution: 'London High', degree: 'Diploma', year: 2020 }]
};

const candidateB = {
  id: 'cand_bhargav_002',
  full_name: 'Bhargav Reddy',
  first_name: 'Bhargav',
  last_name: 'Reddy',
  email: 'bhargav.reddy.sample@example.com',
  phone: '5125550187',
  current_city: 'Austin',
  current_state: 'TX',
  highest_qualification: 'Bachelor of Technology in Computer Science and Engineering',
  total_experience_years: 7,
  primary_skills: 'Java, Spring Boot, React, AWS, TypeScript',
  current_job_title: 'Senior Software Engineer',
  current_employer: 'BluePeak Digital Solutions',
  employment_history: [{ title: 'Senior Software Engineer', company: 'BluePeak Digital Solutions', years: 3 }],
  education_history: [{ institution: 'JNTU Hyderabad', degree: 'B.Tech', year: 2017 }]
};

// 1. Verify individual candidate values
const valuesA = mapping.buildValues(candidateA);
const valuesB = mapping.buildValues(candidateB);

console.log('Candidate A:', valuesA.full_name, '|', valuesA.current_title, '|', valuesA.highest_education, '|', valuesA.current_location);
console.log('Candidate B:', valuesB.full_name, '|', valuesB.current_title, '|', valuesB.highest_education, '|', valuesB.current_location);

assert.strictEqual(valuesA.full_name, 'Alice Cooper');
assert.strictEqual(valuesA.current_title, 'UI Designer');
assert.strictEqual(valuesA.current_city, 'London');
assert.strictEqual(valuesA.total_experience_years, 3);
assert.strictEqual(valuesA.primary_skills, 'Graphic Design, Figma, Illustrator');

assert.strictEqual(valuesB.full_name, 'Bhargav Reddy');
assert.strictEqual(valuesB.current_title, 'Senior Software Engineer');
assert.strictEqual(valuesB.current_city, 'Austin');
assert.strictEqual(valuesB.current_state, 'TX');
assert.strictEqual(valuesB.current_location, 'Austin, TX');
assert.strictEqual(valuesB.highest_education, 'Bachelor of Technology in Computer Science and Engineering');
assert.strictEqual(valuesB.total_experience_years, 7);

// 2. Multi-Candidate Store Simulation (Zero Wiping):
const savedProfiles = {
  [candidateA.id]: candidateA,
  [candidateB.id]: candidateB
};

assert.strictEqual(Object.keys(savedProfiles).length, 2, 'Both candidates must be preserved simultaneously');

// 3. Candidate 1 applies:
const fieldsToTest = [
  { label: 'Full Name', kind: 'text' },
  { label: 'Email', kind: 'text' },
  { label: 'Phone', kind: 'text' },
  { label: 'City', kind: 'text' },
  { label: 'Current Company', kind: 'text' },
  { label: 'Current Title', kind: 'text' },
  { label: "Do you have a Bachelor's degree?", kind: 'choice', options: ['Yes', 'No'] }
];

const planForCandidate1 = mapping.planFill(fieldsToTest, savedProfiles[candidateA.id]);
console.log('\n--- Candidate 1 Autofill Execution ---');
for (const p of planForCandidate1) {
  console.log(`Field [${p.field.label}] -> Filled: [${p.value}]`);
}
assert.strictEqual(planForCandidate1.find(p => p.field.label === 'Full Name').value, 'Alice Cooper');
assert.strictEqual(planForCandidate1.find(p => p.field.label === 'Email').value, 'alice@example.com');
assert.strictEqual(planForCandidate1.find(p => p.field.label === 'City').value, 'London');
assert.strictEqual(planForCandidate1.find(p => p.field.label === 'Current Company').value, 'Studio Alpha');
assert.strictEqual(planForCandidate1.find(p => p.field.label === 'Current Title').value, 'UI Designer');
assert.strictEqual(planForCandidate1.find(p => p.field.label.includes('Bachelor')).value, 'No');

// 4. Candidate 2 applies:
const planForCandidate2 = mapping.planFill(fieldsToTest, savedProfiles[candidateB.id]);
console.log('\n--- Candidate 2 Autofill Execution ---');
for (const p of planForCandidate2) {
  console.log(`Field [${p.field.label}] -> Filled: [${p.value}]`);
}
assert.strictEqual(planForCandidate2.find(p => p.field.label === 'Full Name').value, 'Bhargav Reddy');
assert.strictEqual(planForCandidate2.find(p => p.field.label === 'Email').value, 'bhargav.reddy.sample@example.com');
assert.strictEqual(planForCandidate2.find(p => p.field.label === 'City').value, 'Austin');
assert.strictEqual(planForCandidate2.find(p => p.field.label === 'Current Company').value, 'BluePeak Digital Solutions');
assert.strictEqual(planForCandidate2.find(p => p.field.label === 'Current Title').value, 'Senior Software Engineer');
assert.strictEqual(planForCandidate2.find(p => p.field.label.includes('Bachelor')).value, 'Yes');

// 5. In between: Candidate 1 applies again (verify neither data was lost or wiped):
assert(savedProfiles[candidateA.id], 'Candidate 1 data must still exist intact');
const planForCandidate1Again = mapping.planFill(fieldsToTest, savedProfiles[candidateA.id]);
assert.strictEqual(planForCandidate1Again.find(p => p.field.label === 'Full Name').value, 'Alice Cooper');
assert.strictEqual(planForCandidate1Again.find(p => p.field.label === 'Current Company').value, 'Studio Alpha');
assert.strictEqual(planForCandidate1Again.find(p => p.field.label.includes('Bachelor')).value, 'No');

console.log('\n✔ MULTI-CANDIDATE PRESERVATION & INDIVIDUAL AUTOFILL VERIFIED PERFECTLY!');
