if (typeof importScripts === 'function') importScripts('resume-engine.js','resume-workflows.js');
let flushing;
let serial = Promise.resolve();

const supportedJobHosts = [
  'boards.greenhouse.io',
  'job-boards.greenhouse.io',
  'greenhouse.io',
  'jobs.ashbyhq.com',
  'ashbyhq.com',
  'dice.com',
  'www.dice.com',
  'linkedin.com',
  'www.linkedin.com',
  'indeed.com',
  'www.indeed.com',
  'jobs.lever.co',
  'lever.co',
  'myworkdayjobs.com',
  'workday.com',
  'smartrecruiters.com',
  'jobs.smartrecruiters.com',
  'icims.com',
  'ziprecruiter.com',
  'bamboohr.com',
  'workable.com',
  'apply.workable.com',
  'taleo.net',
  'successfactors.com',
  'successfactors.eu',
  'paylocity.com',
  'recruiting.paylocity.com',
  'recruitingbypaycor.com',
  'rippling-ats.com',
  'ats.rippling.com',
  'oraclecloud.com',
  'clearcompany.com',
  'breezy.hr',
  'jobvite.com',
  'jazzhr.com'
];

// Universal support for all web domains (Owned by Nextkinlife LLC)
function isSupportedHost(hostname) {
  if (!hostname) return false;
  const h = String(hostname).toLowerCase();
  if (h === 'newtab' || h.startsWith('chrome') || h.startsWith('devtools') || h.includes('extension')) return false;
  return true;
}

