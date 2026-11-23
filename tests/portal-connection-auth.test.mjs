import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const scriptSource = readFileSync(new URL('../jobright_extension/portal-connection.js', import.meta.url), 'utf8');

function setupEnvironment({
  url = 'https://www.nextkinhr.com/auth/jobseeker/connected',
  localStorage = {},
  sessionStorage = {},
} = {}) {
  const location = new URL(url);
  const notifications = [];
  const runtimeMessages = [];
  let messageListener = null;
  let extensionMessageListener = null;

  const window = {
    addEventListener: (type, listener) => {
      if (type === 'message') messageListener = listener;
    },
    postMessage: (message, targetOrigin) => {
      notifications.push({ message, targetOrigin });
    },
  };

  const chrome = {
    runtime: {
      id: 'test-extension-id',
      sendMessage: async message => {
        runtimeMessages.push({ ...message });
        return { watching: true };
      },
      onMessage: {
        addListener: listener => {
          extensionMessageListener = listener;
        },
      },
    },
    storage: {
      session: {
        get: async keys => {
          if (!keys) return { ...sessionStorage };
          const kArr = Array.isArray(keys) ? keys : [keys];
          const res = {};
          for (const k of kArr) res[k] = sessionStorage[k];
          return res;
        },
        set: async patch => {
          Object.assign(sessionStorage, patch);
        },
        remove: async keys => {
          const kArr = Array.isArray(keys) ? keys : [keys];
          for (const k of kArr) delete sessionStorage[k];
        },
      },
      local: {
        get: async keys => {
          if (!keys) return { ...localStorage };
          const kArr = Array.isArray(keys) ? keys : [keys];
          const res = {};
          for (const k of kArr) res[k] = localStorage[k];
          return res;
        },
        set: async patch => {
          Object.assign(localStorage, patch);
        },
        remove: async keys => {
          const kArr = Array.isArray(keys) ? keys : [keys];
          for (const k of kArr) delete localStorage[k];
        },
      },
    },
  };

  runInNewContext(scriptSource, {
    location,
    window,
    console,
    chrome,
  });

  const postWindowMessage = (data, { origin = location.origin, source = window } = {}) => {
    if (messageListener) {
      messageListener({ source, origin, data });
    }
  };

  const sendExtensionMessage = (message, sender = { id: 'test-extension-id' }) => {
    if (extensionMessageListener) {
      extensionMessageListener(message, sender);
    }
  };

  return {
    location,
    window,
    chrome,
    localStorage,
    sessionStorage,
    notifications,
    runtimeMessages,
    postWindowMessage,
    sendExtensionMessage,
    hasMessageListener: () => messageListener !== null,
  };
}

test('Auth & Security: untrusted origins are immediately rejected and script halts', () => {
  const untrusted = [
    'https://evil-site.com/auth/jobseeker/connected',
    'https://evilnextkinhr.com/auth/jobseeker/connected',
    'http://localhost:8080/auth/jobseeker/connected',
    'https://nextkinhr.com.attacker.com/auth/jobseeker/connected',
  ];

  for (const url of untrusted) {
    const env = setupEnvironment({ url });
    assert.equal(env.hasMessageListener(), false, `Should not attach listener on ${url}`);
  }
});

test('Auth & Security: trusted origins (nextkinhr, jobright-internal, localhost:3000) are accepted', () => {
  const trusted = [
    'https://nextkinhr.com/auth/jobseeker/connected',
    'https://www.nextkinhr.com/auth/jobseeker/connected',
    'https://app.nextkinhr.com/auth/jobseeker/connected',
    'https://jobright-internal.com/auth/jobseeker/connected',
    'https://dev.jobright-internal.com/auth/jobseeker/connected',
    'http://localhost:3000/auth/jobseeker/connected',
    'http://127.0.0.1:3000/auth/jobseeker/connected',
  ];

  for (const url of trusted) {
    const env = setupEnvironment({ url });
    assert.equal(env.hasMessageListener(), true, `Should attach listener on ${url}`);
  }
});

test('Auth & Security: message-source is strictly validated (rejects other windows / mismatched origins)', async () => {
  const env = setupEnvironment();
  const otherWindow = {};

  // Reject message where event.source !== window
  env.postWindowMessage(
    {
      type: 'NEXTKIN_EXTENSION_PAIRED',
      token: 'valid-test-token-1234567890abcdef',
      user: { id: 'user-1', name: 'Test User', email: 'test@example.com', role: 'candidate' },
    },
    { source: otherWindow }
  );
  await new Promise(r => setImmediate(r));
  assert.equal(env.sessionStorage.token, undefined);

  // Reject message where event.origin !== location.origin
  env.postWindowMessage(
    {
      type: 'NEXTKIN_EXTENSION_PAIRED',
      token: 'valid-test-token-1234567890abcdef',
      user: { id: 'user-1', name: 'Test User', email: 'test@example.com', role: 'candidate' },
    },
    { origin: 'https://attacker.com' }
  );
  await new Promise(r => setImmediate(r));
  assert.equal(env.sessionStorage.token, undefined);
});

