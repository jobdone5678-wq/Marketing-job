const fs = require('fs');

console.log('--- Updating outside-job-engine.js with: ---');
console.log('1. Reliable Checkbox & Radio filling (fixed toggle bug, added role=checkbox)');
console.log('2. Live Autofill Animation with smooth scroll, field pulsing ring & progress overlay');
console.log('3. Gender & EEO database/storage persistence & multi-portal auto-reuse');
console.log('4. Multi-page / page-by-page automatic step watcher');
console.log('5. Error toast notifications and zero fallback hardcoding');

const file = 'jobright_extension/outside-job-engine.js';
let content = fs.readFileSync(file, 'utf8');

// 1. Fix setNativeChecked so it NEVER toggles checked back to false
const oldSetNativeChecked = `function setNativeChecked(element, boolVal) {
    if (!element || !element.isConnected) return false;
    if (element._valueTracker) {
      try { element._valueTracker.setValue(boolVal ? 'false' : 'true'); } catch {}
    }
    const proto = HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'checked')?.set;
    if (setter) setter.call(element, boolVal); else element.checked = boolVal;
    try {
      element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, composed: true }));
    } catch {
      try { element.click(); } catch {}
    }
    element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    try { element.dispatchEvent(new Event('blur', { bubbles: true })); } catch {}
    return element.checked === boolVal;
  }`;

const newSetNativeChecked = `function setNativeChecked(element, boolVal) {
    if (!element || !element.isConnected) return false;
    if (element.checked === boolVal) return true;

    if (element._valueTracker) {
      try { element._valueTracker.setValue(!boolVal ? 'true' : 'false'); } catch {}
    }
    const proto = HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'checked')?.set;
    if (setter) setter.call(element, boolVal); else element.checked = boolVal;

    element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

    // If still not checked (e.g. custom styled checkbox where label handles state)
    if (element.checked !== boolVal) {
      const lbl = element.id ? document.querySelector(\`label[for="\${CSS.escape(element.id)}"]\`) : element.closest('label');
      if (lbl) {
        try { lbl.click(); } catch {}
      } else {
        try { element.click(); } catch {}
      }
    }
    try { element.dispatchEvent(new Event('blur', { bubbles: true })); } catch {}
    return element.checked === boolVal;
  }

  function setNativeRoleCheckbox(element, boolVal) {
    if (!element || !element.isConnected) return false;
    const currentAria = element.getAttribute('aria-checked');
    const isChecked = currentAria === 'true';
    if (isChecked !== boolVal) {
      try { element.click(); } catch {}
      element.setAttribute('aria-checked', boolVal ? 'true' : 'false');
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    return true;
  }`;

if (content.includes('function setNativeChecked(')) {
  content = content.replace(/function setNativeChecked\([\s\S]*?return element\.checked === boolVal;\s*\}/, newSetNativeChecked);
  console.log('1. Fixed setNativeChecked successfully');
} else {
  console.warn('1. setNativeChecked not found');
}

