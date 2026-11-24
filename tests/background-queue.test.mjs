import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const workspace = 'https://www.nextkinhr.com';
const owner = { workspace, accountId: 'account-a' };
const panel = { id: 'extension', url: 'chrome-extension://extension/panel.html' };
const receipt = (id, body = {}) => ({ ...owner, id, body: { eventKey: id, ...body } });

function createMockWorker(customFetch, initialStorage = {}) {
  const localStorage = initialStorage.local || { origin: workspace };
  const sessionStorage = initialStorage.session || { origin: workspace, accountId: owner.accountId, token: 'first-account-valid-token' };
  let storageError = false;
  let onMessage;
  const alarms = new Map();
  const notices = [];
  const noop = { addListener() {} };

  const tabUrls = new Map();
  const chromeMock = {
    runtime: {
      onInstalled: noop,
      onStartup: noop,
      onConnect: noop,
      id: 'extension',
      getURL: path => 'chrome-extension://extension/' + path,
      onMessage: { addListener: listener => { onMessage = listener; } },
      sendMessage: async (msg) => { notices.push(msg); },
    },
    action: {
      setBadgeText: async () => {},
      setBadgeBackgroundColor: async () => {},
    },
    notifications: {
      create: async () => {},
    },
    scripting: {
      executeScript: async () => [{ result: null }],
    },
    tabs: {
      onUpdated: noop,
      onRemoved: noop,
      get: async (id) => ({ id, url: tabUrls.get(id) || 'https://careers.example.com/jobs/1' }),
      query: async () => [{ id: 1, url: 'https://www.nextkinhr.com/dashboard' }],
      sendMessage: async (tabId, msg) => { notices.push({ tabId, ...msg }); },
    },
    alarms: {
      onAlarm: noop,
      create: (name, info) => { alarms.set(name, info); },
      clear: async (name) => { alarms.delete(name); },
    },
    storage: {
      local: {
        get: async (keys) => {
          if (!keys) return { ...localStorage };
          if (Array.isArray(keys)) {
            return Object.fromEntries(keys.map(k => [k, localStorage[k]]));
          }
          if (typeof keys === 'string') {
            return { [keys]: localStorage[keys] };
          }
          return { ...localStorage };
        },
        set: async (obj) => {
          if (storageError) throw new Error('storage rejected write');
          Object.assign(localStorage, obj);
        },
        remove: async (keys) => {
          const arr = Array.isArray(keys) ? keys : [keys];
          for (const k of arr) delete localStorage[k];
        },
      },
      session: {
        get: async (keys) => {
          if (!keys) return { ...sessionStorage };
          if (Array.isArray(keys)) {
            return Object.fromEntries(keys.map(k => [k, sessionStorage[k]]));
          }
          if (typeof keys === 'string') {
            return { [keys]: sessionStorage[keys] };
          }
          return { ...sessionStorage };
        },
        set: async (obj) => {
          Object.assign(sessionStorage, obj);
        },
        remove: async (keys) => {
          const arr = Array.isArray(keys) ? keys : [keys];
          for (const k of arr) delete sessionStorage[k];
        },
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
    fetch: customFetch,
    _localStorage: localStorage,
    _rejectLocalWrites: value => { storageError = value; },
    _message: (message, sender = panel) => new Promise(resolve => onMessage(message, sender, resolve)),
    _sessionStorage: sessionStorage,
    _alarms: alarms,
    _notices: notices,
    _setTabUrl: (tabId, url) => tabUrls.set(tabId, url),
  };

  runInNewContext(readFileSync(new URL('../jobright_extension/background.js', import.meta.url), 'utf8'), sandbox);
  return sandbox;
}

test('Background Queue: 2xx delivers and dequeues submission', async () => {
  let fetchCalled = 0;
  const worker = createMockWorker(async (url, opts) => {
    fetchCalled++;
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });

  const item = {
    ...owner,
    id: 'sub-1',
    url: 'https://www.nextkinhr.com/api/webhooks/application-submitted',
    token: 'valid-token',
    body: { test: 'payload' },
  };

  await worker.enqueueSubmission(item);
  let queue = await worker.getSubmissionQueue();
  assert.equal(queue.length, 1);
  assert.equal(queue[0].id, 'sub-1');

  await worker.processSubmissionQueue();

  queue = await worker.getSubmissionQueue();
  assert.equal(queue.length, 0, 'Item should be dequeued on 200 OK');
  assert.equal(fetchCalled, 1);
});

test('Background Queue: 401 preserves event, flags syncStatus as AUTH_REQUIRED, pauses queue until re-auth', async () => {
  const worker = createMockWorker(async () => {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  });

  const item = {
    ...owner,
    id: 'sub-401',
    url: 'https://www.nextkinhr.com/api/webhooks/application-submitted',
    token: 'expired-token',
    body: { test: 'auth' },
  };

  await worker.enqueueSubmission(item);
  await worker.processSubmissionQueue();

  // 1. Event must NOT be dropped
  const queue = await worker.getSubmissionQueue();
  assert.equal(queue.length, 1, '401 event must not be dropped');
  assert.equal(queue[0].syncStatus, 'AUTH_REQUIRED');

  // 2. Queue must be paused
  assert.equal(await worker.isQueuePaused(), true, 'Queue must be paused on 401');

  // Second processSubmissionQueue call should do nothing while paused
  let fetchCount = 0;
  worker.fetch = async () => { fetchCount++; return Response.json({ success: true }); };
  await worker.processSubmissionQueue();
  assert.equal(fetchCount, 0, 'Must not process queue while paused on 401');

  // 3. Re-auth via unpauseQueue and new token
  await worker.chrome.storage.session.set({ token: 'new-valid-token' });
  await worker.unpauseQueue();
  assert.equal(await worker.isQueuePaused(), false, 'Queue should be unpaused after re-auth');

  await worker.processSubmissionQueue();
  assert.equal(fetchCount, 1, 'Should retry after re-auth');
  const postQueue = await worker.getSubmissionQueue();
  assert.equal(postQueue.length, 0, 'Should be delivered and dequeued with new token');
});

test('Background Queue: 403 preserves event, flags syncStatus as FORBIDDEN, notifies user', async () => {
  const worker = createMockWorker(async () => {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  });

  const item = {
    ...owner,
    id: 'sub-403',
    url: 'https://www.nextkinhr.com/api/webhooks/application-submitted',
    token: 'forbidden-token',
    body: { test: 'forbidden' },
  };

  await worker.enqueueSubmission(item);
  await worker.processSubmissionQueue();

  const queue = await worker.getSubmissionQueue();
  assert.equal(queue.length, 1, '403 event must not be dropped');
  assert.equal(queue[0].syncStatus, 'FORBIDDEN');

  // Verify alert notice was broadcast
  const forbiddenNotice = worker._notices.find(n => n.status === 'FORBIDDEN');
  assert.ok(forbiddenNotice, 'User must be notified about 403 Forbidden');
});

test('Background Queue: 409 duplicate vs state conflict', async () => {
  // Case A: 409 with IDEMPOTENT_SUBMISSION_EXISTS -> dequeued as delivered
  let workerA = createMockWorker(async () => {
    return new Response(JSON.stringify({ code: 'IDEMPOTENT_SUBMISSION_EXISTS' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
  });

  const itemA = {
    ...owner,
    id: 'sub-409-dup',
    url: 'https://www.nextkinhr.com/api/webhooks/application-submitted',
    token: 'token',
    body: { test: 'dup' },
  };

  await workerA.enqueueSubmission(itemA);
  await workerA.processSubmissionQueue();

  let queueA = await workerA.getSubmissionQueue();
  assert.equal(queueA.length, 0, 'Idempotent duplicate 409 must be dequeued as delivered');

  // Case B: 409 duplicate: true -> dequeued as delivered
  let workerB = createMockWorker(async () => {
    return new Response(JSON.stringify({ duplicate: true }), { status: 409, headers: { 'Content-Type': 'application/json' } });
  });

  await workerB.enqueueSubmission({ ...itemA, id: 'sub-409-dup-bool' });
  await workerB.processSubmissionQueue();
  assert.equal((await workerB.getSubmissionQueue()).length, 0, 'duplicate: true 409 must be dequeued as delivered');

  // Case C: 409 state conflict -> moved to CONFLICT_NEEDS_RESOLVE
  let workerC = createMockWorker(async () => {
    return new Response(JSON.stringify({ error: 'State conflict: application already in terminal state REJECTED' }), {
      status: 409, headers: { 'Content-Type': 'application/json' },
    });
  });

  const itemConflict = {
    ...owner,
    id: 'sub-409-conflict',
    url: 'https://www.nextkinhr.com/api/webhooks/application-submitted',
    token: 'token',
    body: { test: 'conflict' },
  };

  await workerC.enqueueSubmission(itemConflict);
  await workerC.processSubmissionQueue();

  // Pending queue is dequeued so it does not retry endlessly
  assert.equal((await workerC.getSubmissionQueue()).length, 0);

  // Moved to conflict queue
  const conflicts = await workerC.getStorageArray('conflict_submission_queue');
  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].id, 'sub-409-conflict');
  assert.equal(conflicts[0].syncStatus, 'CONFLICT_NEEDS_RESOLVE');
});

test('Background Queue: 422 preserves in reviewable dead-letter queue (VALIDATION_FAILED)', async () => {
  const worker = createMockWorker(async () => {
    return new Response(JSON.stringify({ error: 'Missing required field: resume' }), {
      status: 422, headers: { 'Content-Type': 'application/json' },
    });
  });

  const item = {
    ...owner,
    id: 'sub-422',
    url: 'https://www.nextkinhr.com/api/webhooks/application-submitted',
    token: 'token',
    body: { invalid: 'payload' },
  };

  await worker.enqueueSubmission(item);
  await worker.processSubmissionQueue();

  // Must not remain in pending queue to avoid infinite retry loops
  const pending = await worker.getSubmissionQueue();
  assert.equal(pending.length, 0);

  // Must be in dead letter queue with VALIDATION_FAILED
  const dlq = await worker.getStorageArray('submission_dead_letter_queue');
  assert.equal(dlq.length, 1);
  assert.equal(dlq[0].id, 'sub-422');
  assert.equal(dlq[0].syncStatus, 'VALIDATION_FAILED');
  assert.equal(dlq[0].errorDetails, undefined);
});

test('Background Queue: 429/5xx/timeout retries with exponential backoff up to 8 attempts', async () => {
  let attemptsSeen = [];
  const worker = createMockWorker(async () => {
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  });

  const item = {
    ...owner,
    id: 'sub-retry',
    url: 'https://www.nextkinhr.com/api/webhooks/application-submitted',
    token: 'token',
    body: { test: 'retry' },
  };

  await worker.enqueueSubmission(item);

  // Simulate 8 retries
  for (let i = 1; i <= 8; i++) {
    // Force nextRetryAt to now
    await worker.updateQueueItem(item, prev => ({ ...prev, nextRetryAt: Date.now() - 1000 }));
    await worker.processSubmissionQueue();

    const queue = await worker.getSubmissionQueue();
    assert.equal(queue.length, 1, `Item should remain in queue on attempt ${i}`);
    assert.equal(queue[0].attempts, i);
    assert.equal(queue[0].syncStatus, 'RETRY_PENDING');
    assert.ok(queue[0].nextRetryAt > Date.now(), 'nextRetryAt should be set in future with backoff');
    attemptsSeen.push(queue[0].attempts);
  }
  assert.deepEqual(attemptsSeen, [1, 2, 3, 4, 5, 6, 7, 8]);

  // 9th attempt should exceed max retries and move to DLQ
  await worker.updateQueueItem(item, prev => ({ ...prev, nextRetryAt: Date.now() - 1000 }));
  await worker.processSubmissionQueue();

  const queueAfterMax = await worker.getSubmissionQueue();
  assert.equal(queueAfterMax.length, 0, 'Item should be dequeued after 8 failed attempts');

  const dlq = await worker.getStorageArray('submission_dead_letter_queue');
  assert.equal(dlq.length, 1);
  assert.equal(dlq[0].id, 'sub-retry');
  assert.equal(dlq[0].syncStatus, 'MAX_RETRIES_EXCEEDED');
});

test('Background Queue: chrome.alarms durable retry scheduling across MV3 restarts', async () => {
  const worker = createMockWorker(async () => {
    return new Response(JSON.stringify({ error: 'Rate limit' }), {
      status: 429, headers: { 'Content-Type': 'application/json' },
    });
  });

  const item = {
    ...owner,
    id: 'sub-alarm',
    url: 'https://www.nextkinhr.com/api/webhooks/application-submitted',
    token: 'token',
    body: { test: 'alarm' },
  };

  await worker.enqueueSubmission(item);
  // Verify enqueue set an initial alarm
  assert.ok(worker._alarms.has('process_submission_queue'));

  await worker.processSubmissionQueue();

  // Verify alarm is scheduled for the next retry time
  const alarm = worker._alarms.get('process_submission_queue');
  assert.ok(alarm, 'Alarm must be scheduled for next retry');
  assert.ok(alarm.when > Date.now(), 'Alarm when timestamp must be in future');
});

test('Background Queue: prevents read-modify-write race condition during processSubmissionQueue', async () => {
  let fetchStartedResolve;
  const fetchStarted = new Promise(r => { fetchStartedResolve = r; });
  let allowFetchToFinishResolve;
  const allowFetchToFinish = new Promise(r => { allowFetchToFinishResolve = r; });

  const worker = createMockWorker(async (url, opts) => {
    const body = JSON.parse(opts.body);
    if (body.eventKey === 'item-1') {
      fetchStartedResolve();
      await allowFetchToFinish;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  });

  const item1 = {
    ...owner,
    id: 'item-1',
    url: 'https://www.nextkinhr.com/api/webhooks/application-submitted',
    token: 'token',
    body: { eventKey: 'item-1' },
  };

  await worker.enqueueSubmission(item1);

  // Start processing in background (it will pause inside fetch for item-1)
  const processingPromise = worker.processSubmissionQueue();
  await fetchStarted;

  // While item-1 fetch is in flight, item-2 arrives and is enqueued!
  const item2 = {
    ...owner,
    id: 'item-2',
    url: 'https://www.nextkinhr.com/api/webhooks/application-submitted',
    token: 'token',
    body: { eventKey: 'item-2' },
  };
  await worker.enqueueSubmission(item2);

  // Now let item-1 finish
  allowFetchToFinishResolve();
  await processingPromise;

  // Verify that item-2 was NOT overwritten or lost!
  const queue = await worker.getSubmissionQueue();
  assert.ok(queue.some(q => q.id === 'item-2'), 'item-2 must NOT be lost due to read-modify-write race');
});

test('Background Queue: eliminates cross-tab profile bleed', async () => {
  const worker = createMockWorker(async () => {
    return Response.json({ intentId: null });
  });

  const tabId = 42;
  const tabPosting = 'https://careers.example.com/jobs/101/apply';
  const candA = '11111111-1111-1111-1111-111111111111';
  const candB = '22222222-2222-2222-2222-222222222222';

  // 1. Tab 42 establishes session with Candidate A
  worker._setTabUrl(tabId, tabPosting);
  await worker.prepareApplication(tabId, tabPosting, { title: 'Engineer', company: 'Acme' }, candA, false);

  const contextAfterTab1 = (await worker.chrome.storage.session.get('application-intent:' + tabId))['application-intent:' + tabId];
  assert.equal(contextAfterTab1.candidateId, candA, 'Tab must be bound to Candidate A');

  // 2. User switches activeCandidateId globally (e.g. in side panel for Tab 99)
  await worker.chrome.storage.local.set({ activeCandidateId: candB });

  // 3. Tab 42 navigates or submits
  const step2Url = 'https://careers.example.com/jobs/101/apply?step=2';
  worker._setTabUrl(tabId, step2Url);
  await worker.prepareApplication(tabId, step2Url, { title: 'Engineer', company: 'Acme' }, undefined, false);

  const contextAfterNav = (await worker.chrome.storage.session.get('application-intent:' + tabId))['application-intent:' + tabId];
  assert.equal(contextAfterNav.candidateId, candA, 'Tab candidate identity must NOT be overwritten by global activeCandidateId');
});

const connectionMessage = (accountId, token, origin = workspace) => ({
  type: 'NEXTKIN_SAVE_CONNECTION', user: { id: accountId }, origin, token,
});
const pairingSender = (origin = workspace) => ({
  id: 'extension', frameId: 0, url: origin + '/auth/jobseeker/connected',
});
const statusMessage = { type: 'NEXTKIN_GET_SUBMISSION_QUEUE_STATUS' };

test('Background Queue: storage rejection and offline delivery do not acknowledge a receipt', async () => {
  const worker = createMockWorker(async () => { throw new Error('offline'); });
  worker._rejectLocalWrites(true);
  await assert.rejects(worker.enqueueSubmission(receipt('direct')), /storage rejected/);
  assert.equal(await worker.persistAndDeliverReceipt(receipt('recover')), false);
  assert.equal(worker._localStorage.pending_submission_queue, undefined);
  assert.equal((await worker._message(statusMessage)).pending[0].syncStatus, 'SAVE_FAILED');

  const restarted = createMockWorker(async () => Response.json({ success: true }), {
    local: worker._localStorage,
    session: worker._sessionStorage,
  });
  assert.equal((await restarted._message(statusMessage)).pending[0].syncStatus, 'SAVE_FAILED');
  await restarted.processSubmissionQueue();
  assert.equal((await restarted._message(statusMessage)).pendingCount, 0);
});

test('Background Queue: confirmed delivery acknowledges despite rejected local writes', async () => {
  const worker = createMockWorker(async () => Response.json({ success: true }));
  worker._rejectLocalWrites(true);
  assert.equal(await worker.persistAndDeliverReceipt(receipt('direct-confirmed')), true);
  assert.equal((await worker._message(statusMessage)).pendingCount, 0);

  worker.fetch = async () => new Response('<html>Sign in</html>', { status: 200 });
  assert.equal(await worker.persistAndDeliverReceipt(receipt('invalid-success')), false);
  assert.equal((await worker._message(statusMessage)).pendingCount, 1);
});

test('Background Queue: restart and disconnect hold a receipt until the original account and workspace reconnect', async () => {
  const requests = [];
  const otherWorkspace = 'https://tenant.nextkinhr.com';
  const worker = createMockWorker(async () => new Response('unauthorized', { status: 401 }));
  assert.equal(await worker.persistAndDeliverReceipt(receipt('account-bound')), true);
  assert.equal((await worker._message(statusMessage)).pending[0].syncStatus, 'AUTH_REQUIRED');
  assert.equal(await worker._message({ type: 'NEXTKIN_DISCONNECT' }), true);

  const restarted = createMockWorker(async (url, options) => {
    requests.push({ url, authorization: options.headers.Authorization });
    return Response.json({ success: true });
  }, { local: worker._localStorage, session: worker._sessionStorage });
  await restarted.processSubmissionQueue();
  assert.equal(requests.length, 0);

  assert.equal(await restarted._message(connectionMessage('account-b', 'account-b-valid-token-123'), pairingSender()), true);
  assert.equal(await restarted._message({ type: 'NEXTKIN_RETRY_SUBMISSION_QUEUE' }), true);
  assert.equal((await restarted._message(statusMessage)).pendingCount, 0);
  assert.equal(requests.length, 0);

  assert.equal(await restarted._message(connectionMessage(owner.accountId, 'another-workspace-token-123', otherWorkspace),
    pairingSender(otherWorkspace)), true);
  await restarted.processSubmissionQueue();
  assert.equal(requests.length, 0);
  assert.equal((await restarted.getSubmissionQueue()).length, 1);

  const newToken = 'original-account-new-token-123';
  assert.equal(await restarted._message(connectionMessage(owner.accountId, newToken), pairingSender()), true);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(requests, [{
    url: workspace + '/api/webhooks/application-submitted',
    authorization: 'Bearer ' + newToken,
  }]);
  assert.equal((await restarted.getSubmissionQueue()).length, 0);
});

test('Background Queue: credentials and raw server data are redacted from immediate failures and status', async () => {
  const secret = 'private-credential';
  let status = 409;
  const worker = createMockWorker(async () => Response.json({
    error: 'Bearer ' + secret, token: secret, secret,
  }, { status }));
  const body = {
    token: secret,
    evidence: 'Bearer ' + secret,
    jobUrl: 'https://name:password@careers.example.com/job?token=' + secret,
    answers: [{ label: 'Password', value: secret }, { label: 'Name', value: 'Candidate' }],
  };

  const conflict = { ...receipt('conflict', body), token: secret, url: 'https://otherwise.example.com/receive' };
  assert.equal(await worker.persistAndDeliverReceipt(conflict), true);
  status = 422;
  assert.equal(await worker.persistAndDeliverReceipt({ ...receipt('invalid', body), token: secret }), true);
  const stored = JSON.stringify(worker._localStorage);
  assert.ok(!stored.includes(secret) && !stored.includes('name:password') && !stored.includes('otherwise.example.com'));
  const result = await worker._message(statusMessage);
  assert.equal(result.conflictCount, 1);
  assert.equal(result.deadLetterCount, 1);
  assert.equal(result.conflicts[0].body, undefined);
  const content = { id: panel.id, url: 'https://careers.example.com/job', frameId: 0 };
  assert.equal(await worker._message(statusMessage, content), false);
  assert.equal(await worker._message({ type: 'NEXTKIN_CLEAR_CONFLICT_QUEUE' }, content), false);
  assert.equal((await worker._message(statusMessage)).conflictCount, 1);
});

test('Background Queue: legacy ownership is held for review across retries and cleared queues', async () => {
  const legacy = { id: 'legacy', token: 'old-secret', url: workspace + '/api/webhooks/application-submitted', body: { jobTitle: 'Engineer' } };
  let sent = 0;
  const worker = createMockWorker(async () => { sent++; return Response.json({ success: true }); }, {
    local: { pending_submission_queue: [legacy], submission_dead_letter_queue: [legacy] },
  });
  await worker.scrubLegacyQueue();
  assert.equal(await worker._message({ type: 'NEXTKIN_RETRY_DEAD_LETTER_ITEM', id: legacy.id }), false);
  assert.equal(await worker._message({ type: 'NEXTKIN_CLEAR_DEAD_LETTER_QUEUE' }), true);
  await worker.processSubmissionQueue();
  assert.equal(sent, 0);
  const status = await worker._message(statusMessage);
  assert.equal(status.ownershipReviewCount, 2);
  assert.equal(status.pendingCount, 0);
  assert.ok(!JSON.stringify(worker._localStorage).includes(legacy.token));
});

test('Background Queue: an offline intent receipt is saved and resolves its attempt during recovery', async () => {
  const intentId = '8b1d6779-6dc3-419c-855a-fa293123aba0';
  const worker = createMockWorker(async () => { throw new Error('offline'); });
  const url = 'https://careers.example.com/jobs/1/confirmation';
  await worker.chrome.storage.session.set({
    'application-intent:1': {
      ...owner, intentId, eventKey: 'intent-receipt', applicationUrl: 'https://careers.example.com/jobs/1',
      jobOrigin: 'https://careers.example.com',
    },
  });
  assert.equal(await worker.recordConfirmation({ evidence: 'Application successfully submitted' }, {
    url, frameId: 0, tab: { id: 1, url },
  }), true);
  const [pending] = await worker.getSubmissionQueue();
  assert.equal(pending.body.intentId, intentId);
  assert.equal(pending.body.attempt, undefined);
  await worker.updateQueueItem(pending, previous => ({ ...previous, nextRetryAt: 0 }));

  const requests = [];
  worker.fetch = async (url, options) => {
    requests.push(url);
    if (!options.method) return Response.json({ intent: { id: intentId, attempt: 2 } });
    const body = JSON.parse(options.body);
    const [stored] = await worker.getSubmissionQueue();
    assert.equal(stored.body.attempt, 2);
    assert.equal(body.attempt, 2);
    assert.equal(body.eventKey, 'intent-receipt');
    return Response.json({ status: 'confirmed' });
  };
  await worker.processSubmissionQueue();
  assert.deepEqual(requests, [workspace + '/api/extension/intents/' + intentId, workspace + '/api/extension/events']);
  assert.equal((await worker.getSubmissionQueue()).length, 0);
});

test('Background Queue: Manual attestation routes to /api/extension/auto-submit', async () => {
  let requestedUrl = '';
  const worker = createMockWorker(async (url) => {
    requestedUrl = url;
    return new Response(JSON.stringify({ success: true, submission: { id: 'sub-1' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  const item = {
    ...owner,
    id: 'manual-sub-1',
    token: 'valid-token',
    body: {
      candidateId: 'ebcbee30-b259-4c55-b40f-97d9006914e9',
      eventKey: 'b27a3c3e-e6c1-4b15-9988-cb94660eb5a1',
      companyName: 'Employ',
      jobTitle: 'Mid-Market Account Executive',
      jobUrl: 'https://jobs.lever.co/employ/a4ec1fd5-d606-4995-a745-5a8b7848937c',
      manualAttestation: true,
    },
  };

  await worker.enqueueSubmission(item);
  await worker.processSubmissionQueue();

  assert.match(requestedUrl, /\/api\/extension\/auto-submit$/);
  assert.equal((await worker.getSubmissionQueue()).length, 0, 'Item should be dequeued on 200 OK');
});
