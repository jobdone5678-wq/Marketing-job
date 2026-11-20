import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { z } from 'zod';
import { applicationUrlKey } from '../src/lib/jobs/application-state.ts';

// Read extension and confirmation sources
const backgroundSource = readFileSync(new URL('../jobright_extension/background.js', import.meta.url), 'utf8');
const applicationSource = readFileSync(new URL('../jobright_extension/core/application.js', import.meta.url), 'utf8');
const confirmationScript = readFileSync(new URL('../jobright_extension/application-confirmation.js', import.meta.url), 'utf8');

function loadSource(path, dependencies) {
  const file = new URL('../src/' + path + '.ts', import.meta.url);
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  runInNewContext(code, {
    exports,
    URL,
    Response,
    Buffer,
    crypto,
    console,
    require: name => dependencies[name],
  });
  return exports;
}

const loadRoute = (path, dependencies) => loadSource('app/api/' + path + '/route', dependencies);

// --------------------------------------------------------------------------
// 1. Queue HTTP Response Matrix (401, 403, 409 duplicate, 409 conflict, 422, 429, 500, network error)
// --------------------------------------------------------------------------
test('Production Hardening: Queue HTTP Response Matrix full coverage', async () => {
  const localStorage = {
    origin: 'https://www.nextkinhr.com',
    token: 'test-token',
  };
  const sessionStorage = {};
  const alarms = new Map();
  const notices = [];
  const actionBadges = [];
  const noop = { addListener() {} };

  let currentFetch = async () => new Response(JSON.stringify({ success: true }), { status: 200 });

  const chromeMock = {
    runtime: {
      onInstalled: noop,
      onStartup: noop,
      onConnect: noop,
      onMessage: noop,
      sendMessage: async msg => { notices.push(msg); },
    },
    action: {
      setBadgeText: async details => { actionBadges.push(details); },
      setBadgeBackgroundColor: async () => {},
    },
    notifications: {
      create: async () => {},
    },
    sidePanel: {
      setPanelBehavior: async () => {},
    },
    scripting: {
      executeScript: async () => [{ result: null }],
    },
    tabs: {
      onUpdated: noop,
      onRemoved: noop,
      get: async id => ({ id, url: 'https://careers.example.com/jobs/1' }),
      query: async () => [{ id: 1, url: 'https://www.nextkinhr.com/dashboard' }],
      sendMessage: async (tabId, msg) => { notices.push({ tabId, ...msg }); },
    },
    alarms: {
      onAlarm: noop,
      create: (name, info) => { alarms.set(name, info); },
      clear: async name => { alarms.delete(name); },
    },
    storage: {
      local: {
        get: async keys => {
          if (!keys) return { ...localStorage };
          if (Array.isArray(keys)) return Object.fromEntries(keys.map(k => [k, localStorage[k]]));
          if (typeof keys === 'string') return { [keys]: localStorage[keys] };
          return { ...localStorage };
        },
        set: async obj => { Object.assign(localStorage, obj); },
        remove: async keys => {
          const arr = Array.isArray(keys) ? keys : [keys];
          for (const k of arr) delete localStorage[k];
        },
      },
      session: {
        get: async keys => {
          if (!keys) return { ...sessionStorage };
          if (Array.isArray(keys)) return Object.fromEntries(keys.map(k => [k, sessionStorage[k]]));
          if (typeof keys === 'string') return { [keys]: sessionStorage[keys] };
          return { ...sessionStorage };
        },
        set: async obj => { Object.assign(sessionStorage, obj); },
        remove: async keys => {
          const arr = Array.isArray(keys) ? keys : [keys];
          for (const k of arr) delete sessionStorage[k];
        },
        setAccessLevel: async () => {},
      },
    },
  };

  const sandbox = {
    URL,
    URLSearchParams,
    AbortSignal,
    crypto,
    console,
    chrome: chromeMock,
    fetch: (...args) => currentFetch(...args),
  };

  runInNewContext(backgroundSource, sandbox);

  const {
    enqueueSubmission,
    processSubmissionQueue,
    getSubmissionQueue,
    getStorageArray,
    isQueuePaused,
    unpauseQueue,
  } = sandbox;

  // 1.1: 200 OK -> dequeued and delivered
  await enqueueSubmission({
    id: 'sub-200',
    url: 'https://nextkinhr.com/api/test',
    token: 'valid-token',
    body: { attemptId: 'att-200' },
  });
  currentFetch = async () => new Response(JSON.stringify({ success: true, submissionId: 's-200' }), { status: 200 });
  await processSubmissionQueue();
  let q = await getSubmissionQueue();
  assert.equal(q.find(x => x.id === 'sub-200'), undefined, '200 OK must dequeue submission');

  // 1.2: 401 Unauthorized -> preserved in queue, syncStatus AUTH_REQUIRED, queue paused
  await enqueueSubmission({
    id: 'sub-401',
    url: 'https://nextkinhr.com/api/test',
    token: 'expired-token',
    body: { attemptId: 'att-401' },
  });
  currentFetch = async () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  await processSubmissionQueue();
  q = await getSubmissionQueue();
  const item401 = q.find(x => x.id === 'sub-401');
  assert.ok(item401, '401 must NOT drop the submission from queue');
  assert.equal(item401.syncStatus, 'AUTH_REQUIRED', '401 must mark syncStatus as AUTH_REQUIRED');
  const paused = await isQueuePaused();
  assert.equal(paused, true, '401 must pause the queue');

  // Unpause upon re-auth
  await unpauseQueue();
  assert.equal(await isQueuePaused(), false, 'unpauseQueue must unpause the queue');

  // 1.3: 403 Forbidden -> preserved in queue, syncStatus FORBIDDEN, user alerted
  await enqueueSubmission({
    id: 'sub-403',
    url: 'https://nextkinhr.com/api/test',
    token: 'bad-token',
    body: { attemptId: 'att-403' },
  });
  currentFetch = async () => new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  await processSubmissionQueue();
  q = await getSubmissionQueue();
  const item403 = q.find(x => x.id === 'sub-403');
  assert.ok(item403, '403 must preserve event');
  assert.equal(item403.syncStatus, 'FORBIDDEN', '403 must set syncStatus to FORBIDDEN');
  assert.ok(actionBadges.some(b => b.text === '!'), '403 must set badge alert');

  // 1.4: 409 with duplicate / IDEMPOTENT_SUBMISSION_EXISTS -> dequeued as delivered
  await enqueueSubmission({
    id: 'sub-409-dup',
    url: 'https://nextkinhr.com/api/test',
    token: 'valid-token',
    body: { attemptId: 'att-409-dup' },
  });
  currentFetch = async () =>
    new Response(JSON.stringify({ duplicate: true, code: 'IDEMPOTENT_SUBMISSION_EXISTS' }), { status: 409 });
  await processSubmissionQueue();
  q = await getSubmissionQueue();
  assert.equal(q.find(x => x.id === 'sub-409-dup'), undefined, '409 duplicate must be dequeued as delivered');

  // 1.5: 409 with state conflict -> moved to conflict_submission_queue
  await enqueueSubmission({
    id: 'sub-409-conflict',
    url: 'https://nextkinhr.com/api/test',
    token: 'valid-token',
    body: { attemptId: 'att-409-conflict' },
  });
  currentFetch = async () =>
    new Response(JSON.stringify({ error: 'State conflict: application already closed' }), { status: 409 });
  await processSubmissionQueue();
  q = await getSubmissionQueue();
  assert.equal(q.find(x => x.id === 'sub-409-conflict'), undefined, '409 conflict must be dequeued from active queue');
  const conflictQ = await getStorageArray('conflict_submission_queue');
  assert.ok(conflictQ.find(x => x.id === 'sub-409-conflict'), '409 conflict must move to conflict_submission_queue');

  // 1.6: 422 Unprocessable Entity -> moved to submission_dead_letter_queue
  await enqueueSubmission({
    id: 'sub-422',
    url: 'https://nextkinhr.com/api/test',
    token: 'valid-token',
    body: { invalid: true },
  });
  currentFetch = async () =>
    new Response(JSON.stringify({ error: 'Validation failed: candidate missing required fields' }), { status: 422 });
  await processSubmissionQueue();
  q = await getSubmissionQueue();
  assert.equal(q.find(x => x.id === 'sub-422'), undefined, '422 must be dequeued from retry loop');
  const dlq = await getStorageArray('submission_dead_letter_queue');
  const dlqItem = dlq.find(x => x.id === 'sub-422');
  assert.ok(dlqItem, '422 must be saved in dead-letter queue');
  assert.equal(dlqItem.syncStatus, 'VALIDATION_FAILED', '422 DLQ item must have syncStatus VALIDATION_FAILED');

  // 1.7: 429 Too Many Requests -> retry backoff scheduled
  await enqueueSubmission({
    id: 'sub-429',
    url: 'https://nextkinhr.com/api/test',
    token: 'valid-token',
    body: { attemptId: 'att-429' },
  });
  currentFetch = async () => new Response(JSON.stringify({ error: 'Rate limited' }), { status: 429 });
  await processSubmissionQueue();
  q = await getSubmissionQueue();
  const item429 = q.find(x => x.id === 'sub-429');
  assert.ok(item429, '429 must be preserved in queue');
  assert.equal(item429.attempts, 1, 'attempts count incremented');
  assert.ok(item429.nextRetryAt > Date.now(), 'nextRetryAt is scheduled in future');
  assert.ok(alarms.has('process_submission_queue'), 'chrome.alarms scheduled for retry');

  // 1.8: 500 Internal Server Error -> retry backoff scheduled
  await enqueueSubmission({
    id: 'sub-500',
    url: 'https://nextkinhr.com/api/test',
    token: 'valid-token',
    body: { attemptId: 'att-500' },
  });
  currentFetch = async () => new Response(JSON.stringify({ error: 'Server crashed' }), { status: 500 });
  await processSubmissionQueue();
  q = await getSubmissionQueue();
  const item500 = q.find(x => x.id === 'sub-500');
  assert.ok(item500, '500 must be preserved in queue');
  assert.equal(item500.attempts, 1);

  // 1.9: Network Error / timeout -> retry backoff scheduled
  await enqueueSubmission({
    id: 'sub-neterr',
    url: 'https://nextkinhr.com/api/test',
    token: 'valid-token',
    body: { attemptId: 'att-neterr' },
  });
  currentFetch = async () => { throw new TypeError('Failed to fetch'); };
  await processSubmissionQueue();
  q = await getSubmissionQueue();
  const itemNet = q.find(x => x.id === 'sub-neterr');
  assert.ok(itemNet, 'Network error must be preserved in queue');
  assert.equal(itemNet.attempts, 1);

  // 1.10: 8th retry exhaustion -> moved to DLQ with MAX_RETRIES_EXCEEDED
  await enqueueSubmission({
    id: 'sub-exhausted',
    url: 'https://nextkinhr.com/api/test',
    token: 'valid-token',
    body: { attemptId: 'att-exhausted' },
    attempts: 8,
  });
  currentFetch = async () => new Response(JSON.stringify({ error: 'Persistent failure' }), { status: 503 });
  await processSubmissionQueue();
  q = await getSubmissionQueue();
  assert.equal(q.find(x => x.id === 'sub-exhausted'), undefined, 'Exhausted retry item must be removed from active queue');
  const dlq2 = await getStorageArray('submission_dead_letter_queue');
  const dlqExhausted = dlq2.find(x => x.id === 'sub-exhausted');
  assert.ok(dlqExhausted, 'Exhausted item must be moved to DLQ');
  assert.equal(dlqExhausted.syncStatus, 'MAX_RETRIES_EXCEEDED', 'DLQ item flagged as MAX_RETRIES_EXCEEDED');
});

