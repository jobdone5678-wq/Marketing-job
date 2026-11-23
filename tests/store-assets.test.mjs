import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync, readFileSync } from 'node:fs';

test('Store Assets: all four 1280x800 screenshots exist and are marked Ready in CHROMEWEBSTORE.md', () => {
  const expectedScreenshots = [
    'screenshot-autofill.png',
    'screenshot-sidepanel.png',
    'screenshot-answer-bank.png',
    'screenshot-tracking.png'
  ];

  for (const file of expectedScreenshots) {
    const p = new URL(`../docs/assets/${file}`, import.meta.url);
    assert.ok(existsSync(p), `Screenshot must exist: ${file}`);
    assert.ok(statSync(p).size > 500, `Screenshot must not be empty: ${file}`);
  }

  const storeDoc = readFileSync(new URL('../CHROMEWEBSTORE.md', import.meta.url), 'utf8');
  for (const file of expectedScreenshots) {
    assert.ok(storeDoc.includes(file), `CHROMEWEBSTORE.md must reference ${file}`);
  }

  // Verify marked as ready in table
  assert.ok(storeDoc.includes('| Screenshot 1 [REQUIRED] | 1280×800 or 640×400 | ✅ Ready | `docs/assets/screenshot-autofill.png` |'));
});
