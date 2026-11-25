/**
 * NextKinHR Recruiting Copilot - Floating Portal Widget
 * Injected on job portals to open the side panel from supported job portals
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
    const href = typeof location !== 'undefined' ? location.href : '';
    const host = (typeof location !== 'undefined' ? location.hostname : '').toLowerCase();
    if (globalThis.NextkinSiteRegistry?.isExcludedUrl?.(href)) {
      return false;
    }
    if (globalThis.NextkinSiteRules?.isSiteBlocked?.(href)) {
      return false;
    }
    if (globalThis.NextkinSiteRegistry?.resolveSite?.(href, document)) {
      return true;
    }

    // 1. Known ATS & Job Portal host domains (Strict whitelist fallback)
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
    `;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <button type="button" class="nk-btn" id="nk-btn" aria-label="Open NextKinHR Recruiting Copilot">
        ${LOGO_SVG}
      </button>
    `;

    shadow.appendChild(style);
    shadow.appendChild(wrapper);

    const findEl = id => (wrapper.querySelector ? wrapper.querySelector('#' + id) : null)
      || (shadow.getElementById ? shadow.getElementById(id) : null)
      || (shadow.querySelector ? shadow.querySelector('#' + id) : null);

    const btn = findEl('nk-btn');
    let isDragging = false;
    let startY = 0;
    let initialTop = 0;

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

  }

  let intervalId = null;
  let domObserver = null;

  function ensureMonitors() {
    if (!intervalId) {
      intervalId = setInterval(() => {
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
    }

    if (!domObserver && typeof MutationObserver === 'function' && document.documentElement) {
      try {
        domObserver = new MutationObserver(() => {
          if (isJobPortal() && !document.getElementById(ROOT_ID)) {
            mountFloatingWidget();
          }
        });
        domObserver.observe(document.documentElement, { childList: true, subtree: true });
      } catch {}
    }
  }

  function init() {
    if (isJobPortal()) {
      mountFloatingWidget();
      ensureMonitors();
    }
  }

  // Run on load and observe navigation / dynamic ATS form loads only on supported portals
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Watch URL changes in SPAs
  window.addEventListener('popstate', init);
  window.addEventListener('hashchange', init);
  window.addEventListener('nextkin:spa-navigation', init);
})();
