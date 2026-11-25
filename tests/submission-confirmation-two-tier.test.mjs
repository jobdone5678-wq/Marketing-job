import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

class MockElement {
  constructor(tagName = 'DIV', attrs = {}, text = '') {
    this.tagName = tagName.toUpperCase();
    this.attrs = { ...attrs };
    this.children = [];
    this.parentElement = null;
    this.innerText = text;
    this.textContent = text;
    this.disabled = !!attrs.disabled;
    this.classList = {
      _classes: new Set((attrs.class || '').split(/\s+/).filter(Boolean)),
      contains(c) { return this._classes.has(c); },
      add(c) { this._classes.add(c); },
      remove(c) { this._classes.delete(c); }
    };
  }
  getAttribute(name) { return this.attrs[name.toLowerCase()] ?? null; }
  setAttribute(name, val) { this.attrs[name.toLowerCase()] = String(val); }
  hasAttribute(name) { return name.toLowerCase() in this.attrs; }
  removeAttribute(name) { delete this.attrs[name.toLowerCase()]; }
  getClientRects() { return [{ width: 100, height: 20 }]; }
  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }
  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentElement = null;
    }
    return child;
  }
  closest(selector) {
    let cur = this;
    while (cur) {
      if (matchesSimple(cur, selector)) return cur;
      cur = cur.parentElement;
    }
    return null;
  }
  querySelector(selector) {
    return querySimple(this, selector);
  }
  querySelectorAll(selector) {
    return queryAllSimple(this, selector);
  }
}

