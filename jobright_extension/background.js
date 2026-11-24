async function configurePanel() {
  if (typeof chrome !== 'undefined' && chrome.sidePanel?.setPanelBehavior) {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }
}

async function configureStorageAccess() {
  if (typeof chrome !== 'undefined' && chrome.storage?.session?.setAccessLevel) {
    await chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(() => {});
  }
  await chrome.storage.local?.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(() => {});
}

const QUEUE_KEY = 'pending_submission_queue';
const DEAD_LETTER_KEY = 'submission_dead_letter_queue';
const CONFLICT_QUEUE_KEY = 'conflict_submission_queue';
const QUEUE_PAUSE_KEY = 'submission_queue_pause_state';

let queueMutex = Promise.resolve();

function withQueueLock(fn) {
  const next = queueMutex.then(fn, fn);
  queueMutex = next.catch(() => {});
  return next;
}


const RECOVERY_KEY = 'submission_queue_recovery';
const unsavedReceipts = new Map();
const bodyFields = new Set([
  'eventKey', 'intentId', 'attempt', 'status', 'candidateId', 'url', 'applicationUrl',
  'observedAt', 'jobUrl', 'confirmationUrl', 'companyName', 'jobTitle', 'jobLocation',
  'company', 'title', 'location', 'portalSource', 'externalId', 'department',
  'employmentType', 'jobDescription', 'evidence', 'captureMethod', 'atsDetected',
  'answers', 'appliedResume', 'manualAttestation', 'matchScore', 'matchedSkills', 'missingSkills', 'notes',
]);

function redactReceipt(value, token) {
  if (typeof value === 'string') {
    const safe = token ? value.replaceAll(token, '[redacted]') : value;
    return safe.replace(/\bBearer\s+[A-Za-z0-9_./+=-]+/gi, '[redacted]');
  }
  if (Array.isArray(value)) return value.map(entry => redactReceipt(entry, token));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !/token|authorization|password|cookie|credential|secret|api.?key/i.test(key))
      .map(([key, entry]) => [key, redactReceipt(entry, token)]));
  }
  return value;
}

function sanitizeQueueItem(item, token = item.token) {
  const { id, workspace, accountId, attempts, createdAt, nextRetryAt, syncStatus,
    lastAttemptAt, failedAt } = item;
  const bound = workspaceOrigin(workspace) === workspace && typeof accountId === 'string' && accountId;
  const body = redactReceipt(Object.fromEntries(Object.entries(item.body || {})
    .filter(([key]) => bodyFields.has(key))), token);
  for (const key of ['url', 'applicationUrl', 'jobUrl', 'confirmationUrl']) {
    if (!body[key]) continue;
    try {
      const url = new URL(body[key]);
      url.username = '';
      url.password = '';
      body[key] = cleanApplicationUrl(url);
    } catch {
      delete body[key];
    }
  }
  if (Array.isArray(body.answers)) {
    body.answers = body.answers.filter(answer => answer &&
      !/password|passphrase|secret|credential|verification.?code|security.?code|one.?time.?code|api.?key|token|captcha|otp/i
        .test([answer.key, answer.label].join(' ')));
  }
  return { id, workspace: bound ? workspace : undefined, accountId: bound ? accountId : undefined,
    attempts, createdAt, nextRetryAt, syncStatus: bound ? syncStatus : 'OWNERSHIP_REVIEW',
    lastAttemptAt, failedAt, body };
}

async function getStorageArray(key) {
  const data = await chrome.storage.local.get(key);
  return Array.isArray(data[key]) ? data[key].filter(item => item?.id).map(item => sanitizeQueueItem(item)) : [];
}

async function saveStorageArray(key, arr) {
  await chrome.storage.local.set({ [key]: arr.map(item => sanitizeQueueItem(item)) });
}

async function scrubLegacyQueue() {
  await withQueueLock(async () => {
    const keys = [QUEUE_KEY, DEAD_LETTER_KEY, CONFLICT_QUEUE_KEY];
    const data = await chrome.storage.local.get(keys);
    const patch = {};
    for (const key of keys) {
      if (!Array.isArray(data[key])) continue;
      const sanitized = data[key].filter(item => item?.id).map(item => sanitizeQueueItem(item));
      if (JSON.stringify(sanitized) !== JSON.stringify(data[key])) patch[key] = sanitized;
    }
    if (Object.keys(patch).length) await chrome.storage.local.set(patch);
  });
}

async function getQueueConnection() {
  const { token, origin, accountId } = await chrome.storage.session.get(['token', 'origin', 'accountId']);
  return { token, workspace: workspaceOrigin(origin), accountId };
}

function matchesQueueAccount(item, connection) {
  return Boolean(connection.token && connection.workspace && connection.accountId &&
    item.workspace === connection.workspace && item.accountId === connection.accountId);
}

function sameQueueItem(a, b) {
  return a.id === b.id && a.workspace === b.workspace && a.accountId === b.accountId;
}

function queueItemKey(item) {
  return JSON.stringify([item.workspace, item.accountId, item.id]);
}

function publicQueueItem({ id, attempts, syncStatus, nextRetryAt }) {
  return { id, attempts, syncStatus, nextRetryAt };
}

async function getRecoveryQueue() {
  const data = await chrome.storage.session.get(RECOVERY_KEY).catch(() => ({}));
  const receipts = new Map((data[RECOVERY_KEY] || []).map(item => [queueItemKey(item), sanitizeQueueItem(item)]));
  for (const [key, item] of unsavedReceipts) receipts.set(key, item);
  return [...receipts.values()];
}

async function updateRecovery(item, preserve) {
  const key = queueItemKey(item);
  if (preserve) unsavedReceipts.set(key, item);
  else unsavedReceipts.delete(key);
  await withQueueLock(async () => {
    const data = await chrome.storage.session.get(RECOVERY_KEY);
    const previous = data[RECOVERY_KEY] || [];
    const receipts = previous.filter(entry => !sameQueueItem(entry, item)).map(entry => sanitizeQueueItem(entry));
    if (preserve) receipts.push(item);
    if (preserve || receipts.length !== previous.length) {
      await chrome.storage.session.set({ [RECOVERY_KEY]: receipts });
    }
  }).catch(() => {});
}

async function getSubmissionQueue() {
  return getStorageArray(QUEUE_KEY);
}

async function saveSubmissionQueue(queue) {
  return saveStorageArray(QUEUE_KEY, queue);
}

async function isQueuePaused(connection) {
  connection ??= await getQueueConnection();
  const data = await chrome.storage.local.get(QUEUE_PAUSE_KEY);
  const pauses = data[QUEUE_PAUSE_KEY];
  return Array.isArray(pauses) && pauses.some(item => matchesQueueAccount(item, connection));
}

async function setQueuePaused(connection, paused) {
  await withQueueLock(async () => {
    const data = await chrome.storage.local.get(QUEUE_PAUSE_KEY);
    const pauses = Array.isArray(data[QUEUE_PAUSE_KEY]) ? data[QUEUE_PAUSE_KEY] : [];
    const remaining = pauses.filter(item => !matchesQueueAccount(item, connection));
    if (paused) remaining.push({ workspace: connection.workspace, accountId: connection.accountId });
    await chrome.storage.local.set({ [QUEUE_PAUSE_KEY]: remaining });
  });
}

async function unpauseQueue(connection, retryAll = false) {
  connection ??= await getQueueConnection();
  await setQueuePaused(connection, false);
  await withQueueLock(async () => {
    const queue = await getSubmissionQueue();
    const next = queue.map(item => matchesQueueAccount(item, connection) &&
      (retryAll || item.syncStatus === 'AUTH_REQUIRED')
      ? { ...item, nextRetryAt: Date.now(), syncStatus: 'QUEUED' }
      : item);
    if (next.some((item, index) => item !== queue[index])) await saveSubmissionQueue(next);
  });
}

function scheduleQueueAlarm(delayMs = 0) {
  if (typeof chrome === 'undefined' || !chrome.alarms?.create) return;
  const targetWhen = Date.now() + Math.max(0, delayMs);
  chrome.alarms.create('process_submission_queue', { when: targetWhen });
}

async function scheduleNextRetryAlarm(connection) {
  if (typeof chrome === 'undefined' || !chrome.alarms?.create) return;
  const queue = await getSubmissionQueue();
  const retryable = queue.filter(item => {
    if (item.syncStatus === 'FORBIDDEN' || item.syncStatus === 'AUTH_REQUIRED') return false;
    return matchesQueueAccount(item, connection) && typeof item.nextRetryAt === 'number';
  });

  if (!retryable.length) {
    try {
      if (chrome.alarms?.clear) await chrome.alarms.clear('process_submission_queue');
    } catch {}
    return;
  }

  const now = Date.now();
  let earliest = Infinity;
  for (const item of retryable) {
    if (item.nextRetryAt < earliest) {
      earliest = item.nextRetryAt;
    }
  }

  const when = Math.max(now + 1000, earliest);
  try {
    chrome.alarms.create('process_submission_queue', { when });
  } catch {}
}

