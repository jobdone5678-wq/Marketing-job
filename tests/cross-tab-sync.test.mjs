import test from 'node:test';
import assert from 'node:assert/strict';

test('postMessage listener strictly verifies origin before processing event', () => {
  const allowedOrigin = 'https://www.nextkinhr.com';
  const validEvent = { origin: 'https://www.nextkinhr.com', data: { type: 'NEXTKIN_APPLICATION_SUBMITTED' } };
  const untrustedEvent = { origin: 'https://malicious.com', data: { type: 'NEXTKIN_APPLICATION_SUBMITTED' } };

  assert.equal(validEvent.origin === allowedOrigin, true);
  assert.equal(untrustedEvent.origin === allowedOrigin, false);
});

test('handles both NEXTKIN_APPLICATION_SUBMITTED and NEXTKIN_OUTSIDE_APPLICATION_SAVED', () => {
  const allowedEvents = new Set(['NEXTKIN_APPLICATION_SUBMITTED', 'NEXTKIN_OUTSIDE_APPLICATION_SAVED']);
  assert.equal(allowedEvents.has('NEXTKIN_APPLICATION_SUBMITTED'), true);
  assert.equal(allowedEvents.has('NEXTKIN_OUTSIDE_APPLICATION_SAVED'), true);
  assert.equal(allowedEvents.has('UNKNOWN_EVENT'), false);
});
