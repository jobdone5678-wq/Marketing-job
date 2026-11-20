import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function loadApplicationModule(customGlobals = {}) {
  const code = readFileSync(new URL('../jobright_extension/core/application.js', import.meta.url), 'utf8');
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
    location: new URL('https://jobs.lever.co/example-company/12345'),
    document: {
      querySelectorAll: () => [],
      addEventListener: () => {},
      removeEventListener: () => {},
    },
    NextkinJobCapture: {
      read: () => ({
        company: 'Example Corp',
        title: 'Full Stack Engineer',
        externalId: 'job-12345',
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
    ...customGlobals,
  };
  runInNewContext(code, sandbox);
  return sandbox;
}

test('ApplicationAttemptContext: has all 12 required fields and is deeply frozen (immutable)', () => {
  const sandbox = loadApplicationModule();
  const { ApplicationAttemptContext } = sandbox.NextkinApplication;

  const now = new Date().toISOString();
  const context = new ApplicationAttemptContext({
    applicationId: 'app-999',
    userId: 'user-001',
    candidateId: 'cand-777',
    profileVersion: 2,
    atsProvider: 'lever',
    jobUrl: 'https://jobs.lever.co/example-company/12345',
    companyName: 'Example Corp',
    jobTitle: 'Senior Software Engineer',
    tabId: 42,
    createdAt: now,
  });

  // Check all 12 properties
  assert.equal(context.applicationId, 'app-999');
  assert.ok(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(context.attemptId), 'attemptId must be UUIDv4');
  assert.equal(context.userId, 'user-001');
  assert.equal(context.candidateId, 'cand-777');
  assert.equal(context.profileVersion, 2);
  assert.equal(context.atsProvider, 'lever');
  assert.equal(context.jobUrl, 'https://jobs.lever.co/example-company/12345');
  assert.equal(context.companyName, 'Example Corp');
  assert.equal(context.jobTitle, 'Senior Software Engineer');
  assert.equal(context.tabId, 42);
  assert.equal(context.createdAt, now);
  assert.ok(context.updatedAt);

  // Immutability: context must be frozen
  assert.ok(Object.isFrozen(context), 'ApplicationAttemptContext must be frozen');

  // Attempting to mutate a property must throw in strict mode
  assert.throws(() => {
    context.candidateId = 'cand-hacked';
  }, /TypeError/);

  // Attempting to mutate candidate identity via withUpdate must throw
  assert.throws(() => {
    context.withUpdate({ candidateId: 'different-candidate' });
  }, /Candidate identity cannot be mutated mid-attempt/);

  // Valid updates preserve candidateId and attemptId
  const updated = context.withUpdate({ jobTitle: 'Lead Engineer' });
  assert.equal(updated.jobTitle, 'Lead Engineer');
  assert.equal(updated.candidateId, 'cand-777');
  assert.equal(updated.attemptId, context.attemptId);
  assert.ok(Object.isFrozen(updated));
});

test('ApplicationStateManager: has 8 explicit states and enforces valid state transitions', () => {
  const sandbox = loadApplicationModule();
  const { ApplicationStateManager, ApplicationAttemptContext, ApplicationState, ApplicationStateError } = sandbox.NextkinApplication;

  // Verify all 8 states exist
  const expectedStates = [
    'DRAFT',
    'FILLING',
    'REVIEW_REQUIRED',
    'READY_TO_SUBMIT',
    'SUBMITTING',
    'SUBMITTED',
    'PENDING_VERIFICATION',
    'FAILED',
  ];
  assert.deepEqual(Object.keys(ApplicationState).sort(), expectedStates.sort());

  const context = new ApplicationAttemptContext({
    candidateId: 'cand-1',
    jobUrl: 'https://jobs.lever.co/test/1',
  });
  const manager = new ApplicationStateManager(context, { initialState: ApplicationState.DRAFT });

  // Initial state
  assert.equal(manager.getState(), ApplicationState.DRAFT);

  // DRAFT -> FILLING
  assert.equal(manager.transition(ApplicationState.FILLING), ApplicationState.FILLING);
  assert.equal(manager.getState(), ApplicationState.FILLING);

  // FILLING -> REVIEW_REQUIRED
  assert.equal(manager.transition(ApplicationState.REVIEW_REQUIRED, { reason: 'missing fields' }), ApplicationState.REVIEW_REQUIRED);

  // REVIEW_REQUIRED -> READY_TO_SUBMIT
  assert.equal(manager.transition(ApplicationState.READY_TO_SUBMIT), ApplicationState.READY_TO_SUBMIT);

  // READY_TO_SUBMIT -> SUBMITTING
  assert.equal(manager.transition(ApplicationState.SUBMITTING), ApplicationState.SUBMITTING);

  // SUBMITTING -> PENDING_VERIFICATION
  assert.equal(manager.transition(ApplicationState.PENDING_VERIFICATION), ApplicationState.PENDING_VERIFICATION);

  // PENDING_VERIFICATION -> SUBMITTED
  assert.equal(manager.transition(ApplicationState.SUBMITTED), ApplicationState.SUBMITTED);
  assert.equal(manager.getState(), ApplicationState.SUBMITTED);

  // Illegal transition: SUBMITTED -> FILLING must throw ApplicationStateError
  assert.throws(() => {
    manager.transition(ApplicationState.FILLING);
  }, err => err instanceof ApplicationStateError && err.message.includes('Illegal application state transition'));
});

test('Separation of application_status (ATS) from sync_status (NextKinHR backend)', () => {
  const sandbox = loadApplicationModule();
  const { ApplicationStateManager, ApplicationAttemptContext, ApplicationState, SyncStatus } = sandbox.NextkinApplication;

  const context = new ApplicationAttemptContext({ candidateId: 'cand-2', jobUrl: 'https://jobs.lever.co/test/2' });
  const manager = new ApplicationStateManager(context);

  // Initial states
  assert.equal(manager.getState(), ApplicationState.DRAFT);
  assert.equal(manager.getSyncStatus(), SyncStatus.LOCAL_ONLY);

  // Application transitions to SUBMITTING on ATS
  manager.transition(ApplicationState.FILLING);
  manager.transition(ApplicationState.READY_TO_SUBMIT);
  manager.transition(ApplicationState.SUBMITTING);

  // Sync is queued
  manager.setSyncStatus(SyncStatus.SYNC_PENDING);
  assert.equal(manager.getState(), ApplicationState.SUBMITTING);
  assert.equal(manager.getSyncStatus(), SyncStatus.SYNC_PENDING);

  // ATS confirms submission
  manager.transition(ApplicationState.SUBMITTED);
  assert.equal(manager.getState(), ApplicationState.SUBMITTED);

  // Backend encounters AUTH_REQUIRED (401 token expired)
  manager.setSyncStatus(SyncStatus.AUTH_REQUIRED, { reason: 'Token expired' });

  // ATS status remains SUBMITTED while sync status reflects AUTH_REQUIRED
  assert.equal(manager.getState(), ApplicationState.SUBMITTED, 'ATS application status must remain SUBMITTED');
  assert.equal(manager.getSyncStatus(), SyncStatus.AUTH_REQUIRED, 'Backend sync status must reflect AUTH_REQUIRED');

  // Verify getStatus provides both separately
  const status = manager.getStatus();
  assert.equal(status.application_status, ApplicationState.SUBMITTED);
  assert.equal(status.sync_status, SyncStatus.AUTH_REQUIRED);
  assert.equal(status.candidateId, 'cand-2');
});

test('Persistence: persists minimal durable state to session storage without raw DOM nodes', () => {
  const sessionStorageStore = {};
  const chromeSessionStore = {};

  const sandbox = loadApplicationModule({
    window: {
      sessionStorage: {
        setItem: (k, v) => { sessionStorageStore[k] = v; },
        getItem: k => sessionStorageStore[k] || null,
      },
    },
    chrome: {
      storage: {
        session: {
          set: async data => { Object.assign(chromeSessionStore, data); },
          get: async k => {
            if (typeof k === 'string') return { [k]: chromeSessionStore[k] };
            const res = {};
            for (const key of k) if (chromeSessionStore[key]) res[key] = chromeSessionStore[key];
            return res;
          },
        },
      },
    },
  });

  const { ApplicationStateManager, ApplicationAttemptContext, ApplicationState, SyncStatus } = sandbox.NextkinApplication;

  const context = new ApplicationAttemptContext({
    applicationId: 'app-persist',
    candidateId: 'cand-persist',
    tabId: 99,
    companyName: 'Acme',
    jobTitle: 'Developer',
    jobUrl: 'https://careers.acme.test/apply',
  });

  const manager = new ApplicationStateManager(context, { initialState: ApplicationState.FILLING });
  manager.setSyncStatus(SyncStatus.SYNC_PENDING);

  // Check window.sessionStorage
  const storedJson = sessionStorageStore.nextkin_application_attempt_state;
  assert.ok(storedJson, 'State must be persisted in window.sessionStorage');
  const parsed = JSON.parse(storedJson);
  assert.equal(parsed.context.candidateId, 'cand-persist');
  assert.equal(parsed.application_status, ApplicationState.FILLING);
  assert.equal(parsed.sync_status, SyncStatus.SYNC_PENDING);

  // Check chrome.storage.session
  const activeKey = 'application-state-active';
  assert.ok(chromeSessionStore[activeKey], 'State must be persisted in chrome.storage.session');
  assert.equal(chromeSessionStore[activeKey].attemptId, context.attemptId);

  // Verify no DOM nodes or circular references
  assert.doesNotThrow(() => JSON.stringify(parsed));
  assert.equal(typeof parsed.context.jobUrl, 'string');

  // Verify restoration
  const restored = ApplicationStateManager.restore({ attemptId: context.attemptId });
  assert.ok(restored, 'ApplicationStateManager must be restored from storage');
  assert.equal(restored.getContext().candidateId, 'cand-persist');
  assert.equal(restored.getState(), ApplicationState.FILLING);
  assert.equal(restored.getSyncStatus(), SyncStatus.SYNC_PENDING);
});

test('Multi-tab isolation: candidate identity cannot be mutated mid-attempt', async () => {
  const sandbox = loadApplicationModule();
  const { fill, ApplicationStateError } = sandbox.NextkinApplication;

  const candidateA = { id: 'cand-AAA', full_name: 'Alice Candidate' };
  const candidateB = { id: 'cand-BBB', full_name: 'Bob Candidate' };
  const url = 'https://jobs.lever.co/example-company/12345';

  // Start autofill with candidate A
  await fill(url, candidateA, null).catch(() => {});

  const manager = sandbox.NextkinApplication.getStateManager();
  assert.ok(manager);
  assert.equal(manager.getContext().candidateId, 'cand-AAA');

  // Attempt to call fill with a different candidate while attempt is active
  manager.transition(sandbox.NextkinApplication.ApplicationState.FILLING);
  await assert.rejects(
    async () => { await fill(url, candidateB, null); },
    err => err instanceof ApplicationStateError && err.message.includes('Candidate identity cannot be mutated mid-attempt')
  );

  // The active candidate identity remains strictly candidate A
  assert.equal(manager.getContext().candidateId, 'cand-AAA');
});

test('validateForSubmission: keeps user in control of final submission without throwing runtime errors', () => {
  const form = {
    isConnected: true,
    checkValidity: () => true,
    requestSubmit: () => {},
    elements: [
      { type: 'submit', disabled: false, innerText: 'Submit Application', getClientRects: () => [{}] },
    ],
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  const fields = [
    { label: 'Full Name', kind: 'text', element: { form, value: 'Alice' } },
    { label: 'Email', kind: 'text', element: { form, required: true, value: '' } }, // Incomplete!
  ];

  const sandbox = loadApplicationModule({
    location: new URL('https://jobs.lever.co/example-company/12345/apply'),
    document: form,
    NextkinForms: { discoverFields: () => fields, label: el => el?.name || '' },
    NextkinFieldWriter: { read: f => f.element.value },
  });

  const { validateForSubmission, ApplicationState } = sandbox.NextkinApplication;
  const url = 'https://jobs.lever.co/example-company/12345/apply';

  // Check pre-submission validation
  const validation = validateForSubmission(url);
  assert.equal(validation.ready, false);
  assert.equal(validation.state, ApplicationState.REVIEW_REQUIRED);
  assert.equal(validation.incomplete, true);
  assert.ok(validation.reason.includes('complete the employer form'));

  // Fix the missing field
  fields[1].element.value = 'alice@example.com';

  const readyValidation = validateForSubmission(url);
  assert.equal(readyValidation.ready, true);
  assert.equal(readyValidation.state, ApplicationState.READY_TO_SUBMIT);
  assert.equal(readyValidation.button, 'Submit Application');
});
