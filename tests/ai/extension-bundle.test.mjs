import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');

test('Extension AI bundle: browser compatibility and manifest optional permissions', async (t) => {
  const bundlePath = path.join(rootDir, 'jobright_extension/core/ai/planner-bundle.js');
  const manifestPath = path.join(rootDir, 'jobright_extension/manifest.json');

  await t.test('1. bundle exists and is a valid ES module exporting required AI primitives', async () => {
    assert.ok(fs.existsSync(bundlePath), `Bundle file must exist at ${bundlePath}`);

    const bundleUrl = `file:///${bundlePath.replace(/\\/g, '/')}`;
    const module = await import(bundleUrl);

    assert.equal(typeof module.planFormBatch, 'function', 'Must export planFormBatch');
    assert.equal(typeof module.chooseComboboxOption, 'function', 'Must export chooseComboboxOption');
    assert.equal(typeof module.validateGroundedAnswer, 'function', 'Must export validateGroundedAnswer');
    assert.equal(typeof module.buildVerifiedFacts, 'function', 'Must export buildVerifiedFacts');
    assert.equal(typeof module.ProviderClient, 'function', 'Must export ProviderClient');
  });

  await t.test('2. bundle does NOT contain Node.js server dependencies or server secrets/SSRF code', () => {
    assert.ok(fs.existsSync(bundlePath), `Bundle file must exist at ${bundlePath}`);
    const content = fs.readFileSync(bundlePath, 'utf8');

    // Forbidden node server builtins & imports
    const forbiddenImports = [
      'node:dns',
      'node:net',
      'node:tls',
      'node:crypto',
      'node:http',
      'node:https',
      '@supabase/supabase-js',
      'ssrf-guard',
      'SafeHttpsAgent',
      'SafeHttpAgent',
      'createSafeAgent',
      'AI_PROVIDER_ENCRYPTION_KEY',
      'private.user_ai_provider_secrets',
    ];

    for (const forbidden of forbiddenImports) {
      assert.equal(
        content.includes(forbidden),
        false,
        `Bundle must NOT contain forbidden server dependency/code "${forbidden}"`,
      );
    }
  });

  await t.test('3. manifest.json declares optional_host_permissions', () => {
    assert.ok(fs.existsSync(manifestPath), `manifest.json must exist at ${manifestPath}`);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    assert.ok(
      Array.isArray(manifest.optional_host_permissions),
      'manifest.json must declare optional_host_permissions as an array',
    );

    const requiredPermissions = [
      'http://localhost/*',
      'http://127.0.0.1/*',
      'https://*/*',
    ];

    for (const perm of requiredPermissions) {
      assert.ok(
        manifest.optional_host_permissions.includes(perm),
        `optional_host_permissions must include "${perm}"`,
      );
    }
  });

  await t.test('4. esbuild metafile dependency graph isolation and bundle size limit', () => {
    const metafilePath = path.join(rootDir, 'dist/planner-bundle.meta.json');
    assert.ok(fs.existsSync(metafilePath), `Metafile must exist at ${metafilePath}`);
    assert.ok(fs.existsSync(bundlePath), `Bundle file must exist at ${bundlePath}`);

    const meta = JSON.parse(fs.readFileSync(metafilePath, 'utf8'));
    assert.ok(meta && typeof meta.inputs === 'object' && meta.inputs !== null, 'meta.inputs must exist');
    assert.ok(meta && typeof meta.outputs === 'object' && meta.outputs !== null, 'meta.outputs must exist');

    const forbiddenPatterns = [
      /node_modules\/ai\//,
      /node_modules\/@ai-sdk\//,
      /node_modules\/zod\//,
      /node_modules\/openai\//,
      /^node:/,
      /src\/lib\/ai\/ssrf-guard/,
      /src\/lib\/ai\/ssrf-fetch-adapter/,
      /src\/lib\/ai\/encryption/,
      /src\/lib\/ai\/server-provider-client/,
      /src\/lib\/ai\/autofill-orchestrator/,
      /src\/lib\/ai\/structured-contracts/,
    ];

    const normalize = (p) => String(p).replace(/\\/g, '/');

    for (const [inputPath, inputInfo] of Object.entries(meta.inputs)) {
      const normalizedPath = normalize(inputPath);
      for (const pattern of forbiddenPatterns) {
        assert.equal(
          pattern.test(normalizedPath),
          false,
          `Bundle meta.inputs must not include forbidden path "${normalizedPath}" (matched ${pattern})`,
        );
      }

      if (Array.isArray(inputInfo?.imports)) {
        for (const imp of inputInfo.imports) {
          assert.notEqual(
            imp.external,
            true,
            `Bundle input "${normalizedPath}" must not have external import "${imp.path}"`,
          );
          const impPath = normalize(imp.path || '');
          for (const pattern of forbiddenPatterns) {
            assert.equal(
              pattern.test(impPath),
              false,
              `Bundle input "${normalizedPath}" import "${impPath}" matched forbidden pattern ${pattern}`,
            );
          }
        }
      }
    }

    const outputEntries = Object.entries(meta.outputs);
    assert.ok(outputEntries.length > 0, 'meta.outputs must contain at least one output');

    const bundleOutputEntry = outputEntries.find(([outPath]) =>
      normalize(outPath).endsWith('jobright_extension/core/ai/planner-bundle.js'),
    );
    assert.ok(bundleOutputEntry, 'meta.outputs must include jobright_extension/core/ai/planner-bundle.js');

    for (const [outPath, outInfo] of outputEntries) {
      const normalizedOut = normalize(outPath);
      if (Array.isArray(outInfo?.imports)) {
        for (const imp of outInfo.imports) {
          assert.notEqual(
            imp.external,
            true,
            `Bundle output "${normalizedOut}" must not have external import "${imp.path}"`,
          );
          const impPath = normalize(imp.path || '');
          for (const pattern of forbiddenPatterns) {
            assert.equal(
              pattern.test(impPath),
              false,
              `Bundle output "${normalizedOut}" import "${impPath}" matched forbidden pattern ${pattern}`,
            );
          }
        }
      }
    }

    const stat = fs.statSync(bundlePath);
    assert.ok(
      stat.size <= 50 * 1024,
      `Bundle size ${stat.size} bytes exceeds 50 KiB (${50 * 1024} bytes) limit`,
    );
  });
});
