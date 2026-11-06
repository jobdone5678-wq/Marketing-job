const fs = require('fs');

const path = 'jobright_extension/outside-job-engine.js';
let content = fs.readFileSync(path, 'utf8');

// 1. Add top-level blocked hosts early return
const topEarlyReturnTarget = `  // Prevent multiple executions in the same frame
  if (root.__nextkinOutsideJobEngineActive) return;
  root.__nextkinOutsideJobEngineActive = true;`;

const topEarlyReturnReplacement = `  // Prevent multiple executions in the same frame
  if (root.__nextkinOutsideJobEngineActive) return;
  root.__nextkinOutsideJobEngineActive = true;

  // Immediate unconditional block for non-job platforms (ChatGPT, Claude, GitHub, etc.)
  const _currHost = window.location.hostname.toLowerCase();
  const _BLOCKED_HOSTS = ['chatgpt.com', 'openai.com', 'claude.ai', 'anthropic.com', 'github.com', 'gitlab.com', 'gitingest.com', 'gitreverse.com', 'google.com', 'bing.com', 'youtube.com', 'whatsapp.com', 'telegram.org', 'discord.com', 'twitter.com', 'x.com', 'reddit.com', 'cloudflare.com'];
  if (_BLOCKED_HOSTS.some(h => _currHost === h || _currHost.endsWith('.' + h))) {
    return;
  }`;

if (content.includes(topEarlyReturnTarget)) {
  content = content.replace(topEarlyReturnTarget, topEarlyReturnReplacement);
  console.log('Added top-level blocked hosts early return in outside-job-engine.js');
} else {
  console.log('topEarlyReturnTarget not found');
}

// 2. Disable all in-page toasts
const toastFuncTarget = `  function showInPageToast(message, isError = false, duration = 4000) {
    // Completely removed: do NOT inject any toast elements into page DOM.
    // Clean up any lingering toast elements immediately.
    try {
      const existing = document.getElementById('nextkin-copilot-toast');
      if (existing) existing.remove();
      const mpExisting = document.getElementById('mp-copilot-toast');
      if (mpExisting) mpExisting.remove();
      document.querySelectorAll('#nextkin-copilot-toast, #mp-copilot-toast, [id*="nextkin-copilot-toast"], [id*="mp-copilot-toast"]').forEach(el => el.remove());
    } catch {}
  }`;

// 3. Update loadActiveCandidate to prioritize uploaded_resume and extract name/email/phone from it
const loadCandTarget = `  async function loadActiveCandidate() {
    try {
      const storage = await chrome.storage.local.get([
        'nextkin_active_candidate',
        'uploadedCandidate',
        'uploaded_resume',
        'nextkin_uploaded_resume',
        'nextkin_candidate_data',
        'candidates'
      ]);
      const cand = storage.nextkin_active_candidate ||
                   storage.uploadedCandidate ||
                   storage.uploaded_resume ||
                   storage.nextkin_uploaded_resume ||
                   storage.nextkin_candidate_data ||
                   (storage.candidates && storage.candidates[0]) ||
                   null;`;

