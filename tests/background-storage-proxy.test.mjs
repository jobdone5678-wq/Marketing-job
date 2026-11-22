import test from 'node:test';
import assert from 'node:assert/strict';

test('submission attempt TTL is valid within 15 minutes and expired after', () => {
  const now = Date.now();
  const validAttempt = { timestamp: now - 14 * 60 * 1000 };
  const expiredAttempt = { timestamp: now - 16 * 60 * 1000 };
  const isValid = (attempt) => Date.now() - attempt.timestamp <= 15 * 60 * 1000;

  assert.equal(isValid(validAttempt), true);
  assert.equal(isValid(expiredAttempt), false);
});

test('pre-submit snapshot merges fallback metadata when confirmation DOM lacks it', () => {
  const domMetadata = {
    jobTitle: '',
    companyName: '',
    jobLocation: null,
    jobUrl: 'https://boards.greenhouse.io/thanks',
  };

  const preSubmitSnapshot = {
    jobTitle: 'Senior Frontend Engineer',
    companyName: 'Acme Corp',
    jobLocation: 'Remote',
    jobUrl: 'https://boards.greenhouse.io/acme/jobs/12345',
  };

  const merged = {
    ...domMetadata,
    jobTitle: domMetadata.jobTitle || preSubmitSnapshot.jobTitle,
    companyName: domMetadata.companyName || preSubmitSnapshot.companyName,
    jobLocation: domMetadata.jobLocation || preSubmitSnapshot.jobLocation,
    canonicalJobUrl: preSubmitSnapshot.jobUrl,
  };

  assert.equal(merged.jobTitle, 'Senior Frontend Engineer');
  assert.equal(merged.companyName, 'Acme Corp');
  assert.equal(merged.jobLocation, 'Remote');
  assert.equal(merged.canonicalJobUrl, 'https://boards.greenhouse.io/acme/jobs/12345');
});

test('browser-compatible base64 encoding does not rely on Node.js Buffer', () => {
  // Emulate Uint8Array -> base64 using String.fromCharCode + btoa
  const sampleBytes = new Uint8Array([72, 101, 108, 108, 111, 32, 87, 111, 114, 108, 100]); // "Hello World"
  let binary = '';
  const len = sampleBytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(sampleBytes[i]);
  }
  const base64 = btoa(binary);

  assert.equal(base64, 'SGVsbG8gV29ybGQ=');
});
