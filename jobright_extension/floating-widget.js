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
      <rect width="48" height="48" rx="8" fill="#00142c"/>
      <g transform="translate(24, 24) scale(0.14) translate(-480, -357)">
        <polygon points="476,290 561,249 561,319 476,360" fill="#e53835"/>
        <polygon points="492,368 561,335 561,418" fill="#d32f2f"/>
        <polygon points="476,360 399,323 399,396 492,464 554,420 476,380" fill="#b71c1c"/>
      </g>
    </svg>
  `;

  const LOGO_HEADER_SVG = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="20" height="20" class="nk-header-svg">
      <rect width="48" height="48" rx="6" fill="#00142c"/>
      <g transform="translate(24, 24) scale(0.14) translate(-480, -357)">
        <polygon points="476,290 561,249 561,319 476,360" fill="#e53835"/>
        <polygon points="492,368 561,335 561,418" fill="#d32f2f"/>
        <polygon points="476,360 399,323 399,396 492,464 554,420 476,380" fill="#b71c1c"/>
      </g>
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