// --------------------------------------------------------------------------
// 2. ApplicationStateManager Transitions (8 Explicit States)
// --------------------------------------------------------------------------
test('Production Hardening: ApplicationStateManager 8-state transition matrix and validation', async () => {
  const sandbox = {
    console,
    URL,
    Date,
    crypto,
    btoa,
    atob,
    Set,
    Map,
    WeakMap,
    WeakSet,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    location: new URL('https://boards.greenhouse.io/acme/jobs/123'),
    document: {
      querySelectorAll: () => [],
      addEventListener: () => {},
      removeEventListener: () => {},
    },
    NextkinJobCapture: {
      read: () => ({
        company: 'Acme',
        title: 'Engineer',
        externalId: 'job-123',
      }),
    },
    NextkinForms: {
      discoverFields: () => [],
      label: el => el?.name || '',
      isStepNavigation: () => false,
      observeStepTransitions: () => ({ disconnect: () => {} }),
    },
    NextkinFieldMapping: {
      resolveFact: () => null,
      planFill: () => [],
      buildValues: facts => facts || {},
      isChoiceKind: () => false,
      isMultiKind: () => false,
      normalizeBoolean: v => (typeof v === 'boolean' ? v : null),
    },
    NextkinFieldWriter: {
      read: field => field.element?.value,
      applyFill: async () => [],
    },
    chrome: {
      storage: {
        session: {
          get: async () => ({}),
          set: async () => {},
          remove: async () => {},
        },
      },
      runtime: {
        sendMessage: async () => ({}),
      },
    },
    sessionStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
  };

  runInNewContext(applicationSource, sandbox);

  const {
    ApplicationState,
    ApplicationStateManager,
    ApplicationAttemptContext,
    ApplicationStateError,
  } = sandbox.NextkinApplication;

  assert.ok(ApplicationState, 'ApplicationState must exist');
  assert.equal(ApplicationState.DRAFT, 'DRAFT');
  assert.equal(ApplicationState.FILLING, 'FILLING');
  assert.equal(ApplicationState.REVIEW_REQUIRED, 'REVIEW_REQUIRED');
  assert.equal(ApplicationState.READY_TO_SUBMIT, 'READY_TO_SUBMIT');
  assert.equal(ApplicationState.SUBMITTING, 'SUBMITTING');
  assert.equal(ApplicationState.SUBMITTED, 'SUBMITTED');
  assert.equal(ApplicationState.PENDING_VERIFICATION, 'PENDING_VERIFICATION');
  assert.equal(ApplicationState.FAILED, 'FAILED');

  const context = new ApplicationAttemptContext({
    applicationId: 'app-999',
    userId: 'user-999',
    candidateId: 'cand-999',
    profileVersion: 'v1.0',
    atsProvider: 'greenhouse',
    jobUrl: 'https://boards.greenhouse.io/acme/jobs/123',
    companyName: 'Acme',
    jobTitle: 'Engineer',
    tabId: 101,
  });

  const manager = new ApplicationStateManager(context, { initialState: ApplicationState.DRAFT });
  assert.equal(manager.getState(), ApplicationState.DRAFT);

  // Transition 1: DRAFT -> FILLING
  assert.equal(manager.transition(ApplicationState.FILLING, { reason: 'Autofill started' }), ApplicationState.FILLING);
  assert.equal(manager.getState(), ApplicationState.FILLING);

  // Transition 2: FILLING -> REVIEW_REQUIRED
  assert.equal(
    manager.transition(ApplicationState.REVIEW_REQUIRED, {
      reason: 'Screening questions require manual review',
      reviewFields: ['cover_letter', 'salary_expectation'],
    }),
    ApplicationState.REVIEW_REQUIRED
  );
  assert.equal(manager.getState(), ApplicationState.REVIEW_REQUIRED);

  // Transition 3: REVIEW_REQUIRED -> READY_TO_SUBMIT
  assert.equal(manager.transition(ApplicationState.READY_TO_SUBMIT, { reason: 'User completed review' }), ApplicationState.READY_TO_SUBMIT);
  assert.equal(manager.getState(), ApplicationState.READY_TO_SUBMIT);

  // Transition 4: READY_TO_SUBMIT -> SUBMITTING
  assert.equal(manager.transition(ApplicationState.SUBMITTING, { reason: 'Submit button clicked' }), ApplicationState.SUBMITTING);
  assert.equal(manager.getState(), ApplicationState.SUBMITTING);

  // Transition 5: SUBMITTING -> PENDING_VERIFICATION (page reloaded or redirected before confirmed receipt)
  assert.equal(manager.transition(ApplicationState.PENDING_VERIFICATION, { reason: 'Page navigated before receipt observed' }), ApplicationState.PENDING_VERIFICATION);
  assert.equal(manager.getState(), ApplicationState.PENDING_VERIFICATION);

  // Transition 6: PENDING_VERIFICATION -> SUBMITTED (confirmation detected on subsequent page)
  assert.equal(manager.transition(ApplicationState.SUBMITTED, { evidence: 'Thank you for applying' }), ApplicationState.SUBMITTED);
  assert.equal(manager.getState(), ApplicationState.SUBMITTED);

  // Check transition history
  const history = manager.history;
  assert.equal(history.length, 7); // Initial DRAFT + 6 transitions

  // Illegal transition test: SUBMITTED -> FILLING must throw ApplicationStateError
  assert.throws(
    () => manager.transition(ApplicationState.FILLING),
    err => err instanceof ApplicationStateError && err.message.includes('Illegal application state transition'),
    'Terminal SUBMITTED state cannot transition back to FILLING'
  );

  // Failure flow test
  const failManager = new ApplicationStateManager(context, { initialState: ApplicationState.READY_TO_SUBMIT });
  failManager.transition(ApplicationState.SUBMITTING);
  failManager.transition(ApplicationState.FAILED, { reason: 'ATS returned 500 error banner' });
  assert.equal(failManager.getState(), ApplicationState.FAILED);
});