async function enqueueSubmission(item) {
  return withQueueLock(async () => {
    const queue = await getSubmissionQueue();
    const existing = queue.find(entry => sameQueueItem(entry, item));
    if (existing) return existing;
    const now = Date.now();
    const entry = sanitizeQueueItem({
      attempts: 0, createdAt: now, nextRetryAt: now, syncStatus: 'QUEUED', ...item,
    });
    await saveSubmissionQueue([...queue, entry]);
    try { scheduleQueueAlarm(); } catch {}
    return entry;
  });
}

async function updateQueueItem(item, updater) {
  await withQueueLock(async () => {
    const queue = await getSubmissionQueue();
    const idx = queue.findIndex(entry => sameQueueItem(entry, item));
    if (idx < 0) return;
    const updated = updater(queue[idx]);
    if (updated === null) queue.splice(idx, 1);
    else queue[idx] = updated;
    await saveSubmissionQueue(queue);
  });
}

async function moveSubmission(item, key, syncStatus) {
  await withQueueLock(async () => {
    const [pending, destination] = await Promise.all([getSubmissionQueue(), getStorageArray(key)]);
    const updated = sanitizeQueueItem({ ...item, syncStatus, failedAt: Date.now() });
    await chrome.storage.local.set({
      [key]: [...destination.filter(entry => !sameQueueItem(entry, item)), updated],
      [QUEUE_KEY]: pending.filter(entry => !sameQueueItem(entry, item)),
    });
  });
}

function broadcastSyncAlert(type, payload) {
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type, ...payload }).catch(() => {});
    }
  } catch {}
}

function notifyForbidden(item) {
  broadcastSyncAlert('NEXTKIN_SYNC_ALERT', {
    status: 'FORBIDDEN',
    message: 'Application submission forbidden (403). Check account permissions.',
    itemId: item.id,
  });
  if (typeof chrome !== 'undefined') {
    chrome.action?.setBadgeText?.({ text: '!' }).catch(() => {});
    chrome.action?.setBadgeBackgroundColor?.({ color: '#EF4444' }).catch(() => {});
    if (chrome.notifications?.create) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon128.plasmo.3c1ed2d2.png',
        title: 'Submission Forbidden (403)',
        message: 'Application submission forbidden (403). Please verify account permissions.',
      }).catch(() => {});
    }
  }
}

function notifyAuthRequired(item) {
  broadcastSyncAlert('NEXTKIN_AUTH_REQUIRED', {
    status: 'AUTH_REQUIRED',
    message: 'Authentication token expired or rejected. Please re-authenticate.',
    itemId: item.id,
  });
  if (typeof chrome !== 'undefined') {
    chrome.action?.setBadgeText?.({ text: 'AUTH' }).catch(() => {});
    chrome.action?.setBadgeBackgroundColor?.({ color: '#F59E0B' }).catch(() => {});
  }
}

function clearAlertBadge() {
  if (typeof chrome !== 'undefined' && chrome.action?.setBadgeText) {
    chrome.action.setBadgeText({ text: '' }).catch(() => {});
  }
}

async function markSessionReported(item) {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.session?.get) return;
    const sessionData = await chrome.storage.session.get(null);
    for (const [k, v] of Object.entries(sessionData || {})) {
      if ((k.startsWith('application-intent:') || k.startsWith('embedded-outside-application:')) && v?.eventKey === item.id) {
        const { submissionEvidence, ...completed } = v;
        await chrome.storage.session.set({ [k]: { ...completed, reported: true } });
      }
    }
  } catch {}
}

async function handleRetryableFailure(item, errorMsg) {
  const attempts = (item.attempts || 0) + 1;
  const now = Date.now();

  if (attempts <= 8) {
    // Exponential backoff with jitter up to 8 attempts:
    // Base: 2s * 2^(attempts-1): 2s, 4s, 8s, 16s, 32s, 60s
    const baseDelay = Math.min(60000, 2000 * Math.pow(2, attempts - 1));
    const jitter = Math.floor(Math.random() * 1000);
    const delayMs = Math.min(60000, baseDelay + jitter);
    const nextRetryAt = now + delayMs;

    await updateQueueItem(item, prev => ({
      ...prev,
      attempts,
      nextRetryAt,
      syncStatus: 'RETRY_PENDING',
      lastError: errorMsg,
      lastAttemptAt: now,
    }));
    return { success: false, retryScheduled: true, attempts, nextRetryAt };
  } else {
    await moveSubmission(item, DEAD_LETTER_KEY, 'MAX_RETRIES_EXCEEDED');
    broadcastSyncAlert('NEXTKIN_DEAD_LETTER_ITEM', {
      status: 'MAX_RETRIES_EXCEEDED',
      itemId: item.id,
      lastError: errorMsg,
    });
    return { success: false, error: 'MAX_RETRIES_EXCEEDED', attempts };
  }
}

const activeDeliveries = new Map();

function dispatchSingleItem(item, allowQueueUpdates = true) {
  const key = queueItemKey(item);
  if (!activeDeliveries.has(key)) {
    const delivery = deliverReceipt(item, allowQueueUpdates).finally(() => activeDeliveries.delete(key));
    activeDeliveries.set(key, delivery);
  }
  return activeDeliveries.get(key);
}

async function deliverReceipt(item, allowQueueUpdates) {
  const now = Date.now();
  const connection = await getQueueConnection();
  if (!matchesQueueAccount(item, connection)) return { success: false, error: 'ACCOUNT_REQUIRED' };
  const intentId = item.body?.intentId;
  const isManual = Boolean(item.body?.manualAttestation);
  const route = intentId
    ? '/api/extension/events'
    : (isManual ? '/api/extension/auto-submit' : '/api/webhooks/application-submitted');
  if (intentId && !Number.isInteger(item.body.attempt)) {
    if (!intentIdPattern.test(intentId)) {
      if (allowQueueUpdates) await moveSubmission(item, DEAD_LETTER_KEY, 'VALIDATION_FAILED');
      return { success: false };
    }
    const response = await fetch(item.workspace + '/api/extension/intents/' + intentId,
      workspaceRequest(connection.token)).catch(() => null);
    if (!response?.ok) {
      if (!allowQueueUpdates) return { success: false };
      if (response?.status === 401) return recordReceiptAuthFailure(item, connection, now);
      if (response?.status === 403 || response?.status === 404) {
        await moveSubmission(item, DEAD_LETTER_KEY, 'INTENT_UNAVAILABLE');
        return { success: false };
      }
      return handleRetryableFailure(item, 'Application attempt lookup failed');
    }
    const data = await response.json().catch(() => null);
    if (data?.intent?.id !== intentId || !Number.isInteger(data.intent.attempt)) {
      if (allowQueueUpdates) await moveSubmission(item, DEAD_LETTER_KEY, 'VALIDATION_FAILED');
      return { success: false };
    }
    item.body = { ...item.body, attempt: Math.max(1, data.intent.attempt) };
    if (allowQueueUpdates) await updateQueueItem(item, previous => ({ ...previous, body: item.body }));
    const current = await getQueueConnection();
    if (!matchesQueueAccount(item, current) || current.token !== connection.token) return { success: false };
  }

  let response;

  try {
    response = await fetch(item.workspace + route, {
      ...workspaceRequest(connection.token),
      method: 'POST',
      body: JSON.stringify(item.body),
    });
  } catch {}

  // Network Timeout or Network Error (fetch threw)
  if (!response) {
    if (!allowQueueUpdates) return { success: false };
    return handleRetryableFailure(item, 'Network error or timeout');
  }

  // 2xx Success: mark delivered and dequeue
  if (response.ok) {
    let data = null;
    try {
      data = await response.json();
    } catch {}
    const isIntent = item.body?.intentId;
    const isSuccess = isIntent
      ? ['submitted', 'confirmed'].includes(data?.status)
      : data?.success === true;

    if (isSuccess) {
      await updateQueueItem(item, () => null).catch(() => {});
      await markSessionReported(item);
      clearAlertBadge();
      broadcastSyncAlert('NEXTKIN_SYNC_SUCCESS', {
        status: 'DELIVERED',
        itemId: item.id,
      });
      return { success: true, status: response.status };
    } else {
      if (allowQueueUpdates) await moveSubmission(item, DEAD_LETTER_KEY, 'SERVER_REJECTED');
      return { success: false, status: response.status };
    }
  }

  // 401 Unauthorized: Do NOT drop! Preserve event, flag syncStatus as AUTH_REQUIRED, pause queue until re-auth.
  if (response.status === 401) {
    if (!allowQueueUpdates) return { success: false };
    return recordReceiptAuthFailure(item, connection, now);
  }

  // 403 Forbidden: Preserve event, flag syncStatus as FORBIDDEN, notify user.
  if (response.status === 403) {
    if (!allowQueueUpdates) return { success: false };
    await updateQueueItem(item, prev => ({
      ...prev,
      syncStatus: 'FORBIDDEN',
      lastError: 'Forbidden (403)',
      lastAttemptAt: now,
    }));
    notifyForbidden(item);
    return { success: false, status: 403, error: 'FORBIDDEN' };
  }

  // 409 Conflict: Do NOT blindly treat as success! Inspect response body.
  if (response.status === 409) {
    let body = null;
    try {
      body = await response.json();
    } catch {
      try { body = { raw: await response.text() }; } catch {}
    }

    const isDuplicate = body?.code === 'IDEMPOTENT_SUBMISSION_EXISTS' ||
      body?.duplicate === true ||
      body?.idempotent === true ||
      body?.status === 'already_submitted' ||
      body?.status === 'confirmed';

    if (isDuplicate) {
      await updateQueueItem(item, () => null).catch(() => {});
      await markSessionReported(item);
      clearAlertBadge();
      broadcastSyncAlert('NEXTKIN_SYNC_SUCCESS', {
        status: 'DELIVERED',
        itemId: item.id,
        duplicate: true,
      });
      return { success: true, status: 409, duplicate: true };
    } else {
      // State conflict: move to CONFLICT_NEEDS_RESOLVE
      if (allowQueueUpdates) await moveSubmission(item, CONFLICT_QUEUE_KEY, 'CONFLICT_NEEDS_RESOLVE');
      broadcastSyncAlert('NEXTKIN_SYNC_CONFLICT', {
        status: 'CONFLICT_NEEDS_RESOLVE',
        itemId: item.id,
      });
      return { success: false, status: 409, error: 'CONFLICT_NEEDS_RESOLVE' };
    }
  }

  if (!allowQueueUpdates) return { success: false };
  if (response.status === 422) {
    await moveSubmission(item, DEAD_LETTER_KEY, 'VALIDATION_FAILED');
    broadcastSyncAlert('NEXTKIN_DEAD_LETTER_ITEM', { status: 'VALIDATION_FAILED', itemId: item.id });
    return { success: false, status: 422, error: 'VALIDATION_FAILED' };
  }

  // 429 or 5xx: Retry with exponential backoff and jitter up to 8 attempts
  if (response.status === 429 || response.status >= 500) {
    return await handleRetryableFailure(item, `HTTP ${response.status}`);
  }

  await moveSubmission(item, DEAD_LETTER_KEY, 'CLIENT_ERROR_' + response.status);
  return { success: false, status: response.status, error: 'CLIENT_ERROR_' + response.status };
}

