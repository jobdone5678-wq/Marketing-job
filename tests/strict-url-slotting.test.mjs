import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const application = new URL('https://jobs.lever.co/fixture/01234567-0123-4567-89ab-0123456789ab/apply');
const source = (file) => readFileSync(new URL(`../jobright_extension/${file}`, import.meta.url), 'utf8');
const prose = 'You can review my recent projects on GitHub.';

class Input extends EventTarget {
  tagName = 'INPUT';
  isConnected = true;
  value = '';
  getAttribute() { return null; }
  closest() { return null; }
}

function createHarness(fieldDefs) {
  const fields = fieldDefs.map(([label, name, type = 'text']) => ({
    key: name,
    label,
    name,
    kind: 'text',
    options: [],
    element: Object.assign(new Input(), { name, type }),
  }));
  const context = {
    location: application,
    document: { querySelectorAll: () => [] },
    crypto,
    Event,
    URL,
    HTMLInputElement: Input,
    NextkinJobCapture: { read: () => null },
    NextkinForms: { discoverFields: () => fields },
  };
  for (const file of ['core/field-mapping.js', 'core/field-writer.js', 'core/application.js']) {
    runInNewContext(source(file), context);
  }
  const lookup = (key) => fields.find((f) => f.key === key || f.name === key);
  return { context, fields, lookup };
}

test('multi-URL form slots LinkedIn, GitHub, Portfolio 1-to-1, marks Twitter and Other manual, and avoids duplicate URLs', () => {
  const { context, fields, lookup } = createHarness([
    ['LinkedIn Profile', 'urls[LinkedIn]'],
    ['GitHub Profile', 'urls[GitHub]', 'url'],
    ['Twitter URL', 'urls[Twitter]'],
    ['Portfolio', 'urls[Portfolio]'],
    ['Other', 'urls[Other]'],
    ['Personal Website', 'urls[Website]'],
  ]);

  const candidate = {
    confirmed_facts: {
      full_name: 'Test Candidate',
      email: 'candidate@example.test',
      linkedin_url: 'https://linkedin.com/in/testcandidate',
      github_url: 'https://github.com/testcandidate',
      portfolio_url: 'https://testcandidate.dev',
      website: 'https://testcandidate.dev', // duplicate of portfolio
    },
  };

  const plans = context.NextkinFieldMapping.planFill(fields, candidate);

  // 1. LinkedIn maps 1-to-1 to linkedin_url
  const linkedinPlan = plans.find((p) => p.field === lookup('urls[LinkedIn]'));
  assert.equal(linkedinPlan.status, 'supported');
  assert.equal(linkedinPlan.factKey, 'linkedin_url');
  assert.equal(linkedinPlan.value, 'https://linkedin.com/in/testcandidate');

  // 2. GitHub maps 1-to-1 to github_url
  const githubPlan = plans.find((p) => p.field === lookup('urls[GitHub]'));
  assert.equal(githubPlan.status, 'supported');
  assert.equal(githubPlan.factKey, 'github_url');
  assert.equal(githubPlan.value, 'https://github.com/testcandidate');

  // 3. Portfolio maps once to portfolio_url
  const portfolioPlan = plans.find((p) => p.field === lookup('urls[Portfolio]'));
  assert.equal(portfolioPlan.status, 'supported');
  assert.equal(portfolioPlan.factKey, 'portfolio_url');
  assert.equal(portfolioPlan.value, 'https://testcandidate.dev');

  // 4. Unmapped link fields (Twitter, Other) are marked manual
  const twitterPlan = plans.find((p) => p.field === lookup('urls[Twitter]'));
  assert.equal(twitterPlan.status, 'manual');
  assert.equal(twitterPlan.reason, 'Unmapped link field; enter manually.');

  const otherPlan = plans.find((p) => p.field === lookup('urls[Other]'));
  assert.equal(otherPlan.status, 'manual');
  assert.equal(otherPlan.reason, 'Unmapped link field; enter manually.');

  // 5. Zero duplicate URLs across fields (urls[Website] attempting to reuse https://testcandidate.dev)
  const websitePlan = plans.find((p) => p.field === lookup('urls[Website]'));
  assert.equal(websitePlan.status, 'manual');
  assert.equal(websitePlan.reason, 'Unmapped link field; enter manually.');

  const supportedUrls = plans.filter((p) => p.status === 'supported').map((p) => p.value);
  const uniqueUrls = new Set(supportedUrls);
  assert.equal(supportedUrls.length, uniqueUrls.size, 'All slotted URLs must be strictly unique');
});

