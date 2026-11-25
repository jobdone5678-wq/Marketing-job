(function (root) {
  'use strict';

  /**
   * NextKinHR Stage-1 Runtime Gatekeeper (runs at document_start, modeled on Jobright v1.27.1 two-stage injection).
   * - Filters excluded security/captcha/SSO/analytics frames immediately.
   * - Preserves marketing-intent / jr_id / ATS job query params across SPA history.replaceState / pushState transitions.
   * - Exposes __nextkinRuntimeGate status for Stage-2 content modules and requests MAIN-world bridge registration when eligible.
   */

  if (root.__nextkinRuntimeGateInitialized) return;
  root.__nextkinRuntimeGateInitialized = true;

  const INTENT_STORAGE_KEY = 'nextkin_preserved_intent';
  const TRACKED_INTENT_PARAMS = [
    'marketing-intent',
    'jr_id',
    'gh_jid',
    'ashby_jid',
    'req_id',
    'requisition',
    'jobId',
    'job_id',
    'jk',
    'vjk',
  ];

  function extractIntentSnapshot(href) {
    try {
      const parsed = new URL(String(href || (typeof location !== 'undefined' ? location.href : '')));
      const hashParams = new URLSearchParams(parsed.hash.startsWith('#') ? parsed.hash.slice(1) : parsed.hash);
      const searchParams = parsed.searchParams;
      const captured = {};
      for (const key of TRACKED_INTENT_PARAMS) {
        const val = hashParams.get(key) || searchParams.get(key);
        if (val) captured[key] = val;
      }
      return {
        url: parsed.href,
        origin: parsed.origin,
        pathname: parsed.pathname,
        marketingIntent: hashParams.get('marketing-intent') || searchParams.get('marketing-intent') || null,
        jrId: searchParams.get('jr_id') || hashParams.get('jr_id') || null,
        params: captured,
        capturedAt: Date.now(),
      };
    } catch {
      return null;
    }
  }

  let intentSnapshot = null;
  function persistIntentSnapshot(snapshot) {
    if (!snapshot || (!snapshot.marketingIntent && !snapshot.jrId && !Object.keys(snapshot.params || {}).length)) return;
    const previous = intentSnapshot?.origin === snapshot.origin ? intentSnapshot : null;
    intentSnapshot = {
      ...snapshot,
      marketingIntent: snapshot.marketingIntent || previous?.marketingIntent || null,
      jrId: snapshot.jrId || previous?.jrId || null,
      params: { ...previous?.params, ...snapshot.params },
    };
  }

  function evaluateGate(urlHref) {
    const registry = root.NextkinSiteRegistry;
    const rules = root.NextkinSiteRules;
    const href = String(urlHref || (typeof location !== 'undefined' ? location.href : ''));
    const excluded = Boolean(registry?.isExcludedUrl?.(href));
    const site = excluded ? null : (registry?.resolveSite?.(href) || null);
    const blocked = !excluded && Boolean(rules?.isSiteBlocked?.(href));
    const supported = !excluded && !blocked && (Boolean(site) || Boolean(registry?.isSupportedPortal?.(href)));
    const state = {
      url: href,
      excluded,
      blocked,
      supported,
      siteKey: site?.key || 'generic',
      supportsMainWorldNetwork: Boolean(site?.supportsMainWorldNetwork),
      isTopWindow: typeof window !== 'undefined' ? window.top === window : true,
      evaluatedAt: Date.now(),
    };
    root.__nextkinRuntimeGate = state;
    return state;
  }

  // Older builds persisted attempt details in the employer's storage.
  try {
    const storage = typeof sessionStorage === 'undefined' ? null : sessionStorage;
    for (const key of Object.keys(storage || {})) {
      if (key === INTENT_STORAGE_KEY || key === 'nextkin_application_attempt_state' ||
        key === 'nextkin_submission_attempted' || /^nextkin_attempt_(?:tab_\d+|[a-f0-9-]{36})$/i.test(key)) {
        storage.removeItem(key);
      }
    }
  } catch {}

  const initialHref = typeof location !== 'undefined' ? location.href : '';
  const initialSnapshot = extractIntentSnapshot(initialHref);
  persistIntentSnapshot(initialSnapshot);
  const initialState = evaluateGate(initialHref);

  // Request MAIN-world network/framework bridge injection from background on supported job portals
  try {
    if (initialState.supported && !initialState.excluded && !initialState.blocked &&
        typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        type: 'NEXTKIN_REGISTER_MAIN_BRIDGES',
        url: initialHref,
        siteKey: initialState.siteKey,
      }).catch(() => {});
    }
  } catch {}

  // Refresh remote site rules in background asynchronously without blocking document_start
  try {
    if (typeof root.NextkinSiteRules?.getCachedRules === 'function') {
      void root.NextkinSiteRules.getCachedRules().then(cached => {
        if (cached) evaluateGate(typeof location !== 'undefined' ? location.href : initialHref);
      }).catch(() => {});
    }
  } catch {}

  // Preserve intent/params across SPA history mutations (Workday, Ashby, Greenhouse, Oracle, React SPAs)
  if (typeof history !== 'undefined' && typeof history.replaceState === 'function') {
    const wrapHistoryMethod = (methodName) => {
      const original = history[methodName];
      if (typeof original !== 'function') return;
      history[methodName] = function (...args) {
        try {
          persistIntentSnapshot(extractIntentSnapshot(typeof location !== 'undefined' ? location.href : ''));
        } catch {}
        const result = original.apply(this, args);
        try {
          const nextHref = typeof location !== 'undefined' ? location.href : '';
          persistIntentSnapshot(extractIntentSnapshot(nextHref));
          const nextState = evaluateGate(nextHref);
          if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
            window.dispatchEvent(new CustomEvent('nextkin:spa-navigation', { detail: nextState }));
          }
        } catch {}
        return result;
      };
    };
    try {
      wrapHistoryMethod('replaceState');
      wrapHistoryMethod('pushState');
    } catch {}
  }

  root.NextkinRuntimeGate = {
    INTENT_STORAGE_KEY,
    extractIntentSnapshot,
    evaluateGate,
    getState: () => root.__nextkinRuntimeGate || evaluateGate(),
    getPreservedIntent: () => intentSnapshot,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
