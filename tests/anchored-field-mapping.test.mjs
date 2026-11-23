import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

class MockElement {
  constructor(tagName = 'INPUT', attrs = {}) {
    this.tagName = tagName.toUpperCase();
    this.attrs = { ...attrs };
    this.id = attrs.id || '';
    this.name = attrs.name || '';
    this.type = attrs.type || 'text';
  }
  getAttribute(name) {
    const key = name.toLowerCase();
    return Object.prototype.hasOwnProperty.call(this.attrs, key) ? this.attrs[key] : null;
  }
}

function createHarness() {
  const context = {
    URL,
    crypto,
    Event,
    EventTarget,
    console,
    HTMLInputElement: MockElement,
  };
  context.globalThis = context;
  const source = (file) => readFileSync(new URL(`../jobright_extension/${file}`, import.meta.url), 'utf8');
  runInNewContext(source('adapters/ats-adapters.js'), context);
  runInNewContext(source('core/field-mapping.js'), context);
  return context;
}

test('1. "Are you legally authorized to work in this country?" matches authorized_in_usa, NOT country', () => {
  const { NextkinFieldMapping } = createHarness();
  const { resolveFact } = NextkinFieldMapping;

  // Standalone label without hint
  const resNoHint = resolveFact('Are you legally authorized to work in this country?');
  assert.ok(resNoHint, 'Expected resolved fact');
  assert.equal(resNoHint.key, 'authorized_in_usa');
  assert.notEqual(resNoHint.key, 'country');

  // Incidental or misattributed Tier 1 adapter hint "country" must be sanitized
  const resWithHint = resolveFact('Are you legally authorized to work in this country?', 'country');
  assert.ok(resWithHint, 'Expected resolved fact');
  assert.equal(resWithHint.key, 'authorized_in_usa');
  assert.notEqual(resWithHint.key, 'country');
});

test('2. "First Name (required) id_1234" matches first_name because first name opens the label', () => {
  const { NextkinFieldMapping } = createHarness();
  const { resolveFact, opensWith } = NextkinFieldMapping;

  assert.equal(typeof opensWith, 'function', 'opensWith must be exported on NextkinFieldMapping');
  assert.equal(opensWith('first name (required) id 1234', 'first name'), true);
  assert.equal(opensWith('firstname', 'first'), false);
  assert.equal(opensWith('first name', 'first name'), true);

  const res = resolveFact('First Name (required) id_1234');
  assert.ok(res, 'Expected resolved fact for First Name (required) id_1234');
  assert.equal(res.key, 'first_name');
});

test('3. Unlisted portal domains on custom URLs fall back to registered generic adapter rather than returning null', () => {
  const { resolveActiveAdapter, NextkinAdapters } = createHarness();

  // Known ATS domain returns its specialized adapter
  const leverAdapter = resolveActiveAdapter('https://jobs.lever.co/fixture/123/apply');
  assert.ok(leverAdapter);
  assert.equal(leverAdapter.id, 'lever');

  // Unlisted domain on custom URL must return generic adapter, not null
  const genericAdapter = resolveActiveAdapter('https://careers.customenterpriseportal.com/jobs/123');
  assert.ok(genericAdapter, 'Expected active generic adapter for unlisted domain, got null');
  assert.equal(genericAdapter.id, 'generic');
  assert.equal(typeof genericAdapter.hint, 'function');

  // Verify generic adapter returns canonical hints
  const emailInput = new MockElement('INPUT', { name: 'email', id: 'candidate_email' });
  assert.equal(genericAdapter.hint(emailInput), 'email');

  const fnInput = new MockElement('INPUT', { name: 'first_name', id: 'first_name' });
  assert.equal(genericAdapter.hint(fnInput), 'first_name');

  // Verify total registered adapters includes generic
  const hasGeneric = (NextkinAdapters || []).some(a => a.id === 'generic');
  assert.ok(hasGeneric, 'Generic adapter must be registered in NextkinAdapters');
});

test('4. Multi-factor semantic evaluation checks question context, question kind, and options to prevent false positive keyword collisions', () => {
  const { NextkinFieldMapping } = createHarness();
  const { resolveFact, planFill } = NextkinFieldMapping;

  // Case A: Question contains keyword "employer", but is a choice question with Yes/No asking for sponsorship
  const sponsorshipField = {
    key: 'sponsor_q',
    label: 'Will your employer need to sponsor your visa status?',
    hint: 'current_employer', // Erroneous / incidental adapter hint
    kind: 'choice',
    options: [{ label: 'Yes' }, { label: 'No' }]
  };
  const resolvedSponsor = resolveFact(sponsorshipField.label, sponsorshipField.hint, sponsorshipField);
  assert.ok(resolvedSponsor);
  assert.equal(resolvedSponsor.key, 'needs_sponsorship', 'Should resolve to needs_sponsorship, not current_employer');
  assert.notEqual(resolvedSponsor.key, 'current_employer');

  // Case B: Authorization question evaluated through planFill
  const authField = {
    key: 'auth_q',
    label: 'Are you legally authorized to work in this country?',
    kind: 'choice',
    options: [{ label: 'Yes' }, { label: 'No' }]
  };
  const countryField = {
    key: 'country_q',
    label: 'Country of residence',
    kind: 'text',
    options: []
  };

  const candidate = {
    confirmed_facts: {
      authorized_in_usa: true,
      country: 'United States'
    }
  };

  const plans = planFill([authField, countryField], candidate);
  const authPlan = plans.find(p => p.field.key === 'auth_q');
  const countryPlan = plans.find(p => p.field.key === 'country_q');

  assert.ok(authPlan);
  assert.equal(authPlan.factKey, 'authorized_in_usa');
  assert.equal(authPlan.status, 'supported');
  assert.equal(authPlan.value, 'Yes');

  assert.ok(countryPlan);
  assert.equal(countryPlan.factKey, 'country');
  assert.equal(countryPlan.status, 'supported');
  assert.equal(countryPlan.value, 'United States');
});
