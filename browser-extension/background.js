if (typeof importScripts === 'function') importScripts('embedded-support.js','resume-engine.js', 'candidate-context.js', 'job-context.js', 'fill-session.js', 'resume-workflows.js');
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
  if(message.type==='register_embedded_form'){
    const support=globalThis.NextkinEmbeddedSupport;
    if(!support||!sender.tab?.id||!sender.frameId||!support.validFrame(sender.tab.url,sender.url))return {error:'Unsupported embedded form.'};
    const job=support.stripeJob(sender.tab.url);
    await chrome.storage.session.set({['embedded:'+sender.tab.id+':'+job.id]:{frameId:sender.frameId,url:sender.url}});return {success:true};
  }
  if(message.type==='embedded_form_action'){
    const support=globalThis.NextkinEmbeddedSupport,job=support?.stripeJob(sender.url);
    if(!job||job.kind!=='apply'||sender.frameId||!sender.tab?.id||message.jobUrl!==sender.url||!['fill','undo'].includes(message.op)||typeof message.sessionId!=='string'||message.sessionId.length>500)return {error:'Unsupported embedded application context.'};
    const key='embedded:'+sender.tab.id+':'+job.id;let target;
    for(let attempt=0;attempt<6;attempt++){target=(await chrome.storage.session.get(key))[key];if(target)break;await new Promise(resolve=>setTimeout(resolve,100));}
    if(!target||!support.validFrame(sender.url,target.url))return {error:'Embedded form is not ready. Reload this job tab after updating the extension.'};
    const latest=await chrome.tabs.get(sender.tab.id);if(latest.url!==sender.url)return {error:'Job changed. Start the fill again.'};
    let candidate;
    if(message.op==='fill'){
      const result=await receive({type:'get_candidates',candidateId:message.candidateId},sender);
      candidate=result.candidates?.find(row=>row.id===message.candidateId);
      if(!candidate)return {error:result.error||'Select an accessible candidate first.'};
    }
    const current=await chrome.tabs.get(sender.tab.id);if(current.url!==sender.url)return {error:'Job changed. Start the fill again.'};
    return chrome.tabs.sendMessage(sender.tab.id,{channel:'nextkin_embedded_v1',op:message.op,jobUrl:sender.url,sessionId:message.sessionId,candidateId:message.candidateId,...(candidate?{candidate:support.contactFacts(candidate)}:{})},{frameId:target.frameId});
  }

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

  if (message.type === 'get_pushed_candidates') {
    const config = await chrome.storage.local.get(['origin', 'token']);
    if (!config.token) return { error: 'Extension is not paired' };
    try {
      const res = await fetch(config.origin + '/api/extension/push-candidate', {
        headers: { 'Authorization': 'Bearer ' + config.token }
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error || 'Unable to load shared profiles' };
      return data;
    } catch (err) { return { error: err.message }; }
  }

  if (message.type === 'push_candidate') {
    const config = await chrome.storage.local.get(['origin', 'token']);
    if (!config.token) return { error: 'Extension is not paired' };
    try {
      const res = await fetch(config.origin + '/api/extension/push-candidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + config.token },
        body: JSON.stringify(message.payload)
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error || 'Unable to share candidate' };
      return data;
    } catch (err) { return { error: err.message }; }
  }

  if (message.type === 'revoke_pushed_candidate') {
    const config = await chrome.storage.local.get(['origin', 'token']);
    if (!config.token) return { error: 'Extension is not paired' };
    try {
      const res = await fetch(config.origin + '/api/extension/push-candidate?id=' + encodeURIComponent(message.shareId), {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + config.token }
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error || 'Unable to revoke share' };
      return data;
    } catch (err) { return { error: err.message }; }
  }

  if (message.type === 'save_shared_candidate') {
    const config = await chrome.storage.local.get(['origin', 'token']);
    if (!config.token) return { error: 'Extension is not paired' };
    try {
      const res = await fetch(config.origin + '/api/extension/push-candidate?candidateId=' + encodeURIComponent(message.candidateId), {
        headers: { 'Authorization': 'Bearer ' + config.token }
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error || 'Profile not available' };
      const share = (data.shares || [])[0];
      if (!share) return { error: 'This profile is no longer shared with you.' };
      // A shared profile becomes the active source for autofill and ATS matching,
      // exactly like a locally uploaded resume, while keeping its provenance.
      const candidate = { ...share.candidate, source: 'shared', provenance_status: 'confirmed' };
      await chrome.storage.local.set({ uploadedCandidate: candidate, sharedCandidate: candidate, sharedShareId: share.id });
      return { success: true, candidate };
    } catch (err) { return { error: err.message }; }
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
      if(message.consent!==true)return {error:'Agree to AI processing before generating screening drafts.'};
      try {
        const uploaded=config.uploadedCandidate?.id===message.candidateId;
        if(String(message.candidateId).startsWith('uploaded')&&!uploaded)return {error:'Select the current uploaded candidate first.'};
        const context=JSON.stringify({candidateId:message.candidateId,jobUrl:message.jobUrl,jobDescription:message.jobDescription,questions:message.questions,sessionId:message.sessionId});
        const key='screeningRequest:'+await globalThis.NextkinResume.fingerprint({context,origin:config.origin,token:config.token});
        let pending=(await chrome.storage.local.get(key))[key];
        if(!pending){pending={requestId:crypto.randomUUID()};await chrome.storage.local.set({[key]:pending});}
        const headers={'Content-Type':'application/json',Authorization:'Bearer '+config.token};
        const body={version:2,candidateId:uploaded?undefined:message.candidateId,...(uploaded?{candidate:{id:config.uploadedCandidate.id,source_text:config.uploadedCandidate.source_text||config.uploadedCandidate.confirmed_facts?.raw_text||''}}:{}),jobTitle:message.jobTitle,companyName:message.companyName,jobDescription:message.jobDescription,jobUrl:message.jobUrl,sessionId:message.sessionId,consent:true,requestId:pending.requestId,questions:message.questions};
        const endpoint=config.origin+'/api/extension/answer-drafts';
        let res=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
        let data=await res.json().catch(()=>({}));
        for(let poll=0;res.ok&&data.taskId&&data.status!=='succeeded'&&poll<60;poll++){
          await new Promise(resolve=>setTimeout(resolve,2000));
          res=await fetch(endpoint+'?taskId='+encodeURIComponent(data.taskId),{headers,signal:AbortSignal.timeout(15000)});
          data=await res.json().catch(()=>({}));
        }
        if(!res.ok){await chrome.storage.local.remove(key);return {error:data.error||`Screening service error (${res.status}).`};}
        if(data.status!=='succeeded')return {error:'Screening is queued. Keep the AI worker running and retry to resume this request.'};
        if(data.sessionId!==message.sessionId)return {error:'Screening context changed. No answers were used.'};
        return data;
      } catch(err){return {error:'Unable to reach the screening service: '+err.message};}
    }

    // Standalone fallback: Answer strictly based on verified candidate facts for the EXACT candidateId requested
    const cand = (config.uploadedCandidate?.id === message.candidateId)
      ? config.uploadedCandidate
      : (config.candidates || []).find(c => c.id === message.candidateId);

    if (cand && Array.isArray(message.questions)) {
      const facts=cand.provenance_status==='confirmed'?(cand.confirmed_facts||{}):cand;
      const answers = {};
      for (const q of message.questions) {
        const key = q.id || q.label;
        const lbl = (q.label || '').toLowerCase();
        if (/total.*(?:years?|experience)|(?:years?.*total experience)/i.test(lbl)) {
          if (facts.total_experience_years !== undefined && facts.total_experience_years !== null && facts.total_experience_years !== '') {
            answers[key] = String(facts.total_experience_years);
          }
        } else if (/sponsor/i.test(lbl)) {
          const now=facts.need_sponsorship_now,future=facts.need_sponsorship_future;
          const sponsorNeeded=/future/i.test(lbl)&&!/now|current|or/i.test(lbl)?future:/now|current/i.test(lbl)&&!/future/i.test(lbl)?now:now===true||future===true?true:now===false&&future===false?false:null;
          if (typeof sponsorNeeded === 'boolean') {
            answers[key] = sponsorNeeded ? 'Yes' : 'No';
          }
        } else if (/authoriz/i.test(lbl) && /united states|\busa\b|\bu\.?s\.?\b/i.test(lbl)) {
          if (typeof facts.authorized_in_usa === 'boolean') {
            answers[key] = facts.authorized_in_usa ? 'Yes' : 'No';
          }
        } else if (/salary|compensation/i.test(lbl)) {
          if (facts.expected_salary) {
            answers[key] = String(facts.expected_salary);
          }
        } else if (/notice|start/i.test(lbl)) {
          if (facts.notice_period || facts.available_to_join) {
            answers[key] = String(facts.notice_period || facts.available_to_join);
          }
        } else if (/relocat/i.test(lbl)) {
          if (typeof facts.open_to_relocation === 'boolean') {
            answers[key] = facts.open_to_relocation ? 'Yes' : 'No';
          }
        }
      }
      return { success: true, answers };
    }
    return { error: 'Failed to generate answers: No active candidate profile matching requested candidate.' };
  }

  
  if (message.type === 'download_file') {
    const filename = message.filename || 'tailored_resume.docx';
    const dataUrl = 'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,' + message.base64;
    if (chrome.downloads && typeof chrome.downloads.download === 'function') {
      try {
        const downloadId = await chrome.downloads.download({
          url: dataUrl,
          filename: filename,
          saveAs: false
        });
        return { success: true, downloadId };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }
    return { success: false, fallback: true };
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
    if (['submit_attempted','submitted'].includes(message.status) && Array.isArray(message.answers)) {
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
  // AI may wait on the worker; never hold application capture or profile refresh behind it.
  if (['tailor_resume','get_ai_answers','register_embedded_form','embedded_form_action'].includes(message.type)) {
    Promise.resolve().then(() => receive(message,sender)).then(reply,e => reply({error:e.message}));
    return true;
  }
  serial = serial.then(() => receive(message, sender)).then(reply, e => reply({ error: e.message }));
  return true;
});

chrome.tabs?.onRemoved?.addListener?.(id => {
  chrome.storage.session?.remove?.('tab:' + id);
  chrome.storage.session?.remove?.('answer-draft:'+id);
});