// --------------------------------------------------------------------------
// 3. Immutable Attempt Context & Multi-Tab Isolation
// --------------------------------------------------------------------------
test('Production Hardening: Immutable ApplicationAttemptContext and multi-tab isolation', async () => {
  const sandbox = {
    console,
    URL,
    Date,
    crypto,
    btoa,
    atob,
    Set,
    Map,
    WeakMap,
    WeakSet,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    location: new URL('https://jobs.lever.co/kinsta/eng'),
    document: {
      querySelectorAll: () => [],
      addEventListener: () => {},
      removeEventListener: () => {},
    },
    NextkinJobCapture: { read: () => null },
    NextkinForms: { discoverFields: () => [], label: () => '', isStepNavigation: () => false },
    NextkinFieldMapping: { resolveFact: () => null, planFill: () => [] },
    NextkinFieldWriter: { read: () => null },
  };
  runInNewContext(applicationSource, sandbox);

  const { ApplicationAttemptContext, ApplicationStateError } = sandbox.NextkinApplication;

  const attempt = new ApplicationAttemptContext({
    applicationId: 'app-abc',
    attemptId: '11111111-2222-3333-4444-555555555555',
    userId: 'user-001',
    candidateId: 'cand-alice',
    profileVersion: 'v1.0',
    atsProvider: 'lever',
    jobUrl: 'https://jobs.lever.co/kinsta/eng',
    companyName: 'Kinsta',
    jobTitle: 'Senior Dev',
    tabId: 42,
  });

  // Verify all 12 properties are present
  assert.equal(attempt.applicationId, 'app-abc');
  assert.equal(attempt.attemptId, '11111111-2222-3333-4444-555555555555');
  assert.equal(attempt.userId, 'user-001');
  assert.equal(attempt.candidateId, 'cand-alice');
  assert.equal(attempt.profileVersion, 'v1.0');
  assert.equal(attempt.atsProvider, 'lever');
  assert.equal(attempt.jobUrl, 'https://jobs.lever.co/kinsta/eng');
  assert.equal(attempt.companyName, 'Kinsta');
  assert.equal(attempt.jobTitle, 'Senior Dev');
  assert.equal(attempt.tabId, 42);
  assert.ok(attempt.createdAt);
  assert.ok(attempt.updatedAt);

  // Verify immutability: direct assignment must throw in strict mode
  assert.throws(
    () => { attempt.candidateId = 'cand-bob'; },
    TypeError,
    'Attempt context must be deeply frozen'
  );

  // Switching candidate mid-attempt via withUpdate must throw ApplicationStateError
  assert.throws(
    () => {
      attempt.withUpdate({ candidateId: 'cand-bob' });
    },
    err => err instanceof ApplicationStateError,
    'Cannot mutate candidateId mid-attempt'
  );

  // Legitimate update returns new frozen instance
  const updated = attempt.withUpdate({ companyName: 'Kinsta Group' });
  assert.equal(updated.companyName, 'Kinsta Group');
  assert.equal(updated.candidateId, 'cand-alice');
  assert.notEqual(updated, attempt, 'withUpdate returns new instance');
  assert.ok(Object.isFrozen(updated), 'New instance is frozen');
});

