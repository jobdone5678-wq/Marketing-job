import test from 'node:test';
import assert from 'node:assert/strict';

test('Answer Bank Extension: 1. Universal answers match across any company', async () => {
  const mod = await import('../jobright_extension/core/answer-bank.js');
  const { matchAnswer, normalizeQuestion } = mod.default || mod;

  const answers = [
    {
      id: 'ans-1',
      question: 'What is your favorite programming language?',
      question_normalized: normalizeQuestion('What is your favorite programming language?'),
      answer: 'TypeScript',
      company_scope: null,
    }
  ];

  const field = {
    key: 'field-1',
    label: 'What is your favorite programming language?',
    kind: 'text',
  };

  const matchStripe = matchAnswer(field, answers, 'stripe');
  assert.ok(matchStripe, 'Should match universal answer for Stripe');
  assert.equal(matchStripe.answer, 'TypeScript');
  assert.equal(matchStripe.companyScope, null);

  const matchGoogle = matchAnswer(field, answers, 'google');
  assert.ok(matchGoogle, 'Should match universal answer for Google');
  assert.equal(matchGoogle.answer, 'TypeScript');
});

test('Answer Bank Extension: 2. Company-specific answers match only when company slug matches', async () => {
  const mod = await import('../jobright_extension/core/answer-bank.js');
  const { matchAnswer, normalizeQuestion } = mod.default || mod;

  const answers = [
    {
      id: 'ans-universal',
      question: 'Why do you want to work here?',
      question_normalized: normalizeQuestion('Why do you want to work here?'),
      answer: 'I love building great software.',
      company_scope: null,
    },
    {
      id: 'ans-stripe',
      question: 'Why do you want to work here?',
      question_normalized: normalizeQuestion('Why do you want to work here?'),
      answer: 'Stripe powers global economic infrastructure and I admire the developer tooling.',
      company_scope: 'stripe',
    }
  ];

  const field = {
    key: 'field-why',
    label: 'Why do you want to work here?',
    kind: 'textarea',
  };

  // When company is stripe, company-specific answer overrides universal
  const matchStripe = matchAnswer(field, answers, 'stripe');
  assert.ok(matchStripe);
  assert.equal(matchStripe.answer, 'Stripe powers global economic infrastructure and I admire the developer tooling.');
  assert.equal(matchStripe.companyScope, 'stripe');

  // When company is another company (e.g. meta), falls back to universal
  const matchMeta = matchAnswer(field, answers, 'meta');
  assert.ok(matchMeta);
  assert.equal(matchMeta.answer, 'I love building great software.');
  assert.equal(matchMeta.companyScope, null);
});

test('Answer Bank Extension: 3. Factual profile data always overrides Answer Bank entries in planFill', async () => {
  // Load field-mapping.js
  await import('../jobright_extension/core/answer-bank.js');
  await import('../jobright_extension/core/field-mapping.js');

  const candidate = {
    id: 'cand-1',
    confirmed_facts: {
      first_name: 'Alex',
      email: 'alex@example.com',
    }
  };

  const answerBank = [
    {
      id: 'ans-bad-name',
      question: 'First Name',
      question_normalized: 'first name',
      answer: 'FakeNameFromBank',
      company_scope: null,
    }
  ];

  const fields = [
    {
      key: 'fname',
      label: 'First Name',
      kind: 'text',
    }
  ];

  const plans = globalThis.NextkinFieldMapping.planFill(fields, candidate, {
    answerBank,
    companySlug: 'stripe'
  });

  assert.equal(plans.length, 1);
  assert.equal(plans[0].value, 'Alex', 'Must use confirmed profile fact, NOT answer bank');
  assert.equal(plans[0].factKey, 'first_name');
});

test('Answer Bank Extension: 4. Sensitive disclosures are rejected from being saved or matched', async () => {
  const mod = await import('../jobright_extension/core/answer-bank.js');
  const { isSensitiveQuestion, matchAnswer } = mod.default || mod;

  const sensitivePrompts = [
    'I agree to the arbitration agreement and terms',
    'Do you consent to background checks and drug screening?',
    'Electronic Signature: Please type your full name',
    'What is your race / ethnicity?',
    'Please state your gender identity',
    'Disability Status voluntary self-identification',
    'Veteran status declaration',
  ];

  for (const prompt of sensitivePrompts) {
    assert.ok(isSensitiveQuestion(prompt), `Prompt should be recognized as sensitive: "${prompt}"`);

    const field = { key: 'sens-1', label: prompt, kind: 'checkbox' };
    const answers = [
      {
        id: 'bad-ans',
        question: prompt,
        question_normalized: prompt.toLowerCase(),
        answer: 'yes',
        company_scope: null,
      }
    ];

    const match = matchAnswer(field, answers, 'stripe');
    assert.equal(match, null, `Sensitive question "${prompt}" must never match from answer bank`);
  }
});

test('Answer Bank Extension: 5. Unrecognized field falls back to Answer Bank (Tier 3) in planFill', async () => {
  await import('../jobright_extension/core/answer-bank.js');
  await import('../jobright_extension/core/field-mapping.js');

  const candidate = {
    id: 'cand-1',
    confirmed_facts: {
      first_name: 'Alex',
    }
  };

  const answerBank = [
    {
      id: 'ans-screening',
      question: 'What is your favorite testing framework?',
      question_normalized: 'what is your favorite testing framework',
      answer: 'node:test',
      company_scope: null,
    }
  ];

  const fields = [
    {
      key: 'custom-q',
      label: 'What is your favorite testing framework?',
      kind: 'text',
    }
  ];

  const plans = globalThis.NextkinFieldMapping.planFill(fields, candidate, {
    answerBank,
    companySlug: 'stripe'
  });

  assert.equal(plans.length, 1);
  assert.equal(plans[0].status, 'ready');
  assert.equal(plans[0].value, 'node:test');
  assert.equal(plans[0].source, 'answer_bank');
});

test('Answer Bank Extension: 6. AnswerBankClient caches locally and interacts with storage', async () => {
  const mod = await import('../jobright_extension/core/answer-bank.js');
  const { AnswerBankClient } = mod.default || mod;

  const mockStorage = {
    data: {},
    async get(key) {
      return { [key]: this.data[key] };
    },
    async set(items) {
      Object.assign(this.data, items);
    }
  };

  const mockAnswers = [
    {
      id: 'a1',
      question: 'What IDE do you use?',
      question_normalized: 'what ide do you use',
      answer: 'VS Code',
      company_scope: null,
      use_count: 3
    }
  ];

  const client = new AnswerBankClient({
    storage: mockStorage,
    api: async (path, options) => {
      if (path === 'answer-bank' && (!options || options.method === 'GET')) {
        return { answers: mockAnswers };
      }
      return {};
    }
  });

  // Initial fetch triggers API and caches
  const answers = await client.getAnswers(null, true);
  assert.equal(answers.length, 1);
  assert.equal(answers[0].answer, 'VS Code');

  // Verify cached into storage
  const cached = await mockStorage.get('nextkin_answer_bank_cache');
  assert.ok(cached.nextkin_answer_bank_cache);
  assert.equal(cached.nextkin_answer_bank_cache.length, 1);

  // Saving sensitive question throws / returns error
  const saveSensResult = await client.saveAnswer({
    question: 'Electronic Signature',
    answer: 'Alex',
    companyScope: null
  });
  assert.equal(saveSensResult.error, 'Sensitive disclosure cannot be saved to Answer Bank');
});
