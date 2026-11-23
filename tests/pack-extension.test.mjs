import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import * as fflate from 'fflate';

test('Packager: generates valid zip in dist/ without test or markdown files', async () => {
  const zipPath = new URL('../dist/jobright_extension-v3.3.19.zip', import.meta.url);
  assert.ok(existsSync(zipPath), 'dist/jobright_extension-v3.3.19.zip must exist');

  const zipBytes = readFileSync(zipPath);
  const unzipped = fflate.unzipSync(zipBytes);
  const fileNames = Object.keys(unzipped);

  assert.ok(fileNames.includes('manifest.json'), 'Must contain manifest.json');
  assert.ok(fileNames.includes('panel.html'), 'Must contain panel.html');
  assert.ok(fileNames.includes('background.js'), 'Must contain background.js');

  for (const name of fileNames) {
    assert.ok(!name.endsWith('.md'), `Must not contain markdown file: ${name}`);
    assert.ok(!name.startsWith('tests/'), `Must not contain test file: ${name}`);
    assert.ok(!name.includes('.git'), `Must not contain git file: ${name}`);
    assert.ok(!name.includes('.env'), `Must not contain env file: ${name}`);
  }
});
