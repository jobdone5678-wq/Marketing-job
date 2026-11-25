import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PROFILE } from '../src/lib/profile/profile-store.ts';

test('DEFAULT_PROFILE contains extended profile fields and omits EEO demographics', () => {
  assert.equal(typeof DEFAULT_PROFILE.headline, 'string', 'headline should be a string');
  assert.equal(typeof DEFAULT_PROFILE.summary, 'string', 'summary should be a string');
  assert.ok(Array.isArray(DEFAULT_PROFILE.location.regions), 'regions should be an array');
  assert.ok(Array.isArray(DEFAULT_PROFILE.location.countries), 'countries should be an array');
  assert.equal(typeof DEFAULT_PROFILE.location.openToRelocation, 'boolean', 'openToRelocation should be a boolean');
  assert.equal('demographics' in DEFAULT_PROFILE, false, 'EEO demographics must be intentionally omitted');
});
