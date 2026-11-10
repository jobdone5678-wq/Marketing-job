/**
 * NextKin copilot: the user-facing autofill control surface.
 * Nextkinlife LLC
 *
 * The copilot owns the flow (candidate choice, fill, undo, review). Every write goes
 * through the shared engine (form-discovery, field-mapping, field-writer), so a portal
 * only has to be recognised - never hand-coded.
 */
(function (root) {
  'use strict';
  if (root.__nextkinCopilotLoaded) return;
  root.__nextkinCopilotLoaded = true;

  const doc = root.document;
  const HOST_ID = 'mp-copilot-root';

  // The copilot never runs on AI assistants, code hosts or the recruiter portal itself.
  const EXCLUDED_HOSTS = [
    'chatgpt.com', 'openai.com', 'claude.ai', 'anthropic.com', 'gemini.google.com', 'perplexity.ai',
    'github.com', 'gitlab.com', 'gitingest.com', 'gitreverse.com', 'bitbucket.org', 'stackoverflow.com',
    'google.com', 'bing.com', 'youtube.com', 'whatsapp.com', 'telegram.org', 'discord.com',
    'twitter.com', 'x.com', 'facebook.com', 'instagram.com', 'reddit.com', 'cloudflare.com',
    'notion.so', 'figma.com', 'linear.app', 'slack.com', 'medium.com', 'substack.com',
    'nextkinhr.com', 'jobright-internal.com', 'localhost', '127.0.0.1'
  ];

  const state = {
    role: 'client',
    standalone: false,
    candidates: [],
    ownCandidateId: null,
    selectedId: null,
    locked: false,
    linked: false,
    linkedCandidateId: null,
    receipts: [],
    sessionId: '',
    pending: null,
    eventKey: '',
    attempt: 0,
    reported: false
  };

  const SHELL = `
<style>
  :host {
    all: initial;
    position: fixed; left: 0; top: 0; width: 1px; height: 1px; display: block;
    pointer-events: none; z-index: 2147483000;
  }
  #mp-copilot-pill {
    position: fixed; right: 18px; bottom: 18px; z-index: 2147483000;
    width: 48px; height: 48px; border-radius: 50%; border: 0; cursor: pointer;
    background: #1d4ed8; color: #fff; font: 600 13px/1 system-ui, sans-serif;
    box-shadow: 0 8px 24px rgba(15, 23, 42, .28);
    pointer-events: auto;
  }
  #mp-panel {
    position: fixed; right: 18px; bottom: 78px; z-index: 2147483000;
    width: 320px; max-height: 70vh; overflow: auto; box-sizing: border-box;
    padding: 14px; border-radius: 14px; border: 1px solid #e2e8f0; background: #fff;
    color: #0f172a; font: 13px/1.45 system-ui, sans-serif; box-shadow: 0 18px 40px rgba(15, 23, 42, .22);
    pointer-events: auto;
  }
  #mp-toast-container {
    position: fixed; right: 18px; bottom: 78px; z-index: 2147483000;
    display: flex; flex-direction: column; gap: 6px; pointer-events: none;
  }
  #mp-toast-container > * { pointer-events: auto; }
  #mp-panel[hidden] { display: none; }
  #mp-panel h3 { margin: 0 0 10px; font-size: 14px; }
  #mp-candidate-select { width: 100%; padding: 6px; margin-bottom: 8px; }
  #mp-panel button {
    padding: 6px 10px; margin: 0 6px 8px 0; border-radius: 8px; cursor: pointer;
    border: 1px solid #cbd5e1; background: #f8fafc; color: #0f172a; font: inherit;
  }
  #mp-autofill-btn { background: #1d4ed8; border-color: #1d4ed8; color: #fff; }
  #mp-workflow-status, #mp-match-container, #mp-capture-status {
    margin-top: 8px; padding: 8px; border-radius: 8px; background: #f1f5f9; white-space: pre-wrap;
  }
  #mp-screening-review { margin-top: 8px; padding: 8px; border: 1px solid #cbd5e1; border-radius: 8px; }
  #mp-screening-review[hidden] { display: none; }
  #mp-screening-review li { margin-bottom: 4px; }
</style>
<button id="mp-copilot-pill" type="button" role="button" aria-label="Open the NextKin copilot">NK</button>
<div id="mp-panel" hidden>
  <h3>NextKin copilot</h3>
  <select id="mp-candidate-select" aria-label="Candidate profile"></select>
  <div>
    <button id="mp-autofill-btn" type="button">Autofill application</button>
    <button id="mp-undo-btn" type="button">Undo</button>
    <button id="mp-log-btn" type="button">Log application</button>
  </div>
  <div id="mp-workflow-status" role="status"></div>
  <div id="mp-match-container"></div>
  <div id="mp-capture-status" role="status"></div>
  <div id="mp-screening-review" hidden>
    <strong>Review suggested answers</strong>
    <ul id="mp-screening-list"></ul>
    <button id="mp-accept-screening-btn" type="button">Accept answers</button>
  </div>
</div>
<div id="mp-toast-container"></div>`;

  function hostAllowed() {
    const host = String(root.location?.hostname || '').toLowerCase();
    if (!host) return false;
    return !EXCLUDED_HOSTS.some(blocked => host === blocked || host.endsWith('.' + blocked));
  }

  function isJobPage() {
    try {
      const path = String(root.location?.pathname || '');
      if (/\/(application|apply|jobs?|careers?|openings?|vacanc(?:y|ies)|positions?)(\/|$)/i.test(path)) return true;
      if (doc.querySelector('input[type="email"], input[type="file"], input[name*="email" i], input[id*="email" i], input[name*="resume" i], input[id*="resume" i]')) return true;
      if (doc.querySelector('[data-automation-id="applicationForm"], .application-form, #application_form, form[data-testid="application-form"], form[id*="application" i]')) return true;
      if (doc.querySelector('.job-description, #job-description, [data-automation-id="jobPostingDescription"], [class*="job-description" i]')) return true;
      const text = doc.body?.innerText || '';
      if (/thank you for applying|your application has been submitted|application (has been )?submitted|application received|we have received your application/i.test(text)) return true;
      return false;
    } catch { return false; }
  }

  // A page only holds application questions once the portal rendered its form.
  function hasApplicationForm() {
    try {
      for (const form of doc.querySelectorAll('form')) {
        if (form.closest('#mp-copilot-root')) continue;
        if (form.querySelector('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), textarea, select')) return true;
      }
      return false;
    } catch { return false; }
  }

  function ensureHost() {
    let host = doc.getElementById(HOST_ID);
    if (!host) {
      host = doc.createElement('div');
      host.id = HOST_ID;
      (doc.body || doc.documentElement).appendChild(host);
    }
    if (!host.shadowRoot) host.attachShadow({ mode: 'open' });
    if (!host.shadowRoot.querySelector('#mp-panel')) host.shadowRoot.innerHTML = SHELL;
    return host;
  }

  function ui() {
    return ensureHost().shadowRoot;
  }

  function showStatus(text) {
    const node = ui().querySelector('#mp-workflow-status');
    if (node) node.textContent = text || '';
  }

  function showCaptureStatus(text) {
    const node = ui().querySelector('#mp-capture-status');
    if (node) node.textContent = text || '';
  }

  function toast(message) {
    try {
      doc.querySelectorAll('#mp-copilot-toast').forEach(el => el.remove());
      const el = doc.createElement('div');
      el.id = 'mp-copilot-toast';
      el.textContent = String(message || '');
      el.style.cssText = 'position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:2147483001;padding:10px 16px;border-radius:10px;background:#0f172a;color:#fff;font:13px/1.4 system-ui,sans-serif;box-shadow:0 10px 30px rgba(15,23,42,.3)';
      (doc.body || doc.documentElement).appendChild(el);
      setTimeout(() => { try { el.remove(); } catch { } }, 8000);
    } catch { }
  }

  function send(message, timeoutMs = 1500) {
    return new Promise(resolve => {
      let settled = false;
      const finish = value => {
        if (settled) return;
        settled = true;
        resolve(value && typeof value === 'object' ? value : {});
      };
      try {
        const rt = root.chrome && root.chrome.runtime;
        if (!rt || typeof rt.sendMessage !== 'function') return finish({});
        const maybe = rt.sendMessage(message, finish);
        if (maybe && typeof maybe.then === 'function') maybe.then(finish, () => finish({}));
      } catch { finish({ }); }
      setTimeout(() => finish({}), timeoutMs);
    });
  }

  function storageGet(keys) {
    return new Promise(resolve => {
      let settled = false;
      const finish = values => {
        if (settled) return;
        settled = true;
        resolve(values || {});
      };
      try {
        const store = root.chrome && root.chrome.storage && root.chrome.storage.local;
        if (!store || typeof store.get !== 'function') return finish({});
        const maybe = store.get(keys, finish);
        if (maybe && typeof maybe.then === 'function') maybe.then(finish, () => finish({}));
      } catch { finish({}); }
      setTimeout(() => finish({}), 800);
    });
  }

  function isUploadedCandidate(candidate) {
    if (!candidate) return false;
    return state.standalone || String(candidate.id || '').startsWith('uploaded') ||
      candidate.source === 'uploaded' || Boolean(candidate.resume_file);
  }

  function candidateLabel(candidate) {
    const name = candidate.full_name || candidate.name || 'Candidate';
    return isUploadedCandidate(candidate) ? `${name} - Uploaded Resume` : name;
  }

  function findCandidate(id) {
    if (!id) return null;
    return state.candidates.find(c => c && c.id === id) || null;
  }

  function activeCandidate() {
    return findCandidate(state.selectedId);
  }

  function intentFromLocation() {
    try {
      const match = /marketing[-_]intent=([^&]+)/i.exec(String(root.location?.hash || ''));
      return match ? decodeURIComponent(match[1]) : '';
    } catch { return ''; }
  }

  function jobSnapshot() {
    const text = (doc.body?.innerText || '').slice(0, 4000);
    const title = doc.querySelector('h1')?.textContent?.trim() || doc.title || '';
    const company = doc.querySelector('[data-automation-id="companyName"], [class*="company-name" i], [class*="companyName" i]')?.textContent?.trim() || '';
    const description = doc.querySelector('#job-description, .job-description, [data-automation-id="jobPostingDescription"], [class*="job-description" i]')?.textContent?.trim() || text;
    return { title, company, description };
  }

  function jobKey() {
    const job = jobSnapshot();
    return `${job.title}|${job.company}|${root.location?.href || ''}`;
  }

  function sessionIdFor(candidate) {
    const key = `${candidate?.id || 'none'}|${jobKey()}`;
    let hash = 0;
    for (let i = 0; i < key.length; i++) hash = ((hash << 5) - hash) + key.charCodeAt(i);
    state.sessionId = 'mp_' + Math.abs(hash).toString(36);
    return state.sessionId;
  }

  function engine() {
    return {
      forms: root.NextkinForms,
      mapping: root.NextkinFieldMapping,
      writer: root.NextkinFieldWriter
    };
  }

  function questionId(field) {
    const el = field.element;
    if (!el) return field.key;
    if (field.kind === 'radio' || field.kind === 'choice') {
      const first = (field.elements && field.elements[0]) || el;
      return first.id || first.name || field.key;
    }
    return el.id || el.name || field.key;
  }

  function isQuestionField(field) {
    if (!field) return false;
    if (field.kind === 'textarea') return true;
    return /\?/.test(String(field.label || ''));
  }

  function questionType(field) {
    return (field.kind === 'select' || field.kind === 'radio' || field.kind === 'choice' || field.kind === 'combobox') ? 'choice' : 'text';
  }

  function questionOptions(field) {
    return (field.options || []).map(o => String(o.label ?? o.value ?? '').trim()).filter(Boolean);
  }

  async function resolveAiPlans(plans, candidate) {
    const aiPlans = plans.filter(p => p.status === 'ai');
    if (!aiPlans.length) return;
    const job = jobSnapshot();
    await Promise.all(aiPlans.map(async plan => {
      try {
        const res = await send({
          type: 'generate_ai_field_answer',
          fieldLabel: plan.field.label,
          prompt: plan.aiPrompt || plan.field.label,
          options: plan.options || [],
          candidate,
          jobTitle: job.title,
          companyName: job.company
        });
        const answer = res && typeof res.answer === 'string' ? res.answer.trim() : '';
        if (!answer) { plan.status = 'needs_review'; plan.reason = 'No AI answer available.'; return; }
        if (plan.options && plan.options.length) {
          const match = plan.options.find(o => String(o).toLowerCase().trim() === answer.toLowerCase().trim())
            || plan.options.find(o => answer.toLowerCase().includes(String(o).toLowerCase().trim()));
          if (!match) { plan.status = 'needs_review'; plan.reason = 'AI answer did not match an option.'; return; }
          plan.value = match;
        } else {
          plan.value = answer;
        }
        plan.status = 'supported';
        plan.ai = true;
      } catch {
        plan.status = 'needs_review';
        plan.reason = 'AI answer failed.';
      }
    }));
  }

  async function runAutofill(candidate, options = {}) {
    if (!candidate) return 0;
    const { forms, mapping, writer } = engine();
    if (!forms || !mapping || !writer) {
      showStatus('The autofill engine is not loaded on this page.');
      return 0;
    }
    const sessionId = sessionIdFor(candidate);
    let written = 0;
    try {
      const fields = forms.discoverFields(doc);
      const plans = mapping.planFill(fields, candidate);
      if (options.resolveAi !== false) await resolveAiPlans(plans, candidate);
      const receipts = await writer.applyFill(plans, { sessionId, isCurrent: () => true });
      written = (receipts || []).length;
      state.receipts.push(...(receipts || []));
      showStatus(written ? `Filled ${written} field${written === 1 ? '' : 's'}.` : 'No empty fields needed this profile.');
    } catch (err) {
      showStatus('Autofill could not finish: ' + (err?.message || err));
    }
    return written;
  }

  async function undoAutofill() {
    const { writer } = engine();
    if (!writer || !state.receipts.length) return 0;
    try {
      const restored = await writer.undo(state.receipts, { sessionId: state.sessionId, isCurrent: () => true });
      state.receipts = [];
      showStatus(restored ? `Restored ${restored} field${restored === 1 ? '' : 's'}.` : 'Nothing to undo.');
      return restored;
    } catch {
      showStatus('Undo could not finish.');
      return 0;
    }
  }

  function renderCandidates() {
    const select = ui().querySelector('#mp-candidate-select');
    if (!select) return;
    const previous = state.selectedId;
    select.innerHTML = '';
    for (const candidate of state.candidates) {
      if (!candidate || !candidate.id) continue;
      const option = doc.createElement('option');
      option.value = candidate.id;
      option.textContent = candidateLabel(candidate);
      select.appendChild(option);
    }
    if (previous && findCandidate(previous)) select.value = previous;
    select.disabled = state.locked;
  }

  function setSelected(id, { lock = false } = {}) {
    if (state.locked && state.selectedId && id !== state.selectedId) return;
    state.selectedId = id || null;
    if (lock) state.locked = true;
    const select = ui().querySelector('#mp-candidate-select');
    if (select) {
      select.value = state.selectedId || '';
      select.disabled = state.locked;
    }
  }

  function matchReport(candidate) {
    const job = jobSnapshot();
    const haystack = `${job.title} ${job.description}`.toLowerCase();
    const skills = String(candidate?.primary_skills || (Array.isArray(candidate?.skills) ? candidate.skills.join(', ') : candidate?.skills) || '')
      .split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
    const matched = skills.filter(s => haystack.includes(s.toLowerCase()));
    const missing = skills.filter(s => !haystack.includes(s.toLowerCase()));
    const score = skills.length ? Math.round((matched.length / skills.length) * 100) : 0;
    const node = ui().querySelector('#mp-match-container');
    if (node) {
      node.textContent = `ATS Match: ${score}%\n` +
        (matched.length ? `Matched: ${matched.join(', ')}\n` : '') +
        (missing.length ? `Missing: ${missing.join(', ')}` : '');
    }
    return { score, matched, missing };
  }

  function collectAnswers() {
    const answers = [];
    const seen = new Set();
    const { forms } = engine();
    if (!forms) return answers;
    for (const field of forms.discoverFields(doc)) {
      if (!field || field.kind === 'inaccessible' || field.excluded) continue;
      const el = field.element;
      if (!el || !el.isConnected) continue;
      const key = field.key || el.name || el.id;
      if (!key || seen.has(key)) continue;
      let value = '';
      if (field.kind === 'radio') {
        const picked = field.elements.find(r => r.checked);
        value = picked ? (picked.value || '') : '';
      } else if (field.kind === 'checkbox') {
        value = el.checked ? (el.value || 'Yes') : '';
      } else if (field.kind === 'choice') {
        const picked = (field.options || []).find(o => o.element.getAttribute('aria-pressed') === 'true' || o.element.getAttribute('aria-checked') === 'true');
        value = picked ? picked.label : '';
      } else {
        value = String(el.value || '').trim();
      }
      if (!value) continue;
      seen.add(key);
      answers.push({ key, label: String(field.label || key).slice(0, 120), value });
    }
    return answers;
  }

  function eventKeyFor() {
    if (state.eventKey) return state.eventKey;
    try {
      const stored = root.sessionStorage?.getItem('mp_event_key');
      if (stored) { state.eventKey = stored; return stored; }
    } catch { }
    state.eventKey = 'mp_' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
    try { root.sessionStorage?.setItem('mp_event_key', state.eventKey); } catch { }
    return state.eventKey;
  }

  async function saveDraft(answers) {
    const candidate = activeCandidate();
    await send({
      type: 'save_answer_draft',
      candidateId: candidate?.id || state.linkedCandidateId || null,
      jobTitle: jobSnapshot().title,
      answers
    });
  }

  async function reportSubmission({ manualAttestation = false } = {}) {
    const answers = collectAnswers();
    const candidate = activeCandidate();
    const job = jobSnapshot();
    const match = candidate ? matchReport(candidate) : { score: 0 };
    await saveDraft(answers);
    const payload = {
      eventKey: eventKeyFor(),
      attempt: state.attempt,
      jobTitle: job.title,
      companyName: job.company,
      applicationUrl: root.location?.href || '',
      candidateId: candidate?.id || state.linkedCandidateId || null,
      matchScore: match.score,
      answers
    };
    if (state.linked || manualAttestation) {
      await send({ status: 'submitted', ...payload, manualAttestation });
      showCaptureStatus('Submission recorded.');
      toast('Submission recorded.');
    } else {
      await send({ type: 'auto_submit', payload });
      showCaptureStatus('Submission sent for review.');
    }
    return payload;
  }

  function isConfirmationPage() {
    const text = (doc.body?.innerText || '').slice(0, 3000);
    return /thank you for applying|your application has been submitted|application (has been )?submitted|application received|we have received your application|successfully submitted/i.test(text);
  }

  function showScreeningReview(pending) {
    const panel = ui().querySelector('#mp-screening-review');
    const list = ui().querySelector('#mp-screening-list');
    if (!panel || !list) return;
    list.innerHTML = '';
    for (const item of pending.items) {
      const li = doc.createElement('li');
      li.textContent = `${item.label}: ${item.value}`;
      list.appendChild(li);
    }
    panel.hidden = false;
  }

  function hideScreeningReview() {
    const panel = ui().querySelector('#mp-screening-review');
    if (panel) panel.hidden = true;
  }

  // Suggested answers are collected first and only written when the candidate accepts them.
  async function triggerAIScreeningQuestions(candidate, options = {}) {
    const { forms, mapping } = engine();
    if (!forms || !mapping) return 0;
    const fields = forms.discoverFields(doc);
    const questionFields = fields.filter(field => isQuestionField(field));
    if (!questionFields.length) return 0;

    const job = jobSnapshot();
    const res = await send({
      type: 'get_ai_answers',
      candidate,
      jobTitle: job.title,
      companyName: job.company,
      questions: questionFields.map(field => ({
        id: questionId(field),
        label: field.label,
        type: questionType(field),
        options: questionOptions(field)
      }))
    });
    const answers = (res && res.answers) || {};
    const items = [];
    for (const field of questionFields) {
      const id = questionId(field);
      const raw = answers[id] ?? answers[field.label] ?? answers[field.element?.name];
      if (!raw || !String(raw).trim()) continue;
      items.push({
        field,
        id,
        label: String(field.label || id),
        labelSnapshot: String(field.label || id),
        value: String(raw).trim()
      });
    }
    if (!items.length) return 0;

    state.pending = { items, jobKey: jobKey() };
    showScreeningReview(state.pending);
    if (options.autoAccept) acceptScreeningReview();
    return items.length;
  }

  // Writes one reviewed answer and records it so it can be undone like any other fill.
  function writeReviewedAnswer(field, value) {
    const { writer } = engine();
    if (!writer || !field || !field.element || !field.element.isConnected) return null;
    const wanted = String(value).toLowerCase().trim();

    if (field.kind === 'select') {
      const option = (field.options || []).find(o => String(o.label || '').toLowerCase().trim() === wanted)
        || (field.options || []).find(o => String(o.value || '').toLowerCase().trim() === wanted);
      if (!option) return null;
      const previousValue = field.element.value;
      if (!writer.writeNative(field.element, 'value', option.value)) return null;
      if (field.element.value !== option.value) return null;
      return { fieldKey: field.key, field, element: field.element, previousValue, writtenValue: option.value, sessionId: state.sessionId, undoChoice: null, ai: true };
    }

    if (field.kind === 'radio' || field.kind === 'choice') {
      const option = (field.options || []).find(o => String(o.label ?? o.value ?? '').toLowerCase().trim() === wanted)
        || (field.options || []).find(o => String(o.label ?? o.value ?? '').toLowerCase().trim().includes(wanted));
      if (!option) return null;
      const previousValue = field.kind === 'radio' ? field.elements.map(e => e.checked) : null;
      writer.singleClick(option.element);
      const landed = field.kind === 'radio' ? field.elements.some(e => e.checked) : true;
      if (!landed) return null;
      return { fieldKey: field.key, field, element: field.element, previousValue, writtenValue: value, sessionId: state.sessionId, undoChoice: previousValue, ai: true };
    }

    const previousValue = field.element.value;
    if (!writer.writeNative(field.element, 'value', value)) return null;
    if (String(field.element.value || '').trim() !== String(value).trim()) return null;
    return { fieldKey: field.key, field, element: field.element, previousValue, writtenValue: value, sessionId: state.sessionId, undoChoice: null, ai: true };
  }

  function acceptScreeningReview() {
    const pending = state.pending;
    if (!pending || !pending.items.length) { hideScreeningReview(); return 0; }
    // An SPA navigation to another job invalidates answers written for the previous one.
    if (pending.jobKey !== jobKey()) {
      state.pending = null;
      hideScreeningReview();
      return 0;
    }
    const { forms } = engine();
    const fields = forms ? forms.discoverFields(doc) : [];
    let applied = 0;
    for (const item of pending.items) {
      const current = fields.find(f => f.element === item.field.element);
      if (!current) continue;
      // A control whose question changed is a different question; the old answer no longer applies.
      if (String(current.label || '') !== item.labelSnapshot) continue;
      const receipt = writeReviewedAnswer(current, item.value);
      if (!receipt) continue;
      state.receipts.push(receipt);
      applied++;
    }
    state.pending = null;
    hideScreeningReview();
    return applied;
  }

  async function resolveContext() {
    const intentId = intentFromLocation();
    const [ctx, list] = await Promise.all([
      send({ type: 'get_context', intentId }),
      send({ type: 'get_candidates' })
    ]);

    state.role = (list && list.role) || 'client';
    state.standalone = Boolean(list && list.standalone);
    state.ownCandidateId = (list && list.ownCandidateId) || null;
    state.linked = Boolean(ctx && ctx.linked);
    state.linkedCandidateId = (ctx && ctx.candidateId) || null;

    let candidates = Array.isArray(list && list.candidates) ? list.candidates.filter(Boolean) : [];
    if (!candidates.length) {
      const stored = await storageGet(['uploadedCandidate', 'uploaded_resume']);
      const uploaded = stored.uploadedCandidate || stored.uploaded_resume?.parsed_candidate || stored.uploaded_resume?.candidate;
      if (uploaded) candidates = [uploaded];
    }
    state.candidates = candidates;

    let selected = null;
    if (state.linkedCandidateId) selected = findCandidate(state.linkedCandidateId);
    if (!selected && state.ownCandidateId && state.role !== 'recruiter') selected = findCandidate(state.ownCandidateId);
    if (!selected && (state.standalone || state.role !== 'recruiter') && candidates.length === 1) selected = candidates[0];

    renderCandidates();
    if (selected) {
      setSelected(selected.id, { lock: state.linked || state.role !== 'recruiter' });
      const candidate = activeCandidate();
      if (candidate) {
        matchReport(candidate);
        // A job page without a form has no questions to answer yet.
        if (hasApplicationForm()) await runAutofill(candidate);
      }
    } else {
      showStatus(state.role === 'recruiter'
        ? 'Choose the candidate profile this application belongs to.'
        : 'No candidate profile is available yet.');
    }
  }

  function wireControls() {
    const shadow = ui();
    const pill = shadow.querySelector('#mp-copilot-pill');
    if (pill) pill.addEventListener('click', () => {
      const panel = shadow.querySelector('#mp-panel');
      if (panel) panel.hidden = !panel.hidden;
    });

    const select = shadow.querySelector('#mp-candidate-select');
    if (select) select.addEventListener('change', async () => {
      if (state.locked && state.selectedId && select.value !== state.selectedId) {
        select.value = state.selectedId;
        return;
      }
      state.selectedId = select.value || null;
      const candidate = activeCandidate();
      if (!candidate) return;
      matchReport(candidate);
      await runAutofill(candidate);
      setSelected(state.selectedId, { lock: true });
    });

    const fill = shadow.querySelector('#mp-autofill-btn');
    if (fill) fill.addEventListener('click', async () => {
      const candidate = activeCandidate();
      if (!candidate) { showStatus('Choose a candidate profile first.'); return; }
      await runAutofill(candidate);
    });

    const undo = shadow.querySelector('#mp-undo-btn');
    if (undo) undo.addEventListener('click', async () => { await undoAutofill(); });

    const log = shadow.querySelector('#mp-log-btn');
    if (log) log.addEventListener('click', async () => {
      await reportSubmission({ manualAttestation: state.linked });
    });

    const accept = shadow.querySelector('#mp-accept-screening-btn');
    if (accept) accept.addEventListener('click', () => { acceptScreeningReview(); });
  }

  function watchPage() {
    let timer = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        timer = null;
        const candidate = activeCandidate();
        if (!candidate) return;
        if (isConfirmationPage()) {
          if (!state.reported) {
            state.reported = true;
            state.attempt++;
            await reportSubmission();
          }
          return;
        }
        if (!hasApplicationForm()) return;
        await runAutofill(candidate);
      }, 180);
    };

    try {
      const observer = new root.MutationObserver(records => {
        for (const record of records) {
          const target = record.target;
          if (target && target.nodeType === 1 && (target.id === HOST_ID || target.closest?.(`#${HOST_ID}`))) continue;
          schedule();
          return;
        }
      });
      observer.observe(doc.body || doc.documentElement, { childList: true, subtree: true });
    } catch { }

    doc.addEventListener('submit', async event => {
      const answers = collectAnswers();
      await saveDraft(answers);
      const candidate = activeCandidate();
      const job = jobSnapshot();
      const payload = {
        eventKey: eventKeyFor(),
        attempt: state.attempt,
        jobTitle: job.title,
        companyName: job.company,
        applicationUrl: root.location?.href || '',
        candidateId: candidate?.id || state.linkedCandidateId || null,
        answers
      };
      if (state.linked) {
        state.attempt++;
        await send({ status: 'submit_attempted', ...payload });
        showCaptureStatus('Submission detected. Review the answers before they are sent.');
      } else {
        await send({ type: 'auto_submit', payload });
      }
    }, true);
  }

  root.undoAutofill = undoAutofill;
  root.acceptScreeningReview = acceptScreeningReview;
  root.triggerAIScreeningQuestions = triggerAIScreeningQuestions;
  root.NextkinCopilot = {
    state,
    runAutofill,
    undoAutofill,
    resolveContext,
    triggerAIScreeningQuestions,
    acceptScreeningReview
  };

  async function start() {
    if (!hostAllowed() || !isJobPage()) return;
    ensureHost();
    wireControls();
    watchPage();
    await resolveContext();
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})(globalThis);