// --------------------------------------------------------------------------
// 4. Deterministic ATS Confirmation Rules
// --------------------------------------------------------------------------
test('Production Hardening: Deterministic ATS Confirmation Rules for 5 major providers', () => {
  function createConfirmationSandbox({
    url = 'https://boards.greenhouse.io/acme/jobs/12345/apply',
    title = 'Job Application',
    activeSubmit = false,
  } = {}) {
    const messages = [];
    let scheduledCallback = null;
    const location = new URL(url);

    class MockElement {
      constructor(tagName = 'DIV', attrs = {}, text = '') {
        this.tagName = tagName.toUpperCase();
        this.attrs = { ...attrs };
        this.innerText = text;
        this.textContent = text;
        this.parentElement = null;
        this.children = [];
        this.disabled = !!attrs.disabled;
      }
      getAttribute(name) { return this.attrs[name.toLowerCase()] ?? null; }
      setAttribute(name, val) { this.attrs[name.toLowerCase()] = String(val); }
      hasAttribute(name) { return name.toLowerCase() in this.attrs; }
      getClientRects() { return [{ width: 100, height: 20 }]; }
      closest(selector) {
        if (!selector) return null;
        if (this.matches(selector)) return this;
        return this.parentElement?.closest(selector) || null;
      }
      matches(selector) {
        if (!selector) return false;
        const parts = selector.split(',').map(s => s.trim().toLowerCase());
        for (const part of parts) {
          if (part === this.tagName.toLowerCase()) return true;
          if (part.startsWith('.') && (this.getAttribute('class') || '').toLowerCase().split(/\s+/).includes(part.slice(1))) return true;
          if (part.startsWith('#') && (this.getAttribute('id') || '').toLowerCase() === part.slice(1)) return true;
          const attrMatch = part.match(/\[([a-z0-9_-]+)(?:([*^$]?=)(?:"|')?([^"'\]]+)(?:"|')?)?\]/i);
          if (attrMatch) {
            const [, attr, op, val] = attrMatch;
            const actual = this.getAttribute(attr);
            if (actual === null) continue;
            if (!op) return true;
            if (op === '=' && actual.toLowerCase() === val.toLowerCase()) return true;
            if (op === '*=' && actual.toLowerCase().includes(val.toLowerCase())) return true;
          }
        }
        return false;
      }
      querySelector(selector) {
        return this.querySelectorAll(selector)[0] || null;
      }
      querySelectorAll(selector) {
        const results = [];
        const walk = node => {
          for (const child of node.children) {
            if (child.matches && child.matches(selector)) {
              results.push(child);
            }
            walk(child);
          }
        };
        walk(this);
        return results;
      }
      appendChild(child) {
        child.parentElement = this;
        this.children.push(child);
        return child;
      }
    }

    const rootBody = new MockElement('BODY');

    if (activeSubmit) {
      const form = new MockElement('FORM');
      const submitBtn = new MockElement('BUTTON', { type: 'submit' }, 'Submit Application');
      form.appendChild(submitBtn);
      rootBody.appendChild(form);
    }

    const listeners = new Map();

    const mockWindow = {
      location,
      addEventListener: (type, fn) => {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(fn);
      },
      dispatchEvent: evt => {
        for (const fn of listeners.get(evt.type) || []) fn(evt);
      },
    };

    const doc = {
      body: rootBody,
      documentElement: rootBody,
      title,
      addEventListener: (type, fn) => {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(fn);
      },
      querySelector: sel => rootBody.querySelector(sel),
      querySelectorAll: sel => rootBody.querySelectorAll(sel),
      createTreeWalker: rootNode => {
        const allText = [];
        const collect = n => {
          if (n.innerText) allText.push({ textContent: n.innerText, parentElement: n });
          for (const c of n.children) collect(c);
        };
        collect(rootNode || rootBody);
        return { nextNode: () => allText.shift() || null };
      },
    };

    const sandbox = {
      document: doc,
      window: mockWindow,
      globalThis: {},
      NodeFilter: { SHOW_TEXT: 4 },
      MutationObserver: class { observe() {} disconnect() {} },
      getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
      setTimeout: fn => { scheduledCallback = fn; return 1; },
      clearTimeout: () => { scheduledCallback = null; },
      sessionStorage: {
        _store: new Map(),
        getItem(k) { return this._store.get(k) || null; },
        setItem(k, v) { this._store.set(k, String(v)); },
        removeItem(k) { this._store.delete(k); },
      },
      chrome: {
        runtime: {
          sendMessage: async msg => {
            messages.push(msg);
            return true;
          },
        },
      },
      MockElement,
    };

    sandbox.globalThis = sandbox;

    return {
      sandbox,
      MockElement,
      run: () => {
        runInNewContext(confirmationScript, sandbox);
        if (scheduledCallback) scheduledCallback();
        return messages;
      },
      messages,
    };
  }

  // 4.1: Workday
  const wd = createConfirmationSandbox({
    url: 'https://company.myworkdayjobs.com/en-US/Careers/job/Austin/Software-Engineer_JR10928/apply',
    title: 'Workday Application',
  });
  const successCard = new wd.MockElement('DIV', { 'data-automation-id': 'applicationSubmitted' });
  const heading = new wd.MockElement('H1', {}, 'Congratulations! Your application has been submitted.');
  const reqInfo = new wd.MockElement('SPAN', { 'data-automation-id': 'requisitionId' }, 'JR10928');
  successCard.appendChild(heading);
  successCard.appendChild(reqInfo);
  wd.sandbox.document.body.appendChild(successCard);
  const wdMsgs = wd.run();
  assert.equal(wdMsgs.length, 1);
  assert.equal(wdMsgs[0].status, 'SUBMITTED');
  assert.equal(wdMsgs[0].atsProvider, 'workday');
  assert.equal(wdMsgs[0].requisitionId, 'JR10928');

  // 4.2: Greenhouse
  const gh = createConfirmationSandbox({
    url: 'https://boards.greenhouse.io/acme/jobs/987654/confirmation',
    title: 'Thank you for applying',
  });
  const confirmationDiv = new gh.MockElement('DIV', { id: 'application_confirmation', class: 'application-confirmation' }, 'Thank you for applying to Acme!');
  gh.sandbox.document.body.appendChild(confirmationDiv);
  const ghMsgs = gh.run();
  assert.equal(ghMsgs.length, 1);
  assert.equal(ghMsgs[0].status, 'SUBMITTED');
  assert.equal(ghMsgs[0].atsProvider, 'greenhouse');
  assert.equal(ghMsgs[0].requisitionId, '987654');

  // 4.3: Lever
  const lv = createConfirmationSandbox({
    url: 'https://jobs.lever.co/kinsta/4ccea588-b12d-4fa5-9b14-9f72f4d48691/thanks',
    title: 'Application Submitted',
  });
  const leverDiv = new lv.MockElement('DIV', { class: 'application-confirmation' }, 'Thank you for submitting your application!');
  lv.sandbox.document.body.appendChild(leverDiv);
  const lvMsgs = lv.run();
  assert.equal(lvMsgs.length, 1);
  assert.equal(lvMsgs[0].status, 'SUBMITTED');
  assert.equal(lvMsgs[0].atsProvider, 'lever');
  assert.equal(lvMsgs[0].requisitionId, '4ccea588-b12d-4fa5-9b14-9f72f4d48691');

  // 4.4: Ashby
  const ab = createConfirmationSandbox({
    url: 'https://jobs.ashbyhq.com/figma/apply/complete',
    title: 'Thank you for your application',
  });
  const ashbyDiv = new ab.MockElement('DIV', { 'data-testid': 'application-submitted' }, 'Application received successfully');
  ab.sandbox.document.body.appendChild(ashbyDiv);
  const abMsgs = ab.run();
  assert.equal(abMsgs.length, 1);
  assert.equal(abMsgs[0].status, 'SUBMITTED');
  assert.equal(abMsgs[0].atsProvider, 'ashby');

  // 4.5: SmartRecruiters
  const sr = createConfirmationSandbox({
    url: 'https://careers.smartrecruiters.com/AcmeCorp/jobs/74399999999/thank-you',
    title: 'Application Confirmed',
  });
  const srDiv = new sr.MockElement('DIV', { 'data-test': 'application-success' }, 'You have successfully applied');
  sr.sandbox.document.body.appendChild(srDiv);
  const srMsgs = sr.run();
  assert.equal(srMsgs.length, 1);
  assert.equal(srMsgs[0].status, 'SUBMITTED');
  assert.equal(srMsgs[0].atsProvider, 'smartrecruiters');
  assert.equal(srMsgs[0].requisitionId, '74399999999');

  // 4.6: Negative check - active enabled submit button blocks confirmation
  const neg = createConfirmationSandbox({
    url: 'https://boards.greenhouse.io/acme/jobs/123/apply',
    activeSubmit: true,
  });
  const negHeading = new neg.MockElement('H2', {}, 'Thank you for your interest in our company');
  neg.sandbox.document.body.appendChild(negHeading);
  const negMsgs = neg.run();
  assert.equal(negMsgs.length, 0, 'Active submit button must prevent confirmation');

  // 4.7: Footer text exclusion
  const foot = createConfirmationSandbox({
    url: 'https://careers.example.com/jobs/123/apply',
  });
  const footerEl = new foot.MockElement('FOOTER');
  const footerText = new foot.MockElement('P', {}, 'Thank you for visiting. Applications received daily.');
  footerEl.appendChild(footerText);
  foot.sandbox.document.body.appendChild(footerEl);
  const footMsgs = foot.run();
  assert.equal(footMsgs.length, 0, 'Footer text must be excluded from confirmation detection');
});