async function recordReceiptAuthFailure(item, connection, lastAttemptAt) {
  const current = await getQueueConnection();
  if (current.token === connection.token && matchesQueueAccount(item, current)) {
    await updateQueueItem(item, previous => ({ ...previous, syncStatus: 'AUTH_REQUIRED', lastAttemptAt }));
    await setQueuePaused(connection, true);
    notifyAuthRequired(item);
  }
  return { success: false, status: 401, error: 'AUTH_REQUIRED' };
}

let isProcessingQueue = false;

async function processSubmissionQueue() {
  if (typeof chrome === 'undefined' || !chrome.storage?.local?.get) return;
  if (isProcessingQueue) return;
  isProcessingQueue = true;

  try {
    const connection = await getQueueConnection();
    if (!connection.token || await isQueuePaused(connection)) return;

    let recoveryPending = false;
    for (const item of await getRecoveryQueue()) {
      if (!matchesQueueAccount(item, connection)) continue;
      try {
        await enqueueSubmission({ ...item, syncStatus: 'QUEUED' });
        await updateRecovery(item, false);
      } catch {
        recoveryPending = true;
      }
    }

    const now = Date.now();
    for (const item of await getSubmissionQueue()) {
      if (!matchesQueueAccount(item, connection) || item.syncStatus === 'FORBIDDEN' ||
        item.syncStatus === 'AUTH_REQUIRED' || item.nextRetryAt > now) continue;
      await dispatchSingleItem(item);
      if (await isQueuePaused(connection)) break;
    }

    const current = await getQueueConnection();
    if (current.token !== connection.token || current.workspace !== connection.workspace || current.accountId !== connection.accountId) {
      scheduleQueueAlarm();
    } else if (recoveryPending) scheduleQueueAlarm(60000);
    else await scheduleNextRetryAlarm(connection);
  } catch {
    try { scheduleQueueAlarm(60000); } catch {}
  } finally {
    isProcessingQueue = false;
  }
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onInstalled?.addListener) {
  chrome.runtime.onInstalled.addListener(async () => {
    await Promise.all([
      configurePanel(),
      configureStorageAccess(),
      scrubLegacyQueue().catch(() => {}),
      processSubmissionQueue(),
      chrome.storage.local?.remove?.(['candidateProfile', 'resumeData', 'savedProfiles', 'savedResumes', 'token']),
    ]);
  });
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onStartup?.addListener) {
  chrome.runtime.onStartup.addListener(async () => {
    await Promise.all([
      configurePanel(),
      configureStorageAccess(),
      scrubLegacyQueue().catch(() => {}),
      processSubmissionQueue(),
      chrome.storage.local?.remove?.('token'),
    ]);
  });
}

if (typeof chrome !== 'undefined' && chrome.alarms?.onAlarm) {
  chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === 'process_submission_queue') {
      void processSubmissionQueue();
    }
  });
}

if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'session' && changes?.token?.newValue) {
      void (async () => {
        if (await isQueuePaused()) {
          await unpauseQueue();
          void processSubmissionQueue();
        }
      })();
    }
  });
}

async function getStoredCredentials() {
  let sessionToken = null;
  let sessionOrigin = null;
  let accountId;
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.session?.get) {
      const session = await chrome.storage.session.get(['token', 'origin', 'accountId']);
      sessionToken = session?.token;
      sessionOrigin = session?.origin;
      accountId = session?.accountId;
    }
  } catch {}

  let local = {};
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local?.get) {
      local = (await chrome.storage.local.get(['origin', 'token', 'user', 'activeCandidateId'])) || {};
    }
  } catch {}

  // Migrate legacy token from local to session if session token is absent
  if (local.token && !sessionToken) {
    sessionToken = local.token;
    try {
      if (chrome.storage?.session?.set) {
        await chrome.storage.session.set({
          token: sessionToken,
          ...(local.origin ? { origin: local.origin } : {}),
        });
      }
    } catch {}
  }

  // Remove legacy token from local storage
  if (local.token) {
    try {
      if (chrome.storage?.local?.remove) {
        await chrome.storage.local.remove('token');
      }
    } catch {}
  }

  const token = sessionToken || local.token || null;
  const origin = sessionOrigin || local.origin || null;
  const matchingAccount = !accountId || (accountId === local.user?.id && workspaceOrigin(origin) === workspaceOrigin(local.origin));
  return { token, origin, accountId, user: matchingAccount ? local.user : undefined,
    activeCandidateId: matchingAccount ? local.activeCandidateId : undefined };
}

const trackedKey = tabId => 'application-intent:' + tabId;
const embeddedKey = tabId => 'embedded-outside-application:' + tabId;
const stepKey = tabId => 'application-next-step:' + tabId;
const intentIdPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const outsideDiscoveries = new Map();

function workspaceOrigin(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && /(^|\.)(nextkinhr\.com|jobright-internal\.com)$/.test(url.hostname)) {
      return url.origin === 'https://nextkinhr.com' ? 'https://www.nextkinhr.com' : url.origin;
    }
    if (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)) return url.origin;
  } catch {}
  return null;
}

function workspaceRequest(token) {
  return { credentials: 'omit', redirect: 'error', signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(10000) : undefined,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } };
}

function portalOrigin(url) {
  return url.origin === 'https://job-boards.greenhouse.io' ? 'https://boards.greenhouse.io' : url.origin;
}

const PRESERVED_JOB_PARAMS = new Set(['gh_jid', 'jobid', 'job_id', 'jk', 'requisition', 'req_id', 'id']);

function cleanApplicationUrl(url) {
  if (!url) return '';
  try {
    const parsed = typeof url === 'string' ? new URL(url) : (url instanceof URL ? url : new URL(String(url)));
    const clean = params => {
      for (const name of [...params.keys()]) {
        const lower = name.toLowerCase();
        if (!PRESERVED_JOB_PARAMS.has(lower) || lower.startsWith('utm_') || ['ref', 'source', 'fbclid', 'gclid', 'trk'].includes(lower)) {
          params.delete(name);
        }
      }
      params.sort();
    };
    clean(parsed.searchParams);
    const [route, query] = parsed.hash.slice(1).split(/\?(.*)/s, 2);
    const SearchParams = parsed.searchParams.constructor || URLSearchParams;
    const routeParams = new SearchParams(query);
    clean(routeParams);
    parsed.hash = /^!?\//.test(route) ? route + (routeParams.size ? '?' + routeParams.toString() : '') : '';
    return parsed.href;
  } catch {
    return typeof url === 'string' ? url : (url?.href || String(url));
  }
}