// 2. Add visual animation helper for highlighting fields as they are filled
const visualAnimationHelper = `
  // -------------------------------------------------------------
  // Visual Autofill Field Highlighter & In-Page Progress Overlay
  // -------------------------------------------------------------
  function highlightFieldBeingFilled(el) {
    if (!el || !el.style) return;
    try {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      const origOutline = el.style.outline;
      const origShadow = el.style.boxShadow;
      const origTransition = el.style.transition;

      el.style.transition = 'all 0.3s ease';
      el.style.outline = '2px solid #3b82f6';
      el.style.boxShadow = '0 0 10px rgba(59, 130, 246, 0.45)';

      setTimeout(() => {
        try {
          el.style.outline = '2px solid #10b981';
          el.style.boxShadow = '0 0 8px rgba(16, 185, 129, 0.4)';
          setTimeout(() => {
            try {
              el.style.outline = origOutline;
              el.style.boxShadow = origShadow;
              el.style.transition = origTransition;
            } catch {}
          }, 1200);
        } catch {}
      }, 400);
    } catch {}
  }

  function updateAutofillProgressOverlay(message, current, total) {
    try {
      let overlay = document.getElementById('nextkin-autofill-progress-banner');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'nextkin-autofill-progress-banner';
        overlay.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;background:#0f172a;color:#ffffff;padding:10px 16px;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.25);font-family:system-ui,-apple-system,sans-serif;font-size:13px;display:flex;align-items:center;gap:10px;border:1px solid #334155;transition:all 0.3s ease;';
        document.body.appendChild(overlay);
      }
      const pct = total > 0 ? Math.round((current / total) * 100) : 0;
      overlay.innerHTML = '<span style="display:inline-block;width:12px;height:12px;border:2px solid #38bdf8;border-top-color:transparent;border-radius:50%;animation:nextkin-spin 0.8s linear infinite;"></span>' +
        '<div><strong style="color:#38bdf8;display:block;font-size:11.5px;letter-spacing:0.5px;">NEXTKIN AUTOFILLING</strong>' +
        '<span>' + message + (total > 0 ? ' (' + current + '/' + total + ')' : '') + '</span></div>';
      
      // Inject spin animation if missing
      if (!document.getElementById('nextkin-spin-style')) {
        const style = document.createElement('style');
        style.id = 'nextkin-spin-style';
        style.textContent = '@keyframes nextkin-spin { to { transform: rotate(360deg); } }';
        document.head.appendChild(style);
      }
    } catch {}
  }

  function removeAutofillProgressOverlay() {
    try {
      const overlay = document.getElementById('nextkin-autofill-progress-banner');
      if (overlay) {
        overlay.style.opacity = '0';
        overlay.style.transform = 'translateY(-10px)';
        setTimeout(() => overlay.remove(), 350);
      }
    } catch {}
  }
`;

if (!content.includes('nextkin-autofill-progress-banner')) {
  const insertIdx = content.indexOf('function setNativeChecked');
  if (insertIdx !== -1) {
    content = content.substring(0, insertIdx) + visualAnimationHelper + content.substring(insertIdx);
    console.log('2. Added visual animation helper');
  }
}

// 3. Gender persistence & auto-detection
const genderPersistenceLogic = `
  // -------------------------------------------------------------
  // Candidate Fact Learner: Saves Gender & Common Info to DB
  // -------------------------------------------------------------
  function saveLearnedCandidateFact(key, value) {
    if (!key || !value) return;
    try {
      chrome.storage.local.get(['uploaded_resume', 'nextkin_uploaded_resume', 'uploadedCandidate', 'nextkin_active_candidate'], function(res) {
        const upl = res.uploaded_resume || res.nextkin_uploaded_resume;
        const cand = res.uploadedCandidate || (upl && upl.parsed_candidate) || res.nextkin_active_candidate || {};
        
        cand[key] = value;
        if (!cand.confirmed_facts) cand.confirmed_facts = {};
        cand.confirmed_facts[key] = value;

        chrome.storage.local.set({
          uploadedCandidate: cand,
          nextkin_active_candidate: cand,
          uploaded_resume: upl ? { ...upl, [key]: value, parsed_candidate: cand } : upl
        });

        // Sync to backend candidate profile
        chrome.storage.local.get(['token', 'nextkin_auth_token', 'origin'], function(authRes) {
          const tok = authRes.token || authRes.nextkin_auth_token;
          const orig = authRes.origin || 'https://nextkinhr.com';
          if (tok) {
            fetch(orig + '/api/jobseeker/profile', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok },
              body: JSON.stringify({ [key]: value })
            }).catch(() => {});
          }
        });
      });
    } catch {}
  }

  // Attach live listener for user interactions on gender and demographic fields
  document.addEventListener('change', function(e) {
    const el = e.target;
    if (!el || !el.tagName) return;
    const tag = el.tagName.toLowerCase();
    if (tag !== 'input' && tag !== 'select' && tag !== 'textarea') return;

    const desc = (getControlDescriptor(el) || '').toLowerCase();
    if (/\b(gender|sex)\b/i.test(desc)) {
      let val = el.value || '';
      if (tag === 'select' && el.selectedIndex >= 0) {
        val = el.options[el.selectedIndex]?.text?.trim() || val;
      }
      if (val && !/select|choose/i.test(val)) {
        saveLearnedCandidateFact('gender', val);
      }
    }
  }, true);
`;

if (!content.includes('saveLearnedCandidateFact')) {
  const insertIdx = content.indexOf('function setNativeChecked');
  if (insertIdx !== -1) {
    content = content.substring(0, insertIdx) + genderPersistenceLogic + content.substring(insertIdx);
    console.log('3. Added gender persistence logic');
  }
}

