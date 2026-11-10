import { test } from 'node:test';
import assert from 'node:assert';
import { MemoryCache } from '../src/lib/cache.ts';

test('System Design: MemoryCache stores and retrieves values in O(1) time', () => {
  const cache = new MemoryCache(10);
  cache.set('test-key', 'test-value', 5000);
  assert.strictEqual(cache.get('test-key'), 'test-value');
});

test('System Design: MemoryCache evicts expired keys', async () => {
  const cache = new MemoryCache(10);
  cache.set('quick-expire', 'hello', 10, 20); // 10ms ttl
  await new Promise((r) => setTimeout(r, 25));
  assert.strictEqual(cache.get('quick-expire'), undefined);
});

test('System Design: MemoryCache SWR returns stale value immediately and updates in background', async () => {
  const cache = new MemoryCache(10);
  let counter = 1;

  // Initial populate (ttl 20ms, staleTtl 500ms)
  const val1 = await cache.fetchWithSWR('counter', async () => ({ count: counter }), {
    ttlMs: 20,
    staleTtlMs: 500,
  });
  assert.strictEqual(val1.count, 1);

  // Wait until it is stale but not expired
  await new Promise((r) => setTimeout(r, 30));
  counter = 2;

  // Next call should return stale value immediately (< 1ms)
  const start = performance.now();
  const val2 = await cache.fetchWithSWR('counter', async () => {
    await new Promise((r) => setTimeout(r, 50));
    return { count: counter };
  }, { ttlMs: 20, staleTtlMs: 500 });
  const elapsed = performance.now() - start;

  assert.ok(elapsed < 10, `SWR took ${elapsed}ms, expected sub-10ms instantaneous response`);
  assert.strictEqual(val2.count, 1); // Stale value returned immediately

  // After background promise resolves, next fetch gets updated value
  await new Promise((r) => setTimeout(r, 70));
  const val3 = cache.get('counter');
  assert.strictEqual(val3?.count, 2);
});