function allowed(url, base) {
  if (!url || !base) return false;
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
    const config = await chrome.storage.local.get(['origin', 'token', 'outbox', 'captureReviewHistory']);
    if (!config.origin || !config.token) return;
    const remaining = [];
    const outcomes=[];
    const reviewedIntents=[];
    for (const event of config.outbox || []) {
      if (event._delivery?.manualReview) { remaining.push(event); continue; }
      try {
        const observation = { ...event };
        delete observation._delivery;
        const r = await fetch(config.origin + (event._kind==='submission'?'/api/extension/auto-submit':'/api/extension/events'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + config.token
          },
          body: JSON.stringify(event._kind==='submission'?event.payload:observation),
          signal: AbortSignal.timeout(15000)
        });
        if (!r.ok) {
          const needsReconnect = r.status === 401 || r.status === 403;
          const manualReview = !needsReconnect && r.status !== 408 && r.status !== 429 && r.status < 500;
          event._delivery = { status: r.status, manualReview, needsReconnect };
          remaining.push(event);
          outcomes.push({key:event.payload?.eventKey||event.eventKey,ok:false,queued:true,manualReview,needsReconnect});
        } else {
          const data=typeof r.json==='function'?await r.json().catch(()=>({})):{};
          outcomes.push({key:event.payload?.eventKey||event.eventKey,ok:true,data});
          if(event.manualAttestation===true)reviewedIntents.push({intentId:event.intentId,attempt:event.attempt});
        }
      } catch {
        remaining.push(event);
      }
    }
    const reviewed=remaining.filter(event=>event._delivery?.manualReview&&reviewedIntents.some(intent=>intent.intentId===event.intentId&&intent.attempt===event.attempt));
    const retained=remaining.filter(event=>!reviewed.includes(event));
    const changes={outbox:retained.slice(-200)};
    if(reviewed.length)changes.captureReviewHistory=[...(config.captureReviewHistory||[]),...reviewed.map(event=>({...event,_reviewedAt:new Date().toISOString()}))].slice(-200);
    await chrome.storage.local.set(changes);
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
      pendingCount:(data.outbox||[]).length,
      manualReviewCount:(data.outbox||[]).filter(event=>event._delivery?.manualReview).length
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

  if (message.type === 'save_uploaded_resume') {
    if (!message.candidate || !message.candidate.full_name) return { error: 'Invalid candidate profile' };
    const config = await chrome.storage.local.get(['uploadedCandidate','uploadedProfiles']);
    const profiles = {...config.uploadedProfiles};
    if (config.uploadedCandidate) profiles[config.uploadedCandidate.id] = {id:config.uploadedCandidate.id,full_name:config.uploadedCandidate.full_name,email:config.uploadedCandidate.email || ''};
    const candidate = {...message.candidate};
    const previous = candidate.email && Object.values(profiles).find(profile => profile.full_name.toLowerCase() === candidate.full_name.toLowerCase() && profile.email.toLowerCase() === candidate.email.toLowerCase());
    if (previous) candidate.id = previous.id;
    if (!String(candidate.id || '').startsWith('uploaded')) candidate.id = 'uploaded-resume-' + crypto.randomUUID();
    profiles[candidate.id] = {id:candidate.id,full_name:candidate.full_name,email:candidate.email || ''};
    await chrome.storage.local.set({ uploadedCandidate:candidate,uploadedProfiles:profiles });
    return { success: true, candidate };
  }

  if (message.type === 'clear_uploaded_resume') {
    await chrome.storage.local.remove(['uploadedCandidate']);
    return { success: true };
  }

  if (message.type === 'get_candidates') {
    if (sender?.tab && (!sender.url || !isSupportedHost(new URL(sender.url).hostname))) return { error: 'Unsupported page' };
    const config = await chrome.storage.local.get(['origin', 'token', 'candidates', 'candidateRole', 'ownCandidateId', 'uploadedCandidate']);
    const uploaded = config.uploadedCandidate ? [config.uploadedCandidate] : [];

    // Case A: Connected to NextKinHR Recruiter Portal
    if (config.token) {
      if (message.refresh || message.candidateId || !config.candidates || config.candidates.length === 0) {
        try {
          const res = await fetch(config.origin + '/api/extension/candidates' + (message.candidateId ? '?candidateId=' + encodeURIComponent(message.candidateId) : ''), {
            headers: { 'Authorization': 'Bearer ' + config.token }
          });
          const data = await res.json();
          if (res.ok && data.candidates) {
            const combined = [...data.candidates, ...uploaded.filter(u => !data.candidates.some(c => c.id === u.id))];
            if (!message.candidateId) await chrome.storage.local.set({ candidates: data.candidates, candidateRole: data.role, ownCandidateId: data.ownCandidateId });
            return { candidates: combined, role: data.role, ownCandidateId: data.ownCandidateId, connected: true };
          }
          await chrome.storage.local.remove(['candidates', 'candidateRole', 'ownCandidateId']);
          return { error: data.error || 'Unable to load candidate profiles', candidates: uploaded, connected: true };
        } catch { return { error: 'Unable to refresh candidate profiles', candidates: uploaded, connected: true }; }
      }
      const combined = [...(config.candidates || []), ...uploaded.filter(u => !(config.candidates || []).some(c => c.id === u.id))];
      return { candidates: combined, role: config.candidateRole, ownCandidateId: config.ownCandidateId, connected: true };
    }

    // Case B: Standalone Mode (No NextKinHR Portal connection)
    if (uploaded.length > 0) {
      return {
        candidates: uploaded,
        role: 'standalone',
        ownCandidateId: uploaded[0].id,
        standalone: true,
        connected: false
      };
    }

    return {
      candidates: [],
      role: 'standalone',
      ownCandidateId: null,
      standalone: true,
      connected: false,
      message: 'Upload a resume to enable autofill & ATS matching without NextKinHR login.'
    };
  }

  if (message.type === 'get_resume_file') {
    const candidateId = message.candidateId;
    if (!candidateId) return { error: 'Candidate ID is required' };
    const config = await chrome.storage.local.get(['origin', 'token', 'uploadedCandidate']);

    // Check if it's the locally uploaded resume
    if (config.uploadedCandidate?.id === candidateId) {
      const file = config.uploadedCandidate.resume_file;
      if (file && file.base64) {
        return {
          success: true,
          file: {
            filename: file.filename || `${config.uploadedCandidate.full_name.replace(/[^a-zA-Z0-9]/g, '_')}_Resume.pdf`,
            mimeType: file.mimeType || 'application/pdf',
            base64: file.base64,
            candidateName: config.uploadedCandidate.full_name
          }
        };
      }
      return {error:'These candidate details were provided as text. Generate a tailored DOCX for the current JD before attaching a resume.'};
    }

    if (!config.token) return { error: 'Extension not connected and no resume uploaded' };
    try {
      const res = await fetch(`${config.origin}/api/extension/resume-file?candidateId=${encodeURIComponent(candidateId)}`, {
        headers: { 'Authorization': 'Bearer ' + config.token }
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error || 'Failed to fetch resume file' };
      return { success: true, file: data };
    } catch (err) {
      return { error: err.message };
    }
  }

  if (message.type === 'get_ai_answers') {
    const config = await chrome.storage.local.get(['origin', 'token', 'uploadedCandidate']);
    if (config.token) {
      try {
        const res = await fetch(`${config.origin}/api/extension/ai-answers`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + config.token
          },
          body: JSON.stringify({
            candidateId: message.candidateId,
            jobTitle: message.jobTitle,
            companyName: message.companyName,
            jobDescription: message.jobDescription,
            questions: message.questions
          })
        });
        const data = await res.json();
        if (res.ok) return data;
      } catch (err) {}
    }

    // Standalone fallback: Answer based on uploaded candidate resume facts
    const cand = (config.uploadedCandidate?.id === message.candidateId)
      ? config.uploadedCandidate
      : (config.candidates || []).find(c => c.id === message.candidateId) || config.uploadedCandidate;

    if (cand && Array.isArray(message.questions)) {
      const answers = {};
      const exp = cand.total_experience_years || 5;
      const skills = cand.primary_skills || 'Full stack development';
      for (const q of message.questions) {
        const key = q.id || q.label;
        const lbl = (q.label || '').toLowerCase();
        if (/year.*experience|how\s*many\s*years/i.test(lbl)) {
          answers[key] = String(exp);
        } else if (/sponsor|authoriz/i.test(lbl)) {
          answers[key] = cand.authorized_in_usa ? 'Yes' : 'No';
        } else if (/salary|compensation/i.test(lbl)) {
          answers[key] = cand.expected_salary || 'Competitive market rate';
        } else if (/notice|start/i.test(lbl)) {
          answers[key] = cand.notice_period || 'Immediately';
        } else if (/relocat/i.test(lbl)) {
          answers[key] = cand.open_to_relocation ? 'Yes' : 'No';
        } else {
          answers[key] = `I have ${exp}+ years of professional experience working with ${skills}, delivering high quality scalable software solutions that align with team goals.`;
        }
      }
      return { success: true, answers };
    }
    return { error: 'Failed to generate answers: No active candidate profile.' };
  }

  if (['tailor_resume','list_resume_versions','get_saved_resume','list_resume_profiles'].includes(message.type)) {
    if (!globalThis.NextkinResumeWorkflows) return {error:'Reload the updated extension to enable resume generation.'};
    return globalThis.NextkinResumeWorkflows.handle(message);
  }

  if (message.type === 'auto_submit') {
    if(!sender?.tab||!sender.url||!isSupportedHost(new URL(sender.url).hostname)||!allowed(sender.url,message.payload?.jobUrl))return {error:'Unsupported application page'};
    const config = await chrome.storage.local.get(['origin', 'token','outbox']);
    if (!config.token) return { error: 'Extension is not connected to portal.' };
    const outbox=config.outbox||[];
    const pending=outbox.find(event=>event._kind==='submission'&&event.payload?.eventKey===message.payload?.eventKey);
    if(pending?._delivery?.manualReview){
      if(message.payload?.manualAttestation!==true)return {queued:true,manualReview:true};
      if(pending.payload.candidateId!==message.payload.candidateId)return {error:'This capture belongs to a different candidate. Review it in the portal.'};
      // An explicit reviewed attestation may replace the rejected delivery, while
      // retaining its original automatic evidence after the new delivery succeeds.
      // Reuse the key so a partial earlier save cannot create another application.
      const {captureReviewHistory=[]}=await chrome.storage.local.get('captureReviewHistory');
      await chrome.storage.local.set({
        captureReviewHistory:[...captureReviewHistory,{...pending,_reviewedAt:new Date().toISOString()}].slice(-200),
        outbox:outbox.map(event=>event===pending?{_kind:'submission',payload:message.payload}:event)
      });
    }else if(!pending){
      if(outbox.length>=200)return {error:'Capture queue is full. Review this application in the portal.'};
      await chrome.storage.local.set({outbox:[...outbox,{_kind:'submission',payload:message.payload}]});
    }
    const outcomes=await flush();const result=outcomes?.find(item=>item.key===message.payload?.eventKey);
    if(result)return result.ok?{success:true,...result.data}:{queued:true,manualReview:result.manualReview,needsReconnect:result.needsReconnect};
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
    if(message.manualAttestation===true&&message.status!=='submitted')return {error:'A manual attestation must refer to a submitted application.'};
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
    if(message.manualAttestation===true)event.manualAttestation=true;
    if (!event.manualAttestation && ['submit_attempted','submitted'].includes(message.status) && Array.isArray(message.answers)) {
      event.answers = message.answers.slice(0, 100);
    }

    const { outbox = [] } = await chrome.storage.local.get('outbox');
    if (outbox.length >= 200) return { error: 'Capture queue is full. Use the portal review action.' };
    await chrome.storage.local.set({ outbox: [...outbox, event] });
    const outcomes = await flush();
    const result = outcomes?.find(item => item.key === event.eventKey);
    return { linked: true, candidateId: context.candidateId, success: result?.ok === true, queued: result?.ok !== true, manualReview: result?.manualReview === true, needsReconnect: result?.needsReconnect === true };
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