async function loadApplicationData(path) {
  const { origin, token } = await getStoredCredentials();
  const workspace = workspaceOrigin(origin);
  if (!workspace || !token) return null;
  const response = await fetch(workspace + '/api/extension/' + path, workspaceRequest(token));
  if (!response.ok) return null;
  const data = await response.json();
  const current = await getStoredCredentials();
  return current.origin === origin && current.token === token ? data : null;
}

async function loadApplicationResume(candidateId) {
  if (!intentIdPattern.test(candidateId || '')) return null;
  const params = new URLSearchParams({ candidateId, originalOnly: 'true' });
  const file = await loadApplicationData('resume-file?' + params);
  return file?.source === 'upload' && file.base64 && file.filename ? file : null;
}

async function loadSavedProfile(candidateId) {
  const query = new URLSearchParams({ savedOnly: 'true' });
  if (intentIdPattern.test(candidateId || '')) query.set('candidateId', candidateId);
  const data = await loadApplicationData('candidates?' + query);
  const profile = data?.candidates?.[0];
  const facts = profile?.confirmed_facts;
  if (profile?.provenance_status !== 'confirmed' || !facts?.full_name ||
    String(facts.notes || '').startsWith('Profile created from an uploaded resume.')) return null;
  return profile;
}

async function queueApplicationStep(tabId, sender, message) {
  const { origin, token } = await getStoredCredentials();
  if (!workspaceOrigin(origin) || !token || !intentIdPattern.test(message.candidateId || '')) return;
  const step = {
    origin, token, formUrl: sender.url, documentId: sender.documentId,
    candidateId: message.candidateId, expiresAt: Date.now() + 30000,
    resumeDocumentId: intentIdPattern.test(message.resumeDocumentId || '') ? message.resumeDocumentId : null,
  };
  await chrome.storage.session.set({ [stepKey(tabId)]: step });
}

function sameApplicationStepScope(previous, current) {
  if (previous.origin !== current.origin) return false;
  const base = path => path.replace(/\/(?:apply|application|applyjob)(?:\/.*)?$/i, '').replace(/\/$/, '');
  const previousKey = new URL(cleanApplicationUrl(new URL(previous)));
  const currentKey = new URL(cleanApplicationUrl(new URL(current)));
  for (const [key, value] of currentKey.searchParams) {
    if (previousKey.searchParams.has(key) && previousKey.searchParams.get(key) !== value) return false;
  }
  const previousRoute = previousKey.hash.split('?')[0];
  const currentRoute = currentKey.hash.split('?')[0];
  if ((previousRoute || currentRoute) && base(previousRoute) !== base(currentRoute)) return false;
  return previous.pathname === current.pathname || base(previous.pathname) === base(current.pathname);
}

async function continueTracking(tabId, step, url) {
  const key = trackedKey(tabId);
  const context = (await chrome.storage.session.get(key))[key];
  if (context?.applicationUrl === cleanApplicationUrl(new URL(step.formUrl)) && context.token === step.token) {
    await chrome.storage.session.set({ [key]: { ...context, applicationUrl: cleanApplicationUrl(url) } });
  }
}

async function claimApplicationStep(tabId, sender) {
  await pendingSteps.get(tabId);
  const key = stepKey(tabId);
  const step = (await chrome.storage.session.get(key))[key];
  if (!step || step.documentId === sender.documentId || step.expiresAt < Date.now()) return null;
  await chrome.storage.session.remove(key);
  const url = new URL(sender.url);
  const current = await getStoredCredentials();
  if (!sameApplicationStepScope(new URL(step.formUrl), url) || workspaceOrigin(step.origin) !== workspaceOrigin(current.origin) || !current.token ||
    /(?:login|sign[-_]?in|register|creat(?:e|ing)[-_]?account)(?:$|[/_-])/i.test(url.pathname)) return null;
  const [profile, resume] = await Promise.all([
    loadSavedProfile(step.candidateId),
    (step.resumeDocumentId ? loadApplicationData('resume?documentId=' + step.resumeDocumentId)
      : loadApplicationResume(step.candidateId)).catch(() => null),
  ]);
  if (!profile) return null;
  await continueTracking(tabId, step, url);
  return { profile, resume, resumeDocumentId: step.resumeDocumentId };
}

function externalJobDetails(job, url, jobUrl, candidateId) {
  const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
  const jobTitle = text(job?.title, 200);
  const companyName = text(job?.company, 200);
  if (!jobTitle || !companyName) return null;
  return {
    candidateId, jobUrl, jobTitle, companyName, portalSource: text(job.portalSource, 100) || url.hostname,
    jobLocation: text(job.location, 200), department: text(job.department, 100),
    employmentType: text(job.employmentType, 50), jobDescription: text(job.description, 60000),
    externalId: text(job.externalId, 200) || null,
  };
}

function ashbyFramePosting(url) {
  if (url.origin !== 'https://jobs.ashbyhq.com') return null;
  const id = url.pathname.split('/')[2];
  return intentIdPattern.test(id || '') ? id.toLowerCase() : null;
}

function outsidePage(url) {
  return url.protocol === 'https:' && !workspaceOrigin(url.href) &&
    !new URLSearchParams(url.hash.slice(1)).has('marketing-intent');
}

function matchesEmbeddedPosting(parent, url) {
  const ashbyId = parent.searchParams.get('ashby_jid');
  return !ashbyId || ashbyFramePosting(url) === ashbyId.toLowerCase();
}

async function prepareEmbeddedOutsideApplication(tabId, tabUrl, frame, job, candidateId, submitted = false, submissionEvidence) {
  if (!frame.documentId || !Number.isInteger(frame.frameId) || frame.frameId <= 0 || (!submitted && !intentIdPattern.test(candidateId || ''))) return false;
  const parent = new URL(tabUrl);
  const url = new URL(frame.url);
  if (!outsidePage(parent) || !outsidePage(url) || !matchesEmbeddedPosting(parent, url)) return false;
  const { origin, token, activeCandidateId, accountId } = await getStoredCredentials();
  const workspace = workspaceOrigin(origin);
  if (!workspace || !token || (await chrome.tabs.get(tabId)).url !== tabUrl) return false;

  const key = embeddedKey(tabId);
  const storage = await chrome.storage.session.get([key, trackedKey(tabId)]);
  const top = storage[trackedKey(tabId)];
  if (top?.intentId && top.accountId === accountId && top.jobOrigin === portalOrigin(parent)) {
    if (storage[key]) await chrome.storage.session.remove(key);
    return true;
  }
  const previous = storage[key]?.accountId === accountId ? storage[key] : undefined;
  const jobUrl = cleanApplicationUrl(new URL(url));
  const sameForm = previous?.documentId === frame.documentId && previous.parentUrl === parent.href && previous.externalJob?.jobUrl === jobUrl &&
    previous.token === token && previous.workspace === workspace;

  // Eliminate cross-tab profile bleed:
  // Tab-scoped candidate identity takes priority over global activeCandidateId
  const existingTabCandidate = (intentIdPattern.test(previous?.candidateId || '') ? previous.candidateId : null)
    || (intentIdPattern.test(previous?.externalJob?.candidateId || '') ? previous.externalJob.candidateId : null)
    || (top?.accountId === accountId && intentIdPattern.test(top?.candidateId || '') ? top.candidateId : null)
    || (top?.accountId === accountId && intentIdPattern.test(top?.externalJob?.candidateId || '') ? top.externalJob.candidateId : null);

  const selectedCandidate = (intentIdPattern.test(candidateId || '') ? candidateId : null)
    || existingTabCandidate
    || (intentIdPattern.test(activeCandidateId || '') ? activeCandidateId : 'current');

  if (sameForm && (previous?.candidateId === selectedCandidate || previous?.externalJob?.candidateId === selectedCandidate)) {
    if (submissionEvidence && !previous.reported) await chrome.storage.session.set({ [key]: { ...previous, submissionEvidence } });
    return true;
  }
  const target = { tabId, documentIds: [frame.documentId] };
  if (!submitted) {
    const [verified] = await chrome.scripting.executeScript({ target, func: () => location.href });
    if (verified?.frameId !== frame.frameId || verified.result !== frame.url) return false;
  }
  const externalJob = externalJobDetails(job, url, jobUrl, selectedCandidate);
  if (!externalJob) return false;
  const context = {
    frameId: frame.frameId, documentId: frame.documentId, parentUrl: parent.href, jobOrigin: portalOrigin(url), workspace, token, accountId,
    candidateId: selectedCandidate,
    externalJob: { ...externalJob, candidateId: selectedCandidate, externalId: ashbyFramePosting(url) || externalJob.externalId }, eventKey: crypto.randomUUID(),
    ...(submissionEvidence ? { submissionEvidence } : {}),
  };
  await chrome.storage.session.set({ [key]: context });
  try {
    await chrome.scripting.executeScript({ target, files: ['application-confirmation.js'] });
  } catch (error) {
    if (submitted) return true; // The iframe may already have navigated to its receipt.
    if ((await chrome.storage.session.get(key))[key]?.eventKey === context.eventKey)
      await chrome.storage.session.remove(key);
    throw error;
  }
  return true;
}

