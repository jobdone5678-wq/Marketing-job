/**
 * NextKinHR Recruiting Copilot - Floating Portal Widget
 * Injected on job portals to display floating extension icon and 1-click autofill card
 * Nextkinlife LLC
 */
(function () {
  'use strict';

  if (window.top !== window.self) {
    // Only run in top window
    return;
  }

  const ROOT_ID = 'nextkin-floating-widget-root';

  const LOGO_SVG = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="32" height="32" class="nk-logo-svg">
      <rect width="48" height="48" rx="8" fill="#ffffff"/>
      <image href="data:image/png;base64,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" x="7" y="7" width="34" height="34"/>
    </svg>
  `;

  const LOGO_HEADER_SVG = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="20" height="20" class="nk-header-svg">
      <rect width="48" height="48" rx="6" fill="#ffffff"/>
      <image href="data:image/png;base64,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" x="7" y="7" width="34" height="34"/>
    </svg>
  `;

  let isSidePanelOpen = Boolean(window.__NEXTKIN_SIDE_PANEL_OPEN__);

  function setWidgetVisibility(visible) {
    window.__NEXTKIN_SIDE_PANEL_OPEN__ = !visible;
    isSidePanelOpen = !visible;
    const host = document.getElementById(ROOT_ID);
    if (host) {
      host.style.display = visible ? 'block' : 'none';
    }
  }

  // Check initial side panel state
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ action: 'check_side_panel_state' }, res => {
        if (chrome.runtime?.lastError) return;
        if (res && typeof res.isOpen === 'boolean') {
          isSidePanelOpen = res.isOpen;
          setWidgetVisibility(!isSidePanelOpen);
        }
      });
    }
  } catch {}

  // Listen for side panel state events
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage?.addListener) {
      chrome.runtime.onMessage.addListener(msg => {
        if (msg?.type === 'NEXTKIN_SIDE_PANEL_STATE') {
          isSidePanelOpen = Boolean(msg.isOpen);
          setWidgetVisibility(!isSidePanelOpen);
        }
      });
    }
  } catch {}

  function isJobPortal() {
    const host = location.hostname.toLowerCase();
    
    // 1. Known ATS & Job Portal host domains (Strict whitelist)
    const atsDomains = [
      'ashbyhq.com', 'greenhouse.io', 'lever.co', 'myworkdayjobs.com', 'myworkday.com',
      'workday.com', 'smartrecruiters.com', 'jobvite.com', 'taleo.net', 'icims.com',
      'bamboohr.com', 'rippling.com', 'workable.com', 'applytojob.com', 'breezy.hr',
      'pinpointhq.com', 'recruitee.com', 'personio.de', 'personio.com', 'successfactors.com',
      'brassring.com', 'clearcompany.com', 'oraclecloud.com', 'avature.net', 'jazzhr.com',
      'ziprecruiter.com', 'indeed.com', 'glassdoor.com', 'join.com', 'teamtailor.com',
      'fountain.com', 'careerbuilder.com', 'hirehive.com', 'applicantstack.com',
      'paylocity.com', 'paycomonline.net', 'ultipro.com', 'ukg.com', 'adp.com',
      'gem.com', 'phenom.com', 'phenompeople.com'
    ];

    if (atsDomains.some(d => host === d || host.endsWith('.' + d))) {
      return true;
    }

    // 2. NextkinAdapters match check
    if (Array.isArray(globalThis.NextkinAdapters)) {
      for (const adapter of globalThis.NextkinAdapters) {
        try {
          if (typeof adapter.matches === 'function' && adapter.matches(host, location.href, document)) {
            return true;
          }
        } catch {}
      }
    }

    // Completely removed generic path matching to prevent false positives on non-job websites.
    return false;
  }


  async function getStoredCandidate() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        const data = await chrome.storage.local.get(['candidateProfile', 'resumeData', 'activeCandidateId', 'savedProfiles', 'savedResumes']);
        const activeId = data.activeCandidateId;
        const stored = data.candidateProfile || data.savedProfiles?.[activeId];
        const fresh = await Promise.resolve(chrome.runtime.sendMessage({ action: 'load_application_profile', candidateId: stored?.id }))
          .catch(() => null);
        const candidate = fresh;
        const resume = data.resumeData?.candidate_id === candidate?.id ? data.resumeData : data.savedResumes?.['doc_' + candidate?.id];
        return { candidate, resume };
      }
    } catch {}
    return { candidate: null, resume: null };
  }

  function mountFloatingWidget() {
    let host = document.getElementById(ROOT_ID);
    if (host) {
      host.style.display = isSidePanelOpen ? 'none' : 'block';
      return;
    }
    const parent = document.body || document.documentElement;
    if (!parent) return;

    host = document.createElement('div');
    host.id = ROOT_ID;
    host.style.position = 'fixed';
    host.style.top = '0';
    host.style.right = '0';
    host.style.width = '0';
    host.style.height = '0';
    host.style.zIndex = '2147483647';
    host.style.pointerEvents = 'none';
    host.style.display = isSidePanelOpen ? 'none' : 'block';
    parent.appendChild(host);

    const shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      :host {
        all: initial;
      }
      .nk-btn {
        position: fixed;
        right: 0;
        top: 35%;
        transform: translateY(-50%);
        width: 48px;
        height: 48px;
        background: #ffffff;
        border-radius: 24px 0 0 24px;
        box-shadow: -2px 4px 18px rgba(0, 0, 0, 0.16);
        border: 2px solid #00162d;
        border-right: none;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        pointer-events: auto;
        z-index: 2147483647;
        transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s ease;
        user-select: none;
        padding-left: 5px;
        box-sizing: border-box;
      }
      .nk-btn:hover {
        transform: translateY(-50%) translateX(-4px);
        box-shadow: -4px 6px 22px rgba(0, 22, 45, 0.35);
      }
      .nk-logo-svg {
        width: 32px;
        height: 32px;
        display: block;
        border-radius: 6px;
        pointer-events: none;
      }
      .nk-header-svg {
        width: 20px;
        height: 20px;
        display: block;
        border-radius: 4px;
        pointer-events: none;
      }
      .nk-indicator {
        position: absolute;
        top: 5px;
        left: 7px;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #ca1e1c;
        border: 1.5px solid #ffffff;
      }
      .nk-indicator.empty {
        background: #94a3b8;
      }
      .nk-card {
        position: fixed;
        right: 56px;
        top: 35%;
        transform: translateY(-50%);
        width: 330px;
        background: #ffffff;
        border-radius: 14px;
        box-shadow: 0 12px 36px rgba(0, 20, 44, 0.22), 0 2px 6px rgba(0, 0, 0, 0.08);
        border: 1px solid #e2e8f0;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        z-index: 2147483647;
        overflow: hidden;
        display: none;
        box-sizing: border-box;
        color: #00142c;
        pointer-events: auto;
      }
      .nk-card.open {
        display: block;
        animation: nkSlideIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes nkSlideIn {
        from { opacity: 0; transform: translateY(-50%) translateX(12px); }
        to { opacity: 1; transform: translateY(-50%) translateX(0); }
      }
      .nk-card-header {
        padding: 12px 14px;
        background: #00142c;
        border-bottom: 2px solid #ca1e1c;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .nk-brand {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        font-weight: 700;
        color: #ffffff;
      }
      .nk-brand span {
        color: #f8efd8;
      }
      .nk-close {
        cursor: pointer;
        width: 22px;
        height: 22px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 6px;
        color: #cbd5e1;
        font-size: 16px;
        line-height: 1;
        transition: background 0.15s, color 0.15s;
      }
      .nk-close:hover {
        background: rgba(255, 255, 255, 0.12);
        color: #ffffff;
      }
      .nk-card-body {
        padding: 14px;
        max-height: 440px;
        overflow-y: auto;
      }
      .nk-candidate-info {
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 10px;
        margin-bottom: 12px;
      }
      .nk-candidate-info.empty {
        background: #fff7ed;
        border-color: #ffedd5;
      }
      .nk-candidate-name {
        font-weight: 700;
        font-size: 13px;
        color: #00142c;
        display: flex;
        align-items: center;
        gap: 5px;
      }
      .nk-candidate-name::before {
        content: "";
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #ca1e1c;
        display: inline-block;
      }
      .nk-candidate-info.empty .nk-candidate-name::before {
        background: #f59e0b;
      }
      .nk-candidate-meta {
        font-size: 11px;
        color: #475569;
        margin-top: 3px;
      }
      .nk-fill-btn {
        width: 100%;
        background: #00162d;
        color: #ffffff;
        border: none;
        border-radius: 8px;
        padding: 10px 14px;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        transition: background 0.15s, transform 0.1s, box-shadow 0.15s;
        box-shadow: 0 4px 12px rgba(0, 22, 45, 0.3);
      }
      .nk-fill-btn:hover:not(:disabled) {
        background: #002244;
        box-shadow: 0 6px 16px rgba(0, 22, 45, 0.45);
      }
      .nk-fill-btn:active:not(:disabled) {
        transform: scale(0.98);
        background: #001020;
      }
      .nk-fill-btn:disabled {
        background: #94a3b8;
        box-shadow: none;
        opacity: 0.65;
        cursor: not-allowed;
      }
      .nk-status-msg {
        font-size: 11px;
        margin-top: 10px;
        padding: 8px 10px;
        border-radius: 6px;
        display: none;
        line-height: 1.4;
      }
      .nk-status-msg.show {
        display: block;
      }
      .nk-status-msg.success {
        background: #f8fafc;
        color: #00142c;
        border: 1px solid #cbd5e1;
        border-left: 3px solid #1d4ed8;
      }
      .nk-status-msg.error {
        background: #fdf2f2;
        color: #ca1e1c;
        border: 1px solid #fecaca;
        border-left: 3px solid #ca1e1c;
      }
      .nk-sections {
        margin-top: 12px;
        display: grid;
        gap: 10px;
      }
      .nk-sec-block {
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 8px 10px;
      }
      .nk-sec-label {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        margin-bottom: 5px;
      }
      .nk-sec-label.filled {
        color: #1d4ed8;
      }
      .nk-sec-label.unfilled {
        color: #ca1e1c;
      }
      .nk-sec-list {
        margin: 0;
        padding: 0;
        list-style: none;
        max-height: 110px;
        overflow-y: auto;
      }
      .nk-sec-list li {
        font-size: 11px;
        padding: 2px 0;
        color: #334155;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .nk-sec-list.filled li::before {
        content: "✓ ";
        color: #1d4ed8;
        font-weight: 700;
      }
      .nk-sec-list.unfilled li::before {
        content: "○ ";
        color: #ca1e1c;
        font-weight: 700;
      }
      .nk-card-footer {
        padding: 10px 14px;
        background: #f8fafc;
        border-top: 1px solid #e2e8f0;
        display: flex;
        justify-content: flex-end;
      }
      .nk-sidepanel-link {
        font-size: 11px;
        color: #1d4ed8;
        background: none;
        border: none;
        cursor: pointer;
        padding: 0;
        font-weight: 650;
        text-decoration: underline;
      }
      .nk-sidepanel-link:hover {
        color: #ca1e1c;
      }
    `;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="nk-btn" id="nk-btn" title="NextKinHR Recruiting Copilot • Click to open extension">
        <div class="nk-indicator" id="nk-indicator"></div>
        ${LOGO_SVG}
      </div>

      <div class="nk-card" id="nk-card">
        <div class="nk-card-header">
          <div class="nk-brand">
            ${LOGO_HEADER_SVG}
            <span>NextKinHR Copilot</span>
          </div>
          <div class="nk-close" id="nk-close" title="Close">&times;</div>
        </div>

        <div class="nk-card-body">
          <div class="nk-candidate-info" id="nk-cand-info">
            <div class="nk-candidate-name" id="nk-cand-name">Loading candidate…</div>
            <div class="nk-candidate-meta" id="nk-cand-meta"></div>
          </div>

          <button class="nk-fill-btn" id="nk-fill-btn">
            <span>⚡ Autofill Application</span>
          </button>

          <div class="nk-status-msg" id="nk-status"></div>

          <div class="nk-sections" id="nk-sections" style="display: none;">
            <div class="nk-sec-block" id="nk-filled-block" style="display: none;">
              <div class="nk-sec-label filled">✓ Autofilled Fields (<span id="nk-filled-cnt">0</span>)</div>
              <ul class="nk-sec-list filled" id="nk-filled-list"></ul>
            </div>
            <div class="nk-sec-block" id="nk-unfilled-block" style="display: none;">
              <div class="nk-sec-label unfilled">○ Unfilled Fields (<span id="nk-unfilled-cnt">0</span>)</div>
              <ul class="nk-sec-list unfilled" id="nk-unfilled-list"></ul>
            </div>
          </div>
        </div>

        <div class="nk-card-footer">
          <button class="nk-sidepanel-link" id="nk-sidepanel-btn">Open Extension Side Panel &rarr;</button>
        </div>
      </div>
    `;

    shadow.appendChild(style);
    shadow.appendChild(wrapper);

    const findEl = id => (wrapper.querySelector ? wrapper.querySelector('#' + id) : null)
      || (shadow.getElementById ? shadow.getElementById(id) : null)
      || (shadow.querySelector ? shadow.querySelector('#' + id) : null);

    const btn = findEl('nk-btn');
    const card = findEl('nk-card');
    const closeBtn = findEl('nk-close');
    const fillBtn = findEl('nk-fill-btn');
    const candInfo = findEl('nk-cand-info');
    const candName = findEl('nk-cand-name');
    const candMeta = findEl('nk-cand-meta');
    const statusMsg = findEl('nk-status');
    const indicator = findEl('nk-indicator');
    const sidepanelBtn = findEl('nk-sidepanel-btn');
    const sectionsBlock = findEl('nk-sections');
    const filledBlock = findEl('nk-filled-block');
    const filledCnt = findEl('nk-filled-cnt');
    const filledList = findEl('nk-filled-list');
    const unfilledBlock = findEl('nk-unfilled-block');
    const unfilledCnt = findEl('nk-unfilled-cnt');
    const unfilledList = findEl('nk-unfilled-list');

    let currentCandidate = null;
    let currentResume = null;
    let isDragging = false;
    let startY = 0;
    let initialTop = 0;

    // Refresh candidate details from storage
    async function updateCandidateCard() {
      const { candidate, resume } = await getStoredCandidate();
      currentCandidate = candidate;
      currentResume = resume;

      const hasDetails = candidate && Boolean(
        candidate.full_name || candidate.email || candidate.phone ||
        candidate.current_job_title || candidate.current_employer ||
        (resume && (resume.raw_text || resume.filename))
      );

      if (hasDetails) {
        candInfo.className = 'nk-candidate-info';
        candName.textContent = candidate.full_name || candidate.name || 'Candidate Profile';
        const title = candidate.current_job_title || candidate.headline || 'Profile Active';
        candMeta.textContent = `${title} • Resume ready`;
        indicator.className = 'nk-indicator';
        fillBtn.disabled = false;
      } else {
        candInfo.className = 'nk-candidate-info empty';
        candName.textContent = '⚠️ No candidate details found';
        candMeta.textContent = 'Autofill fills only submitted details. Upload resume or save profile in NextKinHR.';
        indicator.className = 'nk-indicator empty';
        fillBtn.disabled = true;
      }
    }

    // Click floating button: immediately hide widget and open extension side panel
    btn.addEventListener('click', e => {
      if (isDragging) return;
      e.stopPropagation();
      isSidePanelOpen = true;
      setWidgetVisibility(false);

      // Trigger side panel opening in background service worker
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
          chrome.runtime.sendMessage({ action: 'open_side_panel' }, () => {
            void chrome.runtime?.lastError;
          });
        }
      } catch {}
    });

    closeBtn.addEventListener('click', e => {
      e.stopPropagation();
      card.classList.remove('open');
    });

    document.addEventListener('click', e => {
      if (!host.contains(e.target)) {
        card.classList.remove('open');
      }
    });

    sidepanelBtn.addEventListener('click', e => {
      e.stopPropagation();
      isSidePanelOpen = true;
      setWidgetVisibility(false);
      try {
        if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
          chrome.runtime.sendMessage({ action: 'open_side_panel' }, () => {
            void chrome.runtime?.lastError;
          });
        }
      } catch {}
    });

    // Vertical drag handling for the floating button along viewport right edge
    btn.addEventListener('mousedown', e => {
      isDragging = false;
      startY = e.clientY;
      const rect = btn.getBoundingClientRect();
      initialTop = rect.top + rect.height / 2;

      function onMouseMove(moveEvent) {
        const delta = moveEvent.clientY - startY;
        if (Math.abs(delta) > 3) {
          isDragging = true;
          const newTop = Math.max(30, Math.min(window.innerHeight - 30, initialTop + delta));
          btn.style.top = newTop + 'px';
          card.style.top = newTop + 'px';
        }
      }

      function onMouseUp() {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        setTimeout(() => { isDragging = false; }, 50);
      }

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    // Execute autofill
    fillBtn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!currentCandidate) {
        statusMsg.className = 'nk-status-msg error show';
        statusMsg.textContent = 'No candidate details found. Please submit candidate details in NextKinHR first.';
        return;
      }

      fillBtn.disabled = true;
      fillBtn.innerHTML = '<span>⏳ Filling application…</span>';
      statusMsg.className = 'nk-status-msg show';
      statusMsg.textContent = 'Discovering fields and filling based strictly on candidate details…';

      try {
        if (!globalThis.NextkinApplication?.fill) {
          throw new Error('Autofill engine is not loaded on this page.');
        }

        const url = window.location.href;
        const page = globalThis.NextkinApplication.scan?.();
        const candidate = await chrome.runtime.sendMessage({ action: 'load_application_profile', candidateId: currentCandidate.id })
          .catch(() => null);
        if (!candidate) throw new Error('Save your candidate details in My Applications and Resume, then reconnect the extension.');
        const resume = currentResume;
        const [tracking, resumeFile] = await Promise.all([
          page?.hasForm ? chrome.runtime.sendMessage({
            action: 'prepare_application_tracking', url, job: page.job, candidateId: candidate.id,
          }).catch(() => null) : null,
          resume?.base64 ? resume : chrome.runtime.sendMessage({
            action: 'load_application_resume', candidateId: candidate.id,
          }).catch(() => null),
        ]);
        const res = await globalThis.NextkinApplication.startAutofill(
          url,
          candidate,
          resumeFile ? { ...resume, ...resumeFile } : resume,
          resume?.id
        );

        if (res.error) {
          statusMsg.className = 'nk-status-msg error show';
          statusMsg.textContent = res.error;
          if (sectionsBlock) sectionsBlock.style.display = 'none';
        } else {
          const filledArr = res.filled || [];
          const unfilledArr = res.unfilled || [];

          const trackingWarning = tracking?.tracked ? '' : ` ${tracking?.error || 'Application tracking is unavailable. Check your NextKinHR connection.'}`;
          statusMsg.className = `nk-status-msg ${trackingWarning ? 'error' : 'success'} show`;
          statusMsg.textContent = `Autofill complete: ${filledArr.length} filled, ${unfilledArr.length} unfilled.${trackingWarning}`;

          if (sectionsBlock && (filledArr.length || unfilledArr.length)) {
            sectionsBlock.style.display = 'grid';

            if (filledBlock && filledCnt && filledList) {
              if (filledArr.length) {
                filledBlock.style.display = 'block';
                filledCnt.textContent = String(filledArr.length);
                filledList.replaceChildren(...filledArr.map(f => {
                  const li = document.createElement('li');
                  li.textContent = `${f.label}: ${f.value}`;
                  return li;
                }));
              } else {
                filledBlock.style.display = 'none';
              }
            }

            if (unfilledBlock && unfilledCnt && unfilledList) {
              if (unfilledArr.length) {
                unfilledBlock.style.display = 'block';
                unfilledCnt.textContent = String(unfilledArr.length);
                unfilledList.replaceChildren(...unfilledArr.map(f => {
                  const li = document.createElement('li');
                  li.textContent = `${f.label}${f.reason ? ` (${f.reason})` : ''}`;
                  return li;
                }));
              } else {
                unfilledBlock.style.display = 'none';
              }
            }
          }
        }
      } catch (err) {
        statusMsg.className = 'nk-status-msg error show';
        statusMsg.textContent = err?.message || 'Could not complete autofill.';
      } finally {
        fillBtn.disabled = false;
        fillBtn.innerHTML = '<span>⚡ Autofill Application</span>';
      }
    });

    // Initial check
    void updateCandidateCard();
  }

  function init() {
    if (isJobPortal()) {
      mountFloatingWidget();
    }
  }

  // Run on load and observe future navigation / dynamic ATS form loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Periodic safety check for client-side routing on job portals
  setInterval(() => {
    if (isJobPortal()) {
      const host = document.getElementById(ROOT_ID);
      if (!host) {
        mountFloatingWidget();
      } else {
        const expectedDisplay = isSidePanelOpen ? 'none' : 'block';
        if (host.style.display !== expectedDisplay) {
          host.style.display = expectedDisplay;
        }
      }
    }
  }, 800);

  // Watch DOM mutations to mount as soon as body / portal container appears
  try {
    const observer = new MutationObserver(() => {
      if (isJobPortal() && !document.getElementById(ROOT_ID)) {
        mountFloatingWidget();
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  } catch {}

  // Watch URL changes in SPAs
  window.addEventListener('popstate', init);
  window.addEventListener('hashchange', init);
})();
