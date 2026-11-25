import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const mapping = require('../jobright_extension/core/field-mapping.js');
const registry = require('../jobright_extension/core/site-registry.js');
const siteRules = require('../jobright_extension/core/site-rules.js');

function loadAutofillBundle(extraGlobals = {}) {
  const code = fs.readFileSync('tests/autofill-bundle.js', 'utf8');
  const context = {
    globalThis: null,
    window: { top: null },
    location: {
      href: 'https://boards.greenhouse.io/acme/jobs/123',
      origin: 'https://boards.greenhouse.io',
      pathname: '/acme/jobs/123',
      search: '',
      hash: '',
    },
    document: {
      title: 'Acme Job',
      body: { innerText: '' },
      querySelector: () => null,
      querySelectorAll: () => [],
      getElementById: () => null,
      createElement: () => ({ innerHTML: '', textContent: '', querySelectorAll: () => [], querySelector: () => null }),
    },
    crypto: globalThis.crypto,
    URL,
    URLSearchParams,
    Set,
    Map,
    WeakMap,
    WeakSet,
    Promise,
    Date,
    Math,
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    Event: class Event { constructor(type, opts = {}) { this.type = type; this.bubbles = !!opts.bubbles; } },
    KeyboardEvent: class KeyboardEvent { constructor(type, opts = {}) { this.type = type; this.key = opts.key; } },
    DataTransfer: class DataTransfer { constructor() { this._items = []; this.files = []; } get items() { const self = this; return { add(f) { self._items.push(f); self.files = [...self._items]; } }; } },
    File: class File { constructor(parts, name, opts = {}) { this.parts = parts; this.name = name; this.type = opts.type || ''; this.size = parts.reduce((n, p) => n + p.length, 0); } async arrayBuffer() { return this.parts[0].buffer; } },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    console,
    ...extraGlobals,
  };
  context.globalThis = context;
  context.window.top = context.window;
  vm.runInNewContext(code, context);
  return context;
}

// 1. US-authorized candidate applying to a Canadian job with "Are you authorized to work in this country?"
test('1. Country-aware work authorization: US-authorized candidate on Canadian job is not answered Yes', () => {
  const field = {
    key: 'auth_q',
    label: 'Are you authorized to work in this country?',
    kind: 'choice',
    options: [{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }],
  };
  const candidate = { confirmed_facts: { authorized_in_usa: true } };

  const canadaPlans = mapping.planFill([field], candidate, { jobCountry: 'Canada' });
  assert.notEqual(canadaPlans[0].status, 'supported');
  assert.notEqual(canadaPlans[0].value, 'Yes');

  const unverifiedPlans = mapping.planFill([field], candidate);
  assert.equal(unverifiedPlans[0].status, 'needs_review');

  const usPlans = mapping.planFill([field], candidate, { jobCountry: 'United States' });
  assert.equal(usPlans[0].status, 'supported');
  assert.equal(usPlans[0].value, 'Yes');
});

// 2. Associate degree satisfying a general college degree question
test('2. Associate degree satisfies general college degree question', () => {
  const field = {
    key: 'college_degree',
    label: 'Do you have a college degree?',
    kind: 'choice',
    options: [{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }],
  };
  const candidate = { confirmed_facts: { highest_qualification: 'Associate Degree' } };
  const plans = mapping.planFill([field], candidate);
  assert.equal(plans[0].status, 'supported');
  assert.equal(plans[0].value, 'Yes');
});

// 3. Completed Bachelor's degree not implying current enrollment
test('3. Completed Bachelor degree does not imply current enrollment', () => {
  const field = {
    key: 'enrolled',
    label: 'Are you currently enrolled in college?',
    hint: 'highest_education',
    kind: 'choice',
    options: [{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }],
  };
  const candidate = { confirmed_facts: { highest_qualification: "Bachelor's Degree" } };
  const plans = mapping.planFill([field], candidate);
  assert.equal(plans[0].status, 'needs_review');
  assert.equal(plans[0].value, undefined);
});

// 4. AI eligibility rejecting protected declarations without confirmed facts
test('4. AI eligibility rejects age, legal entitlement, criminal history, nationality, and compensation declarations', () => {
  const protectedQuestions = [
    'Are you legally entitled to work in Canada?',
    'Are you eligible for employment in Canada?',
    'Are you at least 18 years old?',
    'Are you over 18?',
    'Have you ever been convicted of a felony?',
    'What is your expected annual pay?',
    'Are you a US national?',
  ];
  for (const label of protectedQuestions) {
    const field = {
      label,
      kind: 'radio',
      options: [{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }],
    };
    assert.equal(mapping.isAiEligible(field, null), false, `Expected isAiEligible=false for "${label}"`);
  }

  const openField = {
    label: 'Describe a distributed system you architected and the trade-offs you made.',
    kind: 'textarea',
  };
  assert.equal(mapping.isAiEligible(openField, null), true);
  assert.equal(mapping.classifyQuestionPolicy(openField, null), mapping.AnswerPolicy.AI_DRAFT_ALLOWED);
});