async function resumeEmbeddedTracking(sender) {
  if (!sender.frameId || !sender.documentId || sender.tab?.id == null || !sender.tab.url || !sender.url) return;
  const tabId = sender.tab.id;
  await pendingTracking.get(tabId)?.catch(() => {});
  const key = embeddedKey(tabId);
  const context = (await chrome.storage.session.get(key))[key];
  if (!context || context.reported || context.frameId !== sender.frameId || context.documentId === sender.documentId ||
    context.parentUrl !== sender.tab.url) return;
  const url = new URL(sender.url);
  if (portalOrigin(url) !== context.jobOrigin || !matchesEmbeddedPosting(new URL(sender.tab.url), url)) return;
  await chrome.storage.session.set({ [key]: { ...context, documentId: sender.documentId } });
  await chrome.scripting.executeScript({ target: { tabId, documentIds: [sender.documentId] }, files: ['application-confirmation.js'], injectImmediately: true });
}

async function saveOutsideDiscovery(key) {
  const context = (await chrome.storage.session.get(key))[key];
  if (!context?.externalJob || context.reported || outsideDiscoveries.get(key) === context.eventKey) return;
  const current = await getStoredCredentials();
  if (workspaceOrigin(current.origin) !== context.workspace || !current.token) return;
  if (outsideDiscoveries.get(key) === context.eventKey) return;
  outsideDiscoveries.set(key, context.eventKey);
  const job = context.externalJob;
  let saved = false;
  try {
    const response = await fetch(context.workspace + '/api/extension/save-external-job', {
      ...workspaceRequest(current.token || context.token), method: 'POST', body: JSON.stringify({
        candidateId: intentIdPattern.test(job.candidateId) ? job.candidateId : undefined,
        title: job.jobTitle, company: job.companyName, jobUrl: job.jobUrl, portalSource: job.portalSource,
        location: job.jobLocation, department: job.department, employmentType: job.employmentType, externalId: job.externalId,
        description: job.jobDescription.length >= 10 ? job.jobDescription : `Application for ${job.jobTitle} at ${job.companyName}.`,
      }),
    });
    saved = response.ok;
  } finally {
    if (!saved && outsideDiscoveries.get(key) === context.eventKey) outsideDiscoveries.delete(key);
  }
}

async function prepareApplication(tabId, expectedUrl, job, candidateId, submittedFromPage = false, submissionEvidence) {
  const url = new URL(expectedUrl);
  if (url.protocol !== 'https:') return false;
  const jobOrigin = portalOrigin(url);
  const stillOnApplication = async () => {
    const urlNow = (await chrome.tabs.get(tabId)).url;
    return urlNow === expectedUrl || (submittedFromPage && urlNow && portalOrigin(new URL(urlNow)) === jobOrigin);
  };
  if (!await stillOnApplication()) throw new Error('The application tab changed. Try autofill again.');
  const { origin, token, activeCandidateId, accountId } = await getStoredCredentials();
  const workspace = workspaceOrigin(origin);
  if (!workspace || !token) return false;

  let intentId = new URLSearchParams(url.hash.slice(1)).get('marketing-intent');
  const jobUrl = cleanApplicationUrl(url);
  const key = trackedKey(tabId);
  const savedContext = (await chrome.storage.session.get(key))[key];
  const context = savedContext?.accountId === accountId ? savedContext : undefined;

  // Tab-scoped candidate identity to prevent cross-tab profile bleed
  const existingTabCandidate = (intentIdPattern.test(context?.candidateId || '') ? context.candidateId : null)
    || (intentIdPattern.test(context?.externalJob?.candidateId || '') ? context.externalJob.candidateId : null);

  const tabCandidateId = (intentIdPattern.test(candidateId || '') ? candidateId : null)
    || existingTabCandidate
    || (intentIdPattern.test(activeCandidateId || '') ? activeCandidateId : 'current');

  if (submittedFromPage && context && context.workspace === workspace && token && (
    context.applicationUrl === jobUrl ||
    (context.awaitSubmit && sameApplicationStepScope(new URL(context.applicationUrl), url))
  )) {
    if (context.reported) return false;
    if (submissionEvidence || context.awaitSubmit) {
      await chrome.storage.session.set({ [key]: { ...context, token, awaitSubmit: false, ...(submissionEvidence ? { submissionEvidence } : {}) } });
    }
    return true;
  }
  if (!intentIdPattern.test(intentId || '')) {
    const response = await fetch(workspace + '/api/extension/intents/resolve', {
      ...workspaceRequest(token), method: 'POST', body: JSON.stringify({ url: jobUrl }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.error || 'Could not link this form to your NextKinHR application.');
    }
    ({ intentId } = await response.json());
  } else if (!submittedFromPage) {
    const response = await fetch(workspace + '/api/extension/intents/' + intentId, workspaceRequest(token));
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.error || 'Could not verify this NextKinHR application.');
    }
    const { intent } = await response.json();
    if (tabCandidateId && tabCandidateId !== 'current' && intent?.candidate_id && intent.candidate_id !== tabCandidateId) {
      throw new Error('Select the candidate who started this application.');
    }
  }
  let externalJob;
  if (!intentIdPattern.test(intentId || '')) {
    intentId = null;
    if (url.origin === workspace || /(^|\.)(nextkinhr\.com|jobright-internal\.com)$/.test(url.hostname)) return false;
    externalJob = externalJobDetails(job, url, jobUrl, tabCandidateId);
    if (!externalJob) return false;
  }
  if (!await stillOnApplication()) throw new Error('The application tab changed. Try autofill again.');

  const changed = context?.intentId !== intentId || context?.jobOrigin !== jobOrigin || context.workspace !== workspace
    || (context.applicationUrl && context.applicationUrl !== jobUrl)
    || context.externalJob?.jobUrl !== externalJob?.jobUrl
    || (context.candidateId || context.externalJob?.candidateId) !== (tabCandidateId || externalJob?.candidateId);

  if (changed || submissionEvidence || !context.applicationUrl) {
    const tracking = changed ? { intentId, candidateId: tabCandidateId, externalJob, jobOrigin, workspace, token, accountId, eventKey: crypto.randomUUID() } : { ...context, token };
    await chrome.storage.session.set({ [key]: { ...tracking, candidateId: tabCandidateId, applicationUrl: jobUrl,
      ...(submissionEvidence ? { submissionEvidence } : {}) } });
  }
  await chrome.scripting.executeScript({ target: { tabId }, files: ['application-confirmation.js'] });
  return true;
}

const workspaceLaunchPath = /^\/(?:jobs|dashboard\/outside-jobs)\/[^/]+\/apply\/?$/;

async function watchPortalLaunch(sender, job, actorId, candidateParam) {
  const tabId = sender.tab?.id;
  if (!Number.isInteger(tabId) || sender.frameId !== 0 || !sender.url) return false;
  const launch = new URL(sender.url);
  if (!workspaceLaunchPath.test(launch.pathname)) return false;
  const { origin, token, user, activeCandidateId, accountId } = await getStoredCredentials();
  const workspace = workspaceOrigin(origin);
  if (!workspace || workspaceOrigin(launch.href) !== workspace || !token || (await chrome.tabs.get(tabId)).url !== launch.href) return false;
  if (launch.pathname.startsWith('/dashboard/') && (!actorId || user?.id !== actorId)) return false;
  if (typeof job?.jobUrl !== 'string') return false;
  const destination = new URL(job.jobUrl);
  if (destination.protocol !== 'https:' || destination.username || destination.password || workspaceOrigin(destination.href)) return false;
  const applicationUrl = cleanApplicationUrl(destination);
  const candidateId = intentIdPattern.test(candidateParam || '') ? candidateParam
    : (intentIdPattern.test(job?.candidateId || '') ? job.candidateId
    : (intentIdPattern.test(activeCandidateId || '') ? activeCandidateId : undefined));
  const externalJob = externalJobDetails(job, destination, applicationUrl, candidateId);
  if (!externalJob) return false;
  const key = trackedKey(tabId);
  const current = (await chrome.storage.session.get(key))[key];
  if (current?.applicationUrl === applicationUrl && current.token === token && current.candidateId === candidateId) return true;
  await chrome.storage.session.set({ [key]: {
    intentId: null, candidateId, applicationUrl, externalJob, jobOrigin: portalOrigin(destination),
    workspace, token, accountId, eventKey: crypto.randomUUID(), awaitSubmit: true, launchExpiresAt: Date.now() + 2 * 60 * 60 * 1000,
  } });
  return true;
}

// Job boards such as LinkedIn open the application in a transient modal and keep
// the same posting URL. There is no marketing-intent link to arm tracking, so the
// posting itself is the signal.
function outsideJobPosting(url) {
  return url.protocol === 'https:' && !workspaceOrigin(url.href) &&
    /\/(?:jobs?|careers?|openings?|positions?)\/(?:view|job|detail|posting|apply)\/?\d+/i.test(url.pathname);
}

