(function (root) {
  'use strict';

  const CACHE_STORAGE_KEY = 'nextkin_site_rules_v1';
  const SELECTOR_TTL = 6 * 60 * 60 * 1000;
  const POLICY_TTL = 2 * 60 * 1000;
  const modes = new Set(['active', 'legacy', 'off']);
  const sites = new Map();
  const refreshes = new Map();
  const retryAfter = new Map();
  const empty = { schemaVersion: 1, sites: {} };
  let memoryCache = null;
  let memoryCacheAccountId = null;

  // Chrome extension version components are integers 0..65535 (up to 4 dot-separated parts).
  const versionPattern = /^(?:0|[1-9]\d{0,4})(?:\.(?:0|[1-9]\d{0,4})){0,3}$/;
  const isValidExtensionVersion = value => typeof value === 'string' && versionPattern.test(value) &&
    value.split('.').every(part => Number(part) >= 0 && Number(part) <= 65535);
  const getExtensionVersion = () => typeof chrome !== 'undefined' ? chrome.runtime?.getManifest?.()?.version || '0' : '0';

  function compareExtensionVersion(a, b) {
    if (!isValidExtensionVersion(a) || !isValidExtensionVersion(b)) return NaN;
    const left = a.split('.').map(Number);
    const right = b.split('.').map(Number);
    for (let i = 0; i < 4; i++) {
      const difference = (left[i] || 0) - (right[i] || 0);
      if (difference) return Math.sign(difference);
    }
    return 0;
  }

  function workspaceOrigin(value) {
    try {
      const url = new URL(value);
      if (url.username || url.password) return null;
      if (url.protocol === 'https:' && /(^|\.)(nextkinhr\.com|jobright-internal\.com)$/.test(url.hostname)) return url.origin;
      if (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)) return url.origin;
    } catch {}
    return null;
  }

  const isObject = value => value && typeof value === 'object' && !Array.isArray(value);
  const isSiteKey = value => /^[a-z][a-z0-9_-]{0,40}$/.test(value) &&
    (value === 'generic' || Object.hasOwn(root.NextkinSiteRegistry?.SITE_BY_KEY || {}, value));
  const strings = (value, max = 256) => Array.isArray(value) && value.length <= 40 &&
    value.every(item => typeof item === 'string' && item.trim() && item.length <= max);
  const selector = value => {
    if (typeof document === 'undefined') return true;
    try { document.createDocumentFragment().querySelector(value); return true; } catch { return false; }
  };

  function validateRules(rules) {
    if (!isObject(rules) || rules.schemaVersion !== 1 || !isObject(rules.sites) ||
      (rules.globalMode !== undefined && !modes.has(rules.globalMode)) ||
      (rules.revision !== undefined && (typeof rules.revision !== 'string' || rules.revision.length > 80)) ||
      (rules.disabledSites !== undefined && (!strings(rules.disabledSites, 41) || !rules.disabledSites.every(isSiteKey)))) return false;
    const allowedRoot = new Set(['schemaVersion', 'revision', 'globalMode', 'siteRulesKillSwitch', 'disabledSites', 'sites']);
    const allowedSite = new Set(['mode', 'killSwitch', 'minExtensionVersion', 'maxExtensionVersion', 'confirmationSelectors',
      'errorSelectors', 'selectorTables', 'preservedParams', 'excludePathPatterns']);
    if (Object.keys(rules).some(key => !allowedRoot.has(key))) return false;
    return Object.entries(rules.sites).every(([key, entry]) => {
      if (!isSiteKey(key) || !isObject(entry) || Object.keys(entry).some(name => !allowedSite.has(name))) return false;
      if (entry.mode !== undefined && !modes.has(entry.mode)) return false;
      for (const key of ['minExtensionVersion', 'maxExtensionVersion']) {
        if (entry[key] !== undefined && !isValidExtensionVersion(entry[key])) return false;
      }
      if (entry.minExtensionVersion && entry.maxExtensionVersion && compareExtensionVersion(entry.minExtensionVersion, entry.maxExtensionVersion) > 0) return false;
      for (const key of ['confirmationSelectors', 'errorSelectors', 'preservedParams', 'excludePathPatterns']) {
        if (entry[key] !== undefined && !strings(entry[key])) return false;
      }
      if ([...(entry.confirmationSelectors || []), ...(entry.errorSelectors || [])].some(value => !selector(value))) return false;
      if (entry.preservedParams?.some(value => !/^[a-z0-9_-]{1,48}$/i.test(value) || /token|secret|password|credential|session|auth|api[-_]?key/i.test(value))) return false;
      // Prefixes keep the contract predictable and avoid executing remote regexes.
      if (entry.excludePathPatterns?.some(value => !value.startsWith('/') && !value.startsWith('#/'))) return false;
      if (entry.selectorTables !== undefined && (!isObject(entry.selectorTables) ||
        Object.entries(entry.selectorTables).some(([name, list]) => name !== 'fields' || !strings(list) || !list.every(selector)))) return false;
      return true;
    });
  }

  function validateSiteRuleEntry(entry, version) {
    if (!isObject(entry)) return null;
    if (entry.minExtensionVersion && !(compareExtensionVersion(version, entry.minExtensionVersion) >= 0)) return null;
    if (entry.maxExtensionVersion && !(compareExtensionVersion(version, entry.maxExtensionVersion) <= 0)) return null;
    return entry;
  }

  function evaluateSitePolicy(siteKey, version = getExtensionVersion(), payload = memoryCache) {
    const hasPayload = Boolean(payload && (isObject(payload.rules) || isObject(payload.sites)));
    const rules = payload?.rules || payload || empty;
    const selectorsStale = typeof payload?.expiresAt === 'number' && payload.expiresAt <= Date.now();
    // policyExpiresAt is independent of the selector TTL: once it passes, the remote mode / kill switch
    // are no longer authoritative and the built-in (legacy) policy applies.
    const policyExpired = typeof payload?.policyExpiresAt === 'number' && payload.policyExpiresAt <= Date.now();
    const stale = selectorsStale || policyExpired;
    const killMode = value => value === true ? 'off' : value === false ? undefined : value;
    // Resolve the last trusted configuration first. An explicit "off" decision (global kill switch,
    // per-site mode, or disabledSites) is sticky: expiry of its freshness window must never turn a
    // disabled site back into a site eligible for legacy autofill.
    const rawGlobalMode = killMode(rules.siteRulesKillSwitch) || rules.globalMode || (hasPayload ? 'active' : 'legacy');
    const entry = validateSiteRuleEntry(rules.sites?.[siteKey], version);
    const rawSiteMode = killMode(entry?.killSwitch) || entry?.mode || rawGlobalMode;
    const disabled = rawGlobalMode === 'off' || rawSiteMode === 'off' ||
      Boolean(rules.disabledSites?.includes(siteKey));
    // Only permissive policies degrade to legacy. Blocked policies stay blocked until a fresh,
    // validated configuration replaces the cached entry (getWorkspaceRules does that on refresh).
    const globalMode = policyExpired && !disabled ? 'legacy' : rawGlobalMode;
    const siteMode = policyExpired && !disabled ? 'legacy' : rawSiteMode;
    const blocked = !modes.has(rawGlobalMode) || !modes.has(rawSiteMode) || disabled;
    const mode = blocked ? 'off' : (!hasPayload || stale || policyExpired || globalMode === 'legacy') ? 'legacy' : siteMode;
    const overlays = mode === 'active' ? entry || {} : {};
    return {
      siteKey, blocked, mode,
      stale: stale || !hasPayload, revision: rules.revision,
      selectorTables: overlays.selectorTables || {},
      confirmationSelectors: overlays.confirmationSelectors || [],
      errorSelectors: overlays.errorSelectors || [],
      preservedParams: overlays.preservedParams || [],
      // Retain safety path exclusions even when rules become stale or degraded.
      excludePathPatterns: blocked ? [] : (entry?.excludePathPatterns || []),
    };
  }

  function automationDisabled(input, activeOnly = false, payload = memoryCache, version = getExtensionVersion(), doc = typeof document !== 'undefined' ? document : undefined) {
    const registry = root.NextkinSiteRegistry;
    if (registry?.isExcludedUrl(input)) return true;
    const policy = evaluateSitePolicy(registry?.detectAtsProvider(input, doc) || 'generic', version, payload);
    if (policy.blocked || (activeOnly && policy.mode !== 'active')) return true;
    try {
      const url = new URL(String(input).includes('://') ? input : 'https://' + input);
      return policy.excludePathPatterns.some(prefix =>
        prefix.startsWith('#') ? url.hash.startsWith(prefix) : url.pathname.startsWith(prefix));
    } catch { return true; }
  }

  function isSiteBlocked(input, version, payload) {
    return automationDisabled(input, false, payload, version);
  }

  function invalidateCache() {
    memoryCache = null;
    memoryCacheAccountId = null;
    sites.clear();
    retryAfter.clear();
  }

  async function getCachedRules() {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage && typeof document !== 'undefined') {
      try {
        const entry = await chrome.runtime.sendMessage({ type: 'NEXTKIN_GET_SITE_RULES' });
        if (!entry || !validateRules(entry.rules) || (memoryCacheAccountId && entry.accountId && entry.accountId !== memoryCacheAccountId)) {
          memoryCache = entry && validateRules(entry.rules) ? entry : null;
          memoryCacheAccountId = memoryCache ? (entry.accountId || null) : null;
        } else {
          memoryCache = entry;
          memoryCacheAccountId = entry.accountId || memoryCacheAccountId;
        }
      } catch {
        memoryCache = null;
        memoryCacheAccountId = null;
      }
    }
    return memoryCache;
  }

  async function getWorkspaceRules(origin, token, accountId, version = getExtensionVersion()) {
    const workspace = workspaceOrigin(origin);
    if (!workspace || !token || typeof accountId !== 'string' || !accountId || !isValidExtensionVersion(version)) return null;
    const key = JSON.stringify([CACHE_STORAGE_KEY, workspace, accountId, version]);
    if (refreshes.has(key)) return refreshes.get(key);
    const refresh = (async () => {
      const stored = sites.get(key) || (await chrome.storage?.local?.get(key).catch(() => ({})))?.[key];
      const cached = stored && validateRules(stored.rules) ? stored : null;
      const now = Date.now();
      const policyFresh = cached && typeof cached.policyExpiresAt === 'number' && cached.policyExpiresAt > now;
      if (policyFresh || retryAfter.get(key) > now) return cached;
      retryAfter.set(key, now + 60000);
      try {
        const url = new URL('/api/extension/site-rules', workspace);
        url.searchParams.set('version', version);
        const result = await fetch(url, {
          credentials: 'omit', redirect: 'error', cache: 'no-store',
          signal: typeof AbortSignal !== 'undefined' ? AbortSignal.timeout?.(4000) : undefined,
          headers: { Authorization: 'Bearer ' + token },
        });
        if (!result.ok) return cached;
        const text = await result.text();
        if (text.length > 128000) return cached;
        const parsed = JSON.parse(text);
        const rules = parsed.rules || parsed;
        if (!validateRules(rules)) return cached;
        const fetchedAt = Date.now();
        const entry = {
          rules,
          accountId,
          expiresAt: fetchedAt + SELECTOR_TTL,
          policyExpiresAt: fetchedAt + POLICY_TTL,
        };
        sites.set(key, entry);
        await chrome.storage?.local?.set({ [key]: entry }).catch(() => {});
        return entry;
      } catch {
        return cached;
      }
    })();
    refreshes.set(key, refresh);
    try { return await refresh; } finally { refreshes.delete(key); }
  }

  root.NextkinSiteRules = {
    POLICY_TTL, SELECTOR_TTL,
    compareExtensionVersion, compareSemver: compareExtensionVersion,
    getExtensionVersion, getCachedRules, invalidateCache, evaluateSitePolicy, isSiteBlocked, automationDisabled,
    getWorkspaceRules, refreshFromWorkspace: getWorkspaceRules,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.NextkinSiteRules;
})(typeof globalThis !== 'undefined' ? globalThis : this);