// --------------------------------------------------------------------------
// 5. Atomic Database Submission & Idempotency
// --------------------------------------------------------------------------
test('Production Hardening: Atomic Database Submission & Idempotency enforcement', async () => {
  const actor = { id: '00000000-0000-4000-8000-000000000001', role: 'candidate', status: 'active' };
  const candidateId = '11111111-1111-4000-8000-111111111111';
  const eventKey = '22222222-2222-4000-8000-222222222222';
  const jobUrl = 'https://jobs.lever.co/acme/software-engineer';
  const confirmationUrl = 'https://jobs.lever.co/acme/software-engineer/thanks';

  const mockDbData = {
    job_submissions: [],
    outside_jobs: [],
    extension_submission_events: [],
  };

  const db = {
    from(table) {
      return {
        select() { return this; },
        eq() { return this; },
        order() { return this; },
        limit() { return this; },
        async maybeSingle() {
          if (table === 'candidates') {
            return { data: { id: candidateId, version: 1, user_id: actor.id } };
          }
          return { data: null };
        },
        then(resolve) { resolve({ data: [] }); },
      };
    },
    async rpc(fn, args) {
      if (fn === 'candidate_actor_can_access') {
        return { data: args.p_candidate === candidateId && args.p_actor === actor.id, error: null };
      }
      if (fn === 'record_extension_submission' || fn === 'record_application_submission') {
        // Idempotency check
        const existing = mockDbData.extension_submission_events.find(e => e.event_key === args.p_event_key);
        if (existing) {
          return {
            data: {
              job_id: existing.job_id,
              submission_id: existing.submission_id,
              duplicate: true,
              code: 'IDEMPOTENT_SUBMISSION_EXISTS',
              replayed: true,
              submission: mockDbData.job_submissions.find(s => s.id === existing.submission_id),
            },
            error: null,
          };
        }

        const subId = 'sub-atomic-1';
        const newSub = {
          id: subId,
          candidate_id: args.p_candidate,
          company_name: args.p_fields.companyName,
          job_title: args.p_fields.jobTitle,
          job_url: args.p_fields.jobUrl,
          status: 'Applied',
          capture_status: 'submitted',
        };
        mockDbData.job_submissions.push(newSub);
        mockDbData.extension_submission_events.push({
          event_key: args.p_event_key,
          submission_id: subId,
          job_id: 'job-123',
        });
        mockDbData.outside_jobs.push({
          id: 'out-1',
          submission_id: subId,
          candidate_id: args.p_candidate,
          job_url: args.p_fields.jobUrl,
        });

        return {
          data: {
            submission_id: subId,
            job_id: 'job-123',
            duplicate: false,
            code: 'SUBMISSION_RECORDED',
            replayed: false,
            submission: newSub,
          },
          error: null,
        };
      }
      return { data: null, error: null };
    },
  };

  const sharedDeps = {
    '@/lib/capture/server': {
      extensionProfile: async () => actor,
      extensionRoute: async (_request, work) => {
        try {
          return Response.json(await work());
        } catch (error) {
          return Response.json({ error: error.message }, { status: error.status || 500 });
        }
      },
      cors: (_req, res) => res,
      markOutsideJobsApplied: async () => {},
    },
    '@/lib/db/admin': {
      database: () => db,
      checkDb: assert.ifError,
      CaptureError: class extends Error {
        constructor(message, status) {
          super(message);
          this.status = status;
        }
      },
    },
    '@/lib/capture/snapshot': { validateApplicationAnswers: a => a },
    '@/lib/capture/validation': {
      allowedCaptureUrl: () => true,
      validateObservation: () => true,
    },
    '@/lib/capture/applied-resume': {
      appliedResumeSchema: z.unknown(),
      saveAppliedResume: async () => null,
    },
    '@/lib/jobs/application-state': { applicationUrlKey },
    zod: { z },
  };

  const autoSubmitRoute = loadRoute('extension/auto-submit', sharedDeps);
  const { POST } = loadRoute('applications/submission-events', {
    ...sharedDeps,
    '@/app/api/extension/auto-submit/route': autoSubmitRoute,
  });

  // Call 1: First Atomic Submission
  const req1 = {
    url: 'https://nextkinhr.com/api/applications/submission-events',
    headers: new Map([
      ['authorization', 'Bearer valid-test-token'],
      ['content-type', 'application/json'],
    ]),
    json: async () => ({
      userId: actor.id,
      candidateId,
      eventKey,
      attemptId: 'att-1',
      jobUrl,
      companyName: 'Acme',
      jobTitle: 'Software Engineer',
      confirmationUrl,
      evidence: 'Thank you for applying to Acme',
    }),
  };

  const res1 = await POST(req1);
  assert.equal(res1.status, 200);
  const data1 = await res1.json();
  assert.equal(data1.success, true);
  assert.equal(data1.duplicate, false);
  assert.equal(mockDbData.job_submissions.length, 1);
  assert.equal(mockDbData.outside_jobs.length, 1);

  // Call 2: Replay exact same eventKey -> Idempotent response 200 with IDEMPOTENT_SUBMISSION_EXISTS
  const req2 = {
    url: 'https://nextkinhr.com/api/applications/submission-events',
    headers: new Map([
      ['authorization', 'Bearer valid-test-token'],
      ['content-type', 'application/json'],
    ]),
    json: async () => ({
      userId: actor.id,
      candidateId,
      eventKey,
      attemptId: 'att-1',
      jobUrl,
      companyName: 'Acme',
      jobTitle: 'Software Engineer',
      confirmationUrl,
      evidence: 'Thank you for applying to Acme',
    }),
  };

  const res2 = await POST(req2);
  assert.equal(res2.status, 200);
  const data2 = await res2.json();
  assert.equal(data2.success, true);
  assert.equal(data2.duplicate, true);
  assert.equal(data2.code, 'IDEMPOTENT_SUBMISSION_EXISTS');
  assert.equal(data2.replayed, true);
  assert.equal(mockDbData.job_submissions.length, 1, 'No duplicate row created in job_submissions');
  assert.equal(mockDbData.outside_jobs.length, 1, 'No duplicate row created in outside_jobs');

  // Call 3: Client-supplied userId mismatch rejected with 403
  const reqMismatch = {
    url: 'https://nextkinhr.com/api/applications/submission-events',
    headers: new Map([
      ['authorization', 'Bearer valid-test-token'],
      ['content-type', 'application/json'],
    ]),
    json: async () => ({
      userId: '00000000-0000-4000-8000-000000000099', // Spoofed ID
      candidateId,
      eventKey: 'event-spoof',
      attemptId: 'att-spoof',
      jobUrl,
      companyName: 'Acme',
      jobTitle: 'Software Engineer',
      confirmationUrl,
      evidence: 'Thank you for applying',
    }),
  };
  const resMismatch = await POST(reqMismatch);
  assert.equal(resMismatch.status, 403, 'Client-supplied userId mismatch must return 403 Forbidden');
});