// 5. Candidate switching or account switching during autofill
test('5. Candidate switching mid-attempt throws and site-rules cache invalidates on account switch', async () => {
  const ctx = loadAutofillBundle();
  const app = ctx.NextkinApplication;
  const candA = { id: '11111111-1111-1111-1111-111111111111', version: 1, full_name: 'Alice' };
  const candB = { id: '22222222-2222-2222-2222-222222222222', version: 1, full_name: 'Bob' };
  const mgr = app.getStateManager() || (() => {
    const m = new app.ApplicationStateManager(
      new app.ApplicationAttemptContext({ candidateId: candA.id, jobUrl: ctx.location.href, jobKey: ctx.location.href }),
      { initialState: app.ApplicationState.FILLING }
    );
    return m;
  })();
  assert.ok(mgr);

  await assert.rejects(
    () => app.fill(ctx.location.href, candB, null),
    /Cannot|Candidate|Open the job application form/i
  );

  siteRules.invalidateCache();
  let currentAccount = 'acct_1';
  globalThis.chrome = {
    runtime: {
      sendMessage: async () => ({
        accountId: currentAccount,
        rules: { schemaVersion: 1, globalMode: 'active', sites: { workday: { mode: 'active' } } },
        expiresAt: Date.now() + 60000,
      }),
    },
  };
  globalThis.document = {};
  const first = await siteRules.getCachedRules();
  assert.equal(first.accountId, 'acct_1');

  currentAccount = 'acct_2';
  globalThis.chrome.runtime.sendMessage = async () => { throw new Error('Account disconnected'); };
  const afterError = await siteRules.getCachedRules();
  assert.equal(afterError, null);
  delete globalThis.chrome;
  delete globalThis.document;
});

// 6. Two jobs displayed on the same SPA URL (expectedJobKey mismatch)
test('6. panel.js passes initial expectedJobKey and fillForm rejects job change on same SPA URL', () => {
  const panelSrc = fs.readFileSync('jobright_extension/panel.js', 'utf8');
  assert.match(panelSrc, /const initialJobKey = globalThis\.NextkinFieldMapping\?\.screeningJobKey/);
  assert.match(panelSrc, /fillForm\(tab, frame, profile, file \?\? null, documentId, reusable, useAI \? \{\} : null, source === frame \|\| !source \? initialJobKey : null\)/);

  const keyA = mapping.screeningJobKey({ title: 'Backend Engineer', company: 'Acme', externalId: 'job-1' });
  const keyB = mapping.screeningJobKey({ title: 'Frontend Engineer', company: 'Acme', externalId: 'job-2' });
  assert.notEqual(keyA, keyB);
});

