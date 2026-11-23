import test from 'node:test';
import assert from 'node:assert/strict';
import '../jobright_extension/core/field-mapping.js';

const { isCompanySpecificQuestion, computeCacheKey } = globalThis.NextkinFieldMapping;

test('factual question is cached globally', () => {
  const key = computeCacheKey('Are you authorized to work in the US?', 'Google', 'Software Engineer');
  assert.equal(key, 'are you authorized to work in the us');
});

test('notice period and salary questions are cached globally as factual', () => {
  const key1 = computeCacheKey('What is your notice period?', 'Meta', 'Full Stack Engineer');
  assert.equal(key1, 'what is your notice period');

  const key2 = computeCacheKey('What are your salary expectations?', 'Amazon', 'Backend Dev');
  assert.equal(key2, 'what are your salary expectations');
});

test('company-specific question is scoped to company and role', () => {
  const key = computeCacheKey('Why do you want to work at Stripe?', 'Stripe', 'Frontend Engineer');
  assert.equal(key, 'why do you want to work at stripe|stripe|frontend engineer');
});

test('role-motivation question is scoped to company and role', () => {
  const key = computeCacheKey('Why are you interested in this role?', 'Netflix', 'Systems Engineer');
  assert.equal(key, 'why are you interested in this role|netflix|systems engineer');
});

test('company-specific question without resolved company skips caching', () => {
  const key = computeCacheKey('Why do you want to join our company?', '', 'Frontend Engineer');
  assert.equal(key, null);
});

test('contextual local cache requires a role and preserves distinct composite scopes', () => {
  const question = 'Why are you interested in this role?';
  assert.equal(computeCacheKey(question, 'Stripe', ''), null);
  assert.notEqual(computeCacheKey(question, 'A|B', 'C'), computeCacheKey(question, 'A', 'B|C'));
});