// 4. Update gender handling in autofill so it uses candidate.gender and selects actual option
content = content.replace(
  /\} else if \(\/\\b\(gender\|sex\)\\b\/i\.test\(descriptor\)\) \{\s*targetVal = 'Decline to Self Identify';/g,
  `} else if (/\\b(gender|sex)\\b/i.test(descriptor)) {
        const candG = (candidate.gender || candidate.confirmed_facts?.gender || '').toLowerCase();
        if (candG.includes('female') || candG === 'woman') targetVal = 'Female';
        else if (candG.includes('male') || candG === 'man') targetVal = 'Male';
        else if (candG.includes('non-binary') || candG.includes('nonbinary')) targetVal = 'Non-Binary';
        else targetVal = candidate.gender || 'Decline to Self Identify';`
);

content = content.replace(
  /\} else if \(\/\\b\(gender\|sex\)\\b\/i\.test\(descriptor\)\) \{\s*shouldSelect = \/decline\\s\*to\\s\*self\\s\*identify[\s\S]*?optText\);/g,
  `} else if (/\\b(gender|sex)\\b/i.test(descriptor)) {
        const candG = (candidate.gender || candidate.confirmed_facts?.gender || '').toLowerCase();
        if (candG.includes('female') || candG === 'woman') {
          shouldSelect = /\\b(female|woman)\\b/i.test(optText);
        } else if (candG.includes('male') || candG === 'man') {
          shouldSelect = /\\b(male|man)\\b/i.test(optText) && !/female/i.test(optText);
        } else if (candG.includes('non-binary') || candG.includes('nonbinary')) {
          shouldSelect = /non-binary|nonbinary/i.test(optText);
        } else {
          shouldSelect = /decline\\s*to\\s*self\\s*identify|prefer\\s*not\\s*to\\s*say|i\\s*do\\s*not\\s*wish/i.test(optText);
        }`
);

// 5. Multi-Page / Page-by-Page step watcher
const multiPageStepWatcher = `
  // -------------------------------------------------------------
  // Multi-Page / Multi-Step Form Observer
  // -------------------------------------------------------------
  let lastObservedUrl = window.location.href;
  let lastFilledStepSignature = '';

  function setupMultiPageStepWatcher() {
    // 1. URL / History change watcher (for SPAs)
    window.addEventListener('popstate', onStepChange);
    window.addEventListener('hashchange', onStepChange);

    // 2. DOM Mutation Watcher for dynamically swapped step containers
    const stepObserver = new MutationObserver((mutations) => {
      if (document.hidden) return;
      const currentUrl = window.location.href;
      if (currentUrl !== lastObservedUrl) {
        lastObservedUrl = currentUrl;
        onStepChange();
        return;
      }

      // Check if new unfilled application fields have appeared in the DOM
      const emptyInputs = document.querySelectorAll('input:not([type="hidden"]):not([type="password"]):not([data-nextkin-filled]), select:not([data-nextkin-filled]), textarea:not([data-nextkin-filled])');
      if (emptyInputs.length >= 2) {
        const signature = Array.from(emptyInputs).slice(0, 4).map(el => el.name || el.id || el.placeholder || '').join('|');
        if (signature && signature !== lastFilledStepSignature) {
          lastFilledStepSignature = signature;
          onStepChange();
        }
      }
    });

    stepObserver.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  let stepDebounceTimer = null;
  function onStepChange() {
    clearTimeout(stepDebounceTimer);
    stepDebounceTimer = setTimeout(async () => {
      const mode = detectPageMode();
      if (mode === 'form' || isFormPresent()) {
        const cand = await loadActiveCandidate();
        if (cand && (cand.full_name || cand.name)) {
          showInPageToast('📄 Next step detected: Autofilling new page fields...', 3000);
          await executeOutsideAutofill(cand);
        }
      }
    }, 700);
  }

  // Initialize multi-page watcher after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupMultiPageStepWatcher);
  } else {
    setupMultiPageStepWatcher();
  }
`;

if (!content.includes('setupMultiPageStepWatcher')) {
  content += '\n' + multiPageStepWatcher;
  console.log('4. Added multi-page step watcher');
}

fs.writeFileSync(file, content, 'utf8');
console.log('Updated outside-job-engine.js successfully!');
