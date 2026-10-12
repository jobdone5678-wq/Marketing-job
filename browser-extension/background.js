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
  'myworkdayjobs.com',
  'smartrecruiters.com',
  'icims.com',
  'ziprecruiter.com'
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
    const outcomes=[];
    for (const event of config.outbox || []) {
      try {
        const r = await fetch(config.origin + (event._kind==='submission'?'/api/extension/auto-submit':'/api/extension/events'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + config.token
          },
          body: JSON.stringify(event._kind==='submission'?event.payload:event),
          signal: AbortSignal.timeout(15000)
        });
        if (r.status === 401 || r.status === 403) {
          remaining.push(event);
          continue;
        }
        if (!r.ok && (r.status >= 500||r.status===429))remaining.push(event);
        else {const data=typeof r.json==='function'?await r.json().catch(()=>({})):{};outcomes.push({key:event.payload?.eventKey||event.eventKey,ok:r.ok,data});}
      } catch {
        remaining.push(event);
      }
    }
    await chrome.storage.local.set({ outbox: remaining.slice(-200) });
    return outcomes;
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
    const data = await chrome.storage.local.get(['origin', 'token', 'user', 'candidates','outbox']);
    return {
      paired: Boolean(data.token),
      origin: data.origin || 'http://localhost:3000',
      user: data.user || null,
      candidateCount: (data.candidates || []).length,
      pendingCount:(data.outbox||[]).length
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
    if (sender?.tab && (!sender.url || !isSupportedHost(new URL(sender.url).hostname))) return { error: 'Unsupported page' };
    const config = await chrome.storage.local.get(['origin', 'token', 'candidates', 'candidateRole', 'ownCandidateId']);
    if (!config.token) return { error: 'Extension not connected' };
    if (message.refresh || message.candidateId || !config.candidates || config.candidates.length === 0) {
      try {
        const res = await fetch(config.origin + '/api/extension/candidates' + (message.candidateId ? '?candidateId=' + encodeURIComponent(message.candidateId) : ''), {
          headers: { 'Authorization': 'Bearer ' + config.token }
        });
        const data = await res.json();
        if (res.ok && data.candidates) {
          if (!message.candidateId) await chrome.storage.local.set({ candidates: data.candidates, candidateRole: data.role, ownCandidateId: data.ownCandidateId });
          return { candidates: data.candidates, role: data.role, ownCandidateId: data.ownCandidateId };
        }
        await chrome.storage.local.remove(['candidates', 'candidateRole', 'ownCandidateId']);
        return { error: data.error || 'Unable to load candidate profiles', candidates: [] };
      } catch { return { error: 'Unable to refresh candidate profiles', candidates: [] }; }
    }
    return { candidates: config.candidates || [], role: config.candidateRole, ownCandidateId: config.ownCandidateId };
  }

  if (message.type === 'auto_submit') {
    if(!sender?.tab||!sender.url||!isSupportedHost(new URL(sender.url).hostname)||!allowed(sender.url,message.payload?.jobUrl))return {error:'Unsupported application page'};
    const config = await chrome.storage.local.get(['origin', 'token','outbox']);
    if (!config.token) return { error: 'Extension is not connected to portal.' };
    const outbox=config.outbox||[];
    if(outbox.length>=200)return {error:'Capture queue is full. Review this application in the portal.'};
    if(!outbox.some(event=>event._kind==='submission'&&event.payload?.eventKey===message.payload?.eventKey))await chrome.storage.local.set({outbox:[...outbox,{_kind:'submission',payload:message.payload}]});
    const outcomes=await flush();const result=outcomes?.find(item=>item.key===message.payload?.eventKey);
    if(result)return result.ok?{success:true,...result.data}:{error:result.data.error||'Application needs manual review.'};
    return {queued:true};
  }

  if(['get_answer_draft','save_answer_draft'].includes(message.type)){
    if(!sender?.tab||!sender.url||!isSupportedHost(new URL(sender.url).hostname))return {error:'Unsupported application page'};
    const parsed=new URL(sender.url);const scope=parsed.origin+parsed.pathname.replace(/\/(?:application|apply)(?:\/.*)?\/?$/i,'');
    const key='answer-draft:'+sender.tab.id;
    const draft=(await chrome.storage.session.get(key))[key];
    if(message.type==='save_answer_draft'){
      if(!message.candidateId||!Array.isArray(message.answers))return {error:'Invalid answer draft'};
      const applicationScope=draft?.candidateId===message.candidateId&&allowed(sender.url,draft.scope)?draft.scope:scope;
      await chrome.storage.session.set({[key]:{scope:applicationScope,candidateId:message.candidateId,answers:message.answers.slice(0,100),eventKey:message.eventKey,attempt:message.attempt,jobTitle:message.jobTitle,companyName:message.companyName}});return {saved:true};
    }
    return draft&&allowed(sender.url,draft.scope)?draft:{};
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
      candidateId: data.intent.candidate_id,
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
    if (['submit_attempted','submitted'].includes(message.status) && Array.isArray(message.answers)) {
      event.answers = message.answers.slice(0, 100);
    }

    const { outbox = [] } = await chrome.storage.local.get('outbox');
    if (outbox.length >= 200) return { error: 'Capture queue is full. Use the portal review action.' };
    await chrome.storage.local.set({ outbox: [...outbox, event] });
    await flush();
  }

  return { linked: true, candidateId: context.candidateId };
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  serial = serial.then(() => receive(message, sender)).then(reply, e => reply({ error: e.message }));
  return true;
});

chrome.tabs?.onRemoved?.addListener?.(id => {
  chrome.storage.session?.remove?.('tab:' + id);
  chrome.storage.session?.remove?.('answer-draft:'+id);
});
