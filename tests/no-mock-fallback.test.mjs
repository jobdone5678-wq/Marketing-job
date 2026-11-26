import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('no-mock-fallback: nextkinhr-fallback.ts does not exist', () => {
  const fallbackFilePath = path.join(process.cwd(), 'src', 'lib', 'jobs', 'nextkinhr-fallback.ts');
  assert.equal(fs.existsSync(fallbackFilePath), false, 'nextkinhr-fallback.ts must be completely removed');
});

test('no-mock-fallback: nextkinhr-api.ts does not import or contain mock fallback constants', () => {
  const apiFilePath = path.join(process.cwd(), 'src', 'lib', 'jobs', 'nextkinhr-api.ts');
  const apiContent = fs.readFileSync(apiFilePath, 'utf8');

  assert.equal(apiContent.includes('FALLBACK_JOBS'), false, 'nextkinhr-api.ts must not contain FALLBACK_JOBS');
  assert.equal(apiContent.includes('REDCARE_PHARMACY_JOB'), false, 'nextkinhr-api.ts must not contain REDCARE_PHARMACY_JOB');
  assert.equal(apiContent.includes('FALLBACK_FACETS'), false, 'nextkinhr-api.ts must not contain FALLBACK_FACETS');
  assert.equal(apiContent.includes('nextkinhr-fallback'), false, 'nextkinhr-api.ts must not import nextkinhr-fallback');
});

test('no-mock-fallback: searchNextkinhrJobs returns empty items and error string on network failure', async () => {
  const { searchNextkinhrJobs } = await import('../src/lib/jobs/nextkinhr-api.ts');
  
  // When fetch fails (e.g. invalid host or sandbox block), searchNextkinhrJobs catches and surfaces error
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('Network connection failed');
  };

  try {
    const result = await searchNextkinhrJobs(new URLSearchParams(), 20, 0);
    assert.deepEqual(result.items, [], 'Must return empty items array on error');
    assert.equal(result.total, 0, 'Must return 0 total on error');
    assert.equal(result.hasMore, false, 'hasMore must be false on error');
    assert.equal(typeof result.error, 'string', 'Must surface error message');
    assert.match(result.error, /Network connection failed/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('no-mock-fallback: getNextkinhrJob rethrows network errors and never serves mock job', async () => {
  const { getNextkinhrJob } = await import('../src/lib/jobs/nextkinhr-api.ts');

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('Connection refused');
  };

  try {
    await assert.rejects(
      async () => {
        await getNextkinhrJob('some-slug');
      },
      /Connection refused/,
      'getNextkinhrJob must rethrow remote errors rather than returning mock data'
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