async function trackApplication(tabId, tabUrl) {
  if (!tabUrl || !/^https:\/\//i.test(tabUrl)) return;
  const url = new URL(tabUrl);
  if (workspaceOrigin(url.href) && workspaceLaunchPath.test(url.pathname)) return;
  const jobOrigin = portalOrigin(url);
  const intentId = new URLSearchParams(url.hash.slice(1)).get('marketing-intent');
  const key = trackedKey(tabId);
  let context = (await chrome.storage.session.get(key))[key];
  if (context?.launchExpiresAt && context.launchExpiresAt <= Date.now()) {
    await chrome.storage.session.remove(key);
    context = null;
  }
  if (context && context.jobOrigin !== jobOrigin && !intentIdPattern.test(intentId || '')) {
    await chrome.storage.session.remove(key);
    return;
  }
  if (intentIdPattern.test(intentId || '') && (intentId !== context?.intentId || jobOrigin !== context?.jobOrigin)) {
    const { origin, token, accountId } = await getStoredCredentials();
    const workspace = workspaceOrigin(origin);
    if (!workspace || !token) return;
    const existingCandidateId = context?.accountId === accountId && context?.workspace === workspace
      ? context.candidateId || context.externalJob?.candidateId : undefined;
    context = { intentId, candidateId: existingCandidateId, jobOrigin, workspace, token, accountId, eventKey: crypto.randomUUID() };
    await chrome.storage.session.set({ [key]: context });
  }
  if (!context && outsideJobPosting(url)) {
    const [capture] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => globalThis.NextkinJobCapture?.read?.() || null,
    }).catch(() => []);
    const job = capture?.result;
    if (job?.title && job?.company) {
      const existingCandidateId = context?.candidateId || context?.externalJob?.candidateId;
      await prepareApplication(tabId, tabUrl, job, existingCandidateId, false).catch(() => {});
      return;
    }
  }
  if (context?.jobOrigin !== jobOrigin || context.reported) return;
  await chrome.scripting.executeScript({ target: { tabId }, files: ['application-confirmation.js'] });
}

if (typeof chrome !== 'undefined' && chrome.tabs?.onUpdated?.addListener) {
  chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
    if (change.status === 'complete' || change.url) {
      void trackApplication(tabId, change.url || tab.url).catch(() => {});
    }
  });
}

if (typeof chrome !== 'undefined' && chrome.tabs?.onRemoved?.addListener) {
  chrome.tabs.onRemoved.addListener(tabId => {
    outsideDiscoveries.delete(trackedKey(tabId));
    outsideDiscoveries.delete(embeddedKey(tabId));
    void chrome.storage.session.remove([trackedKey(tabId), stepKey(tabId), embeddedKey(tabId)]);
  });
}

async function notifyOutsideApplicationSaved(workspace, payload) {
  if (typeof chrome === 'undefined' || !chrome.tabs?.query) return;
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(tabs.flatMap(tab => {
    if (tab.id == null || workspaceOrigin(tab.url) !== workspace || !/^\/dashboard(?:\/|$)/.test(new URL(tab.url).pathname)) return [];
    return [
      chrome.tabs.sendMessage(tab.id, { type: 'NEXTKIN_OUTSIDE_APPLICATION_SAVED', payload }, { frameId: 0 }),
    ];
  }));
}

async function recordConfirmation(message, sender) {
  if (sender.tab?.id == null || !Number.isInteger(sender.frameId) || !sender.url) return false;
  const url = new URL(sender.url);
  const embedded = sender.frameId !== 0;
  const key = embedded ? embeddedKey(sender.tab.id) : trackedKey(sender.tab.id);
  let context = (await chrome.storage.session.get(key))[key];

  // Check 15-minute attempt TTL and pre-submit snapshot
  const attemptKey = `submission_attempt:${sender.tab.id}`;
  const attemptData = (await chrome.storage.session.get(attemptKey).catch(() => ({})))?.[attemptKey];
  const isRecentAttempt = attemptData && Date.now() - attemptData.timestamp <= 15 * 60 * 1000;

  const snapshotKey = `submission_snapshot:${sender.tab.id}`;
  const snapshot = (await chrome.storage.session.get(snapshotKey).catch(() => ({})))?.[snapshotKey];

  const current = await getStoredCredentials();
  const connection = await getQueueConnection();
  if (current.token !== connection.token || workspaceOrigin(current.origin) !== connection.workspace || !connection.accountId) return false;
  const snapshotData = snapshot && matchesQueueAccount(snapshot, connection) ? snapshot : null;

  if (!context) {
    if (isRecentAttempt && matchesQueueAccount(attemptData, connection) && snapshotData) {
      context = {
        workspace: connection.workspace,
        accountId: connection.accountId,
        jobOrigin: portalOrigin(url),
        externalJob: {
          jobTitle: snapshotData.jobTitle,
          companyName: snapshotData.companyName,
          jobLocation: snapshotData.jobLocation,
          jobUrl: snapshotData.jobUrl || sender.url,
          portalSource: snapshotData.portalSource || 'extension',
          candidateId: current.activeCandidateId,
        },
        candidateId: current.activeCandidateId,
        eventKey: snapshotData.eventKey,
      };
    } else {
      return false;
    }
  } else if ((context.launchExpiresAt && context.launchExpiresAt <= Date.now()) ||
    portalOrigin(url) !== context.jobOrigin) {
    return false;
  }
  if (embedded) {
    if (sender.frameId !== context.frameId || sender.documentId !== context.documentId || !sender.tab.url) return false;
    const parent = new URL(sender.tab.url);
    if (parent.href !== context.parentUrl || !matchesEmbeddedPosting(parent, url)) return false;
  }
  if (context.workspace !== connection.workspace || !connection.token ||
    (context.accountId ? context.accountId !== connection.accountId : context.token !== connection.token)) return false;
  if (context.reported) return true;
  const receiptUrl = cleanApplicationUrl(url);

  // Tab-scoped candidate identity
  const tabCandidateId = intentIdPattern.test(context.candidateId || '') ? context.candidateId
    : (intentIdPattern.test(context.externalJob?.candidateId || '') ? context.externalJob.candidateId : undefined);

  let payload = {
    ...context.externalJob,
    confirmationUrl: receiptUrl,
    candidateId: tabCandidateId,
  };

  if (snapshotData) {
    payload = {
      ...payload,
      title: payload.title || payload.jobTitle || snapshotData.jobTitle,
      company: payload.company || payload.companyName || snapshotData.companyName,
      location: payload.location || payload.jobLocation || snapshotData.jobLocation,
      jobUrl: payload.jobUrl || snapshotData.jobUrl,
    };
  }

  if (context.intentId) {
    payload = {
      intentId: context.intentId,
      status: 'confirmed',
      candidateId: tabCandidateId,
      url: receiptUrl,
      applicationUrl: context.applicationUrl,
      observedAt: new Date().toISOString(),
    };
  } else if (!context.externalJob) return false;

  const confirmationBody = {
    ...payload,
    candidateId: tabCandidateId,
    ...context.submissionEvidence,
    eventKey: context.eventKey,
    evidence: message.evidence,
    captureMethod: 'extension-detected',
    atsDetected: Boolean(message.atsDetected),
  };

  const queueItem = sanitizeQueueItem({
    id: context.eventKey,
    workspace: context.workspace,
    accountId: connection.accountId,
    body: confirmationBody,
  }, connection.token);

  const latest = (await chrome.storage.session.get(key).catch(() => ({})))[key];
  if (!latest || latest.eventKey === context.eventKey) {
    await chrome.storage.session.set({ [key]: { ...context, accountId: connection.accountId,
      awaitSubmit: false } }).catch(() => {});
  }

  return persistAndDeliverReceipt(queueItem);

}

async function persistAndDeliverReceipt(item) {
  item = sanitizeQueueItem(item);
  let pending;
  try {
    pending = await enqueueSubmission(item);
  } catch {
    const result = await dispatchSingleItem(item, false).catch(() => null);
    if (result?.success) {
      await updateRecovery(item, false);
      return true;
    }
    await updateRecovery({ ...item, syncStatus: 'SAVE_FAILED' }, true);
    try { scheduleQueueAlarm(60000); } catch {}
    broadcastSyncAlert('NEXTKIN_RECEIPT_SAVE_FAILED', { status: 'SAVE_FAILED', itemId: item.id });
    return false;
  }

  await updateRecovery(item, false);
  if (await isQueuePaused().catch(() => true)) return true;
  if (['AUTH_REQUIRED', 'FORBIDDEN'].includes(pending.syncStatus) || pending.nextRetryAt > Date.now()) return true;
  const result = await dispatchSingleItem(pending).catch(() => null);
  if (result?.success && matchesQueueAccount(item, await getQueueConnection().catch(() => ({})))) {
    void notifyOutsideApplicationSaved(item.workspace).catch(() => {});
  }
  return true;
}

const trustedPanel = sender => sender.id === chrome.runtime.id &&
  Boolean(chrome.runtime.getURL) && sender.url === chrome.runtime.getURL('panel.html');