test('malformed URLs or strings containing whitespace or newlines are rejected', () => {
  const { context } = createHarness([]);
  const { candidateHttpUrl } = context.NextkinFieldMapping;

  // Valid URLs pass
  assert.equal(candidateHttpUrl('https://github.com/user'), 'https://github.com/user');
  assert.equal(candidateHttpUrl('http://example.org/portfolio'), 'http://example.org/portfolio');

  // Whitespace and newlines rejected
  assert.equal(candidateHttpUrl('https://example.com/with space'), null);
  assert.equal(candidateHttpUrl('https://example.com\n'), null);
  assert.equal(candidateHttpUrl('https://example.com\r\npath'), null);
  assert.equal(candidateHttpUrl(' https://example.com'), null);
  assert.equal(candidateHttpUrl('https://example.com '), null);
  assert.equal(candidateHttpUrl(prose), null);

  // Invalid protocol or syntax rejected
  assert.equal(candidateHttpUrl('javascript:alert(1)'), null);
  assert.equal(candidateHttpUrl('mailto:test@example.com'), null);
  assert.equal(candidateHttpUrl('ftp://files.example.com'), null);
  assert.equal(candidateHttpUrl('https://user:pass@example.com'), null);
  assert.equal(candidateHttpUrl('https:///fixture.test'), null);
  assert.equal(candidateHttpUrl('not a url'), null);
  assert.equal(candidateHttpUrl(''), null);
  assert.equal(candidateHttpUrl(null), null);
});

test('zero prose or screening text can be slotted into any URL field during application fill', async () => {
  const { context, lookup } = createHarness([
    ['LinkedIn Profile', 'urls[LinkedIn]'],
    ['GitHub Profile', 'urls[GitHub]', 'url'],
    ['Twitter URL', 'urls[Twitter]'],
    ['Portfolio', 'urls[Portfolio]'],
    ['Other', 'urls[Other]'],
    ['Why do you want to join this company?', 'motivation'],
  ]);

  const candidate = {
    provenance_status: 'confirmed',
    confirmed_facts: {
      full_name: 'Test Candidate',
      email: 'candidate@example.test',
      linkedin_url: 'https://linkedin.com/in/testcandidate',
      github_url: 'https://github.com/testcandidate',
      portfolio_url: 'https://testcandidate.dev',
    },
  };

  const screeningProse = {
    'linkedin profile': prose,
    'github profile': prose,
    'twitter url': prose,
    'portfolio': prose,
    'other': prose,
    'urls[other]': prose,
    'motivation': 'I am passionate about building great software.',
  };

  const results = await context.NextkinApplication.fill(
    application.href,
    candidate,
    null,
    false,
    null,
    { 'twitter url': { type: 'text', value: prose } },
    screeningProse,
  );

  assert.equal(lookup('urls[LinkedIn]').element.value, 'https://linkedin.com/in/testcandidate');
  assert.equal(lookup('urls[GitHub]').element.value, 'https://github.com/testcandidate');
  assert.equal(lookup('urls[Portfolio]').element.value, 'https://testcandidate.dev');
  assert.equal(lookup('urls[Twitter]').element.value, '');
  assert.equal(lookup('urls[Other]').element.value, '');

  // Verify only motivation is in screening questions, zero URL fields
  assert.equal(results.questions.length, 1);
  assert.match(results.questions[0].label, /why do you want/i);

  // Verify no prose or AI filled into URL fields
  for (const entry of results.filled) {
    assert.notEqual(entry.key, 'urls[Twitter]');
    assert.notEqual(entry.key, 'urls[Other]');
    assert.ok(!entry.ai, 'No URL field should be filled by AI');
    assert.ok(!entry.learned, 'No URL field should be filled by learned answer');
  }
});

test('unrecognized or extra link fields receive manual status with specific unmapped reason', () => {
  const { context, fields, lookup } = createHarness([
    ['Twitter URL', 'urls[Twitter]'],
    ['Other', 'urls[Other]'],
    ['Substack Blog', 'urls[Substack]'],
  ]);

  const candidate = {
    confirmed_facts: {
      full_name: 'Test Candidate',
      email: 'candidate@example.test',
    },
  };

  const plans = context.NextkinFieldMapping.planFill(fields, candidate);
  for (const plan of plans) {
    assert.equal(plan.status, 'manual');
    assert.equal(plan.reason, 'Unmapped link field; enter manually.');
  }
});
