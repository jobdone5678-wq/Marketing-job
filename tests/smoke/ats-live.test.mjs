import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { chromium } from 'playwright';

const bundle = readFileSync(new URL('../autofill-bundle.js', import.meta.url), 'utf8');

for (const [provider, env, hosts] of [
  ['Lever', 'NEXTKIN_LEVER_SMOKE_URL', ['jobs.lever.co', 'jobs.eu.lever.co']],
  ['Greenhouse', 'NEXTKIN_GREENHOUSE_SMOKE_URL', [
    'boards.greenhouse.io', 'job-boards.greenhouse.io', 'boards.eu.greenhouse.io',
    'job-boards.eu.greenhouse.io',
  ]],
]) {
  const target = process.env[env];
  test(`${provider} discovers a job form and fills synthetic candidate facts`, {
    skip: target ? false : `Set ${env} to an approved test posting to opt in`,
  }, async () => {
    const url = new URL(target);
    assert.equal(url.protocol, 'https:');
    assert.ok(hosts.includes(url.hostname));
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      await page.goto(url.href, { waitUntil: 'domcontentloaded' });
      assert.ok(hosts.includes(new URL(page.url()).hostname));
      await page.evaluate(bundle);
      const result = await page.evaluate(async () => {
        const engine = globalThis.NextkinApplication;
        const scan = engine.scan();
        const candidate = {
          first_name: 'Fixture', last_name: 'Candidate', full_name: 'Fixture Candidate',
          email: 'candidate@example.test',
        };
        return { hasForm: scan.hasForm, ...(await engine.fill(location.href, candidate, null)) };
      });
      assert.equal(result.hasForm, true);
      assert.ok(!result.error, result.error);
      assert.ok(result.filled.some(field => field.value === 'candidate@example.test'));
    } finally {
      await browser.close();
    }
  });
}