const loadCandReplacement = `  async function loadActiveCandidate() {
    try {
      const storage = await chrome.storage.local.get([
        'uploaded_resume',
        'nextkin_uploaded_resume',
        'uploadedCandidate',
        'nextkin_active_candidate',
        'nextkin_candidate_data',
        'candidates'
      ]);
      const upl = storage.uploaded_resume || storage.nextkin_uploaded_resume;
      let cand = null;
      if (upl && upl.parsed_candidate) {
        cand = upl.parsed_candidate;
      } else if (upl && (upl.full_name || upl.raw_text || upl.filename)) {
        const cleanFn = String(upl.filename || '').replace(/\\.[^/.]+$/, '').replace(/^(?:resume|cv)[-_ ]*|[-_ ]*(?:resume|cv)$/gi, '').replace(/[-_]/g, ' ').trim();
        const nameParts = (upl.full_name || cleanFn).split(/\\s+/).filter(Boolean);
        const fn = upl.first_name || (nameParts.length > 0 ? nameParts[0] : '');
        const ln = upl.last_name || (nameParts.length > 1 ? nameParts.slice(1).join(' ') : fn);
        const text = upl.raw_text || upl.source_text || '';
        const em = upl.email || (text.match(/[\\w.%+-]+@[\\w.-]+\\.[a-zA-Z]{2,}/i) || [])[0] || '';
        const ph = upl.phone || (text.match(/(?:\\+\\d{1,3}[ -]?)?(?:\\(\\d{3}\\)|\\d{3})[ .-]?\\d{3}[ .-]?\\d{4}\\b/) || [])[0] || '';
        const li = upl.linkedin_url || (text.match(/(?:https?:\\/\\/)?(?:www\\.)?linkedin\\.com\\/in\\/[\\w-]+/i) || [])[0] || '';
        cand = {
          id: upl.candidate_id || 'cand-upl',
          full_name: (fn + ' ' + (ln && ln !== fn ? ln : '')).trim(),
          first_name: fn,
          last_name: ln,
          email: em,
          phone: ph,
          linkedin_url: li,
          skills: upl.skills || [],
          all_skills: upl.skills || [],
          raw_text: text,
          source_text: text,
          basicInfo: { firstName: fn, lastName: ln, fullName: fn + ' ' + ln, email: em, phone: ph, urls: { linkedin: li } },
          confirmed_facts: { full_name: fn + ' ' + ln, first_name: fn, last_name: ln, email: em, phone: ph, linkedin_url: li, raw_text: text, filename: upl.filename }
        };
      } else if (storage.uploadedCandidate) {
        cand = storage.uploadedCandidate;
      } else if (storage.nextkin_active_candidate) {
        cand = storage.nextkin_active_candidate;
      } else {
        cand = storage.nextkin_candidate_data || (storage.candidates && storage.candidates[0]) || null;
      }`;

if (content.includes(loadCandTarget)) {
  content = content.replace(loadCandTarget, loadCandReplacement);
  console.log('Updated loadActiveCandidate prioritization in outside-job-engine.js');
} else {
  console.log('loadCandTarget not found');
}

// 4. Update setNativeValue for SELECT options matching
const setNativeValTarget = `    // Step 2: Invoke the native prototype setter directly
    const proto = element.tagName === 'SELECT'
      ? HTMLSelectElement.prototype
      : element.tagName === 'TEXTAREA'
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;

    const setter = Object.getOwnPropertyDescriptor(proto, property)?.set;
    if (setter) {
      setter.call(element, val);
    } else {
      element[property] = val;
    }`;

const setNativeValReplacement = `    // Step 2: For SELECT elements, match option by value or text case-insensitively
    if (element.tagName === 'SELECT') {
      const lowerVal = String(val).toLowerCase().trim();
      let matchedOption = null;
      for (const opt of element.options) {
        const optVal = opt.value.toLowerCase().trim();
        const optText = opt.text.toLowerCase().trim();
        if (optVal === lowerVal || optText === lowerVal) {
          matchedOption = opt;
          break;
        }
      }
      if (!matchedOption) {
        for (const opt of element.options) {
          const optVal = opt.value.toLowerCase().trim();
          const optText = opt.text.toLowerCase().trim();
          if ((optVal && lowerVal.includes(optVal)) || (optText && lowerVal.includes(optText)) || (optVal && optVal.includes(lowerVal)) || (optText && optText.includes(lowerVal))) {
            matchedOption = opt;
            break;
          }
        }
      }
      if (matchedOption) {
        matchedOption.selected = true;
        val = matchedOption.value;
      }
    }

    // Step 2b: Invoke the native prototype setter directly
    const proto = element.tagName === 'SELECT'
      ? HTMLSelectElement.prototype
      : element.tagName === 'TEXTAREA'
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;

    const setter = Object.getOwnPropertyDescriptor(proto, property)?.set;
    if (setter) {
      setter.call(element, val);
    } else {
      element[property] = val;
    }`;

if (content.includes(setNativeValTarget)) {
  content = content.replace(setNativeValTarget, setNativeValReplacement);
  console.log('Updated setNativeValue for SELECT matching in outside-job-engine.js');
} else {
  console.log('setNativeValTarget not found');
}

fs.writeFileSync(path, content, 'utf8');
console.log('Wrote updates to outside-job-engine.js');
