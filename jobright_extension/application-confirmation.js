(function () {
  if (globalThis.nextkinConfirmationObserver) return;
  globalThis.nextkinConfirmationObserver = true;

  const confirmationPatterns = [
    /^(?:thank you for (?:applying|your application)|(?:your )?application (?:has been |was |is )?(?:(?:successfully )?(?:submitted|received|sent|confirmed)|successful)|successfully submitted (?:your |the )?application|submission (?:received|confirmed|successful)|(?:we|we've) (?:have )?received your application|(?:you(?: have|'ve) )?successfully applied|(?:you (?:have )?|you've )?applied successfully)(?=$|[.!,:]|\s+(?:to|for|successfully)\b)/i,
    /^(?:application submitted|application received|submission received|application confirmed|submission confirmed|submission successful|successfully submitted (?:your |the )?application|you (?:have )?applied successfully|you've applied successfully)(?=$|[.!,:]|\s+)/i,
    /\b(?:thank you for (?:applying|your application)|(?:we|we've) received your application)\b/i
  ];

  const confirmationUrlPattern = /\/(?:confirmation|thank[-_]?you|thankyou|thanks|applied|application[-_]submitted|application[-_]success|submission[-_]success|success|submitted)\/?$/i;

  const statusSelectors = '[role="status"], [role="alert"], [role="dialog"], dialog[open], [data-testid*="success" i], [data-testid*="confirmation" i], [class*="application-confirmation" i], [class*="toast" i]';
  const hiddenSelectors = 'footer, script, style, template, [hidden], [inert], [aria-hidden="true"]';
  let timer;
  let pending = false;
  let attempts = 0;
  let receipt;

  function hasActiveSubmitButton() {
    return [...document.querySelectorAll('form button[type="submit"], form input[type="submit"]')].some(button =>
      !button.disabled && button.getClientRects().length && /\b(?:submit|apply|send)\b/i.test(button.innerText || button.value || '')
    );
  }

  function isVisible(element) {
    if (!element.getClientRects().length) return false;
    const style = getComputedStyle(element);
    return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
  }

  function confirmationEvidence(value, patterns = confirmationPatterns) {
    const text = value?.replace(/\s+/g, ' ').trim().replace(/^success[!.:]\s*/i, '');
    if (!text || text.length > 320) return null;
    if (/\b(?:if|once|after|when|before|until|unless)\b.{0,50}\b(?:application|submit(?:ted)?|receiv(?:e|ed))\b|\b(?:not (?:been )?(?:submitted|received|sent)|unable to submit|submission failed|not successful)\b/i.test(text)) return null;
    for (const pattern of patterns) {
      const match = pattern.exec(text);
      if (match) return match[0];
    }
    return null;
  }

  function detectConfirmation() {
    for (const element of document.querySelectorAll(statusSelectors)) {
      if (!isVisible(element) || element.closest(hiddenSelectors)) continue;
      for (const child of [element, ...element.querySelectorAll?.('h1, h2, h3, p') || []]) {
        if (!isVisible(child) || child.closest(hiddenSelectors)) continue;
        const evidence = confirmationEvidence(child.innerText, confirmationPatterns.slice(0, 2));
        if (evidence) return evidence;
      }
    }
    if (hasActiveSubmitButton()) return null;

    for (const element of document.querySelectorAll('h1, h2, h3, p')) {
      if (!isVisible(element) || element.closest(hiddenSelectors)) continue;
      const evidence = confirmationEvidence(element.innerText);
      if (evidence) return evidence;
    }

    const root = document.body || document.documentElement;
    if (!root) return null;
    const text = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = text.nextNode(); node; node = text.nextNode()) {
      const evidence = confirmationEvidence(node.textContent);
      const element = node.parentElement;
      if (evidence && element && !element.closest(hiddenSelectors) && isVisible(element)) return evidence;
    }

    const title = document.title.trim();
    const titleEvidence = confirmationEvidence(title, confirmationPatterns.slice(0, 2));
    if (titleEvidence) return titleEvidence;

    const pathname = window.location.pathname.toLowerCase();
    return confirmationUrlPattern.test(pathname) ? `URL confirmation path: ${pathname}` : null;
  }

  async function check() {
    if (pending || attempts >= 5) return;
    const url = window.location.href;
    if (!receipt || receipt.url !== url) {
      const evidence = detectConfirmation();
      receipt = evidence ? { url, evidence } : undefined;
    }
    if (!receipt) return;

    pending = true;
    attempts++;
    try {
      if (await chrome.runtime.sendMessage({ type: 'application-confirmation', evidence: receipt.evidence })) {
        observer.disconnect();
        clearTimeout(timer);
        return;
      }
    } catch {}
    pending = false;
    schedule(2000 * attempts);
  }

  function schedule(delay = 0) {
    if (pending || attempts >= 5 || timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      void check();
    }, delay);
  }

  const observer = new MutationObserver(() => schedule());
  observer.observe(document, {
    childList: true, subtree: true, characterData: true, attributes: true,
    attributeFilter: ['hidden', 'aria-hidden', 'class', 'open', 'style'],
  });
  schedule();
})();
