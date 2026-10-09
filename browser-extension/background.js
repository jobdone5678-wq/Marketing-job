let flushing;
let serial = Promise.resolve();

const supportedJobHosts = [
  'boards.greenhouse.io',
  'job-boards.greenhouse.io',
  'jobs.ashbyhq.com',
  'dice.com',
  'www.dice.com',
  'linkedin.com',
  'www.linkedin.com',
  'indeed.com',
  'www.indeed.com',
  'jobs.lever.co',
  'myworkdayjobs.com'
];

function isSupportedHost(hostname) {
  return supportedJobHosts.some(h => hostname === h || hostname.endsWith('.' + h));
}

function allowed(url, base) {
  try {
    const a = new URL(url), b = new URL(base);
    const path = b.pathname.replace(/\/application\/?$/, '').replace(/\/$/, '');
    return a.origin === b.origin && (a.pathname === path || a.pathname.startsWith(path + '/'));
  } catch {
    return false;
  }
}

async function flush() {
  if (flushing) return flushing;
  flushing = (async () => {
    const config = await chrome.storage.local.get(['origin', 'token', 'outbox']);
    if (!config.origin || !config.token) return;
    const remaining = [];
    for (const event of config.outbox || []) {
      try {
        const r = await fetch(config.origin + '/api/extension/events', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + config.token
          },
          body: JSON.stringify(event),
          signal: AbortSignal.timeout(15000)
        });
        if (r.status === 401 || r.status === 403) {
          remaining.push(event);
          continue;
        }
        if (!r.ok && r.status >= 500) remaining.push(event);
      } catch {
        remaining.push(event);
      }
    }
    await chrome.storage.local.set({ outbox: remaining.slice(-200) });
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

chrome.alarms?.create?.('capture-retry', { periodInMinutes: 1 });
chrome.alarms?.onAlarm?.addListener(() => {
  serial = serial.then(flush, flush);
});

async function receive(message, sender) {
  // Handle action/popup messages (which may not have sender.tab)
  if (message.type === 'get_status') {
    const data = await chrome.storage.local.get(['origin', 'token', 'user', 'candidates']);
    return {
      paired: Boolean(data.token),
      origin: data.origin || 'http://localhost:3000',
      user: data.user || null,
      candidateCount: (data.candidates || []).length
    };
  }

  if (message.type === 'auto_connect') {
    const origin = (message.origin || 'http://localhost:3000').replace(/\/+$/, '');
    try {
      const res = await fetch(origin + '/api/extension/quick-pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Portal connection failed. Please ensure you are logged in to ' + origin);
      await chrome.storage.local.set({
        origin,
        token: data.token,
        credentialId: data.credentialId,
        user: data.user
      });
      // Immediately pre-fetch candidates
      try {
        const cRes = await fetch(origin + '/api/extension/candidates', {
          headers: { 'Authorization': 'Bearer ' + data.token }
        });
        if (cRes.ok) {
          const cData = await cRes.json();
          await chrome.storage.local.set({ candidates: cData.candidates || [] });
        }
      } catch {}
      return { success: true, user: data.user };
    } catch (e) {
      return { error: e.message };
    }
  }

  if (message.type === 'get_candidates') {
    const config = await chrome.storage.local.get(['origin', 'token', 'candidates']);
    if (!config.token) return { error: 'Extension not connected' };
    if (message.refresh || !config.candidates || config.candidates.length === 0) {
      try {
        const res = await fetch(config.origin + '/api/extension/candidates', {
          headers: { 'Authorization': 'Bearer ' + config.token }
        });
        const data = await res.json();
        if (res.ok && data.candidates) {
          await chrome.storage.local.set({ candidates: data.candidates });
          return { candidates: data.candidates };
        }
      } catch {}
    }
    return { candidates: config.candidates || [] };
  }

  if (message.type === 'auto_submit') {
    const config = await chrome.storage.local.get(['origin', 'token']);
    if (!config.token) return { error: 'Extension is not connected to portal.' };
    try {
      const res = await fetch(config.origin + '/api/extension/auto-submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + config.token
        },
        body: JSON.stringify(message.payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to record submission.');
      return { success: true, ...data };
    } catch (e) {
      return { error: e.message };
    }
  }

  // Intent & observation flow
  const tab = sender?.tab?.id;
  if (!tab || !sender?.url) return { error: 'Unsupported page' };

  let urlHostname = '';
  try {
    urlHostname = new URL(sender.url).hostname;
  } catch {
    return { error: 'Invalid URL' };
  }

  if (!isSupportedHost(urlHostname)) {
    return { error: 'Unsupported page' };
  }

  const config = await chrome.storage.local.get(['origin', 'token']);
  if (!config.token) return { error: 'Extension is not paired' };

  const key = 'tab:' + tab;
  let context = (await chrome.storage.session.get(key))[key];

  if (message.intentId) {
    const r = await fetch(config.origin + '/api/extension/intents/' + encodeURIComponent(message.intentId), {
      headers: { Authorization: 'Bearer ' + config.token },
      signal: AbortSignal.timeout(15000)
    });
    const data = await r.json();
    if (!r.ok || !allowed(sender.url, data.intent?.job?.application_url)) {
      return { error: 'Intent does not match this tab' };
    }
    context = {
      intentId: data.intent.id,
      applicationUrl: data.intent.job.application_url,
      attempt: data.intent.attempt || 0
    };
    await chrome.storage.session.set({ [key]: context });
  }

  if (!context || !allowed(sender.url, context.applicationUrl)) {
    return { error: 'Open this application from the portal to link it' };
  }

  if (message.status) {
    if (!['in_progress', 'submit_attempted', 'submitted', 'failed'].includes(message.status)) {
      return { error: 'Invalid event' };
    }
    if (message.status === 'submit_attempted') context.attempt += 1;
    const attempt = Math.max(1, context.attempt);
    await chrome.storage.session.set({ [key]: context });

    const event = {
      intentId: context.intentId,
      eventKey: crypto.randomUUID(),
      status: message.status,
      attempt,
      evidence: String(message.evidence || '').slice(0, 1000),
      url: sender.url.split('#')[0],
      observedAt: new Date().toISOString()
    };

    const { outbox = [] } = await chrome.storage.local.get('outbox');
    if (outbox.length >= 200) return { error: 'Capture queue is full. Use the portal review action.' };
    await chrome.storage.local.set({ outbox: [...outbox, event] });
    await flush();
  }

  return { linked: true };
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  serial = serial.then(() => receive(message, sender)).then(reply, e => reply({ error: e.message }));
  return true;
});

chrome.tabs?.onRemoved?.addListener?.(id => {
  chrome.storage.session?.remove?.('tab:' + id);
});