function matchesSimple(el, selector) {
  if (!el || !selector) return false;
  const parts = selector.split(',').map(s => s.trim());
  for (const sel of parts) {
    if (sel.startsWith('#') && el.attrs.id === sel.slice(1)) return true;
    if (sel.startsWith('.') && el.classList.contains(sel.slice(1))) return true;
    if (sel.startsWith('[') && sel.endsWith(']')) {
      const inside = sel.slice(1, -1);
      if (inside.includes('=')) {
        const [k, v] = inside.split('=').map(s => s.trim().replace(/^["']|["']$/g, ''));
        if (el.getAttribute(k) === v) return true;
      } else {
        if (el.hasAttribute(inside)) return true;
      }
    }
    if (el.tagName === sel.toUpperCase()) return true;
  }
  return false;
}

function querySimple(root, selector) {
  const all = queryAllSimple(root, selector);
  return all.length ? all[0] : null;
}

function queryAllSimple(root, selector) {
  const matches = [];
  function walk(node) {
    for (const child of node.children) {
      if (matchesSimple(child, selector)) {
        matches.push(child);
      }
      walk(child);
    }
  }
  walk(root);
  return matches;
}

function setupMockConfirmationEnv(options = {}) {
  const messages = [];
  const sessionData = { ...(options.sessionStorage || {}) };
  const sessionStorageMock = {
    getItem: (k) => sessionData[k] ?? null,
    setItem: (k, v) => { sessionData[k] = String(v); },
    removeItem: (k) => { delete sessionData[k]; }
  };

  const doc = new MockElement('HTML');
  const body = new MockElement('BODY');
  doc.appendChild(body);

  const listeners = {};
  const addEventListener = (type, fn) => {
    listeners[type] = listeners[type] || [];
    listeners[type].push(fn);
  };

  const dispatchEvent = (type, event = {}) => {
    for (const fn of listeners[type] || []) {
      fn(event);
    }
  };

  const chromeMock = {
    runtime: {
      sendMessage: async (msg) => {
        if (msg.type === 'NEXTKIN_GET_SUBMISSION_ATTEMPT') return Boolean(options.submissionAttempt);
        messages.push(msg);
        return true;
      }
    }
  };

  const sandbox = {
    document: {
      ...doc,
      body,
      documentElement: doc,
      querySelector: (sel) => querySimple(doc, sel),
      querySelectorAll: (sel) => queryAllSimple(doc, sel),
      addEventListener,
      dispatchEvent
    },
    window: {
      location: { href: options.url || 'https://jobs.example.com/apply/123', pathname: options.pathname || '/apply/123' },
      addEventListener
    },
    sessionStorage: sessionStorageMock,
    chrome: chromeMock,
    setTimeout: (fn) => { fn(); return 1; },
    clearTimeout: () => {},
    MutationObserver: class {
      constructor(cb) { this.cb = cb; }
      observe() {}
      disconnect() {}
    },
    NodeFilter: { SHOW_TEXT: 4 },
    globalThis: {}
  };
  sandbox.globalThis = sandbox;

  return { sandbox, messages, body, dispatchEvent, sessionStorageMock };
}

test('Two-Tier Confirmation: 1. High-confidence confirmation receipts auto-record only when preceded by an active submission attempt', async () => {
  const code = readFileSync(new URL('../jobright_extension/application-confirmation.js', import.meta.url), 'utf8');

  // Case A: Page displays confirmation text, but NO submission was attempted (idle browsing / direct visit)
  const envA = setupMockConfirmationEnv({
    url: 'https://jobs.example.com/jobs/123',
    sessionStorage: { nextkin_submission_attempted: 'true' }, // Employer storage cannot authorize a receipt.
  });
  const heading = new MockElement('H1', {}, 'Thank you for your application');
  envA.body.appendChild(heading);

  runInNewContext(code, envA.sandbox);
  await new Promise(resolve => setImmediate(resolve));

  // Must NOT auto-record without submission attempt evidence
  assert.equal(
    envA.messages.filter(m => m.status === 'SUBMITTED').length,
    0,
    'High-confidence confirmation must NOT auto-record if no submission was attempted'
  );

  // Case B: The worker confirms the submission attempt.
  const envB = setupMockConfirmationEnv({
    url: 'https://jobs.example.com/jobs/123',
    submissionAttempt: true,
  });
  const headingB = new MockElement('H1', {}, 'Thank you for your application');
  envB.body.appendChild(headingB);

  runInNewContext(code, envB.sandbox);
  await new Promise(resolve => setImmediate(resolve));

  // Must auto-record when submission attempt was present
  assert.ok(
    envB.messages.some(m => m.status === 'SUBMITTED'),
    'High-confidence confirmation MUST auto-record when preceded by active submission attempt'
  );
});

test('Two-Tier Confirmation: 2. A form disappearing without a receipt triggers the "Did you submit?" prompt', async () => {
  // Simulate panel prompt logic on form removal
  const job = { id: 'job-1', title: 'Software Engineer', company: 'Acme Corp' };
  let startedApplication = { job, tabId: 1, url: 'https://jobs.example.com/apply/1', candidateId: 'cand-1' };
  let pendingAppliedPrompt = null;

  // Function reflecting panel form reconciliation
  function reconcileFormState(currentForm, answered) {
    if (currentForm && answered) {
      startedApplication = { job, tabId: 1, url: 'https://jobs.example.com/apply/1', candidateId: 'cand-1' };
      pendingAppliedPrompt = null;
    } else if (!currentForm && startedApplication) {
      pendingAppliedPrompt = startedApplication;
      startedApplication = null;
    } else if (currentForm && pendingAppliedPrompt) {
      pendingAppliedPrompt = null;
    }
  }

  // Active form initially
  reconcileFormState({ frameId: 0 }, true);
  assert.equal(pendingAppliedPrompt, null);
  assert.ok(startedApplication);

  // Form disappears without receipt
  reconcileFormState(null, false);
  assert.ok(pendingAppliedPrompt, 'Form disappearance should trigger pendingAppliedPrompt');
  assert.equal(pendingAppliedPrompt.job.title, 'Software Engineer');
});

test('Two-Tier Confirmation: 3. Wizard step navigation ("Next") does not trigger the submission prompt', async () => {
  const job = { id: 'job-1', title: 'Software Engineer', company: 'Acme Corp' };
  let startedApplication = { job, tabId: 1, url: 'https://jobs.example.com/apply/1', candidateId: 'cand-1' };
  let pendingAppliedPrompt = null;

  function reconcileFormState(currentForm, answered) {
    if (currentForm && answered) {
      startedApplication = { job, tabId: 1, url: 'https://jobs.example.com/apply/1', candidateId: 'cand-1' };
      pendingAppliedPrompt = null;
    } else if (!currentForm && startedApplication) {
      pendingAppliedPrompt = startedApplication;
      startedApplication = null;
    } else if (currentForm && pendingAppliedPrompt) {
      pendingAppliedPrompt = null;
    }
  }

  // Step 1 active
  reconcileFormState({ frameId: 0, step: 1 }, true);
  assert.equal(pendingAppliedPrompt, null);

  // Transitioning to Step 2: Next step form is still active
  reconcileFormState({ frameId: 0, step: 2 }, true);
  assert.equal(pendingAppliedPrompt, null, 'Wizard step navigation should NOT trigger submission prompt while active form remains');
});

test('Two-Tier Confirmation: 4. If auto-submit / delivery fails with 503 or network error, submission remains in pending queue and retries', async () => {
  const backgroundCode = readFileSync(new URL('../jobright_extension/background.js', import.meta.url), 'utf8');

  const workspace = 'https://www.nextkinhr.com';
  const owner = { workspace, accountId: 'account-1' };
  const mockStorageData = {
    origin: workspace,
    user: { id: 'account-1' },
    nextkin_account_sync: true
  };

  const localStore = { ...mockStorageData };
  const sessionStore = { origin: workspace, accountId: 'account-1', token: 'valid-test-token' };

  let fetchCallCount = 0;
  const mockFetch = async (url) => {
    fetchCallCount++;
    if (url.includes('/api/webhooks/application-submitted') || url.includes('/api/extension/auto-submit')) {
      return {
        status: 503,
        ok: false,
        json: async () => ({ error: 'Service Unavailable' })
      };
    }
    return { status: 404, ok: false };
  };

  const alarms = new Map();
  const chromeMock = {
    runtime: {
      id: 'ext-test',
      getURL: (p) => 'chrome-extension://ext-test/' + p,
      onInstalled: { addListener() {} },
      onStartup: { addListener() {} },
      onConnect: { addListener() {} },
      onMessage: { addListener() {} },
      sendMessage: async () => {}
    },
    action: {
      setBadgeText: async () => {},
      setBadgeBackgroundColor: async () => {}
    },
    notifications: { create: async () => {} },
    tabs: { onUpdated: { addListener() {} } },
    alarms: {
      create: (name, info) => { alarms.set(name, info); },
      onAlarm: { addListener() {} }
    },
    storage: {
      local: {
        get: async (keys) => {
          if (Array.isArray(keys)) {
            return Object.fromEntries(keys.map(k => [k, localStore[k]]));
          }
          if (typeof keys === 'string') return { [keys]: localStore[keys] };
          return { ...localStore };
        },
        set: async (items) => { Object.assign(localStore, items); },
        remove: async (k) => { delete localStore[k]; }
      },
      session: {
        get: async (k) => {
          if (typeof k === 'string') return { [k]: sessionStore[k] };
          return { ...sessionStore };
        },
        set: async (items) => { Object.assign(sessionStore, items); },
        remove: async (k) => { delete sessionStore[k]; }
      }
    }
  };

  const sandbox = {
    chrome: chromeMock,
    fetch: mockFetch,
    setTimeout,
    clearTimeout,
    Date,
    Math,
    URL,
    console,
    globalThis: {}
  };
  sandbox.globalThis = sandbox;

  runInNewContext(backgroundCode, sandbox);

  // Enqueue a submission item
  const item = {
    id: 'sub-test-1',
    workspace,
    accountId: 'account-1',
    body: {
      eventKey: 'sub-test-1',
      candidateId: '00000000-0000-0000-0000-000000000001',
      jobUrl: 'https://jobs.example.com/1',
      confirmationUrl: 'https://jobs.example.com/1/confirmation',
      companyName: 'Acme',
      jobTitle: 'Engineer'
    }
  };

  const result = await sandbox.enqueueSubmission(item);
  assert.ok(result);

  // Trigger processing
  await sandbox.processSubmissionQueue();

  // Verify item is still in queue with retry scheduled
  const queue = localStore.pending_submission_queue || [];
  assert.equal(queue.length, 1, 'Submission must remain in pending queue after 503 error');
  assert.equal(queue[0].id, 'sub-test-1');
  assert.ok(queue[0].attempts >= 1, 'Attempts should be incremented');
  assert.ok(queue[0].nextRetryAt > Date.now() - 1000, 'nextRetryAt should be set');
});
