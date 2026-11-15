async function configurePanel() {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}

chrome.runtime.onInstalled.addListener(configurePanel);
chrome.runtime.onStartup.addListener(configurePanel);

const trackedKey = tabId => 'application-intent:' + tabId;
const intentIdPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

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

async function trackApplication(tabId, tabUrl) {
  if (!tabUrl || !/^https:\/\//i.test(tabUrl)) return;
  const url = new URL(tabUrl);
  const intentId = new URLSearchParams(url.hash.slice(1)).get('marketing-intent');
  const key = trackedKey(tabId);
  let context = (await chrome.storage.session.get(key))[key];
  if (context && context.jobOrigin !== url.origin && !intentIdPattern.test(intentId || '')) {
    await chrome.storage.session.remove(key);
    return;
  }
  if (intentIdPattern.test(intentId || '') && (intentId !== context?.intentId || url.origin !== context?.jobOrigin)) {
    const { origin, token } = await chrome.storage.local.get(['origin', 'token']);
    const workspace = workspaceOrigin(origin);
    if (!workspace || !token) return;
    context = { intentId, jobOrigin: url.origin, workspace, token, eventKey: crypto.randomUUID() };
    await chrome.storage.session.set({ [key]: context });
  }
  if (context?.jobOrigin !== url.origin || context.reported) return;
  await chrome.scripting.executeScript({ target: { tabId }, files: ['application-confirmation.js'] });
}

chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.status === 'complete' || change.url) {
    void trackApplication(tabId, change.url || tab.url).catch(() => {});
  }
});

chrome.tabs.onRemoved.addListener(tabId => {
  void chrome.storage.session.remove(trackedKey(tabId));
});

async function recordConfirmation(message, sender) {
  if (sender.tab?.id == null || sender.frameId !== 0 || !sender.url) return false;
  const url = new URL(sender.url);
  const key = trackedKey(sender.tab.id);
  const context = (await chrome.storage.session.get(key))[key];
  if (!context || url.origin !== context.jobOrigin) return false;
  if (context.reported) return true;
  const current = await chrome.storage.local.get(['origin', 'token']);
  if (workspaceOrigin(current.origin) !== context.workspace || current.token !== context.token) return false;
  const options = { credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(10000),
    headers: { Authorization: 'Bearer ' + current.token, 'Content-Type': 'application/json' } };
  const intent = await fetch(context.workspace + '/api/extension/intents/' + context.intentId, options);
  if (!intent.ok) return false;
  const { intent: detail } = await intent.json();
  if (detail?.id !== context.intentId || !Number.isInteger(detail.attempt)) return false;
  url.hash = '';
  const response = await fetch(context.workspace + '/api/extension/events', {
    ...options, method: 'POST', body: JSON.stringify({
      intentId: context.intentId, eventKey: context.eventKey, attempt: Math.max(1, detail.attempt),
      status: message.status || 'confirmed', url: url.href, evidence: message.evidence, observedAt: new Date().toISOString(),
    }),
  });
  if (!response.ok) return false;
  const { status } = await response.json();
  if (status !== 'submitted' && status !== 'confirmed') return false;
  const latest = (await chrome.storage.session.get(key))[key];
  if (latest?.eventKey === context.eventKey) await chrome.storage.session.set({ [key]: { ...context, reported: true } });
  return true;
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type !== 'application-confirmation' || typeof message.evidence !== 'string' || message.evidence.length > 200) return;
  void (async () => {
    try { reply(await recordConfirmation(message, sender)); }
    catch { reply(false); }
  })();
  return true;
});
