(function () {
  if (globalThis.nextkinConfirmationObserver) return;
  globalThis.nextkinConfirmationObserver = true;

  const confirmationPatterns = [
    /^(?:(?:congratulations|congrats|thank you|thanks)[!.,:]*\s+)?(?:(?:thank you|thanks) for (?:applying|your application|submitting your application)|(?:(?:thank you|thanks)[!.,:]*\s+)?(?:your |the )?(?:job )?(?:applications?|submissions?)\s+(?:(?:has been |have been |was |is |were )?(?:(?:successfully )?(?:submitted|received|sent|confirmed|complete|completed)|successful)|(?:has been |have been |was |is |were )(?:received|submitted|sent|confirmed))|(?:(?:you (?:have )?|you've )?successfully submitted|(?:you (?:have )?|you've )submitted) (?:your |the )?(?:job )?(?:applications?|submissions?)|submissions? (?:received|confirmed|successful|complete|completed)|(?:we(?: have|'ve)?) (?:successfully )?received (?:your |the )?(?:job )?(?:applications?|submissions?)|(?:you(?: have|'ve) )?successfully applied|(?:you (?:have )?|you've )?applied successfully)(?=$|[.!,:]|\s+(?:to|for|successfully|at|with|and|by|on|in|we)\b)/i,
    /^(?:application submitted|application received|application have been received|application has been received|applications? (?:submitted|received|confirmed|complete|completed)|submissions? (?:received|confirmed|successful|complete|completed)|successfully submitted (?:your |the )?application|you (?:have )?applied successfully|you've applied successfully)(?=$|[.!,:]|\s+)/i,
    /\b(?:(?:thank\s+you|thanks)\s+for\s+(?:your\s+)?interest(?:(?:\s+in\s+)(?:our\s+company|[^,.:;!?]+?))?[,.\s]+)?(?:we(?: have|'ve)?\s+)?(?:successfully\s+)?received\s+(?:your|the)\s+(?:job\s+)?(?:applications?|submissions?)\b/i,
    /\b(?:(?:thank you|thanks) for (?:applying|your application)|(?:we(?: have|'ve)?) (?:successfully )?received (?:your |the )?(?:job\s+)?(?:applications?|submissions?)|(?:job\s+)?(?:applications?|submissions?) (?:has been|have been|was|is) (?:successfully )?(?:received|submitted))\b/i
  ];

  const appReceiptPattern = /\b(?:(?:we(?: have|'ve)?\s+(?:successfully\s+)?received\s+(?:your\s+|the\s+)?(?:job\s+)?(?:applications?|submissions?))|(?:(?:your\s+|the\s+)?(?:job\s+)?(?:applications?|submissions?)\s+(?:has been|have been|was|is)\s+(?:successfully\s+)?(?:received|submitted|confirmed))|(?:thank\s+you\s+for\s+(?:applying|your\s+application|submitting\s+your\s+application))|(?:thank\s+you\s+for\s+your\s+interest[,\s]+(?:in\s+our\s+company[,\s]*)?(?:we\s+have\s+received\s+your\s+application)?)|(?:applications?\s+received|applications?\s+submitted))\b/i;
  const standaloneNonJob = /\b(?:thank\s+you\s+for\s+(?:taking|completing|submitting)\s+(?:our|the|this)?\s*(?:survey|questionnaire|feedback)|(?:survey|questionnaire|feedback)\s+(?:response\s+)?(?:has been\s+)?(?:submitted|received|recorded|complete|completed)|newsletter\s+sign[-_]?up|subscription\s+confirmed|order\s+confirmed|purchase\s+confirmed|order\s+summary|ticket\s+created|donation\s+received)\b/i;
  const nonJobContext = /\b(?:contact\s+us|customer\s+support|newsletter|survey|feedback|subscribe|subscription|donation|cart|checkout|order\s+confirmed|purchase|order\s+summary|ticket\s+created)\b/i;

  const confirmationUrlPattern = /\/(?:application\/(?:confirmation|received|complete|thank[-_]?you)|confirmation|thank[-_]?you(?:[-_]for[-_]applying)?|thanks|applied|application[-_](?:submitted|success|received|complete)|submission[-_]success|success|submitted)\/?$/i;

  const statusSelectors = '[data-qa="job-application-success"], [data-automation-id="applicationSubmitted"], [data-automation-id="congratulations"], [data-testid="application-submitted"], [data-testid*="application-success" i], [class*="application-confirmation" i], [class*="application-submitted" i], #application_confirmation, [role="status"], [role="alert"], [role="dialog"], [aria-live="polite"], [aria-live="assertive"], dialog[open], [data-testid*="success" i], [data-testid*="confirmation" i], [class*="toast" i], [class*="snackbar" i]';
  const atsSuccessSelector = '[data-qa="job-application-success"], [data-automation-id="applicationSubmitted"], [data-automation-id="congratulations"], [data-testid="application-submitted"], [data-testid*="application-success" i], #application_confirmation, .application-confirmation, .application-submitted';

  // Broaden hiddenSelectors to exclude footers, headers, navigation, and wizard progress bars
  const hiddenSelectors = [
    'footer', 'header', 'nav',
    '[role="contentinfo"]', '[role="banner"]', '[role="navigation"]',
    '.footer', '#footer', '.site-footer',
    'script', 'style', 'template',
    '[hidden]', '[inert]', '[aria-hidden="true"]',
    '[data-automation-id="stepIndicator"]', '.wizard-steps', '.step-indicator',
    '.progress-bar', 'ol.steps', '[class*="step-indicator" i]', '[class*="wizard-step" i]'
  ].join(', ');

  const errorSelectors = [
    '[data-automation-id="errorBanner"]',
    '[data-automation-id="formError"]',
    '[data-automation-id="errorMessage"]',
    '[data-qa="error-message"]',
    '[data-qa="form-error"]',
    '[data-testid="form-error"]',
    '[data-testid="error-banner"]',
    '.alert-danger',
    '.alert-error',
    '.error-message',
    '.form-error',
    '[role="alert"].error',
    '[role="alert"].alert-danger'
  ].join(', ');

  const errorPattern = /\b(?:unable to submit|submission failed|error submitting|failed to submit|there was an error processing your application|submission error|an error occurred while submitting|application could not be submitted|please fix the following errors)\b/i;

  function q(sel, root = document) {
    if (!root) return null;
    if (typeof root.querySelector === 'function') return root.querySelector(sel);
    if (typeof root.querySelectorAll === 'function') return root.querySelectorAll(sel)[0] || null;
    return null;
  }

  function qAll(sel, root = document) {
    if (!root || typeof root.querySelectorAll !== 'function') return [];
    return root.querySelectorAll(sel) || [];
  }

  let timer;
  let pending = false;
  let confirmedSent = false;
  let attempts = 0;
  let receipt;

  // Track submission attempt to distinguish page navigation after submit vs idle browsing
  let submissionAttempted = false;
  try {
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('nextkin_submission_attempted') === 'true') {
      submissionAttempted = true;
    }
  } catch {}

  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('submit', () => {
      submissionAttempted = true;
      try { sessionStorage?.setItem('nextkin_submission_attempted', 'true'); } catch {}
    }, true);

    document.addEventListener('click', event => {
      const btn = event.target?.closest?.('button, input[type="submit"], [role="button"]');
      if (!btn) return;
      const txt = (btn.innerText || btn.value || '').trim();
      if (/\b(?:submit|apply|send application|complete application)\b/i.test(txt)) {
        submissionAttempted = true;
        try { sessionStorage?.setItem('nextkin_submission_attempted', 'true'); } catch {}
      }
    }, true);
  }

  function isVisible(element) {
    if (!element) return false;
    if (typeof element.getClientRects === 'function' && !element.getClientRects().length) return false;
    const view = element.ownerDocument?.defaultView || globalThis;
    const style = view.getComputedStyle ? view.getComputedStyle(element) : null;
    if (style) {
      if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') return false;
    }
    return true;
  }

  function detectExplicitError() {
    for (const el of qAll(errorSelectors)) {
      if (!isVisible(el) || el.closest?.(hiddenSelectors)) continue;
      const txt = (el.innerText || el.textContent || '').trim();
      if (errorPattern.test(txt)) {
        return txt.slice(0, 150);
      }
    }
    return null;
  }

  const ignoredInputSelectors = [
    'input[type="search"]',
    'header input',
    'nav input',
    '[role="search"] input',
    '[role="search"] button',
    '[class*="newsletter" i]',
    '[class*="alert" i]',
    '[class*="subscribe" i]',
    '[id*="subscribe" i]',
    '[id*="newsletter" i]',
    '[id*="alert" i]'
  ].join(', ');

  function hasActiveSubmitButton() {
    const submitSelectors = [
      'form button[type="submit"]',
      'form input[type="submit"]',
      'button[type="submit"]',
      'input[type="submit"]',
      '[role="button"][data-automation-id*="submit" i]',
      'button[data-automation-id*="submit" i]',
      'button[data-automation-id*="bottom-navigation-next-button" i]',
      'button[data-testid*="submit" i]',
      '[data-qa*="submit" i]'
    ].join(', ');

    const buttons = qAll(submitSelectors);
    for (const btn of buttons) {
      if (btn.disabled || (typeof btn.getAttribute === 'function' && btn.getAttribute('aria-disabled') === 'true')) continue;
      if (btn.closest?.(hiddenSelectors) || btn.closest?.(ignoredInputSelectors)) continue;
      if (!isVisible(btn)) continue;
      const text = (btn.innerText || btn.value || (typeof btn.getAttribute === 'function' ? btn.getAttribute('aria-label') : '') || '').trim();
      if (/\b(?:submit|apply|send application|complete application)\b/i.test(text)) {
        return true;
      }
    }
    return false;
  }

  function detectAtsProvider() {
    const host = (window.location?.hostname || '').toLowerCase();
    if (/(^|\.)myworkday(jobs|site)?\.com$/i.test(host)) return 'workday';
    if (/(^|\.)(greenhouse\.io|job-boards\.greenhouse\.io)$/i.test(host)) return 'greenhouse';
    if (/(^|\.)lever\.co$/i.test(host)) return 'lever';
    if (/(^|\.)ashbyhq\.com$/i.test(host)) return 'ashby';
    if (/(^|\.)(smartrecruiters\.com|smartr\.me)$/i.test(host)) return 'smartrecruiters';

    // DOM fallbacks
    if (q('[data-automation-id*="workday" i], [data-automation-id="applicationSubmitted"]')) return 'workday';
    if (q('#application_confirmation, [data-qa="job-application-success"], #grnhse_app')) return 'greenhouse';
    if (q('.lever-confirmation, .application-confirmation, .application-submitted')) return 'lever';
    if (q('[data-testid="application-submitted"], [class*="ashby" i]')) return 'ashby';
    if (q('[data-test="application-success"], [data-testid="application-success"]')) return 'smartrecruiters';
    return 'generic';
  }

  function extractRequisitionAndConfirmationId(ats) {
    let requisitionId = null;
    let confirmationId = null;

    const reqEl = q('[data-automation-id="requisitionId"], [data-automation-id="jobId"], [data-testid*="requisition-id" i], [data-qa*="req-id" i]');
    if (reqEl) requisitionId = (reqEl.innerText || reqEl.textContent || '').trim();

    const confEl = q('[data-automation-id="confirmationId"], #confirmation_id, [data-qa="confirmation-id"], [data-testid*="confirmation-id" i]');
    if (confEl) confirmationId = (confEl.innerText || confEl.textContent || '').trim();

    const loc = window.location || {};
    const pathname = loc.pathname || '';
    const params = loc.searchParams || (loc.search && typeof URLSearchParams !== 'undefined' ? new URLSearchParams(loc.search) : null);

    if (params) {
      if (!confirmationId) {
        confirmationId = params.get('confirmation_id') || params.get('conf_id') || params.get('application_id') || params.get('gh_aid') || null;
      }
      if (!requisitionId) {
        requisitionId = params.get('req_id') || params.get('requisition_id') || params.get('gh_jid') || params.get('ashby_jid') || params.get('job_id') || null;
      }
    }

    if (!requisitionId) {
      if (ats === 'workday') {
        const m = pathname.match(/\/(JR\d+|R-\d+|\d{5,})/i);
        if (m) requisitionId = m[1];
      } else if (ats === 'greenhouse') {
        const m = pathname.match(/\/jobs\/(\d+)/i);
        if (m) requisitionId = m[1];
      } else if (ats === 'lever') {
        const m = pathname.match(/\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
        if (m) requisitionId = m[1];
      } else if (ats === 'ashby') {
        const m = pathname.match(/\/([a-f0-9-]{10,})/i);
        if (m) requisitionId = m[1];
      } else if (ats === 'smartrecruiters') {
        const m = pathname.match(/\/jobs\/([a-zA-Z0-9_-]+)/i);
        if (m) requisitionId = m[1];
      }
    }

    if (!confirmationId || !requisitionId) {
      for (const el of qAll('p, div, span, h2, h3')) {
        if (!isVisible(el) || el.closest?.(hiddenSelectors)) continue;
        const text = el.innerText || '';
        if (!confirmationId) {
          const confMatch = text.match(/\b(?:confirmation|receipt|submission)\s*(?:#|id|number|code)?[:\s]*([a-z0-9_-]{4,32})\b/i);
          if (confMatch && !/^(?:number|id|code|please|is|your|has)$/i.test(confMatch[1])) {
            confirmationId = confMatch[1];
          }
        }
        if (!requisitionId) {
          const reqMatch = text.match(/\b(?:requisition|req|job\s*req|job\s*id)\s*(?:#|id|number)?[:\s]*([a-z0-9_-]{4,32})\b/i);
          if (reqMatch && !/^(?:number|id|code|please|is|your|has)$/i.test(reqMatch[1])) {
            requisitionId = reqMatch[1];
          }
        }
        if (confirmationId && requisitionId) break;
      }
    }

    return { requisitionId, confirmationId };
  }

  function confirmationEvidence(value, patterns = confirmationPatterns) {
    const text = value?.replace(/\s+/g, ' ').trim().replace(/^success[!.:]\s*/i, '');
    if (!text || text.length > 500) return null;
    if (/\b(?:if|once|after|when|before|until|unless)\b.{0,50}\b(?:application|submit(?:ted)?|receiv(?:e|ed))\b|\b(?:not (?:been )?(?:submitted|received|sent)|unable to submit|submission failed|not successful)\b/i.test(text)) return null;

    const hasAppReceipt = appReceiptPattern.test(text);
    if (standaloneNonJob.test(text) && !hasAppReceipt) return null;
    if (!hasAppReceipt && nonJobContext.test(text)) return null;

    for (const pattern of patterns) {
      const match = pattern.exec(text);
      if (match) return match[0];
    }
    return null;
  }

  function checkAtsDeterministic(ats) {
    const pathname = (window.location?.pathname || '').toLowerCase();
    const { requisitionId, confirmationId } = extractRequisitionAndConfirmationId(ats);

    // 1. Workday
    if (ats === 'workday') {
      const wdTerminal = q([
        '[data-automation-id="applicationSubmitted"]',
        '[data-automation-id="congratulations"]',
        '[data-automation-id="thankYouMessage"]',
        '[data-automation-id="submissionSummary"]'
      ].join(', '));
      if (wdTerminal && isVisible(wdTerminal)) {
        const heading = q('h1, h2, h3, p', wdTerminal)?.innerText || wdTerminal.innerText || 'Application submitted successfully';
        const evidence = confirmationEvidence(heading) || 'Application submitted successfully';
        return { status: 'SUBMITTED', evidence, atsDetected: true, atsProvider: 'workday', requisitionId, confirmationId };
      }
      if (/\/(?:congratulations|applicationSubmitted|apply\/congratulations)/i.test(pathname)) {
        return { status: 'SUBMITTED', evidence: `URL confirmation path: ${pathname}`, atsDetected: true, atsProvider: 'workday', requisitionId, confirmationId };
      }
    }

    // 2. Greenhouse
    if (ats === 'greenhouse') {
      const ghTerminal = q('#application_confirmation, [data-qa="job-application-success"], .application-confirmation, #apply_status');
      if (ghTerminal && isVisible(ghTerminal)) {
        const heading = q('h1, h2, h3, p', ghTerminal)?.innerText || ghTerminal.innerText || 'Thank you for applying';
        const evidence = confirmationEvidence(heading) || 'Thank you for applying';
        return { status: 'SUBMITTED', evidence, atsDetected: true, atsProvider: 'greenhouse', requisitionId, confirmationId };
      }
      if (/\/(?:confirmation|thank[-_]?you)(?:\?.*)?$/i.test(pathname)) {
        return { status: 'SUBMITTED', evidence: `URL confirmation path: ${pathname}`, atsDetected: true, atsProvider: 'greenhouse', requisitionId, confirmationId };
      }
    }

    // 3. Lever
    if (ats === 'lever') {
      const leverTerminal = q('.application-confirmation, .application-submitted, [data-qa="confirmation-page"], .confirmation-section, .lever-confirmation');
      if (leverTerminal && isVisible(leverTerminal)) {
        const heading = q('h1, h2, h3, p', leverTerminal)?.innerText || leverTerminal.innerText || 'Application submitted';
        const evidence = confirmationEvidence(heading) || 'Application submitted';
        return { status: 'SUBMITTED', evidence, atsDetected: true, atsProvider: 'lever', requisitionId, confirmationId };
      }
      if (/\/(?:thanks|thank-you|confirmation)(?:\?.*)?$/i.test(pathname)) {
        return { status: 'SUBMITTED', evidence: `URL confirmation path: ${pathname}`, atsDetected: true, atsProvider: 'lever', requisitionId, confirmationId };
      }
    }

    // 4. Ashby
    if (ats === 'ashby') {
      const ashbyTerminal = q('[data-testid="application-submitted"], [data-testid*="application-success" i], [class*="applicationSubmitted" i], [class*="ApplicationSuccess" i]');
      if (ashbyTerminal && isVisible(ashbyTerminal)) {
        const heading = q('h1, h2, h3, p', ashbyTerminal)?.innerText || ashbyTerminal.innerText || 'Your application was successfully submitted';
        const evidence = confirmationEvidence(heading) || 'Your application was successfully submitted';
        return { status: 'SUBMITTED', evidence, atsDetected: true, atsProvider: 'ashby', requisitionId, confirmationId };
      }
      if (/\/(?:confirmation|submitted|thank[-_]?you)(?:\?.*)?$/i.test(pathname)) {
        return { status: 'SUBMITTED', evidence: `URL confirmation path: ${pathname}`, atsDetected: true, atsProvider: 'ashby', requisitionId, confirmationId };
      }
    }

    // 5. SmartRecruiters
    if (ats === 'smartrecruiters') {
      const srTerminal = q('[data-test="application-success"], [data-testid="application-success"], st-application-success, .application-success, [data-qa="success-page"], spl-application-submitted');
      if (srTerminal && isVisible(srTerminal)) {
        const heading = q('h1, h2, h3, p', srTerminal)?.innerText || srTerminal.innerText || 'Application submitted successfully';
        const evidence = confirmationEvidence(heading) || 'Application submitted successfully';
        return { status: 'SUBMITTED', evidence, atsDetected: true, atsProvider: 'smartrecruiters', requisitionId, confirmationId };
      }
      if (/\/(?:thank-you|success|confirmation)(?:\?.*)?$/i.test(pathname)) {
        return { status: 'SUBMITTED', evidence: `URL confirmation path: ${pathname}`, atsDetected: true, atsProvider: 'smartrecruiters', requisitionId, confirmationId };
      }
    }

    return null;
  }

  function detectConfirmation() {
    const ats = detectAtsProvider();
    const hasAtsSelector = Boolean(qAll(atsSuccessSelector).length);

    // 1. Explicit ATS Error Banner check (triggers FAILED)
    const errorText = detectExplicitError();
    if (errorText) {
      return {
        status: 'FAILED',
        evidence: `Error: ${errorText}`,
        atsDetected: true,
        atsProvider: ats
      };
    }

    // 2. Overlay / Dialog / Toast / Live status elements
    for (const element of qAll(statusSelectors)) {
      if (!isVisible(element) || element.closest?.(hiddenSelectors)) continue;
      // Skip if this overlay itself has an enabled submit button (e.g. submit confirmation prompt)
      if (q('form button[type="submit"]:not([disabled]), form input[type="submit"]:not([disabled])', element)) continue;
      const candidates = [element, ...(typeof element.querySelectorAll === 'function' ? element.querySelectorAll('h1, h2, h3, p') : [])];
      for (const child of candidates) {
        if (!isVisible(child) || child.closest?.(hiddenSelectors)) continue;
        const evidence = confirmationEvidence(child.innerText, confirmationPatterns.slice(0, 2));
        if (evidence) {
          const { requisitionId, confirmationId } = extractRequisitionAndConfirmationId(ats);
          return { status: 'SUBMITTED', evidence, atsDetected: true, atsProvider: ats, requisitionId, confirmationId };
        }
      }
    }

    // 3. Negative check: if active enabled submit buttons are still visible and enabled,
    // the application is NOT completed.
    if (hasActiveSubmitButton()) return null;

    // 4. Deterministic ATS confirmation rules (Workday, Greenhouse, Lever, Ashby, SmartRecruiters)
    const deterministic = checkAtsDeterministic(ats);
    if (deterministic) return deterministic;

    // 5. Headings and paragraphs check (excluding hiddenSelectors)
    for (const element of qAll('h1, h2, h3, p')) {
      if (!isVisible(element) || element.closest?.(hiddenSelectors)) continue;
      const evidence = confirmationEvidence(element.innerText);
      if (evidence) {
        const { requisitionId, confirmationId } = extractRequisitionAndConfirmationId(ats);
        return { status: 'SUBMITTED', evidence, atsDetected: hasAtsSelector || ats !== 'generic', atsProvider: ats, requisitionId, confirmationId };
      }
    }

    // 6. Scoped TreeWalker fallback (only within main application content, excluding footers/navs/wizard)
    const root = q('main, [role="main"], #main-content, #content, .content, .application-container') ||
      document.body || document.documentElement;
    if (root && typeof document.createTreeWalker === 'function') {
      const walker = document.createTreeWalker(root, typeof NodeFilter !== 'undefined' && NodeFilter.SHOW_TEXT ? NodeFilter.SHOW_TEXT : 4);
      for (let node = walker?.nextNode?.(); node; node = walker?.nextNode?.()) {
        const element = node.parentElement;
        if (!element || element.closest?.(hiddenSelectors) || !isVisible(element)) continue;
        const evidence = confirmationEvidence(node.textContent);
        if (evidence) {
          const { requisitionId, confirmationId } = extractRequisitionAndConfirmationId(ats);
          return { status: 'SUBMITTED', evidence, atsDetected: hasAtsSelector || ats !== 'generic', atsProvider: ats, requisitionId, confirmationId };
        }
      }
    }

    // 7. Title check
    const title = (document.title || '').trim();
    const titleEvidence = confirmationEvidence(title, confirmationPatterns.slice(0, 2));
    if (titleEvidence) {
      const { requisitionId, confirmationId } = extractRequisitionAndConfirmationId(ats);
      return { status: 'SUBMITTED', evidence: titleEvidence, atsDetected: hasAtsSelector || ats !== 'generic', atsProvider: ats, requisitionId, confirmationId };
    }

    // 8. Terminal Route URL check
    const pathname = (window.location?.pathname || '').toLowerCase();
    const bodyText = document.body?.innerText || document.body?.textContent || '';
    if (standaloneNonJob.test(bodyText) && !appReceiptPattern.test(bodyText)) return null;
    if (/\b(?:newsletter|subscribe|subscription|survey|feedback|donation|cart|checkout|order)\b/i.test(pathname)) return null;
    if (confirmationUrlPattern.test(pathname)) {
      const { requisitionId, confirmationId } = extractRequisitionAndConfirmationId(ats);
      return { status: 'SUBMITTED', evidence: `URL confirmation path: ${pathname}`, atsDetected: hasAtsSelector || ats !== 'generic', atsProvider: ats, requisitionId, confirmationId };
    }

    return null;
  }

  async function report(data) {
    if (confirmedSent || pending) return false;
    pending = true;
    try {
      const ok = await chrome.runtime.sendMessage({
        type: 'application-confirmation',
        status: data.status || 'SUBMITTED',
        evidence: data.evidence,
        atsDetected: Boolean(data.atsDetected),
        atsProvider: data.atsProvider || 'generic',
        requisitionId: data.requisitionId || null,
        confirmationId: data.confirmationId || null,
        url: window.location?.href || ''
      });
      if (ok) {
        confirmedSent = true;
        try { observer?.disconnect(); } catch {}
        clearTimeout(timer);
        try { sessionStorage?.removeItem('nextkin_submission_attempted'); } catch {}
        return true;
      }
    } catch {}
    pending = false;
    return false;
  }

  async function check() {
    if (pending || attempts >= 5 || confirmedSent) return;
    const url = window.location?.href;
    if (!receipt || receipt.url !== url) {
      const detected = detectConfirmation();
      receipt = detected ? { ...detected, url } : undefined;
    }
    if (!receipt) return;

    attempts++;
    const ok = await report(receipt);
    if (ok) return;

    schedule(2000 * attempts);
  }

  function schedule(delay = 0) {
    if (pending || attempts >= 5 || timer || confirmedSent) return;
    timer = setTimeout(() => {
      timer = undefined;
      void check();
    }, delay);
  }

  // Handle page change: If submission was attempted but outcome is ambiguous or unconfirmed,
  // set PENDING_VERIFICATION (NEVER FAILED). Only explicit ATS error banners trigger FAILED.
  function handlePageChange() {
    if (confirmedSent) return;
    if (!submissionAttempted) return;

    // Check for explicit error banner
    const errorText = detectExplicitError();
    if (errorText) {
      void report({
        status: 'FAILED',
        evidence: `Error: ${errorText}`.slice(0, 150),
        atsDetected: true,
        atsProvider: detectAtsProvider()
      });
      return;
    }

    // Ambiguous outcome on page change: set PENDING_VERIFICATION
    void report({
      status: 'PENDING_VERIFICATION',
      evidence: 'Pending verification on page navigation',
      atsDetected: detectAtsProvider() !== 'generic',
      atsProvider: detectAtsProvider()
    });
  }

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('beforeunload', handlePageChange);
    window.addEventListener('pagehide', handlePageChange);
    window.addEventListener('popstate', handlePageChange);
  }

  let observer;
  try {
    if (typeof MutationObserver !== 'undefined' && document) {
      observer = new MutationObserver(() => schedule());
      observer.observe(document, {
        childList: true, subtree: true, characterData: true, attributes: true,
        attributeFilter: ['hidden', 'aria-hidden', 'class', 'open', 'style'],
      });
    }
  } catch {}
  schedule();
})();
