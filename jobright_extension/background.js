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

function workspaceRequest(token) {
  return { credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(10000),
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } };
}

function cleanApplicationUrl(url) {
  const fields = new Set(['id', 'jobid', 'job_id', 'gh_jid', 'postingid', 'posting_id', 'requisitionid', 'requisition_id', 'jk']);
  if (/(^|\.)greenhouse\.io$/.test(url.hostname)) {
    fields.add('for');
    fields.add('token');
  }
  for (const name of [...url.searchParams.keys()]) {
    if (!fields.has(name.toLowerCase())) url.searchParams.delete(name);
  }
  url.hash = '';
  return url.href;
}

async function prepareApplication(tabId, expectedUrl, job, candidateId, submittedFromPage = false) {
  const url = new URL(expectedUrl);
  if (url.protocol !== 'https:') return false;
  const stillOnApplication = async () => {
    const urlNow = (await chrome.tabs.get(tabId)).url;
    return urlNow === expectedUrl || (submittedFromPage && urlNow && new URL(urlNow).origin === url.origin);
  };
  if (!await stillOnApplication()) throw new Error('The application tab changed. Try autofill again.');
  const { origin, token } = await chrome.storage.local.get(['origin', 'token']);
  const workspace = workspaceOrigin(origin);
  if (!workspace || !token) return false;

  let intentId = new URLSearchParams(url.hash.slice(1)).get('marketing-intent');
  const jobUrl = cleanApplicationUrl(url);
  if (!intentIdPattern.test(intentId || '')) {
    const response = await fetch(workspace + '/api/extension/intents/resolve', {
      ...workspaceRequest(token), method: 'POST', body: JSON.stringify({ url: jobUrl }),
    });
    if (!response.ok) throw new Error('Could not link this form to your NextKinHR application.');
    ({ intentId } = await response.json());
  }
  const key = trackedKey(tabId);
  const context = (await chrome.storage.session.get(key))[key];
  const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : '';
  let externalJob;
  if (!intentIdPattern.test(intentId || '')) {
    intentId = null;
    if (url.origin === workspace || /(^|\.)(nextkinhr\.com|jobright-internal\.com)$/.test(url.hostname)) return false;
    const jobTitle = text(job?.title, 200);
    const companyName = text(job?.company, 200);
    if (!jobTitle || !companyName) return false;
    const previousCandidate = context?.token === token && context.workspace === workspace && context.externalJob?.jobUrl === jobUrl
      ? context.externalJob.candidateId : null;
    externalJob = {
      candidateId: intentIdPattern.test(candidateId || '') ? candidateId : previousCandidate || 'current',
      jobUrl, jobTitle, companyName, portalSource: text(job.portalSource, 100) || url.hostname,
      jobLocation: text(job.location, 200), department: text(job.department, 100),
      employmentType: text(job.employmentType, 50), jobDescription: text(job.description, 60000),
      externalId: text(job.externalId, 200) || null,
    };
  }
  if (!await stillOnApplication()) throw new Error('The application tab changed. Try autofill again.');

  if (context?.intentId !== intentId || context.jobOrigin !== url.origin || context.token !== token || context.workspace !== workspace
    || context.externalJob?.jobUrl !== externalJob?.jobUrl || context.externalJob?.candidateId !== externalJob?.candidateId) {
    await chrome.storage.session.set({ [key]: { intentId, externalJob, jobOrigin: url.origin, workspace, token, eventKey: crypto.randomUUID() } });
  }
  await chrome.scripting.executeScript({ target: { tabId }, files: ['application-confirmation.js'] });
  return true;
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
  const receiptUrl = cleanApplicationUrl(url);
  let endpoint = 'auto-submit';
  let payload = { ...context.externalJob, confirmationUrl: receiptUrl };
  if (context.intentId) {
    const intent = await fetch(context.workspace + '/api/extension/intents/' + context.intentId, workspaceRequest(current.token));
    if (!intent.ok) return false;
    const { intent: detail } = await intent.json();
    if (detail?.id !== context.intentId || !Number.isInteger(detail.attempt)) return false;
    endpoint = 'events';
    payload = { intentId: context.intentId, attempt: Math.max(1, detail.attempt), status: 'confirmed',
      url: receiptUrl, observedAt: new Date().toISOString() };
  } else if (!context.externalJob) return false;

  const response = await fetch(context.workspace + '/api/extension/' + endpoint, {
    ...workspaceRequest(current.token), method: 'POST',
    body: JSON.stringify({ ...payload, eventKey: context.eventKey, evidence: message.evidence }),
  });
  if (!response.ok) return false;
  const saved = await response.json();
  if (context.intentId ? !['submitted', 'confirmed'].includes(saved.status) : saved.success !== true) return false;
  const latest = (await chrome.storage.session.get(key))[key];
  if (latest?.eventKey === context.eventKey) await chrome.storage.session.set({ [key]: { ...context, reported: true } });
  return true;
}

const connectedPanels = new Set();
const pendingTracking = new Map();

chrome.runtime.onConnect.addListener(port => {
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

chrome.runtime.onMessage.addListener((message, sender, reply) => {
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
  if (message?.action === 'prepare_application_tracking' && typeof message.url === 'string') {
    const panel = sender.url === chrome.runtime.getURL('panel.html');
    const applicationPage = sender.url === message.url && sender.frameId === 0;
    const tabId = panel ? message.tabId : applicationPage ? sender.tab?.id : undefined;
    if (!Number.isInteger(tabId)) return false;
    const tracking = prepareApplication(tabId, message.url, message.job, message.candidateId,
      applicationPage && message.submitted === true);
    pendingTracking.set(tabId, tracking);
    void tracking.then(
      tracked => reply({ tracked }),
      error => reply({ error: error.message }),
    ).finally(() => {
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
      // Notify sender tab immediately that panel is opening
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
