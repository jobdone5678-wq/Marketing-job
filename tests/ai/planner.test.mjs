import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractCountryCodeFromLocation,
  inferQuestionDescriptor,
  planFormBatch,
} from '../../src/lib/ai/planner.ts';
import { ProviderClient, ProviderError } from '../../src/lib/ai/provider-client.ts';
import { buildVerifiedFacts } from '../../src/lib/ai/verified-facts.ts';

test('Employ sponsorship wording and qualified race choices use confirmed facts', async () => {
  const sponsorship = {
    id: 'sponsorship',
    label: 'This role requires candidates to be a US Citizen or Permanent Resident (Green Card holder). We are not able to support any form of visa sponsorship, including H-1B,H-1B Transfer, OPT, TN, EAD, etc. Will you now or in the future require sponsorship for employment visa status? *',
    type: 'radio',
    options: ['Yes', 'No'],
  };
  const qualified = 'Asian (Not Hispanic or Latino)';
  const race = { id: 'race', label: 'Race', type: 'select', options: ['Hispanic or Latino', qualified, 'Decline to self-identify'] };
  const descriptor = inferQuestionDescriptor(sponsorship);
  assert.equal(descriptor.intent, 'visa_sponsorship');
  assert.equal(descriptor.targetCountryCode, 'us');
  assert.equal(descriptor.sponsorshipScope, 'now_or_future');

  const confirmed = (id, value) => ({ id, value, provenance: 'user_confirmed' });
  const facts = new Map([
    ['screening.visa_sponsorship_needed', confirmed('screening.visa_sponsorship_needed', false)],
    ['demographics.raceEthnicity', confirmed('demographics.raceEthnicity', ['Asian'])],
  ]);
  const noProvider = () => assert.fail('Confirmed profile choices do not need an AI call');
  const partial = await planFormBatch([sponsorship, race], facts, noProvider);
  assert.deepEqual(partial.executableFills.map(({ value }) => value), ['No']);
  assert.equal(partial.unresolved.find(({ fieldId }) => fieldId === 'race')?.reasonCode, 'DEMOGRAPHIC_ETHNICITY_UNCONFIRMED');

  facts.set('demographics.hispanicOrigin', confirmed('demographics.hispanicOrigin', ['No']));
  const complete = await planFormBatch([sponsorship, race], facts, noProvider);
  assert.deepEqual(complete.executableFills.map(({ value }) => value), ['No', qualified]);
});

