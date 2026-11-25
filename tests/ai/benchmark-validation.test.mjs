import test from 'node:test';
import assert from 'node:assert/strict';

import {
  runBenchmarkSuite,
  loadFixtureScenarios,
  formatBenchmarkTable,
  redactSecrets,
} from '../../scripts/testing/benchmark-ai-providers.mjs';
import { ServerVercelProviderClient } from '../../src/lib/ai/server-provider-client.ts';

test('Comparative Benchmark Suite: Mock & Fallback Validation', async (t) => {
  await t.test('1. loads scenarios from all 4 ATS HTML fixtures plus adversarial Plan and Choose cases', () => {
    const scenarios = loadFixtureScenarios();
    const sources = new Set(scenarios.map((s) => s.source));

    assert.ok(sources.has('tests/fixtures/greenhouse-universal.html'));
    assert.ok(sources.has('tests/fixtures/ashby-universal.html'));
    assert.ok(sources.has('tests/fixtures/lever-universal.html'));
    assert.ok(sources.has('tests/fixtures/workday-universal.html'));
    assert.ok(sources.has('adversarial'));

    const planCount = scenarios.filter((s) => s.kind === 'plan').length;
    const chooseCount = scenarios.filter((s) => s.kind === 'choose').length;
    assert.ok(planCount >= 5, `Expected >= 5 Plan scenarios, got ${planCount}`);
    assert.ok(chooseCount >= 5, `Expected >= 5 Choose scenarios, got ${chooseCount}`);

    // Verify extracted Greenhouse & Ashby fields
    const greenhouse = scenarios.find((s) => s.id === 'plan-greenhouse-universal');
    assert.ok(greenhouse.fields.some((f) => f.label === 'First Name' && f.required));
    assert.ok(greenhouse.fields.some((f) => f.label === 'What is your favorite testing framework?'));

    const ashby = scenarios.find((s) => s.id === 'plan-ashby-universal');
    const ashbyCombo = ashby.fields.find((f) => f.label === 'Preferred Work Location');
    assert.ok(ashbyCombo?.combo);
    assert.deepEqual(ashbyCombo.options, ['San Francisco, CA', 'Remote, US', 'New York, NY']);
  });

  await t.test('2. runBenchmarkSuite({ mode: "mock" }) evaluates ProviderClient and ServerVercelProviderClient', async () => {
    const report = await runBenchmarkSuite({ mode: 'mock' });

    assert.equal(report.mode, 'mock');
    assert.equal(report.status, 'completed');
    assert.equal(report.results.legacy.client, 'ProviderClient');
    assert.equal(report.results.vercelAiSdk.client, 'ServerVercelProviderClient');

    for (const [label, clientReport] of [
      ['legacy', report.results.legacy],
      ['vercelAiSdk', report.results.vercelAiSdk],
    ]) {
      const m = clientReport.metrics;
      assert.equal(m.schemaValidRate, 100, `${label}: schemaValidRate must be 100%`);
      assert.equal(m.factualAccuracy, 100, `${label}: factualAccuracy must be 100%`);
      assert.equal(m.correctFillCoverage, 100, `${label}: correctFillCoverage must be 100%`);
      assert.equal(
        m.incorrectFillRate,
        0,
        `${label}: post-grounding incorrectFillRate must be 0%`,
      );
      assert.equal(m.unresolvedRate, 100, `${label}: unresolvedRate must be 100%`);
      assert.ok(
        m.groundedResponseRate > 80 && m.groundedResponseRate < 100,
        `${label}: expected pre-grounding groundedResponseRate to reflect caught adversarial hallucination (got ${m.groundedResponseRate}%)`,
      );

      assert.equal(typeof m.latencyMs.avg, 'number');
      assert.equal(typeof m.latencyMs.p50, 'number');
      assert.equal(typeof m.latencyMs.p95, 'number');
      assert.ok(m.latencyMs.p50 <= m.latencyMs.p95);
      assert.ok(m.httpRequestCount > 0);
      assert.equal(m.httpRequestCount, clientReport.counts.totalAttemptedCalls);
    }

    // Token telemetry: ServerVercelProviderClient reports actual tokens; legacy ProviderClient reports 0 (not invented)
    const legacyTokens = report.results.legacy.metrics.tokens;
    const vercelTokens = report.results.vercelAiSdk.metrics.tokens;
    assert.equal(legacyTokens.reportedUsageCalls, 0);
    assert.equal(legacyTokens.totalTokens, 0);
    assert.ok(vercelTokens.reportedUsageCalls > 0);
    assert.ok(vercelTokens.inputTokens > 0);
    assert.ok(vercelTokens.outputTokens > 0);
    assert.equal(
      vercelTokens.totalTokens,
      vercelTokens.inputTokens + vercelTokens.outputTokens,
    );
  });

  await t.test('3. mock fallback scenario (Tier 1 rejects json_schema -> Tier 2) tracks httpRequestCount and preserves incorrectFillRate === 0', async () => {
    ServerVercelProviderClient.clearCache();

    const report = await runBenchmarkSuite({
      mode: 'mock',
      simulateTier1Fallback: true,
    });

    const vercel = report.results.vercelAiSdk;
    const m = vercel.metrics;

    // First call triggers HTTP 400 on Tier 1 (json_schema) and falls back to Tier 2 (json_object),
    // caching supportsStructuredOutputs = false for subsequent calls.
    assert.equal(
      m.httpRequestCount,
      vercel.counts.totalAttemptedCalls + 1,
      `Expected httpRequestCount (${m.httpRequestCount}) to equal totalAttemptedCalls + 1 (${vercel.counts.totalAttemptedCalls + 1}) due to Tier 1 -> Tier 2 fallback`,
    );
    assert.equal(m.incorrectFillRate, 0, 'Post-grounding incorrectFillRate must remain 0%');
    assert.equal(m.schemaValidRate, 100, 'Schema validity must remain 100% after Tier 2 fallback');
    assert.equal(m.factualAccuracy, 100);
    assert.equal(m.correctFillCoverage, 100);
    assert.equal(m.unresolvedRate, 100);
    assert.ok(m.tokens.totalTokens > 0, 'Tokens must still be tracked across fallback');
  });

  await t.test('4. benchmark table output and secret redaction never leak API keys or candidate PII', async () => {
    const report = await runBenchmarkSuite({ mode: 'mock' });
    const table = formatBenchmarkTable(report);

    assert.match(table, /schemaValidRate/);
    assert.match(table, /incorrectFillRate/);
    assert.match(table, /httpRequestCount/);

    assert.equal(table.includes('alex.mercer@example.com'), false);
    assert.equal(table.includes('415-555-0199'), false);
    assert.equal(table.includes('Alex Mercer'), false);

    const leaked = 'Error calling https://api.openai.com with Bearer sk-secret-token-1234567890';
    const redacted = redactSecrets(leaked, 'sk-secret-token-1234567890');
    assert.equal(redacted.includes('sk-secret-token-1234567890'), false);
    assert.match(redacted, /\[REDACTED\]/);
  });
});
