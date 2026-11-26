import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  isAppliedApplication,
  withoutAppliedJobs,
  applicationUrlKey,
} from '../../src/lib/jobs/application-state.ts';

test('Submission Tracking Safety & AI Settings UI Verification', async (t) => {
  await t.test('1. Application is NEVER marked as applied upon autofill completion; requires confirmed submission', () => {
    // When autofill completes, form discovery and slotting are saved, but the job MUST remain unapplied
    const unappliedStates = [
      { applicationStatus: 'Draft', captureStatus: 'started' },
      { applicationStatus: 'Draft', captureStatus: 'in_progress' },
      { applicationStatus: 'Draft', captureStatus: 'submit_attempted' },
      { applicationStatus: 'Draft', captureStatus: null },
      { applicationStatus: 'Draft', captureStatus: undefined },
      // Even if application status is somehow marked 'Applied', if capture is only 'started' or 'in_progress', it's NOT applied
      { applicationStatus: 'Applied', captureStatus: 'started' },
    ];

    for (const state of unappliedStates) {
      assert.equal(
        isAppliedApplication(state.applicationStatus, state.captureStatus),
        false,
        `State ${JSON.stringify(state)} must NEVER be marked as applied upon autofill`
      );
    }

    // Only actual submission evidence / confirmed receipts can transition to applied
    const appliedStates = [
      { applicationStatus: 'Draft', captureStatus: 'submitted' },
      { applicationStatus: 'Draft', captureStatus: 'confirmed' },
      { applicationStatus: 'Applied', captureStatus: 'submitted' },
      { applicationStatus: 'Applied', captureStatus: 'confirmed' },
      { applicationStatus: 'Applied', captureStatus: null }, // Explicit manual attestation
    ];

    for (const state of appliedStates) {
      assert.equal(
        isAppliedApplication(state.applicationStatus, state.captureStatus),
        true,
        `State ${JSON.stringify(state)} must be marked as applied`
      );
    }

    // Filter verification: Autofilled unapplied jobs must NOT be stripped from the active job list
    const jobs = [
      { id: 'job-1', status: 'Draft', capture_status: 'in_progress' }, // Autofill completed, unsubmitted
      { id: 'job-2', status: 'Applied', capture_status: 'confirmed' }, // Submitted & confirmed
    ];
    // Keys only contain confirmed/submitted jobs
    const keys = { jobIds: ['job-2'], urls: [] };
    const activeJobs = withoutAppliedJobs(jobs, keys);
    assert.equal(activeJobs.length, 1);
    assert.equal(activeJobs[0].id, 'job-1', 'Autofilled job must remain in active jobs list');
  });

  await t.test('2. Portal settings component exists with all modes, providers, and test connection', () => {
    const componentSource = readFileSync(
      new URL('../../src/components/ai-provider-settings.tsx', import.meta.url),
      'utf8'
    );

    // Verify 4 hybrid modes are supported
    assert.ok(componentSource.includes('server'), 'Must support server default mode');
    assert.ok(componentSource.includes('portal_byok'), 'Must support portal_byok mode');
    assert.ok(componentSource.includes('extension_byok'), 'Must support extension_byok mode');
    assert.ok(componentSource.includes('local'), 'Must support local mode');

    // Verify major providers are selectable
    assert.ok(componentSource.includes('openrouter'), 'Must support OpenRouter');
    assert.ok(componentSource.includes('deepseek'), 'Must support DeepSeek');
    assert.ok(componentSource.includes('openai'), 'Must support OpenAI');
    assert.ok(componentSource.includes('groq'), 'Must support Groq');
    assert.ok(componentSource.includes('mistral'), 'Must support Mistral');
    assert.ok(componentSource.includes('ollama'), 'Must support Ollama');

    // Verify UI inputs and test connection button
    assert.ok(componentSource.includes('/api/extension/ai/settings'), 'Must call settings API');
    assert.ok(componentSource.includes('/api/extension/ai/test-connection'), 'Must call test-connection API');
    assert.ok(componentSource.includes('Test Connection'), 'Must render Test Connection button');
  });

  await t.test('3. Portal settings component is integrated into candidate profile edit page', () => {
    const pageSource = readFileSync(
      new URL('../../src/app/dashboard/candidates/[id]/edit/page.tsx', import.meta.url),
      'utf8'
    );

    assert.ok(
      pageSource.includes('AiProviderSettings') || pageSource.includes('ai-provider-settings'),
      'EditCandidatePage must render AiProviderSettings'
    );
  });

  await t.test('4. Extension side panel exposes AI mode settings controls', () => {
    const appSvelte = readFileSync(
      new URL('../../extension/entrypoints/sidepanel/App.svelte', import.meta.url),
      'utf8'
    );
    const matchTabSvelte = readFileSync(
      new URL('../../extension/entrypoints/sidepanel/MatchTab.svelte', import.meta.url),
      'utf8'
    );

    assert.ok(appSvelte.includes('getAutofillSettings'), 'App.svelte must load AI settings');
    assert.ok(appSvelte.includes('saveAutofillSettings'), 'App.svelte must persist AI settings');
    assert.ok(matchTabSvelte.includes('onModeChange'), 'MatchTab.svelte must expose mode switcher');
  });

  await t.test('5. Extension client synchronizes AI settings with portal endpoint', () => {
    const clientSource = readFileSync(
      new URL('../../extension/lib/nextkinhr.ts', import.meta.url),
      'utf8'
    );

    assert.ok(
      clientSource.includes('/api/extension/ai/settings'),
      'extension API client must sync settings with portal endpoint'
    );
  });
});