function trustedWorkspacePage(sender, origin) {
  try {
    return sender.id === chrome.runtime.id && sender.frameId === 0 &&
      Boolean(workspaceOrigin(origin)) && new URL(sender.url).origin === origin;
  } catch {
    return false;
  }
}

function trustedPairingPage(sender, origin) {
  return trustedWorkspacePage(sender, origin);
}

async function disconnectQueueConnection(expected) {
  return withQueueLock(async () => {
    if (expected && !matchesQueueAccount(expected, await getQueueConnection())) return false;
    await chrome.storage.session.remove(['token', 'origin', 'accountId']);
    const session = await chrome.storage.session.get(null);
    await Promise.all([
      chrome.storage.local.remove(['origin', 'token', 'user', 'activeCandidateId', 'candidateProfile', 'savedProfiles', 'resumePreferences']),
      chrome.storage.session.remove(Object.keys(session).filter(key => key !== RECOVERY_KEY)),
    ]);
    return true;
  });
}

const queueActions = new Set([
  'NEXTKIN_GET_QUEUE_STATUS', 'NEXTKIN_GET_SUBMISSION_QUEUE_STATUS',
  'NEXTKIN_RETRY_DEAD_LETTER_ITEM', 'NEXTKIN_CLEAR_DEAD_LETTER_QUEUE',
  'NEXTKIN_CLEAR_CONFLICT_QUEUE', 'NEXTKIN_RETRY_SUBMISSION_QUEUE',
  'NEXTKIN_DISMISS_DEAD_LETTER_ITEM', 'NEXTKIN_DISCONNECT',
]);

async function manageQueue(action, id) {
  const connection = await getQueueConnection();
  const owned = item => matchesQueueAccount(item, connection);
  if (action === 'NEXTKIN_GET_QUEUE_STATUS' || action === 'NEXTKIN_GET_SUBMISSION_QUEUE_STATUS') {
    const [queue, deadLetter, conflicts, recovery, isPaused] = await Promise.all([
      getSubmissionQueue(), getStorageArray(DEAD_LETTER_KEY), getStorageArray(CONFLICT_QUEUE_KEY),
      getRecoveryQueue(), isQueuePaused(connection),
    ]);
    const pending = [...recovery.filter(item => !queue.some(entry => sameQueueItem(entry, item))), ...queue];
    return {
      pendingCount: pending.filter(owned).length,
      deadLetterCount: deadLetter.filter(owned).length,
      conflictCount: conflicts.filter(owned).length,
      ownershipReviewCount: [...queue, ...deadLetter, ...conflicts].filter(item => item.syncStatus === 'OWNERSHIP_REVIEW').length,
      isPaused,
      pending: pending.filter(owned).map(publicQueueItem),
      deadLetter: deadLetter.filter(owned).map(publicQueueItem),
      conflicts: conflicts.filter(owned).map(publicQueueItem),
    };
  }
  if (!connection.token || !connection.accountId || !connection.workspace) return false;
  if (action === 'NEXTKIN_RETRY_SUBMISSION_QUEUE') {
    await unpauseQueue(connection, true);
    scheduleQueueAlarm();
    void processSubmissionQueue();
    return true;
  }
  const key = action === 'NEXTKIN_CLEAR_CONFLICT_QUEUE' ? CONFLICT_QUEUE_KEY : DEAD_LETTER_KEY;
  return withQueueLock(async () => {
    const items = await getStorageArray(key);
    const clear = action === 'NEXTKIN_CLEAR_CONFLICT_QUEUE' || action === 'NEXTKIN_CLEAR_DEAD_LETTER_QUEUE';
    const item = clear ? null : items.find(entry => owned(entry) && entry.id === id);
    if (!clear && !item) return false;
    const remaining = items.filter(entry => !(owned(entry) && (clear || sameQueueItem(entry, item))));
    if (action === 'NEXTKIN_RETRY_DEAD_LETTER_ITEM') {
      const pending = await getSubmissionQueue();
      const retry = { ...item, attempts: 0, nextRetryAt: Date.now(), syncStatus: 'QUEUED' };
      await chrome.storage.local.set({
        [QUEUE_KEY]: [...pending.filter(entry => !sameQueueItem(entry, retry)), retry],
        [key]: remaining,
      });
      scheduleQueueAlarm();
    } else await saveStorageArray(key, remaining);
    return true;
  });
}

const connectedPanels = new Set();
const pendingTracking = new Map();
const pendingSteps = new Map();