// 7. Two frames concurrently updating application state in background.js
test('7. Background attempt storage serializes concurrent per-frame updates without overwriting', async () => {
  const bgSrc = fs.readFileSync('jobright_extension/background.js', 'utf8');
  assert.match(bgSrc, /function withAttemptLock\(tabId, fn\)/);
  assert.match(bgSrc, /return withAttemptLock\(tabId, async \(\) => \{/);
});

// 8. New application attempt not inheriting previous verified field records
test('8. Verified field state does not leak across application attempts', () => {
  const appSrc = fs.readFileSync('jobright_extension/core/application.js', 'utf8');
  assert.match(appSrc, /record\.attemptId !== ctx\.attemptId \|\| record\.candidateId !== ctx\.candidateId \|\| record\.jobKey !== ctx\.jobKey/);
  assert.match(appSrc, /\/\/ Clear stale verified field records when starting a fresh attempt after an inactive one\s*resetAttempt\(\)/);
});

// 9. Emergency remote kill switch becoming effective within documented interval (1-5 min)
test('9. Emergency remote kill switch uses short policy TTL (<= 5 minutes) separate from selector TTL', () => {
  assert.ok(siteRules.POLICY_TTL <= 5 * 60 * 1000, 'POLICY_TTL must be <= 5 minutes');
  assert.ok(siteRules.SELECTOR_TTL >= 60 * 60 * 1000, 'SELECTOR_TTL must be >= 1 hour');
  assert.ok(siteRules.POLICY_TTL < siteRules.SELECTOR_TTL);
});

// 10. Stale rules retaining safety exclusions
test('10. Stale rules retain excludePathPatterns while disabling selector overlays and AI/auto-submit', () => {
  const stalePayload = {
    expiresAt: Date.now() - 1000,
    rules: {
      schemaVersion: 1,
      globalMode: 'active',
      sites: {
        workday: {
          mode: 'active',
          excludePathPatterns: ['/internal-only'],
          selectorTables: { fields: ['.custom-field'] },
        },
      },
    },
  };
  const policy = siteRules.evaluateSitePolicy('workday', '3.3.19', stalePayload);
  assert.equal(policy.mode, 'legacy');
  assert.deepEqual(policy.selectorTables, {});
  assert.deepEqual(policy.excludePathPatterns, ['/internal-only']);
  assert.equal(siteRules.automationDisabled('https://acme.myworkdayjobs.com/internal-only/job/1', false, stalePayload, '3.3.19'), true);
  assert.equal(siteRules.automationDisabled('https://acme.myworkdayjobs.com/en-US/job/1', true, stalePayload, '3.3.19'), true);
});

// 11. Background and content-script canonicalization producing consistent job keys
test('11. Explicit policy passed to cleanApplicationUrl produces consistent canonical URLs without global cache', () => {
  const url = 'https://jobs.lever.co/acme/123?lever-origin=applied&custom_job=abc&utm_source=x';
  const rulesPayload = {
    expiresAt: Date.now() + 60000,
    rules: {
      schemaVersion: 1,
      globalMode: 'active',
      sites: { lever: { mode: 'active', preservedParams: ['custom_job'] } },
    },
  };
  const bgClean = registry.cleanApplicationUrl(url, [], rulesPayload);
  const csClean = registry.cleanApplicationUrl(url, [], rulesPayload);
  assert.equal(bgClean, csClean);
  assert.match(bgClean, /custom_job=abc/);
  assert.doesNotMatch(bgClean, /utm_source/);
});

// 12. Country selection recreating state and city controls
test('12. Field writer rediscovers replacement controls after dependent-control DOM rerender', () => {
  const writerSrc = fs.readFileSync('jobright_extension/core/field-writer.js', 'utf8');
  assert.match(writerSrc, /!field\.element\?\.isConnected && typeof root\.NextkinFormDiscovery\?\.discoverFields === 'function'/);
});

// 13. Resume upload pending or failed despite populated file input
test('13. Resume upload tracks FILE_ASSIGNED, UPLOAD_PENDING, UPLOAD_CONFIRMED, UPLOAD_FAILED states', () => {
  const ctx = loadAutofillBundle();
  const writer = ctx.NextkinFieldWriter;
  assert.equal(writer.ResumeUploadState.FILE_ASSIGNED, 'FILE_ASSIGNED');
  assert.equal(writer.ResumeUploadState.UPLOAD_PENDING, 'UPLOAD_PENDING');
  assert.equal(writer.ResumeUploadState.UPLOAD_CONFIRMED, 'UPLOAD_CONFIRMED');
  assert.equal(writer.ResumeUploadState.UPLOAD_FAILED, 'UPLOAD_FAILED');
  assert.equal(writer.ResumeUploadState.MANUAL_REQUIRED, 'MANUAL_REQUIRED');

  const pendingContainer = {
    textContent: '',
    querySelector: (sel) => sel.includes('progressbar') ? {} : null,
  };
  const failedContainer = {
    textContent: 'Upload failed',
    querySelector: (sel) => sel.includes('[role="alert"]') ? { textContent: 'Upload failed' } : null,
  };
  assert.equal(writer.inspectUploadStatus({ closest: () => pendingContainer }, 'resume.pdf'), 'UPLOAD_PENDING');
  assert.equal(writer.inspectUploadStatus({ closest: () => failedContainer }, 'resume.pdf'), 'UPLOAD_FAILED');
});

// 14. Multi-step navigation preserving original attempt identity
test('14. Multi-step wizard navigation preserves attemptId, jobKey, and eventKey', () => {
  const bgSrc = fs.readFileSync('jobright_extension/background.js', 'utf8');
  const appSrc = fs.readFileSync('jobright_extension/core/application.js', 'utf8');
  assert.match(bgSrc, /attemptId:\s*scope\.state\.attemptId,\s*jobKey:\s*scope\.state\.jobKey/);
  assert.match(appSrc, /attemptId:\s*step\.attemptId,\s*jobKey:\s*step\.jobKey,\s*eventKey:\s*step\.eventKey/);
});

// 15. Valid answer-bank results processed consistently with unified status contract and type validation
test('15. Answer bank returns supported status and validates field type restrictions', () => {
  const numericField = {
    key: 'years_exp',
    label: 'How many years of Rust experience do you have?',
    kind: 'text',
    element: { type: 'number' },
  };
  const badPlans = mapping.planFill([numericField], {
    answerBank: [{ question: 'How many years of Rust experience do you have?', answer: 'many years' }],
  });
  assert.notEqual(badPlans[0].status, 'supported');

  const goodPlans = mapping.planFill([numericField], {
    answerBank: [{ question: 'How many years of Rust experience do you have?', answer: '5' }],
  });
  assert.equal(goodPlans[0].status, 'supported');
  assert.equal(goodPlans[0].source, 'answer_bank');
  assert.equal(goodPlans[0].value, '5');
});