test('Planner: NextKinHR form batch planning with neighbor context & grounding', async (t) => {
  await t.test('chunks AI-bound fields into batches of 4-8 questions and preserves neighbor context across batches', async () => {
    // 8 AI-bound fields (not deterministically resolvable by scalar fast-path) -> 2 batches (5 + 3)
    const fields = [
      { id: 'f1', label: 'Why do you want to work at TechCorp?', type: 'textarea', widgetType: 'textarea', required: true },
      { id: 'f2', label: 'Describe a challenging frontend architecture project', type: 'textarea', widgetType: 'textarea', required: true },
      { id: 'f3', label: 'What excites you about our product?', type: 'textarea', widgetType: 'textarea', required: false },
      { id: 'f4', label: 'Preferred interview slot', type: 'select', combo: true, required: true },
      { id: 'f5', label: 'City', type: 'text', required: true }, // fast-pathed -> sets previouslyResolved
      { id: 'f6', label: 'Preferred team focus', type: 'select', options: ['Frontend Platform', 'Design Systems'], required: true },
      { id: 'f7', label: 'Which open-source projects have you maintained?', type: 'textarea', widgetType: 'textarea', required: false },
      { id: 'f8', label: 'Any additional context for the hiring team?', type: 'textarea', widgetType: 'textarea', required: false },
      { id: 'f9', label: 'Preferred work environment details', type: 'textarea', widgetType: 'textarea', required: false },
    ];

    const candidate = {
      full_name: 'Jane Doe',
      current_city: 'San Francisco',
    };
    const facts = buildVerifiedFacts(candidate, [
      { question: 'Why do you want to work at TechCorp?', answer: 'I love building accessible design systems at scale.' },
      { question: 'Describe a challenging frontend architecture project', answer: 'Led a React micro-frontend migration.' },
      { question: 'What excites you about our product?', answer: 'Developer productivity.' },
      { question: 'Which open-source projects have you maintained?', answer: 'Maintained a TypeScript CLI.' },
      { question: 'Any additional context for the hiring team?', answer: 'Available for onsite interviews.' },
      { question: 'Preferred work environment details', answer: 'Collaborative cross-functional teams.' },
    ]);
    // Remove exact answer_bank facts? No, answer_bank fast-paths exact questions!
    // Use unmapped phrasing or facts-without-answer-bank for AI batching, plus city fast-path.
    const aiOnlyFacts = buildVerifiedFacts(candidate);

    const callPayloads = [];
    const customFetch = async (_url, opts) => {
      const body = JSON.parse(opts.body);
      callPayloads.push(body);
      const userContent = JSON.parse(body.messages.find((m) => m.role === 'user').content);
      const targetFields = userContent.fields || [];
      const fills = targetFields.map((f) => ({
        fieldId: f.fieldId,
        label: f.label,
        value: '',
        action: 'skip',
      }));
      return new Response(
        JSON.stringify({
          choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ fills }) } }],
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

    const result = await planFormBatch(fields, aiOnlyFacts, client, {
      jobTitle: 'Frontend Engineer',
      company: 'TechCorp',
      batchSize: 5,
    });

    assert.equal(result.batchCount, 2, 'Must execute in 2 batches for 8 AI-bound fields with batchSize 5');
    assert.equal(callPayloads.length, 2);

    const sysPrompt = callPayloads[0].messages.find((m) => m.role === 'system').content;
    assert.match(sysPrompt, /You map a candidate's profile onto a job-application form/i);
    assert.match(sysPrompt, /Only use values present in the profile/i);
    assert.match(sysPrompt, /Respond with JSON: \{"fills":\[\{"label":"\.\.\.","value":"\.\.\."\}\]\}/i);

    const userContentBatch2 = JSON.parse(callPayloads[1].messages.find((m) => m.role === 'user').content);
    assert.equal(userContentBatch2.previouslyResolved.f5, 'San Francisco', 'Batch 2 must receive previouslyResolved from fast-path');
    assert.ok(userContentBatch2.neighborFields.length > 0, 'Batch 2 must receive neighbor fields context');
    assert.equal(result.fills.length, 1);
    assert.equal(result.fills[0].value, 'San Francisco');
  });

  await t.test('discards AI fills that fail grounded validation and preserves structured unresolved diagnostics (PL-04)', async () => {
    const fields = [
      { id: 'f_rust', label: 'How many years of Rust experience do you have?', type: 'text', required: true },
      { id: 'f_cert', label: 'Do you hold a PMP certification?', type: 'select', options: ['Yes', 'No'], required: true },
      { id: 'f_deg', label: 'Do you hold a Master degree in Computer Science?', type: 'select', options: ['Yes', 'No'], required: true },
    ];

    const candidate = {
      full_name: 'Junior Dev',
      total_experience_years: '2',
      highest_qualification: "Bachelor's Degree",
      primary_skills: 'JavaScript (2 years)',
      certifications: ['AWS Certified Solutions Architect'],
    };
    const facts = buildVerifiedFacts(candidate);

    const customFetch = async () => {
      return new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: JSON.stringify({
                  fills: [
                    { fieldId: 'f_rust', label: 'How many years of Rust experience do you have?', value: '5' },
                    { fieldId: 'f_cert', label: 'Do you hold a PMP certification?', value: 'Yes' },
                    { fieldId: 'f_deg', label: 'Do you hold a Master degree in Computer Science?', value: 'Yes' },
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

    assert.equal(result.fills.length, 0, 'Hallucinated fills must be discarded');
    assert.ok(result.unmapped.includes('How many years of Rust experience do you have?'));
    assert.ok(result.unmapped.includes('Do you hold a PMP certification?'));
    assert.ok(result.unmapped.includes('Do you hold a Master degree in Computer Science?'));

    const rustDiag = result.unresolved.find((u) => u.fieldId === 'f_rust');
    assert.ok(rustDiag);
    assert.equal(rustDiag.stage, 'experience');
    assert.equal(rustDiag.retryable, false);

    const certDiag = result.unresolved.find((u) => u.fieldId === 'f_cert');
    assert.ok(certDiag);
    assert.equal(certDiag.reasonCode, 'UNCONFIRMED_CERTIFICATION');
    assert.equal(certDiag.stage, 'certification');

    const degDiag = result.unresolved.find((u) => u.fieldId === 'f_deg');
    assert.ok(degDiag);
    assert.equal(degDiag.reasonCode, 'DEGREE_ELEVATION');
    assert.equal(degDiag.stage, 'education');
  });

  await t.test('correctly defers supported custom combobox fields and rejects unsupported/invalid combobox queries', async () => {
    const fields = [
      { id: 'f_name', label: 'Full Name', type: 'text', required: true },
      { id: 'f_auth', label: 'Authorized to Work in US?', type: 'select', combo: true, required: true },
      { id: 'f_color', label: 'Favorite Color', type: 'select', combo: true, required: false },
      { id: 'f_loc_bad', label: 'Current Country', type: 'select', combo: true, required: true },
    ];

    const candidate = {
      full_name: 'Alex Work',
      country: 'United States',
      authorized_in_usa: true,
    };
    const facts = buildVerifiedFacts(candidate);

    const customFetch = async () => {
      return new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: JSON.stringify({
                  fills: [
                    { fieldId: 'f_auth', label: 'Authorized to Work in US?', value: '' },
                    { fieldId: 'f_color', label: 'Favorite Color', value: '', action: 'defer_combobox', searchQuery: 'Blue' },
                    { fieldId: 'f_loc_bad', label: 'Current Country', value: '', action: 'defer_combobox', searchQuery: 'Canada' },
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
    assert.deepEqual(result.deferred, ['Authorized to Work in US?']);
    assert.deepEqual(result.deferredFieldIds, ['f_auth']);
    assert.ok(result.unmapped.includes('Favorite Color'));
    assert.ok(result.unmapped.includes('Current Country'));

    const colorDiag = result.unresolved.find((u) => u.fieldId === 'f_color');
    assert.equal(colorDiag?.reasonCode, 'INVALID_COMBOBOX_QUERY');
    const locDiag = result.unresolved.find((u) => u.fieldId === 'f_loc_bad');
    assert.equal(locDiag?.reasonCode, 'INVALID_COMBOBOX_QUERY');
  });

  await t.test('passes schemaName: "plan" and fieldId in userPayload when field.id is defined', async () => {
    const fields = [
      { id: 'field_exp_select', label: 'Years of experience range', type: 'select', options: ['0-2 years', '2+ years', '5+ years'], required: true },
      { label: 'Preferred team culture', type: 'text', required: false },
    ];
    const facts = buildVerifiedFacts({ full_name: 'Jane Doe', total_experience_years: 2 });

    const capturedOptions = [];
    const capturedUserPayloads = [];
    const mockClient = {
      async generateChatCompletion(messages, options) {
        capturedOptions.push(options);
        const userMsg = messages.find((m) => m.role === 'user');
        capturedUserPayloads.push(JSON.parse(userMsg.content));
        return {
          text: JSON.stringify({ fills: [{ label: 'Years of experience range', fieldId: 'field_exp_select', value: '2+ years' }] }),
          rawJson: { fills: [{ label: 'Years of experience range', fieldId: 'field_exp_select', value: '2+ years' }] },
        };
      },
    };

    const result = await planFormBatch(fields, facts, mockClient);
    assert.equal(capturedOptions.length, 1);
    assert.equal(capturedOptions[0].responseFormat, 'json_prompt');
    assert.equal(capturedOptions[0].schemaName, 'plan');

    assert.equal(capturedUserPayloads[0].fields[0].fieldId, 'field_exp_select');
    assert.equal('fieldId' in capturedUserPayloads[0].fields[1], false);
    assert.equal(result.fills.length, 1);
    assert.equal(result.fills[0].fieldId, 'field_exp_select');
  });

  await t.test('rejects unknown fieldId, rejects duplicate assignments, and overrides model-supplied evidenceIds', async () => {
    const fields = [
      { id: 'f_why', name: 'why_role', label: 'Why are you applying?', type: 'textarea' },
      { id: 'f_exp', name: 'exp_range', label: 'Total years of experience', type: 'select', options: ['0-2 years', '1-2 years', '5+ years'] },
    ];
    const facts = buildVerifiedFacts({
      full_name: 'Jane Doe',
      total_experience_years: 2,
    });

    const mockClient = {
      async generateChatCompletion() {
        return {
          text: '{}',
          rawJson: {
            fills: [
              // Unknown fieldId: must be rejected even though label matches
              { label: 'Why are you applying?', fieldId: 'nonexistent_id', value: 'Great mission', evidenceIds: ['forged.id'] },
              // Valid match via field.name === rawFill.fieldId; forged evidenceIds must be replaced
              { label: 'Total years of experience', fieldId: 'exp_range', value: '1-2 years', evidenceIds: ['forged.exp.id'] },
              // Duplicate assignment to same field via id
              { label: 'Total years of experience', fieldId: 'f_exp', value: '0-2 years' },
              // Duplicate assignment to same field via label
              { label: 'Total years of experience', value: '0-2 years' },
            ],
          },
        };
      },
    };

    const result = await planFormBatch(fields, facts, mockClient);

    assert.equal(result.fills.length, 1);
    assert.equal(result.fills[0].label, 'Total years of experience');
    assert.equal(result.fills[0].fieldId, 'f_exp');
    assert.equal(result.fills[0].value, '1-2 years');
    assert.equal(result.fills[0].grounded, true);
    assert.deepEqual(result.fills[0].evidenceIds, ['profile.experience.total_years']);
    assert.ok(!result.fills[0].evidenceIds.includes('forged.exp.id'));
    assert.deepEqual(result.unmapped, ['Why are you applying?']);
  });

  await t.test('handles action skip, action defer_combobox, and executableFills stability', async () => {
    const fields = [
      { id: 'f_name', label: 'Full Name', type: 'text' },
      { label: 'City', type: 'text' }, // No id -> validated fill, NOT in executableFills
      { id: 'f_notes', label: 'Additional portfolio notes', type: 'text' },
      { id: 'f_auth', label: 'Authorized to Work in US?', type: 'select', combo: true },
    ];
    const facts = buildVerifiedFacts({
      full_name: 'Jane Doe',
      current_city: 'Austin',
      authorized_in_usa: true,
    });

    const mockClient = {
      async generateChatCompletion() {
        return {
          text: '{}',
          rawJson: {
            fills: [
              { label: 'Additional portfolio notes', fieldId: 'f_notes', value: 'Note', action: 'skip' },
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
    assert.deepEqual(result.unmapped, ['Additional portfolio notes']);
  });

  await t.test('aggregates batch token telemetry and durationMs without inventing missing counts', async () => {
    const fields = [
      { id: 'f1', label: 'Experience level A', type: 'select', options: ['0-2 years', '2+ years', '5+ years'] },
      { id: 'f2', label: 'Custom prompt 1', type: 'textarea' },
      { id: 'f3', label: 'Custom prompt 2', type: 'textarea' },
      { id: 'f4', label: 'Custom prompt 3', type: 'textarea' },
      { id: 'f5', label: 'Experience level B', type: 'select', options: ['0-2 years', '2+ years', '5+ years'] },
    ];
    const facts = buildVerifiedFacts({
      full_name: 'Jane Doe',
      total_experience_years: 2,
    });

    let callIdx = 0;
    const mockClient = {
      async generateChatCompletion() {
        callIdx++;
        if (callIdx === 1) {
          return {
            text: '{}',
            rawJson: { fills: [{ label: 'Experience level A', fieldId: 'f1', value: '2+ years' }] },
            usage: { promptTokens: 100, completionTokens: 25 },
            durationMs: 120,
          };
        }
        return {
          text: '{}',
          rawJson: { fills: [{ label: 'Experience level B', fieldId: 'f5', value: '2+ years' }] },
          usage: { promptTokens: 80, completionTokens: 15 },
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

    const noTelemetryClient = {
      async generateChatCompletion() {
        return {
          text: '{}',
          rawJson: { fills: [{ label: 'Experience level A', fieldId: 'f1', value: '2+ years' }] },
        };
      },
    };
    const resultNoTelemetry = await planFormBatch(fields.slice(0, 1), facts, noTelemetryClient);
    assert.equal(resultNoTelemetry.telemetry, undefined);
  });

  await t.test('gates dependent sponsorship until DOM confirms planned location combobox, omits jobDescription without prose textarea, and clamps batchSize to [4, 8]', async () => {
    const fields = [
      {
        id: 'f_loc',
        label: 'Which country do you intend to work from?',
        type: 'text',
        widgetType: 'combobox',
        combo: true,
        helperText: 'Please list your city and country.',
        required: true,
      },
      {
        id: 'f_spon',
        label: 'Will you now or in the future require sponsorship for employment visa status to work in this location?',
        type: 'button',
        widgetType: 'boolean_buttons',
        options: ['Yes', 'No'],
        required: true,
      },
    ];

    const facts = buildVerifiedFacts(
      {
        full_name: 'Taylor Austin',
        current_city: 'Austin',
        current_state: 'Texas',
        country: 'United States',
        authorized_in_usa: true,
        confirmed_facts: {
          screeningAnswers: {
            country_specific_answers: {
              us_sponsorship: 'no',
            },
          },
        },
      },
      undefined,
      {
        age_18_or_older: true,
        notice_period_days: null,
        willing_to_relocate: null,
        visa_sponsorship_needed: true,
      },
    );

    const capturedPayloads = [];
    const mockClient = {
      async generateChatCompletion(messages) {
        const userPayload = JSON.parse(messages.find((m) => m.role === 'user').content);
        capturedPayloads.push(userPayload);
        return {
          text: '{}',
          rawJson: {
            fills: [
              {
                fieldId: 'f_loc',
                label: 'Which country do you intend to work from?',
                value: null,
                action: 'defer_combobox',
                searchQuery: 'Austin, United States',
              },
            ],
          },
        };
      },
    };

    const result = await planFormBatch(fields, facts, mockClient, {
      jobDescription: 'Senior Engineer role requiring distributed systems expertise.',
      batchSize: 8,
    });

    assert.equal(capturedPayloads.length, 1);
    assert.equal(capturedPayloads[0].fields[0].helperText, 'Please list your city and country.');
    assert.equal(capturedPayloads[0].fields[0].widgetType, 'combobox');
    assert.equal(capturedPayloads[0].context.jobDescription, undefined, 'jobDescription must be omitted when no prose textarea is in batch');

    assert.deepEqual(result.deferred, ['Which country do you intend to work from?']);
    assert.deepEqual(result.deferredFieldIds, ['f_loc']);
    assert.deepEqual(result.deferredPlans, [
      {
        fieldId: 'f_loc',
        label: 'Which country do you intend to work from?',
        searchQuery: 'Austin, United States',
      },
    ]);

    // Dependent sponsorship must NOT resolve before f_loc is confirmed in DOM!
    assert.equal(result.fills.length, 0);
    const sponDiag = result.unresolved.find((u) => u.fieldId === 'f_spon');
    assert.ok(sponDiag);
    assert.equal(sponDiag.reasonCode, 'UPSTREAM_LOCATION_UNRESOLVED');
    assert.equal(sponDiag.retryable, true);

    // Once DOM confirms f_loc in previouslyResolved (e.g. "Austin, United States"), f_spon resolves deterministically
    const pass2 = await planFormBatch([fields[1]], facts, mockClient, {
      previouslyResolved: { f_loc: 'Austin, United States' },
    });
    assert.equal(pass2.fills.length, 1);
    assert.equal(pass2.fills[0].fieldId, 'f_spon');
    assert.equal(pass2.fills[0].value, 'No');
    assert.ok(pass2.fills[0].evidenceIds.includes('country_specific_answers.us_sponsorship'));

    // Batch size clamp [4, 8] and jobDescription trimmed to 1200 chars only when prose textarea is present
    const eightFields = Array.from({ length: 8 }, (_, idx) => ({
      id: `q_${idx}`,
      label: idx === 0 ? 'Why do you want to work here?' : `Question ${idx}`,
      type: idx === 0 ? 'textarea' : 'text',
      widgetType: idx === 0 ? 'textarea' : 'text',
    }));
    const longDesc = 'A'.repeat(1500);
    const prosePayloads = [];
    const proseClient = {
      async generateChatCompletion(messages) {
        prosePayloads.push(JSON.parse(messages.find((m) => m.role === 'user').content));
        return { text: '{}', rawJson: { fills: [] } };
      },
    };
    const proseResult = await planFormBatch(eightFields, facts, proseClient, {
      jobDescription: longDesc,
      batchSize: 12,
    });
    assert.equal(proseResult.batchCount, 1, 'batchSize 12 must clamp to 8');
    assert.equal(prosePayloads[0].context.jobDescription.length, 1200);
  });

  await t.test('handles bundled demographic checkbox_group strictly based on enabled flag without AI calls', async () => {
    const fields = [
      {
        id: 'f_communities',
        label: 'Which of the following communities do you belong to?',
        type: 'checkbox',
        widgetType: 'checkbox_group',
        options: ['Veteran', 'Person with a disability', 'None of the above'],
      },
    ];

    const enabledFacts = buildVerifiedFacts(
      { full_name: 'Pat Vet' },
      undefined,
      undefined,
      { enabled: true, answers: { veteran: ['Yes'] } },
    );
    const disabledFacts = buildVerifiedFacts(
      { full_name: 'Pat Vet' },
      undefined,
      undefined,
      { enabled: false, answers: { veteran: ['Yes'] } },
    );

    const failIfCalledClient = {
      async generateChatCompletion() {
        assert.fail('Should resolve or gate deterministically without calling AI');
      },
    };

    const enabledRes = await planFormBatch(fields, enabledFacts, failIfCalledClient);
    assert.equal(enabledRes.fills.length, 1);
    assert.equal(enabledRes.fills[0].value, 'Veteran');
    assert.ok(enabledRes.fills[0].evidenceIds.includes('demographics.veteran'));

    const disabledRes = await planFormBatch(fields, disabledFacts, failIfCalledClient);
    assert.equal(disabledRes.fills.length, 0, 'Disabled demographics must leave field unmapped');
    assert.deepEqual(disabledRes.unmapped, ['Which of the following communities do you belong to?']);
    assert.equal(disabledRes.unresolved[0]?.reasonCode, 'DEMOGRAPHIC_DISABLED_OR_UNSET');
  });

  await t.test('tracks incoming [deferred combobox] entries in context.previouslyResolved as unresolved upstream location', async () => {
    const facts = buildVerifiedFacts(
      {
        full_name: 'Taylor Austin',
        authorized_countries: ['us'],
      },
      undefined,
      {
        age_18_or_older: true,
        notice_period_days: null,
        willing_to_relocate: null,
        visa_sponsorship_needed: false,
        authorized_countries: ['us'],
      },
    );

    const fields = [
      {
        id: 'f_spon',
        label: 'Will you now or in the future require sponsorship for employment visa status to work in this location?',
        type: 'radio',
        widgetType: 'boolean_buttons',
        options: ['Yes', 'No'],
      },
    ];

    const mockClient = {
      async generateChatCompletion() {
        assert.fail('Should gate deterministically on UPSTREAM_LOCATION_UNRESOLVED');
      },
    };

    const result = await planFormBatch(fields, facts, mockClient, {
      previouslyResolved: {
        'Which country do you intend to work from?': '[deferred combobox]',
      },
    });
    assert.equal(result.fills.length, 0);
    assert.deepEqual(result.unmapped, [fields[0].label]);
    assert.equal(result.unresolved[0]?.reasonCode, 'UPSTREAM_LOCATION_UNRESOLVED');
  });

  await t.test('PL-02: resolves profile.*, demographics.*, context-safe Answer Bank, and verified select fields deterministically with 0 AI calls', async () => {
    const facts = buildVerifiedFacts(
      {
        full_name: 'Bhargav Reddy',
        email: 'bhargav@example.com',
        current_city: 'Austin',
        current_state: 'TX',
        country: 'United States',
        authorized_in_usa: true,
      },
      [
        { question: 'How did you hear about us?', answer: 'LinkedIn' },
      ],
      undefined,
      {
        enabled: true,
        answers: {
          ageRange: ['25-34'],
          gender: ['Male'],
          raceEthnicity: ['Asian'],
          hispanicOrigin: ['No'],
          veteran: ['Yes'],
        },
      },
    );

    const fields = [
      { id: 'f_name', label: 'Name *', type: 'text', widgetType: 'text', required: true },
      { id: 'f_email', label: 'Email', type: 'email', widgetType: 'text', required: true },
      { id: 'f_city', label: 'City', type: 'text', widgetType: 'text', required: true },
      { id: 'f_auth', label: 'Are you authorized to work in the United States?', type: 'select', widgetType: 'select', options: ['Yes', 'No'] },
      { id: 'f_hear', label: 'How did you hear about us?', type: 'text', widgetType: 'text' },
      {
        id: 'f_age',
        label: 'What is your current age?',
        type: 'select',
        widgetType: 'select',
        options: ['18-24', '25–39 years old', '40-55', 'Prefer not to say'],
      },
      {
        id: 'f_gender',
        label: 'What is your gender identity?',
        type: 'radio',
        widgetType: 'radio',
        options: ['Male / Man', 'Female / Woman', 'Non-binary', 'Prefer not to say'],
      },
      {
        id: 'f_eth',
        label: 'Which ethnicity(ies) do you identify with? Please select all that apply.',
        type: 'checkbox',
        widgetType: 'checkbox_group',
        multiple: true,
        options: ['Asian (Not Hispanic or Latino)', 'White (Not Hispanic or Latino)', 'Prefer not to answer'],
      },
      {
        id: 'f_comm',
        label: 'Which of the following communities do you belong to? Please select all that apply.',
        type: 'checkbox',
        widgetType: 'checkbox_group',
        multiple: true,
        options: ['Veteran', 'Neurodivergent', 'None of the above', 'I prefer not to answer'],
      },
    ];

    let providerCalls = 0;
    const mockClient = {
      async generateChatCompletion() {
        providerCalls++;
        return { text: '{}', rawJson: { fills: [] } };
      },
    };

    const result = await planFormBatch(fields, facts, mockClient);
    assert.equal(providerCalls, 0, 'Expanded PL-02 fast-path must resolve all 9 fields with 0 AI calls');
    assert.equal(result.batchCount, 0);
    assert.equal(result.executableFills.length, 9);
    assert.deepEqual(
      Object.fromEntries(result.executableFills.map((f) => [f.fieldId, f.value])),
      {
        f_name: 'Bhargav Reddy',
        f_email: 'bhargav@example.com',
        f_city: 'Austin',
        f_auth: 'Yes',
        f_hear: 'LinkedIn',
        f_age: '25–39 years old',
        f_gender: 'Male / Man',
        f_eth: 'Asian (Not Hispanic or Latino)',
        f_comm: 'Veteran',
      },
    );
  });
});

test('Planner: PL-01..PL-04, PC-06, CountryResolver, requiresReview, userEdited, and batch partial preservation', async (t) => {
  await t.test('PL-01 & PC-06: immigration status with Refugee/immigrant option is NOT classified as demographic and never leaks demographics.*', async () => {
    const immField = {
      id: 'f_imm',
      label: 'What is your current immigration or work authorization status?',
      type: 'select',
      widgetType: 'select',
      options: ['US Citizen', 'Permanent Resident', 'Refugee or immigrant', 'H-1B Visa'],
    };

    const desc = inferQuestionDescriptor(immField);
    assert.notEqual(desc.category, 'demographics', 'Immigration status question must not be classified as demographics');
    assert.equal(desc.intent, 'visa_status');
    assert.equal(desc.category, 'work_auth');

    const facts = buildVerifiedFacts(
      { full_name: 'Ada Lovelace', country: 'United States' },
      undefined,
      undefined,
      { enabled: true, answers: { gender: ['Female'], raceEthnicity: ['White'] } },
    );

    let seenProfileKeys = [];
    const mockClient = {
      async generateChatCompletion(messages) {
        const payload = JSON.parse(messages.find((m) => m.role === 'user').content);
        seenProfileKeys = Object.keys(payload.profile);
        return { text: '{}', rawJson: { fills: [] } };
      },
    };

    await planFormBatch([immField], facts, mockClient);
    assert.equal(
      seenProfileKeys.some((k) => k.startsWith('demographics.')),
      false,
      'PC-06: Non-demographic batch must NOT receive demographics.* facts',
    );
  });

  await t.test('PLN-R1: preserves duplicate labels with distinct fieldIds, protects userEdited/pre-filled fields, and excludes requiresReview from executableFills', async () => {
    const facts = buildVerifiedFacts({
      full_name: 'Ada Lovelace',
      country: 'United States',
      need_sponsorship_future: true,
    });

    const fields = [
      { id: 'f_edu_country', label: 'Country', section: 'Education', type: 'text', currentValue: 'United Kingdom', userEdited: true },
      { id: 'f_work_country', label: 'Country', section: 'Work History', type: 'text' },
      { id: 'f_spon', label: 'Will you require visa sponsorship in the future?', type: 'radio', options: ['Yes', 'No'] },
    ];

    const mockClient = {
      async generateChatCompletion() {
        assert.fail('All fields should resolve or be protected deterministically');
      },
    };

    const result = await planFormBatch(fields, facts, mockClient);

    // f_edu_country is userEdited -> protected, not in fills, recorded in unresolved
    assert.equal(result.fills.some((f) => f.fieldId === 'f_edu_country'), false);
    const eduDiag = result.unresolved.find((u) => u.fieldId === 'f_edu_country');
    assert.equal(eduDiag?.reasonCode, 'USER_EDITED');

    // f_work_country resolves to United States
    const workCountryFill = result.fills.find((f) => f.fieldId === 'f_work_country');
    assert.equal(workCountryFill?.value, 'United States');

    // f_spon requiresReview=true when candidate needs sponsorship -> in fills, NOT in executableFills
    const sponFill = result.fills.find((f) => f.fieldId === 'f_spon');
    assert.equal(sponFill?.value, 'Yes');
    assert.equal(sponFill?.requiresReview, true);
    assert.equal(result.executableFills.some((f) => f.fieldId === 'f_spon'), false, 'requiresReview fill must NOT enter executableFills');
    assert.deepEqual(result.executableFills.map((f) => f.fieldId), ['f_work_country']);
  });

  await t.test('PLN-R2 & PL-03: section-scoped dependencies (Education country != Employment sponsorship) & unconfirmed dropdown gate', async () => {
    const facts = buildVerifiedFacts(
      {
        full_name: 'Sam Patel',
        country: 'United States',
        confirmed_facts: {
          screeningAnswers: {
            country_specific_answers: {
              ca_auth: true,
              us_auth: false,
            },
          },
        },
      },
      undefined,
      {
        age_18_or_older: true,
        notice_period_days: null,
        willing_to_relocate: null,
        visa_sponsorship_needed: false,
        authorized_countries: ['ca'],
      },
    );

    // Education section has Canada (pre-filled in DOM); Work Authorization section has an unconfirmed select dropdown for Country + dependent auth question
    const fields = [
      { id: 'f_edu_country', label: 'Country', section: 'Education', type: 'text', currentValue: 'Canada' },
      { id: 'f_work_country', label: 'Which country do you intend to work from?', section: 'Work Authorization', type: 'select', options: ['United States', 'Canada'] },
      { id: 'f_work_auth', label: 'Are you legally authorized to work in this location?', section: 'Work Authorization', type: 'radio', options: ['Yes', 'No'] },
    ];

    const result = await planFormBatch(fields, facts, {
      async generateChatCompletion() {
        return { text: '{}', rawJson: { fills: [] } };
      },
    });

    // Even though Education Country is "Canada" in DOM, Work Authorization section has unconfirmed f_work_country dropdown!
    // Therefore f_work_auth MUST be gated (UPSTREAM_LOCATION_UNRESOLVED) rather than inheriting Education's Canada!
    assert.equal(result.fills.some((f) => f.fieldId === 'f_work_auth'), false);
    const authDiag = result.unresolved.find((u) => u.fieldId === 'f_work_auth');
    assert.equal(authDiag?.reasonCode, 'UPSTREAM_LOCATION_UNRESOLVED');
    assert.equal(authDiag?.retryable, true);
  });

  await t.test('PLN-R3: preserves earlier successful batch fills when a later batch fails and records BATCH_ERROR diagnostics', async () => {
    const fields = [
      { id: 'b1_1', label: 'Custom prompt 1', type: 'textarea' },
      { id: 'b1_2', label: 'Custom prompt 2', type: 'textarea' },
      { id: 'b1_3', label: 'Custom prompt 3', type: 'textarea' },
      { id: 'b1_4', label: 'Total years of experience', type: 'select', options: ['0-2 years', '1-2 years', '5+ years'] },
      { id: 'b2_1', label: 'Custom prompt 4', type: 'textarea' },
    ];
    const facts = buildVerifiedFacts({ full_name: 'Ada Lovelace', total_experience_years: 2 });

    let batchIdx = 0;
    const mockClient = {
      async generateChatCompletion() {
        batchIdx++;
        if (batchIdx === 1) {
          return {
            text: '{}',
            rawJson: {
              fills: [{ fieldId: 'b1_4', label: 'Total years of experience', value: '1-2 years' }],
            },
            usage: { promptTokens: 50, completionTokens: 10 },
            durationMs: 40,
          };
        }
        throw new ProviderError('Upstream service unavailable', 503, 'HTTP_ERROR');
      },
    };

    const result = await planFormBatch(fields, facts, mockClient, { batchSize: 4 });
    assert.equal(result.fills.length, 1);
    assert.equal(result.fills[0].fieldId, 'b1_4');
    assert.equal(result.fills[0].value, '1-2 years');
    assert.equal(result.telemetry?.durationMs, 40);

    const b2Diag = result.unresolved.find((u) => u.fieldId === 'b2_1');
    assert.equal(b2Diag?.reasonCode, 'BATCH_ERROR');
    assert.equal(b2Diag?.stage, 'provider');
  });

  await t.test('LOC-R2: uses shared CountryResolver so San Francisco, CA and Indianapolis, IN resolve to us (never Canada/India)', () => {
    assert.equal(extractCountryCodeFromLocation('San Francisco, CA'), 'us');
    assert.equal(extractCountryCodeFromLocation('Indianapolis, IN'), 'us');
    assert.equal(extractCountryCodeFromLocation('[deferred combobox: San Francisco, CA]'), 'us');
    assert.equal(extractCountryCodeFromLocation('Toronto, ON, Canada'), 'ca');
    assert.equal(extractCountryCodeFromLocation('Bengaluru, India'), 'in');
  });
});
