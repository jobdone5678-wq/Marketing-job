import test from 'node:test';
import assert from 'node:assert/strict';
import { planFormBatch } from '../../src/lib/ai/planner.ts';
import { ProviderClient } from '../../src/lib/ai/provider-client.ts';
import { buildVerifiedFacts } from '../../src/lib/ai/verified-facts.ts';

test('Planner: FreeHire form batch planning with neighbor context & grounding', async (t) => {
  await t.test('chunks fields into batches of 4-6 questions and preserves neighbor context across batches', async () => {
    // 8 fields total -> 2 batches (e.g. 5 then 3, or 4 then 4)
    const fields = [
      { label: 'First Name', type: 'text', required: true },
      { label: 'Last Name', type: 'text', required: true },
      { label: 'Email', type: 'text', required: true },
      { label: 'Phone', type: 'text', required: false },
      { label: 'City', type: 'text', required: true },
      { label: 'State', type: 'text', required: true },
      { label: 'Country', type: 'text', required: true },
      { label: 'Postal Code', type: 'text', required: false },
    ];

    const candidate = {
      full_name: 'Jane Doe',
      email: 'jane@example.com',
      phone: '555-123-4567',
      current_city: 'San Francisco',
      current_state: 'CA',
      country: 'United States',
      zip_code: '94105',
    };
    const facts = buildVerifiedFacts(candidate);

    const callPayloads = [];
    const customFetch = async (url, opts) => {
      const body = JSON.parse(opts.body);
      callPayloads.push(body);

      // Extract user content JSON
      const userContent = JSON.parse(body.messages.find(m => m.role === 'user').content);
      const targetFields = userContent.fields || userContent.fieldsToFill || [];

      // Generate mock fills matching target fields
      const fills = [];
      for (const f of targetFields) {
        if (f.label === 'First Name') fills.push({ label: 'First Name', value: 'Jane' });
        if (f.label === 'Last Name') fills.push({ label: 'Last Name', value: 'Doe' });
        if (f.label === 'Email') fills.push({ label: 'Email', value: 'jane@example.com' });
        if (f.label === 'Phone') fills.push({ label: 'Phone', value: '555-123-4567' });
        if (f.label === 'City') fills.push({ label: 'City', value: 'San Francisco' });
        if (f.label === 'State') fills.push({ label: 'State', value: 'CA' });
        if (f.label === 'Country') fills.push({ label: 'Country', value: 'United States' });
        if (f.label === 'Postal Code') fills.push({ label: 'Postal Code', value: '94105' });
      }

      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ fills }) } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const client = new ProviderClient({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-4o',
      fetchFn: customFetch,
    });

    const result = await planFormBatch(fields, facts, client, {
      jobTitle: 'Frontend Engineer',
      company: 'TechCorp',
      batchSize: 5,
    });

    assert.equal(result.batchCount, 2, 'Must execute in 2 batches for 8 fields with batchSize 5');
    assert.equal(callPayloads.length, 2);

    // Verify FreeHire system prompt in call 1
    const sysPrompt = callPayloads[0].messages.find(m => m.role === 'system').content;
    assert.match(sysPrompt, /You map a candidate's profile onto a job-application form/i);
    assert.match(sysPrompt, /Only use values present in the profile/i);
    assert.match(sysPrompt, /Respond with JSON: \{"fills":\[\{"label":"\.\.\.","value":"\.\.\."\}\]\}/i);

    // Verify batch 2 receives neighbor context and previously resolved values
    const userContentBatch2 = JSON.parse(callPayloads[1].messages.find(m => m.role === 'user').content);
    assert.ok(
      userContentBatch2.previouslyResolved || userContentBatch2.context?.previouslyResolved,
      'Batch 2 must receive previouslyResolved context',
    );
    assert.ok(
      userContentBatch2.neighborFields || userContentBatch2.neighbors,
      'Batch 2 must receive neighbor fields context',
    );

    // Verify fills
    assert.equal(result.fills.length, 8);
    const labels = result.fills.map(f => f.label);
    assert.ok(labels.includes('First Name'));
    assert.ok(labels.includes('Country'));
  });

  await t.test('discards fills that fail grounded validation', async () => {
    const fields = [
      { label: 'Years of Experience', type: 'text', required: true },
      { label: 'Highest Degree', type: 'text', required: true },
    ];

    const candidate = {
      full_name: 'Junior Dev',
      total_experience_years: '2',
      highest_qualification: "Bachelor's Degree",
    };
    const facts = buildVerifiedFacts(candidate);

    // LLM hallucinates 10 years experience and a Doctorate
    const customFetch = async () => {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  fills: [
                    { label: 'Years of Experience', value: '10' }, // Inflation!
                    { label: 'Highest Degree', value: 'Doctorate / PhD' }, // Degree elevation!
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const client = new ProviderClient({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-4o',
      fetchFn: customFetch,
    });

    const result = await planFormBatch(fields, facts, client);

    // Both should be discarded
    assert.equal(result.fills.length, 0, 'Hallucinated fills must be discarded');
    assert.ok(result.unmapped.includes('Years of Experience'));
    assert.ok(result.unmapped.includes('Highest Degree'));
  });

  await t.test('correctly defers custom combobox fields for Choose step', async () => {
    const fields = [
      { label: 'Full Name', type: 'text', required: true },
      { label: 'Authorized to Work in US?', type: 'select', combo: true, required: true },
      { label: 'Favorite Color', type: 'select', combo: true, required: false },
    ];

    const candidate = {
      full_name: 'Alex Work',
      authorized_in_usa: true,
    };
    const facts = buildVerifiedFacts(candidate);

    // LLM returns empty value for combo field that profile answers, and leaves out unanswerable one
    const customFetch = async () => {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  fills: [
                    { label: 'Full Name', value: 'Alex Work' },
                    { label: 'Authorized to Work in US?', value: '' }, // Combo deferred
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    const client = new ProviderClient({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'test-key',
      model: 'gpt-4o',
      fetchFn: customFetch,
    });

    const result = await planFormBatch(fields, facts, client);

    assert.equal(result.fills.length, 1);
    assert.equal(result.fills[0].label, 'Full Name');
    assert.ok(result.deferred.includes('Authorized to Work in US?'), 'Combo field must be deferred');
    assert.ok(result.unmapped.includes('Favorite Color'), 'Unanswered combo field is unmapped');
  });

  await t.test('passes schemaName: "plan" and fieldId in userPayload when field.id is defined', async () => {
    const fields = [
      { id: 'field_first', label: 'First Name', type: 'text', required: true },
      { label: 'Last Name', type: 'text', required: true },
    ];
    const facts = buildVerifiedFacts({ full_name: 'Jane Doe' });

    const capturedOptions = [];
    const capturedUserPayloads = [];
    const mockClient = {
      async generateChatCompletion(messages, options) {
        capturedOptions.push(options);
        const userMsg = messages.find((m) => m.role === 'user');
        capturedUserPayloads.push(JSON.parse(userMsg.content));
        return {
          text: JSON.stringify({ fills: [{ label: 'First Name', fieldId: 'field_first', value: 'Jane' }] }),
          rawJson: { fills: [{ label: 'First Name', fieldId: 'field_first', value: 'Jane' }] },
        };
      },
    };

    const result = await planFormBatch(fields, facts, mockClient);
    assert.equal(capturedOptions.length, 1);
    assert.equal(capturedOptions[0].responseFormat, 'json_object');
    assert.equal(capturedOptions[0].schemaName, 'plan');

    assert.equal(capturedUserPayloads[0].fields[0].fieldId, 'field_first');
    assert.equal(capturedUserPayloads[0].fieldsToFill[0].fieldId, 'field_first');
    assert.equal('fieldId' in capturedUserPayloads[0].fields[1], false);
    assert.equal(result.fills.length, 1);
    assert.equal(result.fills[0].fieldId, 'field_first');
  });

  await t.test('rejects unknown fieldId, rejects duplicate assignments, and overrides model-supplied evidenceIds', async () => {
    const fields = [
      { id: 'f_name', name: 'full_name', label: 'Full Name', type: 'text' },
      { id: 'f_email', name: 'email', label: 'Email', type: 'text' },
    ];
    const facts = buildVerifiedFacts({
      full_name: 'Jane Doe',
      email: 'jane@example.com',
    });

    const mockClient = {
      async generateChatCompletion() {
        return {
          text: '{}',
          rawJson: {
            fills: [
              // Unknown fieldId: must be rejected even though label matches 'Full Name'
              { label: 'Full Name', fieldId: 'nonexistent_id', value: 'Jane Doe', evidenceIds: ['forged.id'] },
              // Valid match via field.name === rawFill.fieldId; forged evidenceIds must be replaced
              { label: 'Email', fieldId: 'email', value: 'jane@example.com', evidenceIds: ['forged.email.id'] },
              // Duplicate assignment to same field via id
              { label: 'Email', fieldId: 'f_email', value: 'jane@example.com' },
              // Duplicate assignment to same field via label
              { label: 'Email', value: 'jane@example.com' },
            ],
          },
        };
      },
    };

    const result = await planFormBatch(fields, facts, mockClient);

    assert.equal(result.fills.length, 1);
    assert.equal(result.fills[0].label, 'Email');
    assert.equal(result.fills[0].fieldId, 'f_email');
    assert.equal(result.fills[0].grounded, true);
    assert.deepEqual(result.fills[0].evidenceIds, ['profile.contact.email']);
    assert.ok(!result.fills[0].evidenceIds.includes('forged.email.id'));
    assert.deepEqual(result.unmapped, ['Full Name']);
  });

  await t.test('handles action skip, action defer_combobox, and executableFills stability', async () => {
    const fields = [
      { id: 'f_name', label: 'Full Name', type: 'text' },
      { label: 'City', type: 'text' }, // No id -> validated fill, NOT in executableFills
      { id: 'f_email', label: 'Email', type: 'text' },
      { id: 'f_auth', label: 'Authorized to Work in US?', type: 'select', combo: true },
    ];
    const facts = buildVerifiedFacts({
      full_name: 'Jane Doe',
      current_city: 'Austin',
      email: 'jane@example.com',
      authorized_in_usa: true,
    });

    const mockClient = {
      async generateChatCompletion() {
        return {
          text: '{}',
          rawJson: {
            fills: [
              { label: 'Full Name', fieldId: 'f_name', value: 'Jane Doe', action: 'fill' },
              { label: 'City', value: 'Austin', action: 'fill' },
              { label: 'Email', fieldId: 'f_email', value: 'jane@example.com', action: 'skip' },
              { label: 'Authorized to Work in US?', fieldId: 'f_auth', value: 'Yes', action: 'defer_combobox' },
            ],
          },
        };
      },
    };

    const result = await planFormBatch(fields, facts, mockClient);

    assert.equal(result.fills.length, 2);
    assert.equal(result.executableFills.length, 1);
    assert.equal(result.executableFills[0].fieldId, 'f_name');
    assert.equal(result.executableFills[0].value, 'Jane Doe');
    assert.deepEqual(result.deferred, ['Authorized to Work in US?']);
    assert.deepEqual(result.unmapped, ['Email']);
  });

  await t.test('aggregates batch token telemetry and durationMs without inventing missing counts', async () => {
    const fields = [
      { id: 'f1', label: 'First Name', type: 'text' },
      { id: 'f2', label: 'Last Name', type: 'text' },
      { id: 'f3', label: 'Email', type: 'text' },
      { id: 'f4', label: 'Phone', type: 'text' },
      { id: 'f5', label: 'City', type: 'text' },
    ];
    const facts = buildVerifiedFacts({
      full_name: 'Jane Doe',
      email: 'jane@example.com',
      phone: '555-123-4567',
      current_city: 'Austin',
    });

    let callIdx = 0;
    const mockClient = {
      async generateChatCompletion() {
        callIdx++;
        if (callIdx === 1) {
          return {
            text: '{}',
            rawJson: { fills: [{ label: 'First Name', fieldId: 'f1', value: 'Jane' }] },
            usage: { promptTokens: 100, completionTokens: 25 }, // totalTokens intentionally omitted
            durationMs: 120,
          };
        }
        return {
          text: '{}',
          rawJson: { fills: [{ label: 'City', fieldId: 'f5', value: 'Austin' }] },
          usage: { promptTokens: 80, completionTokens: 15 }, // totalTokens intentionally omitted
          durationMs: 85,
        };
      },
    };

    const result = await planFormBatch(fields, facts, mockClient, { batchSize: 4 });
    assert.equal(result.batchCount, 2);
    assert.ok(result.telemetry);
    assert.equal(result.telemetry.durationMs, 205);
    assert.equal(result.telemetry.usage.promptTokens, 180);
    assert.equal(result.telemetry.usage.completionTokens, 40);
    assert.equal(result.telemetry.usage.totalTokens, undefined, 'Must not invent omitted totalTokens');
    assert.equal(result.telemetry.usage.inputTokens, undefined, 'Must not invent omitted inputTokens');
    assert.equal(result.telemetry.usage.outputTokens, undefined, 'Must not invent omitted outputTokens');

    // When client provides no telemetry, result.telemetry remains undefined
    const noTelemetryClient = {
      async generateChatCompletion() {
        return {
          text: '{}',
          rawJson: { fills: [{ label: 'First Name', fieldId: 'f1', value: 'Jane' }] },
        };
      },
    };
    const resultNoTelemetry = await planFormBatch(fields.slice(0, 1), facts, noTelemetryClient);
    assert.equal(resultNoTelemetry.telemetry, undefined);
  });
});
