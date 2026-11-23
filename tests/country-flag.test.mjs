import test from 'node:test';
import assert from 'node:assert/strict';
import { getCountryFlagUrl } from '../src/lib/profile/country-flag.ts';

test('getCountryFlagUrl normalizes country codes to lowercase SVG URLs', () => {
  assert.equal(getCountryFlagUrl('US'), 'https://hatscripts.github.io/circle-flags/flags/us.svg');
  assert.equal(getCountryFlagUrl('in'), 'https://hatscripts.github.io/circle-flags/flags/in.svg');
  assert.equal(getCountryFlagUrl('AU'), 'https://hatscripts.github.io/circle-flags/flags/au.svg');
  assert.equal(getCountryFlagUrl('   DZ  '), 'https://hatscripts.github.io/circle-flags/flags/dz.svg');
});

test('getCountryFlagUrl returns empty string for empty or missing input', () => {
  assert.equal(getCountryFlagUrl(''), '');
  assert.equal(getCountryFlagUrl(null), '');
  assert.equal(getCountryFlagUrl(undefined), '');
});
