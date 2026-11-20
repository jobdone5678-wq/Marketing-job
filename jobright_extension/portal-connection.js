(function () {
  const TRUSTED_ORIGIN_PATTERNS = [
    /^https:\/\/(?:[a-zA-Z0-9-]+\.)*nextkinhr\.com(?::\d+)?$/,
    /^https:\/\/(?:[a-zA-Z0-9-]+\.)*jobright-internal\.com(?::\d+)?$/,
    /^http:\/\/(?:localhost|127\.0\.0\.1):3000$/,
  ];

  function isTrustedOrigin(originString) {
    if (!originString || typeof originString !== 'string') return false;
    return TRUSTED_ORIGIN_PATTERNS.some(regex => regex.test(originString));
  }

  // Reject execution on untrusted origins
  if (typeof location === 'undefined' || !isTrustedOrigin(location.origin)) {
    return;
  }

  // Proactively clean up any legacy token stored in chrome.storage.local
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local?.remove) {
      chrome.storage.local.remove('token').catch(() => {});
    }
  } catch {}

  const onConnectionPage = () => location.pathname.replace(/\/$/, '') === '/auth/jobseeker/connected';

  async function handleAuthRequired(reason) {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.session?.remove) {
        await chrome.storage.session.remove('token').catch(() => {});
      }
      if (typeof chrome !== 'undefined' && chrome.storage?.local?.remove) {
        await chrome.storage.local.remove('token').catch(() => {});
      }
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({
          type: 'NEXTKIN_AUTH_REQUIRED',
          origin: location.origin,
          reason: reason || 'Authentication required',
        });
      }
    } catch {}

    try {
      if (isTrustedOrigin(location.origin)) {
        window.postMessage({
          type: 'NEXTKIN_AUTH_REQUIRED',
          reason: reason || 'Authentication required',
        }, location.origin);
      }
    } catch {}
  }

  async function saveConnection(token, user) {
    if (!onConnectionPage() || !isTrustedOrigin(location.origin)) return;

    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{20,128}$/.test(token) ||
      typeof user?.id !== 'string' || user.role !== 'candidate') {
      await handleAuthRequired('Invalid pairing token or role');
      return;
    }

    let current = {};
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local?.get) {
        current = (await chrome.storage.local.get(['origin', 'user'])) || {};
      }
    } catch {}

    const accountChanged = current.origin !== location.origin || current.user?.id !== user.id;

    // 1. Sensitive tokens are NEVER written to chrome.storage.local!
    // 2. Store token strictly in chrome.storage.session
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.session?.set) {
        await chrome.storage.session.set({
          origin: location.origin,
          token,
        });
      }
    } catch {}

    // 3. Store non-sensitive metadata in chrome.storage.local, removing any legacy token
    // Pending submission queues are strictly preserved!
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local?.set) {
        await chrome.storage.local.set({
          origin: location.origin,
          user: { id: user.id, name: user.name, email: user.email },
          ...(accountChanged ? { activeCandidateId: null } : {}),
        });
      }
      if (typeof chrome !== 'undefined' && chrome.storage?.local?.remove) {
        await chrome.storage.local.remove('token').catch(() => {});
      }
    } catch {}

    // 4. Handoff to background service worker for session token storage and queue resumption
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage({
          type: 'NEXTKIN_SAVE_CONNECTION',
          origin: location.origin,
          token,
          user: { id: user.id, name: user.name, email: user.email },
        });
      }
    } catch {}
  }

  chrome.runtime.onMessage.addListener((message, sender) => {
    if (sender.id === chrome.runtime.id) {
      if (message?.type === 'NEXTKIN_OUTSIDE_APPLICATION_SAVED') {
        if (isTrustedOrigin(location.origin)) {
          window.postMessage({ type: message.type }, location.origin);
        }
      } else if (message?.type === 'NEXTKIN_AUTH_REQUIRED') {
        if (isTrustedOrigin(location.origin)) {
          window.postMessage({
            type: 'NEXTKIN_AUTH_REQUIRED',
            reason: message.reason || 'Authentication required',
          }, location.origin);
        }
      }
    }
  });

  window.addEventListener('message', event => {
    // Validate message source strictly: must be the current window
    if (event.source !== window) return;
    // Validate origin strictly: must match location.origin and be trusted
    if (!isTrustedOrigin(event.origin) || !isTrustedOrigin(location.origin) || event.origin !== location.origin) return;

    const { data } = event;
    if (!data || typeof data !== 'object') return;

    if (data.type === 'NEXTKIN_APPLICATION_WATCH' &&
      /^\/(?:jobs|dashboard\/outside-jobs)\/[^/]+\/apply\/?$/.test(location.pathname)) {
      chrome.runtime.sendMessage({ type: data.type, job: data.job, actorId: data.actorId }, result => {
        if (!chrome.runtime.lastError && result?.watching) {
          if (isTrustedOrigin(location.origin)) {
            window.postMessage({ type: 'NEXTKIN_APPLICATION_WATCHING' }, location.origin);
          }
        }
      });
    } else if (data.type === 'NEXTKIN_EXTENSION_PAIRED') {
      void saveConnection(data.token, data.user).catch(() => {});
    } else if (data.type === 'NEXTKIN_AUTH_REQUIRED' || data.type === 'NEXTKIN_TOKEN_EXPIRED' || data.type === 'NEXTKIN_LOGOUT') {
      void handleAuthRequired(data.reason).catch(() => {});
    } else if (/^\/dashboard\/candidates(?:\/|$)/.test(location.pathname) &&
      ['NEXTKIN_PROFILE_SAVED', 'NEXTKIN_RESUME_UPLOADED', 'candidate_updated'].includes(data.type)) {
      void chrome.runtime.sendMessage({ type: 'NEXTKIN_PROFILE_SAVED' }).catch(() => {});
    }
  });
})();