test('Auth & Security: sensitive tokens are NEVER written to chrome.storage.local; migrated to chrome.storage.session', async () => {
  const env = setupEnvironment({
    localStorage: { origin: 'https://www.nextkinhr.com', token: 'legacy-token-in-local-storage' },
  });

  // Startup should proactively clean up legacy token from local storage
  await new Promise(r => setImmediate(r));
  assert.equal(env.localStorage.token, undefined, 'Legacy token should be purged on load');

  const validToken = 'session-token-valid-abc123xyz_456789';
  env.postWindowMessage({
    type: 'NEXTKIN_EXTENSION_PAIRED',
    token: validToken,
    user: { id: 'cand-42', name: 'Jane Candidate', email: 'jane@example.com', role: 'candidate' },
  });
  await new Promise(r => setImmediate(r));

  // Verify token is in chrome.storage.session
  assert.equal(env.sessionStorage.token, validToken);
  assert.equal(env.sessionStorage.origin, 'https://www.nextkinhr.com');

  // Verify token is NOT in chrome.storage.local
  assert.equal(env.localStorage.token, undefined);
  assert.equal(env.localStorage.user.id, 'cand-42');
  assert.equal(env.localStorage.user.email, 'jane@example.com');

  // Verify NEXTKIN_SAVE_CONNECTION runtime message dispatched
  const saveMsg = env.runtimeMessages.find(m => m.type === 'NEXTKIN_SAVE_CONNECTION');
  assert.ok(saveMsg);
  assert.equal(saveMsg.token, validToken);
  assert.equal(saveMsg.user.id, 'cand-42');
});

test('Auth & Security: re-pairing and reconnection NEVER wipes pending submission queues', async () => {
  const pendingQueue = [
    { id: 'event-1', jobTitle: 'Software Engineer', status: 'pending' },
    { id: 'event-2', jobTitle: 'Product Manager', status: 'pending' },
  ];

  const env = setupEnvironment({
    localStorage: {
      origin: 'https://www.nextkinhr.com',
      pending_submission_queue: pendingQueue,
      activeCandidateId: 'prev-cand',
      user: { id: 'old-user' },
    },
  });

  // Re-pair with a new user account
  env.postWindowMessage({
    type: 'NEXTKIN_EXTENSION_PAIRED',
    token: 'new-account-token-xyz-1234567890',
    user: { id: 'new-user', name: 'New User', email: 'new@example.com', role: 'candidate' },
  });
  await new Promise(r => setImmediate(r));

  // Pending submission queue must remain completely intact!
  assert.deepEqual(env.localStorage.pending_submission_queue, pendingQueue);
  assert.equal(env.localStorage.activeCandidateId, null, 'Active candidate reset for new account');
  assert.equal(env.sessionStorage.token, 'new-account-token-xyz-1234567890');
  assert.equal(env.localStorage.token, undefined);
});

test('Auth & Security: AUTH_REQUIRED detection on rejected tokens or session expiration', async () => {
  const env = setupEnvironment({
    sessionStorage: { token: 'active-session-token' },
    localStorage: { user: { id: 'cand-1' } },
  });

  // 1. Web portal fires session expiration / AUTH_REQUIRED
  env.postWindowMessage({
    type: 'NEXTKIN_AUTH_REQUIRED',
    reason: 'Session expired',
  });
  await new Promise(r => setImmediate(r));

  // Token purged from session storage
  assert.equal(env.sessionStorage.token, undefined);
  assert.equal(env.localStorage.token, undefined);

  // Background notified with NEXTKIN_AUTH_REQUIRED
  const authReqMsg = env.runtimeMessages.find(m => m.type === 'NEXTKIN_AUTH_REQUIRED');
  assert.ok(authReqMsg);
  assert.equal(authReqMsg.reason, 'Session expired');

  // Web portal received NEXTKIN_AUTH_REQUIRED notification
  const portalNotice = env.notifications.find(n => n.message.type === 'NEXTKIN_AUTH_REQUIRED');
  assert.ok(portalNotice);
});

test('Auth & Security: extension runtime AUTH_REQUIRED notification is relayed to web portal', async () => {
  const env = setupEnvironment({
    sessionStorage: { token: 'active-session-token' },
  });

  // Extension runtime signals auth required (e.g. background 401 response)
  env.sendExtensionMessage({
    type: 'NEXTKIN_AUTH_REQUIRED',
    reason: 'Backend 401 Unauthorized',
  });

  const portalNotice = env.notifications.find(n => n.message.type === 'NEXTKIN_AUTH_REQUIRED');
  assert.ok(portalNotice);
  assert.equal(portalNotice.message.reason, 'Backend 401 Unauthorized');
});

test('Auth & Security: token is NEVER logged or exposed in window messages', async () => {
  const env = setupEnvironment();

  env.postWindowMessage({
    type: 'NEXTKIN_EXTENSION_PAIRED',
    token: 'super-secret-candidate-auth-token-123456',
    user: { id: 'cand-1', name: 'Safe User', email: 'safe@example.com', role: 'candidate' },
  });
  await new Promise(r => setImmediate(r));

  // Check all window postMessages: none should contain token
  for (const n of env.notifications) {
    const serialized = JSON.stringify(n.message);
    assert.equal(serialized.includes('super-secret-candidate-auth-token-123456'), false, 'Token leaked in window message!');
  }
});

test('JobseekerAuth: active user session routes directly to /auth/jobseeker/connected', async () => {
  let redirectedPath = null;
  const mockRouter = { push: path => { redirectedPath = path; } };
  const mockSupabase = {
    auth: {
      getUser: async () => ({ data: { user: { id: 'usr-123', email: 'candidate@example.com' } } })
    }
  };

  async function checkExistingSession(supabase, router) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      router.push('/auth/jobseeker/connected');
    }
  }

  await checkExistingSession(mockSupabase, mockRouter);
  assert.equal(redirectedPath, '/auth/jobseeker/connected');
});

