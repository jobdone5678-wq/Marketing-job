import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';

test('Manifest: host_permissions and content_scripts omit wildcard http://*/*', () => {
  const manifest = JSON.parse(readFileSync(new URL('../jobright_extension/manifest.json', import.meta.url), 'utf8'));

  assert.ok(manifest.host_permissions.includes('https://*/*'), 'Must include https://*/*');
  assert.ok(!manifest.host_permissions.includes('http://*/*'), 'Must NOT include broad http://*/*');
  assert.ok(manifest.host_permissions.some(h => h.includes('localhost')), 'Must allow localhost development');

  for (const cs of manifest.content_scripts) {
    assert.ok(!cs.matches.includes('http://*/*'), 'Content scripts must not match broad http://*/*');
  }

  for (const [size, iconPath] of Object.entries(manifest.icons)) {
    const fullPath = new URL(`../jobright_extension/${iconPath}`, import.meta.url);
    assert.ok(existsSync(fullPath), `Icon ${size} must exist: ${iconPath}`);
    assert.ok(statSync(fullPath).size > 0, `Icon ${size} must be non-empty`);
  }
});
