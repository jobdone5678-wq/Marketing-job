import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export function computeIdempotencyKey(candidateId, canonicalJobUrl, dateStr) {
  return createHash('sha256')
    .update(`${candidateId}:${canonicalJobUrl}:${dateStr}`)
    .digest('hex');
}

export function isIgnoredInput(element) {
  const ignoredSelectors = [
    'input[type="search"]',
    'header input',
    'nav input',
    '[role="search"] input',
    '[class*="newsletter" i]',
    '[class*="alert" i]',
    '[class*="subscribe" i]',
    '[id*="subscribe" i]',
    '[id*="newsletter" i]',
    '[id*="alert" i]'
  ];
  if (!element) return false;
  const type = element.getAttribute?.('type') || '';
  const className = element.getAttribute?.('class') || '';
  const id = element.getAttribute?.('id') || '';
  const role = element.getAttribute?.('role') || '';
  const parentTag = element.parentElement?.tagName?.toLowerCase() || '';

  if (type === 'search') return true;
  if (['header', 'nav'].includes(parentTag)) return true;
  if (role === 'search' || element.parentElement?.getAttribute?.('role') === 'search') return true;
  if (/newsletter|alert|subscribe/i.test(className) || /newsletter|alert|subscribe/i.test(id)) return true;
  return false;
}

test('idempotency key is deterministic across identical submissions on same date', () => {
  const key1 = computeIdempotencyKey('cand-123', 'https://lever.co/company/job-1', '2026-11-22');
  const key2 = computeIdempotencyKey('cand-123', 'https://lever.co/company/job-1', '2026-11-22');
  assert.equal(key1, key2);
});

test('idempotency key differs for different jobs or dates', () => {
  const key1 = computeIdempotencyKey('cand-123', 'https://lever.co/company/job-1', '2026-11-22');
  const key2 = computeIdempotencyKey('cand-123', 'https://lever.co/company/job-2', '2026-11-22');
  assert.notEqual(key1, key2);

  const key3 = computeIdempotencyKey('cand-123', 'https://lever.co/company/job-1', '2026-11-23');
  assert.notEqual(key1, key3);
});

test('false positive guards ignore search bars and newsletter inputs', () => {
  const searchInput = {
    getAttribute(attr) {
      if (attr === 'type') return 'search';
      return null;
    },
    parentElement: null
  };
  assert.equal(isIgnoredInput(searchInput), true);

  const newsletterInput = {
    getAttribute(attr) {
      if (attr === 'class') return 'footer-newsletter-email';
      return null;
    },
    parentElement: null
  };
  assert.equal(isIgnoredInput(newsletterInput), true);

  const regularInput = {
    getAttribute(attr) {
      if (attr === 'type') return 'text';
      if (attr === 'name') return 'full_name';
      return null;
    },
    parentElement: { tagName: 'FORM', getAttribute: () => null }
  };
  assert.equal(isIgnoredInput(regularInput), false);
});
