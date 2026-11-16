import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const bundleJs = fs.readFileSync('tests/autofill-bundle.js', 'utf8');
eval(bundleJs);

class MockElement {
  constructor(tagName = 'INPUT', attrs = {}) {
    this.tagName = tagName.toUpperCase();
    this.attrs = { ...attrs };
    this.id = attrs.id || '';
    this.name = attrs.name || '';
  }
  getAttribute(name) {
    const key = name.toLowerCase();
    return Object.prototype.hasOwnProperty.call(this.attrs, key) ? this.attrs[key] : null;
  }
}

test('Portal Adapter Registry loads all 81+ adapters', () => {
  assert.ok(Array.isArray(globalThis.NextkinAdapters));
  assert.ok(globalThis.NextkinAdapters.length >= 81, `Expected at least 81 adapters, got ${globalThis.NextkinAdapters.length}`);
});

test('Adapter matching and hints for reverse-engineered portals', () => {
  const portalCases = [
    {
      host: 'jobs.clearcompany.com',
      expectedId: 'clearcompany',
      elements: [
        { el: new MockElement('INPUT', { name: 'first_name' }), expected: 'first_name' },
        { el: new MockElement('INPUT', { name: 'last_name' }), expected: 'last_name' },
        { el: new MockElement('INPUT', { name: 'email' }), expected: 'email' },
        { el: new MockElement('INPUT', { name: 'phone' }), expected: 'phone' },
        { el: new MockElement('INPUT', { name: 'address' }), expected: 'full_address' },
        { el: new MockElement('INPUT', { name: 'city' }), expected: 'current_city' }
      ]
    },
    {
      host: 'recruiting.paycor.com',
      expectedId: 'paycor',
      elements: [
        { el: new MockElement('INPUT', { id: 'gnewtonFirstName' }), expected: 'first_name' },
        { el: new MockElement('INPUT', { id: 'gnewtonLastName' }), expected: 'last_name' },
        { el: new MockElement('INPUT', { id: 'gnewtonEmail' }), expected: 'email' },
        { el: new MockElement('INPUT', { id: 'gnewtonMobilePhone' }), expected: 'phone' },
        { el: new MockElement('INPUT', { id: 'gnewtonAddress' }), expected: 'full_address' },
        { el: new MockElement('INPUT', { id: 'gnewtonCity' }), expected: 'current_city' }
      ]
    },
    {
      host: 'egpf.fa.us2.oraclecloud.com',
      expectedId: 'oraclecloud',
      elements: [
        { el: new MockElement('INPUT', { 'aria-label': 'First Name' }), expected: 'first_name' },
        { el: new MockElement('INPUT', { 'aria-label': 'Last Name' }), expected: 'last_name' },
        { el: new MockElement('INPUT', { id: 'candidateEmail' }), expected: 'email' },
        { el: new MockElement('INPUT', { id: 'candidatePhone' }), expected: 'phone' }
      ]
    },
    {
      host: 'sjobs.brassring.com',
      expectedId: 'brassring',
      elements: [
        { el: new MockElement('INPUT', { 'ng-model': 'candidate.firstName' }), expected: 'first_name' },
        { el: new MockElement('INPUT', { 'ng-model': 'candidate.lastName' }), expected: 'last_name' },
        { el: new MockElement('INPUT', { 'ng-model': 'candidate.email' }), expected: 'email' },
        { el: new MockElement('INPUT', { 'ng-model': 'candidate.phone' }), expected: 'phone' }
      ]
    },
    {
      host: 'career4.successfactors.com',
      expectedId: 'successfactors',
      elements: [
        { el: new MockElement('INPUT', { id: 'fbclc_fName' }), expected: 'first_name' },
        { el: new MockElement('INPUT', { id: 'fbclc_lName' }), expected: 'last_name' },
        { el: new MockElement('INPUT', { id: 'fbclc_email' }), expected: 'email' },
        { el: new MockElement('INPUT', { id: 'fbclc_phone' }), expected: 'phone' }
      ]
    },
    {
      host: 'jobs.gusto.com',
      expectedId: 'gusto',
      elements: [
        { el: new MockElement('INPUT', { id: 'applicant_first_name' }), expected: 'first_name' },
        { el: new MockElement('INPUT', { id: 'applicant_last_name' }), expected: 'last_name' },
        { el: new MockElement('INPUT', { id: 'applicant_email' }), expected: 'email' },
        { el: new MockElement('INPUT', { id: 'applicant_phone' }), expected: 'phone' }
      ]
    },
    {
      host: 'jobs.gem.com',
      expectedId: 'gem',
      elements: [
        { el: new MockElement('INPUT', { name: 'fullName' }), expected: 'full_name' },
        { el: new MockElement('INPUT', { name: 'email' }), expected: 'email' },
        { el: new MockElement('INPUT', { name: 'phoneNumber' }), expected: 'phone' },
        { el: new MockElement('INPUT', { name: 'linkedinUrl' }), expected: 'linkedin_url' }
      ]
    },
    {
      host: 'careers.hiringthing.com',
      expectedId: 'hiringthing',
      elements: [
        { el: new MockElement('INPUT', { name: 'applicant_first_name' }), expected: 'first_name' },
        { el: new MockElement('INPUT', { name: 'applicant_last_name' }), expected: 'last_name' },
        { el: new MockElement('INPUT', { name: 'email' }), expected: 'email' },
        { el: new MockElement('INPUT', { name: 'phone' }), expected: 'phone' }
      ]
    },
    {
      host: 'jobs.dayforcehcm.com',
      expectedId: 'dayforce',
      elements: [
        { el: new MockElement('INPUT', { 'data-field-id': 'candidate_firstname' }), expected: 'first_name' },
        { el: new MockElement('INPUT', { 'data-field-id': 'candidate_lastname' }), expected: 'last_name' },
        { el: new MockElement('INPUT', { 'data-field-id': 'candidate_email' }), expected: 'email' },
        { el: new MockElement('INPUT', { 'data-field-id': 'candidate_phone' }), expected: 'phone' }
      ]
    },
    {
      host: 'careers.phenompeople.com',
      expectedId: 'phenom',
      elements: [
        { el: new MockElement('INPUT', { id: 'root_firstName' }), expected: 'first_name' },
        { el: new MockElement('INPUT', { id: 'root_lastName' }), expected: 'last_name' },
        { el: new MockElement('INPUT', { id: 'root_email' }), expected: 'email' },
        { el: new MockElement('INPUT', { id: 'root_phone' }), expected: 'phone' }
      ]
    },
    {
      host: 'deloitte.avature.net',
      expectedId: 'avature',
      elements: [
        { el: new MockElement('INPUT', { name: 'field_firstName' }), expected: 'first_name' },
        { el: new MockElement('INPUT', { name: 'field_lastName' }), expected: 'last_name' },
        { el: new MockElement('INPUT', { name: 'field_email' }), expected: 'email' },
        { el: new MockElement('INPUT', { name: 'field_phone' }), expected: 'phone' }
      ]
    },
    {
      host: 'agency.careerplug.com',
      expectedId: 'careerplug',
      elements: [
        { el: new MockElement('INPUT', { id: 'applicant_first_name' }), expected: 'first_name' },
        { el: new MockElement('INPUT', { id: 'applicant_last_name' }), expected: 'last_name' },
        { el: new MockElement('INPUT', { id: 'applicant_email' }), expected: 'email' },
        { el: new MockElement('INPUT', { id: 'applicant_phone' }), expected: 'phone' }
      ]
    },
    {
      host: 'techjobs.catsone.com',
      expectedId: 'catsone',
      elements: [
        { el: new MockElement('INPUT', { name: 'first_name' }), expected: 'first_name' },
        { el: new MockElement('INPUT', { name: 'last_name' }), expected: 'last_name' },
        { el: new MockElement('INPUT', { name: 'email' }), expected: 'email' },
        { el: new MockElement('INPUT', { name: 'phone' }), expected: 'phone' }
      ]
    },
    {
      host: 'careers.jobscore.com',
      expectedId: 'jobscore',
      elements: [
        { el: new MockElement('INPUT', { id: 'candidate_first_name' }), expected: 'first_name' },
        { el: new MockElement('INPUT', { id: 'candidate_last_name' }), expected: 'last_name' },
        { el: new MockElement('INPUT', { id: 'candidate_email' }), expected: 'email' },
        { el: new MockElement('INPUT', { id: 'candidate_phone' }), expected: 'phone' }
      ]
    },
    {
      host: 'company.recruiterflow.com',
      expectedId: 'recruiterflow',
      elements: [
        { el: new MockElement('INPUT', { name: 'name' }), expected: 'full_name' },
        { el: new MockElement('INPUT', { name: 'email' }), expected: 'email' },
        { el: new MockElement('INPUT', { name: 'phone' }), expected: 'phone' }
      ]
    },
    {
      host: 'jobs.polymer.co',
      expectedId: 'polymer',
      elements: [
        { el: new MockElement('INPUT', { name: 'firstName' }), expected: 'first_name' },
        { el: new MockElement('INPUT', { name: 'lastName' }), expected: 'last_name' },
        { el: new MockElement('INPUT', { name: 'email' }), expected: 'email' },
        { el: new MockElement('INPUT', { name: 'phone' }), expected: 'phone' }
      ]
    },
    {
      host: 'app.dover.com',
      expectedId: 'dover',
      elements: [
        { el: new MockElement('INPUT', { name: 'firstName' }), expected: 'first_name' },
        { el: new MockElement('INPUT', { name: 'lastName' }), expected: 'last_name' },
        { el: new MockElement('INPUT', { name: 'email' }), expected: 'email' },
        { el: new MockElement('INPUT', { name: 'phone' }), expected: 'phone' }
      ]
    },
    {
      host: 'www.workatastartup.com',
      expectedId: 'ycombinator',
      elements: [
        { el: new MockElement('INPUT', { name: 'first_name' }), expected: 'first_name' },
        { el: new MockElement('INPUT', { name: 'last_name' }), expected: 'last_name' },
        { el: new MockElement('INPUT', { name: 'email' }), expected: 'email' },
        { el: new MockElement('INPUT', { name: 'phone' }), expected: 'phone' }
      ]
    },
    {
      host: 'www.governmentjobs.com',
      expectedId: 'governmentjobs',
      elements: [
        { el: new MockElement('INPUT', { id: 'txtFirstName' }), expected: 'first_name' },
        { el: new MockElement('INPUT', { id: 'txtLastName' }), expected: 'last_name' },
        { el: new MockElement('INPUT', { id: 'txtEmail' }), expected: 'email' },
        { el: new MockElement('INPUT', { id: 'txtHomePhone' }), expected: 'phone' },
        { el: new MockElement('INPUT', { id: 'txtAddress' }), expected: 'full_address' },
        { el: new MockElement('INPUT', { id: 'txtCity' }), expected: 'current_city' }
      ]
    },
    {
      host: 'questionnaire.waltonmgt.com',
      expectedId: 'taxcredits',
      elements: [
        { el: new MockElement('INPUT', { name: 'first_name' }), expected: 'first_name' },
        { el: new MockElement('INPUT', { name: 'last_name' }), expected: 'last_name' },
        { el: new MockElement('INPUT', { name: 'email' }), expected: 'email' },
        { el: new MockElement('INPUT', { name: 'phone' }), expected: 'phone' }
      ]
    },
    {
      host: 'amazon.jobs',
      expectedId: 'amazon',
      elements: [
        { el: new MockElement('INPUT', { placeholder: 'First Name' }), expected: 'first_name' },
        { el: new MockElement('INPUT', { placeholder: 'Last Name' }), expected: 'last_name' },
        { el: new MockElement('INPUT', { placeholder: 'Email' }), expected: 'email' },
        { el: new MockElement('INPUT', { placeholder: 'Phone Number' }), expected: 'phone' }
      ]
    },
    {
      host: 'jobs.tesla.com',
      expectedId: 'tesla',
      elements: [
        { el: new MockElement('INPUT', { name: 'first_name' }), expected: 'first_name' },
        { el: new MockElement('INPUT', { name: 'last_name' }), expected: 'last_name' },
        { el: new MockElement('INPUT', { name: 'email' }), expected: 'email' },
        { el: new MockElement('INPUT', { name: 'phone' }), expected: 'phone' }
      ]
    },
    {
      host: 'lifeattiktok.com',
      expectedId: 'tiktok',
      elements: [
        { el: new MockElement('INPUT', { placeholder: 'First Name' }), expected: 'first_name' },
        { el: new MockElement('INPUT', { placeholder: 'Last Name' }), expected: 'last_name' },
        { el: new MockElement('INPUT', { placeholder: 'Email Address' }), expected: 'email' },
        { el: new MockElement('INPUT', { placeholder: 'Mobile Phone' }), expected: 'phone' }
      ]
    }
  ];

  for (const tc of portalCases) {
    const adapter = globalThis.resolveActiveAdapter(tc.host);
    assert.ok(adapter, `Adapter not found for host: ${tc.host}`);
    assert.equal(adapter.id, tc.expectedId, `Expected adapter ${tc.expectedId} for ${tc.host}, got ${adapter.id}`);

    for (const { el, expected } of tc.elements) {
      const hint = adapter.hint(el);
      assert.equal(hint, expected, `Hint mismatch for ${tc.host} on el: ${JSON.stringify(el.attrs)}: expected ${expected}, got ${hint}`);
    }
  }
});
