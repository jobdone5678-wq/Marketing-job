import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('no-mock-fallback: freehire-fallback.ts does not exist', () => {
  const fallbackFilePath = path.join(process.cwd(), 'src', 'lib', 'jobs', 'freehire-fallback.ts');
  assert.equal(fs.existsSync(fallbackFilePath), false, 'freehire-fallback.ts must be completely removed');
});

test('no-mock-fallback: freehire-api.ts does not import or contain mock fallback constants', () => {
  const apiFilePath = path.join(process.cwd(), 'src', 'lib', 'jobs', 'freehire-api.ts');
  const apiContent = fs.readFileSync(apiFilePath, 'utf8');

  assert.equal(apiContent.includes('FALLBACK_JOBS'), false, 'freehire-api.ts must not contain FALLBACK_JOBS');
  assert.equal(apiContent.includes('REDCARE_PHARMACY_JOB'), false, 'freehire-api.ts must not contain REDCARE_PHARMACY_JOB');
  assert.equal(apiContent.includes('FALLBACK_FACETS'), false, 'freehire-api.ts must not contain FALLBACK_FACETS');
  assert.equal(apiContent.includes('freehire-fallback'), false, 'freehire-api.ts must not import freehire-fallback');
});

test('no-mock-fallback: searchFreehireJobs returns empty items and error string on network failure', async () => {
  const { searchFreehireJobs } = await import('../src/lib/jobs/freehire-api.ts');
  
  // When fetch fails (e.g. invalid host or sandbox block), searchFreehireJobs catches and surfaces error
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('Network connection failed');
  };

  try {
    const result = await searchFreehireJobs(new URLSearchParams());
    assert.deepEqual(result.items, [], 'Must return empty items array on error');
    assert.equal(result.total, 0, 'Must return 0 total on error');
    assert.equal(result.hasMore, false, 'hasMore must be false on error');
    assert.equal(typeof result.error, 'string', 'Must surface error message');
    assert.match(result.error, /Network connection failed/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('no-mock-fallback: getFreehireJob rethrows network errors and never serves mock job', async () => {
  const { getFreehireJob } = await import('../src/lib/jobs/freehire-api.ts');

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('Connection refused');
  };

  try {
    await assert.rejects(
      async () => {
        await getFreehireJob('some-slug');
      },
      /Connection refused/,
      'getFreehireJob must rethrow remote errors rather than returning mock data'
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