if (typeof chrome !== 'undefined' && chrome.runtime?.onConnect?.addListener) {
  chrome.runtime.onConnect.addListener(port => {
    if (port.sender?.id && port.sender.id !== chrome.runtime.id) {
      port.disconnect();
      return;
    }
    if (port.name === 'nextkin_side_panel') {
      connectedPanels.add(port);
      // Broadcast to tabs that side panel is now open
      chrome.tabs.query({}).then(tabs => {
        for (const tab of tabs) {
          if (tab.id) chrome.tabs.sendMessage(tab.id, { type: 'NEXTKIN_SIDE_PANEL_STATE', isOpen: true }).catch(() => {});
        }
      }).catch(() => {});

      port.onDisconnect.addListener(() => {
        connectedPanels.delete(port);
        const isOpen = connectedPanels.size > 0;
        chrome.tabs.query({}).then(tabs => {
          for (const tab of tabs) {
            if (tab.id) chrome.tabs.sendMessage(tab.id, { type: 'NEXTKIN_SIDE_PANEL_STATE', isOpen }).catch(() => {});
          }
        }).catch(() => {});
      });
    }
  });
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage?.addListener) {
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (sender?.id && sender.id !== chrome.runtime.id) {
      return false;
    }
    if (message?.type === 'NEXTKIN_CHECK_CONNECTION') {
      void (async () => {
        try {
          const session = await chrome.storage.session.get(['token', 'origin', 'accountId']).catch(() => ({}));
          const local = await chrome.storage.local.get(['user', 'origin']).catch(() => ({}));
          const accountId = session?.accountId || local?.user?.id;
          const connected = Boolean(
            session?.token &&
            session?.origin === message.origin &&
            accountId &&
            (!session.accountId || session.accountId === local?.user?.id)
          );
          reply({ connected });
        } catch {
          reply({ connected: false });
        }
      })();
      return true;
    }
    if (message?.type === 'queue-submission' && message.payload) {
      void (async () => {
        try {
          const connection = await getQueueConnection();
          const item = sanitizeQueueItem({
            id: message.payload.eventKey || crypto.randomUUID(),
            workspace: connection.workspace,
            accountId: connection.accountId,
            body: message.payload,
          }, connection.token);
          await persistAndDeliverReceipt(item);
          reply(true);
        } catch {
          reply(false);
        }
      })();
      return true;
    }
    if (message?.type === 'NEXTKIN_SET_SUBMISSION_ATTEMPT') {
      const tabId = sender.tab?.id;
      if (tabId != null) {
        const key = `submission_attempt:${tabId}`;
        void getQueueConnection().then(({ workspace, accountId }) =>
          chrome.storage.session.set({ [key]: { timestamp: Date.now(), workspace, accountId } }))
          .then(() => reply({ success: true }), (err) => reply({ error: err.message }));
        return true;
      }
      reply({ error: 'No tab id' });
      return false;
    }
    if (message?.type === 'NEXTKIN_SET_JOB_SNAPSHOT') {
      const tabId = sender.tab?.id;
      if (tabId != null) {
        const key = `submission_snapshot:${tabId}`;
        void getQueueConnection().then(async ({ workspace, accountId }) => {
          const prior = (await chrome.storage.session.get(key))[key];
          const eventKey = prior?.eventKey && prior.workspace === workspace && prior.accountId === accountId &&
            prior?.jobUrl === message.payload?.jobUrl ? prior.eventKey : crypto.randomUUID();
          await chrome.storage.session.set({ [key]: { ...(message.payload || {}), workspace, accountId,
            eventKey, updatedAt: Date.now() } });
        })
          .then(() => reply({ success: true }), (err) => reply({ error: err.message }));
        return true;
      }
      reply({ error: 'No tab id' });
      return false;
    }
    if (message?.type === 'NEXTKIN_FETCH_RESUME_FILE') {
      void (async () => {
        try {
          const { origin, token, activeCandidateId } = await getStoredCredentials();
          const candidateId = message.candidateId || activeCandidateId;
          if (!origin || !token) {
            reply({ error: 'Extension is not connected to a server.' });
            return;
          }
          if (!candidateId) {
            reply({ error: 'No active candidate profile selected.' });
            return;
          }
          const res = await fetch(`${origin}/api/extension/resume-file?candidateId=${encodeURIComponent(candidateId)}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            reply({ error: err.error || `Resume fetch failed (${res.status})` });
            return;
          }
          const data = await res.json();
          reply(data);
        } catch (err) {
          reply({ error: err.message });
        }
      })();
      return true;
    }
    if (message?.type === 'NEXTKIN_BROADCAST_AUTOFILL_CHILD_FRAMES') {
      const tabId = sender.tab?.id;
      if (tabId != null) {
        chrome.tabs.sendMessage(tabId, { type: 'NEXTKIN_TRIGGER_AUTOFILL' }).catch(() => {});
        reply({ success: true });
        return true;
      }
      reply({ error: 'No tab id' });
      return false;
    }
    if (message?.type === 'NEXTKIN_SAVE_CONNECTION') {
      const { token, user, origin } = message;
      if (!trustedPairingPage(sender, origin) || typeof user?.id !== 'string' || !user.id ||
        typeof token !== 'string' || !/^[A-Za-z0-9_-]{20,128}$/.test(token)) {
        reply(false);
        return false;
      }
      void (async () => {
        await withQueueLock(async () => {
          const current = await chrome.storage.local.get(['origin', 'user']);
          const accountChanged = current.origin !== origin || current.user?.id !== user.id;
          await chrome.storage.session.set({ token, origin, accountId: user.id });
          await chrome.storage.local.set({
            origin,
            user: { id: user.id, name: user.name, email: user.email },
            ...(accountChanged ? { activeCandidateId: null } : {}),
          });
          await chrome.storage.local.remove('token').catch(() => {});
        });
        await unpauseQueue({ token, workspace: workspaceOrigin(origin), accountId: user.id }).catch(() => {});
        scheduleQueueAlarm();
        void processSubmissionQueue();
      })().then(() => reply(true), () => reply(false));
      return true;
    }
    if (message?.type === 'NEXTKIN_REVOKE_CONNECTION') {
      if (!trustedWorkspacePage(sender, message.origin) || typeof message.accountId !== 'string' || !message.accountId) {
        reply(false);
        return false;
      }
      const expected = { accountId: message.accountId, workspace: workspaceOrigin(message.origin) };
      void disconnectQueueConnection(expected).then(reply, () => reply(false));
      return true;
    }
    const queueAction = message?.action === 'get_submission_queue_status' ? 'NEXTKIN_GET_QUEUE_STATUS' : message?.type;
    if (queueActions.has(queueAction)) {
      if (!trustedPanel(sender)) {
        reply(false);
        return false;
      }
      if (queueAction === 'NEXTKIN_DISCONNECT') {
        void disconnectQueueConnection().then(reply, () => reply(false));
        return true;
      }
      void manageQueue(queueAction, message.id).then(reply, () => reply(false));
      return true;
    }
    if (message?.type === 'embedded-application-document') {
      void resumeEmbeddedTracking(sender).then(() => reply(true), () => reply(false));
      return true;
    }
    if (message?.action === 'load_application_profile' && sender.tab?.id != null) {
      void (async () => {
        let candId = message.candidateId;
        if (!intentIdPattern.test(candId || '')) {
          const tabId = sender.tab.id;
          const tabContext = await chrome.storage.session.get([trackedKey(tabId), embeddedKey(tabId)]);
          const tabScope = tabContext[trackedKey(tabId)] || tabContext[embeddedKey(tabId)];
          candId = tabScope?.candidateId || tabScope?.externalJob?.candidateId;
        }
        if (!intentIdPattern.test(candId || '')) {
          const creds = await getStoredCredentials();
          candId = creds.activeCandidateId;
        }
        return loadSavedProfile(candId);
      })().then(reply, () => reply(null));
      return true;
    }
    if (sender.frameId === 0 && sender.tab?.id != null && sender.documentId && /^https:\/\//.test(sender.url || '')) {
      const tabId = sender.tab.id;
      if (message?.action === 'queue_application_step') {
        const pending = queueApplicationStep(tabId, sender, message);
        pendingSteps.set(tabId, pending);
        void pending.then(() => reply(true), () => reply(false)).finally(() => {
          if (pendingSteps.get(tabId) === pending) pendingSteps.delete(tabId);
        });
        return true;
      }
      if (message?.action === 'claim_application_step') {
        void claimApplicationStep(tabId, sender).then(reply, () => reply(null));
        return true;
      }
      if (message?.action === 'clear_application_step') {
        void (async () => {
          await pendingSteps.get(tabId);
          const key = stepKey(tabId);
          const step = (await chrome.storage.session.get(key))[key];
          if (step?.documentId === sender.documentId) {
            await chrome.storage.session.remove(key);
            const url = new URL(sender.url);
            if (sameApplicationStepScope(new URL(step.formUrl), url)) await continueTracking(tabId, step, url);
          }
        })().then(() => reply(true), () => reply(false));
        return true;
      }
    }
    if (message?.type === 'application-intent-opened' && sender.frameId === 0
      && Number.isInteger(sender.tab?.id) && typeof message.url === 'string') {
      try {
        const url = new URL(message.url);
        const documentUrl = new URL(sender.url);
        url.hash = '';
        documentUrl.hash = '';
        if (url.href === documentUrl.href) void trackApplication(sender.tab.id, message.url).catch(() => {});
      } catch {}
      return false;
    }
    if (message?.type === 'NEXTKIN_OUTSIDE_APPLICATION_SAVED' && sender.url === chrome.runtime.getURL('panel.html')) {
      void (async () => {
        const { origin } = await getStoredCredentials();
        const workspace = workspaceOrigin(origin);
        return workspace ? notifyOutsideApplicationSaved(workspace) : undefined;
      })().then(() => reply(true), () => reply(false));
      return true;
    }
    if (message?.type === 'NEXTKIN_APPLICATION_WATCH') {
      const tabId = sender.tab?.id;
      if (tabId == null) return false;
      const tracking = Promise.resolve(pendingTracking.get(tabId)).catch(() => {}).then(() => watchPortalLaunch(sender, message.job, message.actorId, message.candidateId));
      pendingTracking.set(tabId, tracking);
      void tracking.then(watching => reply({ watching }), () => reply({ watching: false })).finally(() => {
        if (pendingTracking.get(tabId) === tracking) pendingTracking.delete(tabId);
      });
      return true;
    }
    if (message?.action === 'prepare_application_tracking' && typeof message.url === 'string') {
      const panel = sender.url === chrome.runtime.getURL('panel.html');
      const embeddedSubmit = sender.frameId > 0 && sender.documentId && sender.tab?.url && message.submitted === true;
      const applicationPage = sender.url === message.url && (sender.frameId === 0 || embeddedSubmit);
      const tabId = panel ? message.tabId : applicationPage ? sender.tab?.id : undefined;
      if (!Number.isInteger(tabId)) return false;
      const submitted = applicationPage && message.submitted === true;
      const embedded = panel ? message.embeddedFrame : applicationPage && embeddedSubmit && {
        frameId: sender.frameId, documentId: sender.documentId, url: sender.url,
      };
      const tracking = embedded
        ? Promise.resolve(pendingTracking.get(tabId)).catch(() => {}).then(() =>
          prepareEmbeddedOutsideApplication(tabId, panel ? message.url : sender.tab.url, embedded, message.job,
            panel ? message.candidateId : undefined, submitted, submitted ? message.submissionEvidence : undefined))
        : prepareApplication(tabId, message.url, message.job, message.candidateId,
          submitted, submitted ? message.submissionEvidence : undefined);
      pendingTracking.set(tabId, tracking);
      void tracking.then(
        async tracked => {
          const key = embedded ? embeddedKey(tabId) : trackedKey(tabId);
          let outsideJobUrl;
          if (tracked) {
            if (submitted || (panel && message.discover === true)) await saveOutsideDiscovery(key).catch(() => {});
            if (panel) outsideJobUrl = (await chrome.storage.session.get(key))[key]?.externalJob?.jobUrl;
          }
          reply({ tracked, outsideJobUrl });
        },
      ).catch(error => reply({ error: error.message })).finally(() => {
        if (pendingTracking.get(tabId) === tracking) pendingTracking.delete(tabId);
      });
      return true;
    }
    if (message?.action === 'check_side_panel_state') {
      reply({ isOpen: connectedPanels.size > 0 });
      return false;
    }
    if (message?.action === 'open_side_panel') {
      if (chrome.sidePanel?.open && sender.tab?.id) {
        chrome.sidePanel.open({ tabId: sender.tab.id }).catch(() => {
          if (sender.tab?.windowId) {
            chrome.sidePanel.open({ windowId: sender.tab.windowId }).catch(() => {});
          }
        });
        if (sender.tab.id) {
          chrome.tabs.sendMessage(sender.tab.id, { type: 'NEXTKIN_SIDE_PANEL_STATE', isOpen: true }).catch(() => {});
        }
        reply(true);
        return true;
      }
      reply(false);
      return false;
    }
    if (message?.type !== 'application-confirmation' || typeof message.evidence !== 'string' || message.evidence.length > 200) return;
    void (async () => {
      try {
        const tracking = pendingTracking.get(sender.tab?.id);
        if (tracking && !await tracking) { reply(false); return; }
        reply(await recordConfirmation(message, sender));
      }
      catch { reply(false); }
    })();
    return true;
  });
}
