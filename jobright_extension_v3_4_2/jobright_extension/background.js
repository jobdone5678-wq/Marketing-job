try {
  if (typeof importScripts === 'function') {
    importScripts('core/site-registry.js', 'core/site-rules.js');
  }
} catch {}

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
  if (body.appliedResume && typeof body.appliedResume === 'object') {
    const { filename, mimeType, sizeBytes, resumeId, contentHash } = body.appliedResume;
    body.appliedResume = { filename, mimeType, sizeBytes, resumeId, contentHash };
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
  return Boolean(item && connection.token && connection.workspace && connection.accountId &&
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
      if ((k.startsWith('application-intent:') || k.startsWith('embedded-outside-application:') || k.startsWith('submission_attempt:')) &&
        v?.eventKey === item.id && v.workspace === item.workspace && v.accountId === item.accountId) {
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
  if (intentId && (!intentIdPattern.test(intentId) || !Number.isInteger(item.body.attempt) || item.body.attempt < 1)) {
    if (allowQueueUpdates) await moveSubmission(item, DEAD_LETTER_KEY, 'VALIDATION_FAILED');
    return { success: false, error: 'SUBMISSION_ATTEMPT_REQUIRED' };
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
    // Failed / pending-verification observations are terminal deliveries too: the backend recorded
    // them, so dequeue without treating the application as reported or submitted.
    const isObservation = isIntent && ['failed', 'submit_attempted'].includes(item.body?.status);
    const isSuccess = isIntent
      ? ['submitted', 'confirmed', 'failed', 'submit_attempted'].includes(data?.status)
      : data?.success === true;

    if (isSuccess) {
      await updateQueueItem(item, () => null).catch(() => {});
      if (!isObservation) await markSessionReported(item);
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
    accountId = local.user?.id;
    try {
      if (chrome.storage?.session?.set) {
        await chrome.storage.session.set({
          token: sessionToken,
          ...(accountId ? { accountId } : {}),
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
const attemptStateKey = tabId => 'application-attempt-state:' + tabId;
const submissionKey = (tabId, frameId) => 'submission_attempt:' + tabId + ':' + frameId;
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
  if (typeof globalThis.NextkinSiteRegistry?.canonicalOrigin === 'function') {
    return globalThis.NextkinSiteRegistry.canonicalOrigin(url) || url.origin;
  }
  return url.origin === 'https://job-boards.greenhouse.io' ? 'https://boards.greenhouse.io' : url.origin;
}

const PRESERVED_JOB_PARAMS = new Set(['gh_jid', 'jobid', 'job_id', 'jk', 'requisition', 'req_id', 'id']);

function cleanApplicationUrl(url) {
  if (!url) return '';
  if (typeof globalThis.NextkinSiteRegistry?.cleanApplicationUrl === 'function') {
    return globalThis.NextkinSiteRegistry.cleanApplicationUrl(url);
  }
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

async function applicationScope(sender) {
  const tabId = sender.tab?.id;
  if (!Number.isInteger(tabId) || !Number.isInteger(sender.frameId) || !sender.documentId ||
    !/^https:\/\//.test(sender.url || '') || globalThis.NextkinSiteRegistry?.isExcludedUrl?.(sender.url)) return null;
  const connection = await getQueueConnection();
  if (!connection.token || !connection.accountId || !connection.workspace) return null;
  const trackingKey = sender.frameId ? embeddedKey(tabId) : trackedKey(tabId);
  const stateKey = attemptStateKey(tabId);
  const stored = await chrome.storage.session.get([trackingKey, stateKey]);
  const tracking = stored[trackingKey];
  const states = stored[stateKey] || {};
  const state = states[sender.frameId];
  const formUrl = tracking?.applicationUrl || tracking?.externalJob?.jobUrl;
  const tracked = matchesQueueAccount(tracking, connection) && formUrl &&
    (!sender.frameId || (tracking.frameId === sender.frameId && tracking.documentId === sender.documentId)) &&
    sameApplicationStepScope(new URL(formUrl), new URL(sender.url));
  const bound = matchesQueueAccount(state, connection) && state.documentId === sender.documentId &&
    sameApplicationStepScope(new URL(state.formUrl), new URL(sender.url));
  return { connection, tracking: tracked ? tracking : null, state: bound ? state : null, states, stateKey };
}

const attemptLocks = new Map();
function withAttemptLock(tabId, fn) {
  const prev = attemptLocks.get(tabId) || Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  attemptLocks.set(tabId, next);
  return next.finally(() => {
    if (attemptLocks.get(tabId) === next) attemptLocks.delete(tabId);
  });
}

const VALID_ATTEMPT_TRANSITIONS = {
  DRAFT: new Set(['DRAFT', 'FILLING', 'REVIEW_REQUIRED', 'FAILED']),
  FILLING: new Set(['FILLING', 'REVIEW_REQUIRED', 'READY_TO_SUBMIT', 'FAILED']),
  REVIEW_REQUIRED: new Set(['REVIEW_REQUIRED', 'FILLING', 'READY_TO_SUBMIT', 'SUBMITTING', 'PENDING_VERIFICATION', 'FAILED']),
  READY_TO_SUBMIT: new Set(['READY_TO_SUBMIT', 'FILLING', 'REVIEW_REQUIRED', 'SUBMITTING', 'PENDING_VERIFICATION', 'FAILED']),
  SUBMITTING: new Set(['SUBMITTING', 'PENDING_VERIFICATION', 'SUBMITTED', 'REVIEW_REQUIRED', 'FAILED']),
  PENDING_VERIFICATION: new Set(['PENDING_VERIFICATION', 'SUBMITTED', 'REVIEW_REQUIRED', 'FAILED']),
  SUBMITTED: new Set(['SUBMITTED']),
  FAILED: new Set(['FAILED', 'DRAFT', 'FILLING', 'REVIEW_REQUIRED']),
};

async function storeAttempt(message, sender) {
  const tabId = sender.tab?.id;
  if (!Number.isInteger(tabId)) return false;
  return withAttemptLock(tabId, async () => {
    const scope = await applicationScope(sender);
    if (!scope) return false;
    const { connection, tracking, state, states, stateKey } = scope;
    const { frameId, documentId, url } = sender;
    if (message.type === 'NEXTKIN_CLEAR_ATTEMPT') {
      if (states[frameId]?.documentId !== documentId || states[frameId]?.attemptId !== message.attemptId) return false;
      delete states[frameId];
    } else {
      const context = message.payload?.context;
      const nextStatus = message.payload?.application_status || 'DRAFT';
      const prevStatus = state?.attemptId === context?.attemptId ? state?.applicationStatus : null;
      if (!intentIdPattern.test(context?.attemptId || '') || !intentIdPattern.test(context.candidateId || '') ||
        (tracking?.candidateId && tracking.candidateId !== context.candidateId) ||
        (prevStatus && VALID_ATTEMPT_TRANSITIONS[prevStatus] && !VALID_ATTEMPT_TRANSITIONS[prevStatus].has(nextStatus)) ||
        (state?.attemptId === context.attemptId && (state.candidateId !== context.candidateId ||
          state.jobKey !== context.jobKey || state.profileVersion !== context.profileVersion || state.resumeDocumentId !== context.resumeDocumentId))) return false;
      states[frameId] = {
        workspace: connection.workspace, accountId: connection.accountId,
        tabId: sender.tab.id, frameId, documentId, formUrl: url,
        attemptId: context.attemptId, eventKey: tracking?.eventKey,
        jobKey: context.jobKey, candidateId: context.candidateId, profileVersion: context.profileVersion,
        resumeDocumentId: context.resumeDocumentId, applicationStatus: nextStatus,
        requiresReview: Boolean(message.payload.requiresReview || (state?.attemptId === context.attemptId && state.requiresReview)),
        syncStatus: message.payload.sync_status, updatedAt: Date.now(),
      };
    }
    await chrome.storage.session.set({ [stateKey]: states });
    return true;
  });
}

async function automationDisabled(url, activeOnly = false) {
  const rules = globalThis.NextkinSiteRules;
  if (!rules) return false;
  const { workspace, token, accountId } = await getQueueConnection();
  const entry = workspace && token ? await rules.getWorkspaceRules(workspace, token, accountId) : null;
  return rules.automationDisabled(url, activeOnly, entry);
}

async function markSubmission(sender, attemptId) {
  const scope = await applicationScope(sender);
  const context = scope?.tracking;
  if (!context || context.reported || (attemptId && scope.state?.attemptId !== attemptId)) return false;
  const { connection, state } = scope;
  let candidateId = context.candidateId;
  let attempt;
  if (context.intentId) {
    const response = await fetch(connection.workspace + '/api/extension/intents/' + context.intentId,
      workspaceRequest(connection.token)).catch(() => null);
    const { intent } = response?.ok ? await response.json() : {};
    if (intent?.id !== context.intentId || !Number.isInteger(intent?.attempt) ||
      (candidateId && intent.candidate_id !== candidateId)) return false;
    candidateId = intent.candidate_id;
    attempt = Math.max(1, intent.attempt);
  }
  if (!intentIdPattern.test(candidateId || '') || (state && state.candidateId !== candidateId)) return false;
  const current = await getQueueConnection();
  if (!matchesQueueAccount(context, current)) return false;
  const { token: _token, ...receiptContext } = context;
  const key = submissionKey(sender.tab.id, sender.frameId);
  const previous = (await chrome.storage.session.get(key))[key];
  if (previous?.eventKey === context.eventKey && previous.documentId === sender.documentId &&
    previous.attemptId === (state?.attemptId || context.eventKey) && Date.now() - previous.timestamp < 15000) return true;
  await chrome.storage.session.set({ [key]: {
    ...receiptContext, candidateId, attempt, timestamp: Date.now(),
    frameId: sender.frameId, documentId: sender.documentId, applicationUrl: cleanApplicationUrl(sender.url),
    jobKey: state?.jobKey || context.externalJob?.externalId || cleanApplicationUrl(sender.url),
    attemptId: state?.attemptId || context.eventKey, profileVersion: state?.profileVersion,
    resumeDocumentId: state?.resumeDocumentId,
  } });
  return true;
}

async function readSubmissionAttempt(sender) {
  const tabId = sender.tab?.id;
  if (!Number.isInteger(tabId) || !Number.isInteger(sender.frameId) || !sender.url) return null;
  const key = submissionKey(tabId, sender.frameId);
  const marker = (await chrome.storage.session.get(key))[key];
  if (!marker || Date.now() - marker.timestamp > 15 * 60 * 1000 ||
    portalOrigin(new URL(sender.url)) !== marker.jobOrigin ||
    !matchesQueueAccount(marker, await getQueueConnection())) return null;
  return marker;
}

async function loadSavedProfile(candidateId) {
  if (!intentIdPattern.test(candidateId || '')) return null;
  const query = new URLSearchParams({ savedOnly: 'true', candidateId });
  const data = await loadApplicationData('candidates?' + query);
  const profile = data?.candidates?.[0];
  const facts = profile?.confirmed_facts;
  if (profile?.id !== candidateId || profile?.provenance_status !== 'confirmed' || !facts?.full_name ||
    String(facts.notes || '').startsWith('Profile created from an uploaded resume.')) return null;
  return profile;
}

async function queueApplicationStep(tabId, sender, message) {
  const scope = await applicationScope(sender);
  if (!scope?.state || scope.state.candidateId !== message.candidateId ||
    scope.state.resumeDocumentId !== (message.resumeDocumentId || null) ||
    await automationDisabled(sender.url)) return false;
  const { workspace, accountId } = scope.connection;
  const step = {
    workspace, accountId, formUrl: sender.url, documentId: sender.documentId,
    attemptId: scope.state.attemptId, jobKey: scope.state.jobKey, eventKey: scope.state.eventKey || scope.tracking?.eventKey || null,
    candidateId: message.candidateId, profileVersion: scope.state.profileVersion, requiresReview: scope.state.requiresReview, expiresAt: Date.now() + 30000,
    resumeDocumentId: intentIdPattern.test(message.resumeDocumentId || '') ? message.resumeDocumentId : null,
  };
  await chrome.storage.session.set({ [stepKey(tabId)]: step });
}

function sameApplicationStepScope(previous, current) {
  if (portalOrigin(previous) !== portalOrigin(current)) return false;
  const base = path => path.replace(/\/(?:apply|application|applyjob)(?:\/.*)?$/i, '').replace(/\/$/, '');
  const previousKey = new URL(cleanApplicationUrl(new URL(previous)));
  const currentKey = new URL(cleanApplicationUrl(new URL(current)));
  if (previousKey.search !== currentKey.search) return false;
  const previousJob = globalThis.NextkinSiteRegistry?.extractIdentifiers?.(previous.href)?.requisitionId;
  const currentJob = globalThis.NextkinSiteRegistry?.extractIdentifiers?.(current.href)?.requisitionId;
  if ((previousJob || currentJob) && previousJob !== currentJob) return false;
  const [previousRoute, previousHashQuery] = previousKey.hash.split('?');
  const [currentRoute, currentHashQuery] = currentKey.hash.split('?');
  if (previousHashQuery !== currentHashQuery) return false;
  if ((previousRoute || currentRoute) && base(previousRoute) !== base(currentRoute)) return false;
  return previous.pathname === current.pathname || base(previous.pathname) === base(current.pathname);
}

async function continueTracking(tabId, step, url) {
  const key = trackedKey(tabId);
  const context = (await chrome.storage.session.get(key))[key];
  if (context?.applicationUrl === cleanApplicationUrl(new URL(step.formUrl)) && context.workspace === step.workspace && context.accountId === step.accountId && context.candidateId === step.candidateId) {
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
  const current = await getQueueConnection();
  if (!sameApplicationStepScope(new URL(step.formUrl), url) || !matchesQueueAccount(step, current) || !current.token || await automationDisabled(sender.url) ||
    /(?:login|sign[-_]?in|register|creat(?:e|ing)[-_]?account)(?:$|[/_-])/i.test(url.pathname)) return null;
  const [profile, resume] = await Promise.all([
    loadSavedProfile(step.candidateId),
    step.resumeDocumentId ? loadApplicationData('resume?' + new URLSearchParams({ documentId: step.resumeDocumentId, candidateId: step.candidateId })).catch(() => null) : null,
  ]);
  if (!profile || (profile.version ?? 1) !== (step.profileVersion ?? 1)) return null;
  if (!matchesQueueAccount(step, await getQueueConnection())) return null;
  await continueTracking(tabId, step, url);
  return {
    profile, resume, resumeDocumentId: step.resumeDocumentId, requiresReview: step.requiresReview,
    attemptId: step.attemptId || null, jobKey: step.jobKey || null, eventKey: step.eventKey || null,
  };
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
  const { origin, token, accountId } = await getStoredCredentials();
  const workspace = workspaceOrigin(origin);
  if (!workspace || !token || (await chrome.tabs.get(tabId)).url !== tabUrl) return false;

  const key = embeddedKey(tabId);
  const storage = await chrome.storage.session.get([key, trackedKey(tabId)]);
  const top = storage[trackedKey(tabId)];
  if (top?.intentId && top.accountId === accountId && top.jobOrigin === portalOrigin(parent)) {
    if (candidateId && top.candidateId && top.candidateId !== candidateId) {
      throw new Error('Select the candidate who started this application.');
    }
    if (storage[key]) await chrome.storage.session.remove(key);
    return true;
  }
  const previous = storage[key]?.accountId === accountId ? storage[key] : undefined;
  const jobUrl = cleanApplicationUrl(new URL(url));
  const sameForm = previous?.documentId === frame.documentId && previous.parentUrl === parent.href && previous.externalJob?.jobUrl === jobUrl &&
    previous.token === token && previous.workspace === workspace;

  // Reuse a candidate only within the same embedded application document.
  const existingTabCandidate = (intentIdPattern.test(previous?.candidateId || '') ? previous.candidateId : null)
    || (intentIdPattern.test(previous?.externalJob?.candidateId || '') ? previous.externalJob.candidateId : null)
    || (top?.accountId === accountId && intentIdPattern.test(top?.candidateId || '') ? top.candidateId : null)
    || (top?.accountId === accountId && intentIdPattern.test(top?.externalJob?.candidateId || '') ? top.externalJob.candidateId : null);

  const selectedCandidate = (intentIdPattern.test(candidateId || '') ? candidateId : null)
    || (sameForm ? existingTabCandidate : null);
  if (!intentIdPattern.test(selectedCandidate || '')) return false;

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
  if (!context || !await readSubmissionAttempt(sender) || context.reported || context.frameId !== sender.frameId || context.documentId === sender.documentId ||
    context.parentUrl !== sender.tab.url) return;
  const url = new URL(sender.url);
  if (portalOrigin(url) !== context.jobOrigin || !matchesEmbeddedPosting(new URL(sender.tab.url), url)) return;
  await chrome.storage.session.set({ [key]: { ...context, documentId: sender.documentId } });
  await chrome.scripting.executeScript({ target: { tabId, documentIds: [sender.documentId] }, files: ['application-confirmation.js'], injectImmediately: true });
}

async function saveOutsideDiscovery(key) {
  const context = (await chrome.storage.session.get(key))[key];
  if (!context?.externalJob || context.externalJob.jobDescription.length < 10 || context.reported || outsideDiscoveries.get(key) === context.eventKey) return;
  const current = await getStoredCredentials();
  if (!matchesQueueAccount(context, { workspace: workspaceOrigin(current.origin), token: current.token, accountId: current.accountId })) return;
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
        description: job.jobDescription,
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
  const { origin, token, accountId } = await getStoredCredentials();
  const workspace = workspaceOrigin(origin);
  if (!workspace || !token) return false;

  let intentId = new URLSearchParams(url.hash.slice(1)).get('marketing-intent');
  const linkedIntent = intentIdPattern.test(intentId || '');
  const jobUrl = cleanApplicationUrl(url);
  const key = trackedKey(tabId);
  const savedContext = (await chrome.storage.session.get(key))[key];
  const context = savedContext?.accountId === accountId && savedContext?.workspace === workspace ? savedContext : undefined;

  // Tab-scoped candidate identity to prevent cross-tab profile bleed
  const existingTabCandidate = (intentIdPattern.test(context?.candidateId || '') ? context.candidateId : null)
    || (intentIdPattern.test(context?.externalJob?.candidateId || '') ? context.externalJob.candidateId : null);

  let tabCandidateId = (intentIdPattern.test(candidateId || '') ? candidateId : null)
    || (context?.applicationUrl && sameApplicationStepScope(new URL(context.applicationUrl), url) ? existingTabCandidate : null);

  if (submittedFromPage && context && context.workspace === workspace && token && (
    (!candidateId || context.candidateId === candidateId) && (context.applicationUrl === jobUrl ||
    (context.awaitSubmit && context.applicationUrl && sameApplicationStepScope(new URL(context.applicationUrl), url)))
  )) {
    if (context.reported) return false;
    if (submissionEvidence || context.awaitSubmit) {
      await chrome.storage.session.set({ [key]: { ...context, token, applicationUrl: jobUrl, awaitSubmit: false, ...(submissionEvidence ? { submissionEvidence } : {}) } });
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
  }
  if (intentIdPattern.test(intentId || '')) {
    const response = await fetch(workspace + '/api/extension/intents/' + intentId, workspaceRequest(token));
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.error || 'Could not verify this NextKinHR application.');
    }
    const { intent } = await response.json();
    if (!intentIdPattern.test(intent?.candidate_id || '')) return false;
    if (linkedIntent) {
      const job = Array.isArray(intent.job) ? intent.job[0] : intent.job;
      if (!job?.application_url || !sameApplicationStepScope(new URL(job.application_url), url)) {
        throw new Error('This form does not match the NextKinHR application.');
      }
    }
    if (tabCandidateId && intent?.candidate_id !== tabCandidateId) {
      throw new Error('Select the candidate who started this application.');
    }
    tabCandidateId = intent?.candidate_id;
  }
  let externalJob;
  if (!intentIdPattern.test(intentId || '')) {
    intentId = null;
    if (url.origin === workspace || /(^|\.)(nextkinhr\.com|jobright-internal\.com)$/.test(url.hostname)) return false;
    if (!intentIdPattern.test(tabCandidateId || '')) return false;
    externalJob = externalJobDetails(job, url, jobUrl, tabCandidateId);
    if (!externalJob) return false;
  }
  if (!await stillOnApplication()) throw new Error('The application tab changed. Try autofill again.');

  const changed = context?.intentId !== intentId || context?.jobOrigin !== jobOrigin || context?.workspace !== workspace
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
  const { origin, token, user, accountId } = await getStoredCredentials();
  const workspace = workspaceOrigin(origin);
  if (!workspace || workspaceOrigin(launch.href) !== workspace || !token || (await chrome.tabs.get(tabId)).url !== launch.href) return false;
  if (launch.pathname.startsWith('/dashboard/') && (!actorId || user?.id !== actorId)) return false;
  if (typeof job?.jobUrl !== 'string') return false;
  const destination = new URL(job.jobUrl);
  if (destination.protocol !== 'https:' || destination.username || destination.password || workspaceOrigin(destination.href)) return false;
  const applicationUrl = cleanApplicationUrl(destination);
  const candidateId = intentIdPattern.test(candidateParam || '') ? candidateParam
    : (intentIdPattern.test(job?.candidateId || '') ? job.candidateId : undefined);
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
    void (async () => {
      const all = await chrome.storage.session.get(null);
      const markers = Object.keys(all).filter(key => key.startsWith('submission_attempt:' + tabId + ':'));
      await chrome.storage.session.remove([trackedKey(tabId), stepKey(tabId), embeddedKey(tabId), attemptStateKey(tabId), ...markers]);
    })().catch(() => {});
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
  const context = await readSubmissionAttempt(sender);
  const status = message.status || 'SUBMITTED';
  // SUBMITTED is a success receipt; FAILED and PENDING_VERIFICATION are still meaningful
  // observations and must be recorded instead of silently discarded.
  if (!context || !['SUBMITTED', 'FAILED', 'PENDING_VERIFICATION'].includes(status)) return false;
  const connection = await getQueueConnection();
  if (!matchesQueueAccount(context, connection)) return false;
  const latestContext = (await chrome.storage.session.get(key))[key];
  if (latestContext && latestContext.eventKey !== context.eventKey) return false;
  if (context.launchExpiresAt && context.launchExpiresAt <= Date.now()) return false;
  if (latestContext?.reported || context.reported) return true;
  const observedId = globalThis.NextkinSiteRegistry?.extractIdentifiers?.(url.href)?.requisitionId;
  const expectedId = globalThis.NextkinSiteRegistry?.extractIdentifiers?.(context.applicationUrl)?.requisitionId || context.externalJob?.externalId;
  if (observedId && expectedId && String(observedId).toLowerCase() !== String(expectedId).toLowerCase()) return false;
  if (embedded) {
    if (sender.frameId !== context.frameId || !sender.tab.url || sender.documentId !== (latestContext?.documentId || context.documentId)) return false;
    const parent = new URL(sender.tab.url);
    if (parent.href !== context.parentUrl || !matchesEmbeddedPosting(parent, url)) return false;
  }
  const receiptUrl = cleanApplicationUrl(url);

  // Tab-scoped candidate identity
  const tabCandidateId = context.candidateId;
  if (status !== 'SUBMITTED') {
    // Do not clear awaitSubmit or mark the attempt reported: the candidate may still submit.
    const observedStatus = status === 'FAILED' ? 'failed' : 'submit_attempted';
    const observedBody = context.intentId
      ? {
          intentId: context.intentId,
          attempt: context.attempt,
          status: observedStatus,
          candidateId: tabCandidateId,
          url: receiptUrl,
          applicationUrl: context.applicationUrl,
          observedAt: new Date().toISOString(),
          eventKey: context.eventKey,
          evidence: message.evidence || (status === 'FAILED' ? 'Submission failed' : 'Pending verification on page navigation'),
          captureMethod: 'extension-detected',
          atsDetected: Boolean(message.atsDetected),
        }
      : {
          ...(context.externalJob || {}),
          status: observedStatus,
          confirmationUrl: receiptUrl,
          candidateId: tabCandidateId,
          eventKey: context.eventKey,
          evidence: message.evidence || (status === 'FAILED' ? 'Submission failed' : 'Pending verification on page navigation'),
          captureMethod: 'extension-detected',
          atsDetected: Boolean(message.atsDetected),
        };
    const observedItem = sanitizeQueueItem({
      id: context.eventKey + ':' + observedStatus,
      workspace: context.workspace,
      accountId: connection.accountId,
      body: observedBody,
    }, connection.token);
    return persistAndDeliverReceipt(observedItem);
  }

  let payload = {
    ...context.externalJob,
    confirmationUrl: receiptUrl,
    candidateId: tabCandidateId,
  };

  if (context.intentId) {
    payload = {
      intentId: context.intentId,
      attempt: context.attempt,
      status: 'confirmed',
      candidateId: tabCandidateId,
      url: receiptUrl,
      applicationUrl: context.applicationUrl,
      observedAt: new Date().toISOString(),
    };
  } else if (!context.externalJob) return false;

  const confirmationBody = {
    ...payload,
    ...context.submissionEvidence,
    candidateId: tabCandidateId,
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

const connectedPanels = new Map();
const pendingTracking = new Map();
const pendingSteps = new Map();

if (typeof chrome !== 'undefined' && chrome.runtime?.onConnect?.addListener) {
  chrome.runtime.onConnect.addListener(port => {
    if (port.sender?.id && port.sender.id !== chrome.runtime.id) {
      port.disconnect();
      return;
    }
    if (port.name !== 'nextkin_side_panel' || port.sender?.url !== chrome.runtime.getURL('panel.html')) return;
    const ping = tabId => {
      if (!Number.isInteger(tabId)) return;
      const isOpen = [...connectedPanels.values()].includes(tabId);
      void chrome.tabs.sendMessage(tabId, { type: 'NEXTKIN_SIDE_PANEL_STATE', isOpen }).catch(() => {});
    };
    port.onMessage.addListener(message => {
      if (message?.type !== 'panel-tab' || !Number.isInteger(message.tabId)) return;
      const previous = connectedPanels.get(port);
      if (previous === message.tabId) return;
      connectedPanels.set(port, message.tabId);
      ping(previous);
      ping(message.tabId);
    });
    port.onDisconnect.addListener(() => {
      const previous = connectedPanels.get(port);
      connectedPanels.delete(port);
      ping(previous);
    });
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
    if (message?.type === 'queue-submission' && message.payload && sender.url === chrome.runtime.getURL('panel.html')) {
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
    if (message?.type === 'NEXTKIN_SAVE_ATTEMPT' || message?.type === 'NEXTKIN_CLEAR_ATTEMPT') {
      void withQueueLock(() => storeAttempt(message, sender)).then(reply, () => reply(false));
      return true;
    }
    if (message?.type === 'NEXTKIN_CANCEL_SUBMISSION_ATTEMPT') {
      void (async () => {
        const marker = await readSubmissionAttempt(sender);
        if (!marker || marker.documentId !== sender.documentId || marker.attemptId !== message.attemptId) return false;
        await chrome.storage.session.remove(submissionKey(sender.tab.id, sender.frameId));
        return true;
      })().then(reply, () => reply(false));
      return true;
    }
    if (message?.type === 'NEXTKIN_GET_SUBMISSION_ATTEMPT') {
      void readSubmissionAttempt(sender).then(marker => reply(Boolean(marker)), () => reply(false));
      return true;
    }
    if (message?.type === 'NEXTKIN_GET_SITE_RULES') {
      void (async () => {
        const { workspace, token, accountId } = await getQueueConnection();
        return workspace && token ? globalThis.NextkinSiteRules?.getWorkspaceRules(workspace, token, accountId) : null;
      })().then(reply, () => reply(null));
      return true;
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
        const scope = await applicationScope(sender);
        if (!scope?.state || scope.state.candidateId !== message.candidateId ||
          (scope.tracking?.candidateId && scope.tracking.candidateId !== message.candidateId) ||
          await automationDisabled(sender.url)) return null;
        return loadSavedProfile(message.candidateId);
      })().then(reply, () => reply(null));
      return true;
    }
    if (sender.frameId === 0 && sender.tab?.id != null && sender.documentId && /^https:\/\//.test(sender.url || '')) {
      const tabId = sender.tab.id;
      if (message?.action === 'queue_application_step') {
        const pending = queueApplicationStep(tabId, sender, message);
        pendingSteps.set(tabId, pending);
        void pending.then(result => reply(result !== false), () => reply(false)).finally(() => {
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
      const tracking = Promise.resolve(pendingTracking.get(tabId)).catch(() => {}).then(async () => {
        if (panel && await automationDisabled(embedded?.url || message.url)) return false;
        const scope = submitted ? await applicationScope(sender) : null;
        if (submitted && (!scope || (message.attemptId && scope.state?.attemptId !== message.attemptId))) return false;
        if (submitted && message.automatic && (!scope.state || scope.state.requiresReview || await automationDisabled(sender.url, true))) return false;
        const candidateId = panel ? message.candidateId : scope?.state?.candidateId || scope?.tracking?.candidateId;
        const evidence = submitted && message.submissionEvidence ? sanitizeQueueItem({ body: message.submissionEvidence }).body : undefined;
        const submissionEvidence = evidence ? { answers: evidence.answers, appliedResume: evidence.appliedResume } : undefined;
        const tracked = embedded
          ? await prepareEmbeddedOutsideApplication(tabId, panel ? message.url : sender.tab.url, embedded, message.job,
            candidateId, submitted, submissionEvidence)
          : await prepareApplication(tabId, message.url, message.job, candidateId, submitted, submissionEvidence);
        if (!tracked || !submitted) return tracked;
        return markSubmission(sender, message.attemptId);
      });
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
      reply({ isOpen: [...connectedPanels.values()].includes(sender.tab?.id) });
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
    if (message?.type === 'NEXTKIN_REGISTER_MAIN_BRIDGES') {
      const tabId = sender.tab?.id;
      const frameId = sender.frameId;
      const urlHref = sender.url || '';
      if (tabId == null || !/^https?:\/\//i.test(urlHref) || globalThis.NextkinSiteRegistry?.isExcludedUrl?.(urlHref)) {
        reply(false);
        return false;
      }
      if (typeof chrome !== 'undefined' && chrome.scripting?.executeScript) {
        const target = sender.documentId ? { tabId, documentIds: [sender.documentId] } : { tabId, frameIds: [frameId] };
        void (async () => {
          if (!Number.isInteger(frameId) || await automationDisabled(urlHref)) return false;
          await chrome.scripting.executeScript({
            target,
            world: 'MAIN',
            files: ['main-world/submission-network.js', 'main-world/framework-bridges.js'],
          });
          return true;
        })().then(reply, () => reply(false));
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
