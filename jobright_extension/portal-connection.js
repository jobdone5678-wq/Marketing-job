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

  function reportAuthRequired(reason) {
    window.postMessage({ type: 'NEXTKIN_AUTH_REQUIRED', reason }, location.origin);
  }

  async function saveConnection(token, user) {
    if (!onConnectionPage() || !isTrustedOrigin(location.origin)) return;

    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{20,128}$/.test(token) ||
      typeof user?.id !== 'string' || user.role !== 'candidate') {
      reportAuthRequired('Invalid pairing token or role');
      return;
    }

    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local?.get) {
        const current = await chrome.storage.local.get(['user', 'origin']);
        const accountChanged = current?.user?.id && current.user.id !== user.id;
        await chrome.storage.local.set({
          origin: location.origin,
          user: { id: user.id, name: user.name, email: user.email },
          ...(accountChanged ? { activeCandidateId: null } : {}),
        }).catch(() => {});
        await chrome.storage.local.remove('token').catch(() => {});
      }
      if (typeof chrome !== 'undefined' && chrome.storage?.session?.set) {
        await chrome.storage.session.set({
          origin: location.origin,
          token,
        }).catch(() => {});
      }
    } catch {}

    const saved = await chrome.runtime.sendMessage({
      type: 'NEXTKIN_SAVE_CONNECTION',
      origin: location.origin,
      token,
      user: { id: user.id, name: user.name, email: user.email },
    }).catch(() => false);
    if (saved === false) reportAuthRequired('Could not save the extension connection.');
  }

  chrome.runtime.onMessage.addListener((message, sender) => {
    if (sender.id === chrome.runtime.id) {
      if (message?.type === 'NEXTKIN_OUTSIDE_APPLICATION_SAVED' || message?.type === 'NEXTKIN_APPLICATION_SUBMITTED') {
        if (isTrustedOrigin(location.origin)) {
          window.postMessage({ type: message.type, payload: message.payload || message.data }, location.origin);
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
      try {
        if (typeof chrome !== 'undefined') {
          chrome.storage?.session?.remove?.('token')?.catch?.(() => {});
          chrome.storage?.local?.remove?.('token')?.catch?.(() => {});
          chrome.runtime?.sendMessage?.({
            type: 'NEXTKIN_AUTH_REQUIRED',
            origin: location.origin,
            reason: data.reason || 'Authentication required',
          })?.catch?.(() => {});
        }
      } catch {}
      window.postMessage({
        type: 'NEXTKIN_AUTH_REQUIRED',
        reason: data.reason || 'Authentication required',
      }, location.origin);
      const accountId = data.accountId || data.actorId || data.user?.id;
      if (typeof accountId === 'string' && accountId) {
        void chrome.runtime.sendMessage({ type: 'NEXTKIN_REVOKE_CONNECTION', origin: location.origin, accountId }).catch(() => {});
      }
    } else if (/^\/dashboard\/candidates(?:\/|$)/.test(location.pathname) &&
      ['NEXTKIN_PROFILE_SAVED', 'NEXTKIN_RESUME_UPLOADED', 'candidate_updated'].includes(data.type)) {
      void chrome.runtime.sendMessage({ type: 'NEXTKIN_PROFILE_SAVED' }).catch(() => {});
    }
  });
})();
