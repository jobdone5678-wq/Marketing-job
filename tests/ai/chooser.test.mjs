import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseComboboxOption } from '../../src/lib/ai/chooser.ts';
import { ProviderClient } from '../../src/lib/ai/provider-client.ts';
import { buildVerifiedFacts } from '../../src/lib/ai/verified-facts.ts';

test('Chooser: FreeHire combobox option selection from live DOM options', async (t) => {
  await t.test('passes live captured options and selects exact matching option', async () => {
    const question = {
      label: 'Country of Residence',
      type: 'select',
      required: true,
    };
    const options = ['United States', 'Canada', 'United Kingdom', 'Germany', 'Australia'];

    const candidate = {
      full_name: 'Jane Doe',
      country: 'United States',
      current_city: 'San Francisco',
      current_state: 'CA',
    };
    const facts = buildVerifiedFacts(candidate);

    let capturedRequestBody = null;
    const customFetch = async (url, opts) => {
      capturedRequestBody = JSON.parse(opts.body);
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ choice: 'United States' }) } }],
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

    const result = await chooseComboboxOption(question, options, facts, client);

    assert.equal(result.choice, 'United States');
    assert.ok(result.evidenceIds?.length > 0);

    // Verify choose prompt instructions
    const sysPrompt = capturedRequestBody.messages.find(m => m.role === 'system').content;
    assert.match(sysPrompt, /You are answering ONE question on a job-application form/i);
    assert.match(sysPrompt, /Return an option copied exactly from the list/i);
    assert.match(sysPrompt, /Respond with JSON: \{"choice":"\.\.\."\}/i);

    // Verify user payload includes question and options
    const userPayload = JSON.parse(capturedRequestBody.messages.find(m => m.role === 'user').content);
    assert.equal(userPayload.question, 'Country of Residence');
    assert.deepEqual(userPayload.options, options);
  });

  await t.test('rejects any option not present in the offered options array', async () => {
    const question = {
      label: 'Highest Education Level',
      type: 'select',
      required: true,
    };
    const options = ["High School", "Associate's Degree", "Bachelor's Degree"];

    const candidate = {
      full_name: 'Bob Dev',
      highest_qualification: "Bachelor's Degree",
    };
    const facts = buildVerifiedFacts(candidate);

    // Model returns an unoffered hallucinated option
    const customFetch = async () => {
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ choice: "Master's Degree (unofficial)" }) } }],
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

    const result = await chooseComboboxOption(question, options, facts, client);

    assert.equal(result.choice, null, 'Must reject choice not offered in options array');
  });

  await t.test('returns choice: null when candidate profile does not support any option', async () => {
    const question = {
      label: 'What is your security clearance level?',
      type: 'select',
      required: false,
    };
    const options = ['Confidential', 'Secret', 'Top Secret', 'None / Not Applicable'];

    // Candidate has no security clearance facts
    const candidate = {
      full_name: 'Normal Dev',
      current_city: 'Austin',
    };
    const facts = buildVerifiedFacts(candidate);

    const customFetch = async () => {
      // Model correctly declines by returning empty choice per FreeHire prompt rules
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ choice: '' }) } }],
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

    const result = await chooseComboboxOption(question, options, facts, client);

    assert.equal(result.choice, null, 'Must return choice: null when profile does not answer question');
  });

  await t.test('rejects negation-reversal choice on visa sponsorship questions', async () => {
    const question = {
      label: 'Will you now or in the future require visa sponsorship?',
      type: 'select',
      required: true,
    };
    const options = ['Yes', 'No'];

    // Candidate DOES NOT need sponsorship
    const candidate = {
      full_name: 'Citizen Dev',
      authorized_in_usa: true,
      need_sponsorship_now: false,
      need_sponsorship_future: false,
    };
    const facts = buildVerifiedFacts(candidate);

    // Model erroneously returns 'Yes'
    const customFetch = async () => {
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ choice: 'Yes' }) } }],
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

    const result = await chooseComboboxOption(question, options, facts, client);

    assert.equal(result.choice, null, 'Must reject negation-reversed choice on sponsorship question');
  });

  await t.test('forwards helperText and previouslyResolved, resolves standalone Race verbatim when enabled: true, and returns null when enabled: false', async () => {
    const question = {
      label: 'Race',
      type: 'select',
      combo: true,
      helperText: 'Select the racial or ethnic group with which you identify.',
    };
    const options = ['Asian', 'Black or African American', 'White', 'Decline to self-identify'];

    const enabledFacts = buildVerifiedFacts(
      { full_name: 'Alex Cho' },
      undefined,
      undefined,
      { enabled: true, answers: { raceEthnicity: ['Asian'] } },
    );
    const disabledFacts = buildVerifiedFacts(
      { full_name: 'Alex Cho' },
      undefined,
      undefined,
      { enabled: false, answers: { raceEthnicity: ['Asian'] } },
    );

    const capturedPayloads = [];
    const createClient = (choiceValue) => ({
      async generateChatCompletion(messages) {
        capturedPayloads.push(JSON.parse(messages.find((m) => m.role === 'user').content));
        return {
          text: JSON.stringify({ choice: choiceValue }),
          rawJson: { choice: choiceValue },
        };
      },
    });

    const context = {
      helperText: 'Select the racial or ethnic group with which you identify.',
      previouslyResolved: { 'Which country do you intend to work from?': 'Austin, United States' },
    };

    const enabledRes = await chooseComboboxOption(
      question,
      options,
      enabledFacts,
      createClient('Asian'),
      undefined,
      context,
    );
    assert.equal(enabledRes.choice, 'Asian');
    assert.ok(enabledRes.evidenceIds.includes('demographics.raceEthnicity'));
    assert.equal(capturedPayloads[0].helperText, 'Select the racial or ethnic group with which you identify.');
    assert.deepEqual(capturedPayloads[0].previouslyResolved, {
      'Which country do you intend to work from?': 'Austin, United States',
    });

    // Rejects wrong-cased non-verbatim option
    const wrongCaseRes = await chooseComboboxOption(
      question,
      options,
      enabledFacts,
      createClient('asian'),
      undefined,
      context,
    );
    assert.equal(wrongCaseRes.choice, null);

    // Returns null when demographics enabled: false
    const disabledRes = await chooseComboboxOption(
      question,
      options,
      disabledFacts,
      createClient('Asian'),
      undefined,
      context,
    );
    assert.equal(disabledRes.choice, null);
  });
});
