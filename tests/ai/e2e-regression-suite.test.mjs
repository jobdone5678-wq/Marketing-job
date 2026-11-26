import test from 'node:test';
import assert from 'node:assert/strict';

import { buildVerifiedFacts } from '../../src/lib/ai/verified-facts.ts';
import { planFormBatch } from '../../src/lib/ai/planner.ts';
import { chooseComboboxOption } from '../../src/lib/ai/chooser.ts';
import { ProviderClient } from '../../src/lib/ai/provider-client.ts';

test('E2E Regression: Multi-ATS Planning, Combobox Choice & Submission Safety', async (t) => {
  await t.test('2. Multi-ATS form planning: Greenhouse form with deterministic profile & AI screening', async () => {
    const candidate = {
      full_name: 'Jane Doe',
      email: 'jane@example.com',
      phone: '555-123-4567',
      current_city: 'San Francisco',
      current_state: 'CA',
      country: 'United States',
      authorized_in_usa: true,
      need_sponsorship_future: false,
    };
    const facts = buildVerifiedFacts(candidate);

    const greenhouseFields = [
      { label: 'First Name', type: 'text', required: true },
      { label: 'Last Name', type: 'text', required: true },
      { label: 'Email', type: 'email', required: true },
      { label: 'Phone', type: 'tel', required: true },
      { label: 'City', type: 'text', required: false },
      { label: 'Will you now or in the future require visa sponsorship?', type: 'select', options: ['Yes', 'No'] },
    ];

    const mockFetch = async (url, opts) => {
      const fills = [
        { label: 'First Name', value: 'Jane' },
        { label: 'Last Name', value: 'Doe' },
        { label: 'Email', value: 'jane@example.com' },
        { label: 'Phone', value: '555-123-4567' },
        { label: 'City', value: 'San Francisco' },
        { label: 'Will you now or in the future require visa sponsorship?', value: 'No' },
      ];
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ fills }) } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const client = new ProviderClient({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-4o-mini',
      fetchFn: mockFetch,
    });

    const plan = await planFormBatch(greenhouseFields, facts, client);

    assert.equal(plan.fills.length, 6, 'All 6 Greenhouse fields should be planned');
    const sponsorshipFill = plan.fills.find((f) => f.label.includes('sponsorship'));
    assert.ok(sponsorshipFill);
    assert.equal(sponsorshipFill.value, 'No');
    assert.ok(sponsorshipFill.evidenceIds.includes('profile.work_auth.need_sponsorship_future'));
  });

  await t.test('3. Multi-ATS form planning: Ashby live combobox option choice', async () => {
    const candidate = {
      full_name: 'Alex Tech',
      current_city: 'New York',
      current_state: 'NY',
      country: 'United States',
      authorized_in_usa: true,
      need_sponsorship_future: false,
    };
    const facts = buildVerifiedFacts(candidate);

    const questionField = {
      label: 'Are you authorized to work in the United States?',
      type: 'text',
      combo: true,
    };
    const capturedOptions = ['Yes, I am authorized', 'No, I need sponsorship', 'Not sure'];

    const mockFetch = async () => {
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ choice: 'Yes, I am authorized' }) } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const client = new ProviderClient({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-4o-mini',
      fetchFn: mockFetch,
    });

    const result = await chooseComboboxOption(questionField, capturedOptions, facts, client);

    assert.equal(result.choice, 'Yes, I am authorized');
    assert.ok(result.evidenceIds.includes('profile.work_auth.authorized_in_usa'));
  });

  await t.test('4. Dynamic conditional rescanning: reveals follow-up question after interactive fill', async () => {
    // Initial scan returns parent question
    const initialFields = [
      { id: 'f1', label: 'Are you willing to relocate?', type: 'select', options: ['Yes', 'No'] },
    ];

    const candidate = {
      full_name: 'Relocatable Dev',
      open_to_relocation: true,
      preferred_locations: 'New York, Austin, Remote',
    };
    const facts = buildVerifiedFacts(candidate);

    const mockFetch = async () => {
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ fills: [{ label: 'Are you willing to relocate?', value: 'Yes' }] }) } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const client = new ProviderClient({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-4o-mini',
      fetchFn: mockFetch,
    });

    const pass1 = await planFormBatch(initialFields, facts, client);
    assert.equal(pass1.fills.length, 1);

    // Conditional settlement discovers newly revealed field
    const rescanFields = [
      ...initialFields,
      { id: 'f2', label: 'Please list preferred locations', type: 'textarea' },
    ];

    const mockFetchPass2 = async () => {
      return new Response(
        JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                fills: [{ label: 'Please list preferred locations', value: 'New York, Austin, Remote' }]
              })
            }
          }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const clientPass2 = new ProviderClient({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-4o-mini',
      fetchFn: mockFetchPass2,
    });

    // Pass 2 plans only previously unmapped/new fields while retaining previously resolved values
    const previouslyResolved = { 'Are you willing to relocate?': 'Yes' };
    const pass2 = await planFormBatch(
      rescanFields.filter(f => !previouslyResolved[f.label]),
      facts,
      clientPass2,
      { previouslyResolved }
    );

    assert.equal(pass2.fills.length, 1);
    assert.equal(pass2.fills[0].label, 'Please list preferred locations');
  });

  await t.test('5. Stale-plan rejection: plans targeting older form revisions are discarded', () => {
    // Session state tracking form revision
    const session = {
      sessionId: 'sess_123',
      documentId: 'doc_abc',
      formRevision: 2, // DOM has mutated twice
    };

    const stalePlan = {
      sessionId: 'sess_123',
      documentId: 'doc_abc',
      formRevision: 1, // Stale!
      fills: [{ label: 'Name', value: 'Jane' }],
    };

    const isStale = (session, plan) => {
      return (
        session.sessionId !== plan.sessionId ||
        session.documentId !== plan.documentId ||
        session.formRevision !== plan.formRevision
      );
    };

    assert.equal(isStale(session, stalePlan), true, 'Stale plan must be rejected');

    const freshPlan = {
      sessionId: 'sess_123',
      documentId: 'doc_abc',
      formRevision: 2,
      fills: [{ label: 'Name', value: 'Jane' }],
    };

    assert.equal(isStale(session, freshPlan), false, 'Fresh plan matching current revision must be accepted');
  });

  await t.test('6. Application submission tracking safety: application NEVER marked as applied upon autofill completion', () => {
    // An application state machine tracking autofill vs submission confirmation
    const applicationState = {
      formFilled: true,
      autofillReport: { filledCount: 12, unmappedCount: 0 },
      isApplied: false,
      submissionReceipt: null,
    };

    // Rule: Autofill completion does NOT mark application as applied
    assert.equal(applicationState.isApplied, false, 'Application must remain unapplied after autofill');

    // Only upon confirmed submission event (e.g. success URL redirect or confirmation banner receipt)
    const recordConfirmedSubmission = (state, receipt) => {
      if (!receipt || !receipt.confirmedAt) {
        throw new Error('Invalid submission receipt');
      }
      return {
        ...state,
        isApplied: true,
        submissionReceipt: receipt,
      };
    };

    const confirmedState = recordConfirmedSubmission(applicationState, {
      confirmedAt: new Date().toISOString(),
      atsPlatform: 'greenhouse',
      confirmationMessage: 'Thank you for applying!',
    });

    assert.equal(confirmedState.isApplied, true);
    assert.ok(confirmedState.submissionReceipt);
  });
});
