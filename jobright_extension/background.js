async function configurePanel() {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}

chrome.runtime.onInstalled.addListener(configurePanel);
chrome.runtime.onStartup.addListener(configurePanel);

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
  return { credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(10000),
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } };
}

function portalOrigin(url) {
  return url.origin === 'https://job-boards.greenhouse.io' ? 'https://boards.greenhouse.io' : url.origin;
}

function cleanApplicationUrl(url) {
  const fields = new Set(['id', 'jobid', 'job_id', 'gh_jid', 'jr_id', 'jobreqid', 'postingid', 'posting_id', 'requisitionid', 'requisition_id', 'jk']);
  if (/(^|\.)greenhouse\.io$/.test(url.hostname)) {
    fields.add('for');
    fields.add('token');
  }
  const clean = params => {
    for (const name of [...params.keys()]) {
      if (!fields.has(name.toLowerCase())) params.delete(name);
    }
  };
  clean(url.searchParams);
  const [route, query] = url.hash.slice(1).split(/\?(.*)/s, 2);
  const routeParams = new URLSearchParams(query);
  clean(routeParams);
  url.hash = /^!?\//.test(route) ? route + (routeParams.size ? '?' + routeParams : '') : '';
  return url.href;
}

async function loadApplicationData(path) {
  const { origin, token } = await chrome.storage.local.get(['origin', 'token']);
  const workspace = workspaceOrigin(origin);
  if (!workspace || !token) return null;
  const response = await fetch(workspace + '/api/extension/' + path, workspaceRequest(token));
  if (!response.ok) return null;
  const data = await response.json();
  const current = await chrome.storage.local.get(['origin', 'token']);
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
  const { origin, token } = await chrome.storage.local.get(['origin', 'token']);
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
  const current = await chrome.storage.local.get(['origin', 'token']);
  if (!sameApplicationStepScope(new URL(step.formUrl), url) || step.origin !== current.origin || step.token !== current.token ||
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
  const { origin, token, activeCandidateId } = await chrome.storage.local.get(['origin', 'token', 'activeCandidateId']);
  const workspace = workspaceOrigin(origin);
  if (!workspace || !token || (await chrome.tabs.get(tabId)).url !== tabUrl) return false;

  const key = embeddedKey(tabId);
  const storage = await chrome.storage.session.get([key, trackedKey(tabId)]);
  const top = storage[trackedKey(tabId)];
  if (top?.intentId && top.jobOrigin === portalOrigin(parent)) {
    if (storage[key]) await chrome.storage.session.remove(key);
    return true;
  }
  const previous = storage[key];
  const jobUrl = cleanApplicationUrl(new URL(url));
  const sameForm = previous?.documentId === frame.documentId && previous.parentUrl === parent.href && previous.externalJob.jobUrl === jobUrl &&
    previous.token === token && previous.workspace === workspace;
  const selectedCandidate = candidateId || (sameForm && previous.externalJob.candidateId) ||
    (intentIdPattern.test(activeCandidateId || '') ? activeCandidateId : 'current');
  if (sameForm && previous.externalJob.candidateId === selectedCandidate) {
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
    frameId: frame.frameId, documentId: frame.documentId, parentUrl: parent.href, jobOrigin: portalOrigin(url), workspace, token,
    externalJob: { ...externalJob, externalId: ashbyFramePosting(url) || externalJob.externalId }, eventKey: crypto.randomUUID(),
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
  const current = await chrome.storage.local.get(['origin', 'token']);
  if (workspaceOrigin(current.origin) !== context.workspace || current.token !== context.token) return;
  if (outsideDiscoveries.get(key) === context.eventKey) return;
  outsideDiscoveries.set(key, context.eventKey);
  const job = context.externalJob;
  let saved = false;
  try {
    const response = await fetch(context.workspace + '/api/extension/save-external-job', {
      ...workspaceRequest(context.token), method: 'POST', body: JSON.stringify({
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
  const { origin, token, activeCandidateId } = await chrome.storage.local.get(['origin', 'token', 'activeCandidateId']);
  const workspace = workspaceOrigin(origin);
  if (!workspace || !token) return false;

  let intentId = new URLSearchParams(url.hash.slice(1)).get('marketing-intent');
  const jobUrl = cleanApplicationUrl(url);
  const key = trackedKey(tabId);
  const context = (await chrome.storage.session.get(key))[key];
  if (submittedFromPage && context?.applicationUrl === jobUrl && context.token === token && context.workspace === workspace) {
    if (context.reported) return false;
    if (submissionEvidence) await chrome.storage.session.set({ [key]: { ...context, submissionEvidence } });
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
    if (candidateId && intent?.candidate_id !== candidateId) throw new Error('Select the candidate who started this application.');
  }
  let externalJob;
  if (!intentIdPattern.test(intentId || '')) {
    intentId = null;
    if (url.origin === workspace || /(^|\.)(nextkinhr\.com|jobright-internal\.com)$/.test(url.hostname)) return false;
    const previousCandidate = context?.token === token && context.workspace === workspace && context.externalJob?.jobUrl === jobUrl
      ? context.externalJob.candidateId : null;
    const selectedCandidate = intentIdPattern.test(activeCandidateId || '') ? activeCandidateId : 'current';
    externalJob = externalJobDetails(job, url, jobUrl, intentIdPattern.test(candidateId || '') ? candidateId : previousCandidate || selectedCandidate);
    if (!externalJob) return false;
  }
  if (!await stillOnApplication()) throw new Error('The application tab changed. Try autofill again.');

  const changed = context?.intentId !== intentId || context?.jobOrigin !== jobOrigin || context.token !== token || context.workspace !== workspace
    || (context.applicationUrl && context.applicationUrl !== jobUrl)
    || context.externalJob?.jobUrl !== externalJob?.jobUrl || context.externalJob?.candidateId !== externalJob?.candidateId;
  if (changed || submissionEvidence || !context.applicationUrl) {
    const tracking = changed ? { intentId, externalJob, jobOrigin, workspace, token, eventKey: crypto.randomUUID() } : context;
    await chrome.storage.session.set({ [key]: { ...tracking, applicationUrl: jobUrl,
      ...(submissionEvidence ? { submissionEvidence } : {}) } });
  }
  await chrome.scripting.executeScript({ target: { tabId }, files: ['application-confirmation.js'] });
  return true;
}

async function trackApplication(tabId, tabUrl) {
  if (!tabUrl || !/^https:\/\//i.test(tabUrl)) return;
  const url = new URL(tabUrl);
  const jobOrigin = portalOrigin(url);
  const intentId = new URLSearchParams(url.hash.slice(1)).get('marketing-intent');
  const key = trackedKey(tabId);
  let context = (await chrome.storage.session.get(key))[key];
  if (context && context.jobOrigin !== jobOrigin && !intentIdPattern.test(intentId || '')) {
    await chrome.storage.session.remove(key);
    return;
  }
  if (intentIdPattern.test(intentId || '') && (intentId !== context?.intentId || jobOrigin !== context?.jobOrigin)) {
    const { origin, token } = await chrome.storage.local.get(['origin', 'token']);
    const workspace = workspaceOrigin(origin);
    if (!workspace || !token) return;
    context = { intentId, jobOrigin, workspace, token, eventKey: crypto.randomUUID() };
    await chrome.storage.session.set({ [key]: context });
  }
  if (context?.jobOrigin !== jobOrigin || context.reported) return;
  await chrome.scripting.executeScript({ target: { tabId }, files: ['application-confirmation.js'] });
}

chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.status === 'complete' || change.url) {
    void trackApplication(tabId, change.url || tab.url).catch(() => {});
  }
});

chrome.tabs.onRemoved.addListener(tabId => {
  outsideDiscoveries.delete(trackedKey(tabId));
  outsideDiscoveries.delete(embeddedKey(tabId));
  void chrome.storage.session.remove([trackedKey(tabId), stepKey(tabId), embeddedKey(tabId)]);
});

async function recordConfirmation(message, sender) {
  if (sender.tab?.id == null || !Number.isInteger(sender.frameId) || !sender.url) return false;
  const url = new URL(sender.url);
  const embedded = sender.frameId !== 0;
  const key = embedded ? embeddedKey(sender.tab.id) : trackedKey(sender.tab.id);
  const context = (await chrome.storage.session.get(key))[key];
  if (!context || portalOrigin(url) !== context.jobOrigin) return false;
  if (embedded) {
    if (sender.frameId !== context.frameId || sender.documentId !== context.documentId || !sender.tab.url) return false;
    const parent = new URL(sender.tab.url);
    if (parent.href !== context.parentUrl || !matchesEmbeddedPosting(parent, url)) return false;
  }
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
      url: receiptUrl, applicationUrl: context.applicationUrl, observedAt: new Date().toISOString() };
  } else if (!context.externalJob) return false;

  const response = await fetch(context.workspace + '/api/extension/' + endpoint, {
    ...workspaceRequest(current.token), method: 'POST',
    body: JSON.stringify({ ...payload, ...context.submissionEvidence, eventKey: context.eventKey, evidence: message.evidence }),
  });
  if (!response.ok) return false;
  const saved = await response.json();
  if (context.intentId ? !['submitted', 'confirmed'].includes(saved.status) : saved.success !== true) return false;
  const latest = (await chrome.storage.session.get(key))[key];
  if (latest?.eventKey === context.eventKey) {
    const { submissionEvidence, ...completed } = latest;
    await chrome.storage.session.set({ [key]: { ...completed, reported: true } });
  }
  return true;
}

const connectedPanels = new Set();
const pendingTracking = new Map();
const pendingSteps = new Map();

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
  if (message?.type === 'embedded-application-document') {
    void resumeEmbeddedTracking(sender).then(() => reply(true), () => reply(false));
    return true;
  }
  if (message?.action === 'load_application_resume' && sender.frameId === 0 && sender.tab?.id != null) {
    void loadApplicationResume(message.candidateId).then(reply, () => reply(null));
    return true;
  }
  if (message?.action === 'load_application_profile' && sender.tab?.id != null) {
    void loadSavedProfile(message.candidateId).then(reply, () => reply(null));
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
