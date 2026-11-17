(function () {
  if (globalThis.nextkinConfirmationObserver) return;
  globalThis.nextkinConfirmationObserver = true;

  const confirmationPatterns = [
    /^(?:thank you for (?:applying|your application)|(?:your )?application (?:has been |was |is )?(?:successfully )?(?:submitted|received|sent)|(?:we|we've) (?:have )?received your application|you(?: have|'ve) successfully applied)(?=$|[.!,:]|\s+(?:to|for|successfully)\b)/i,
    /^(?:application submitted|application received|submission received|application confirmed|submission confirmed|submission successful)(?=$|[.!,:]|\s+)/i,
    /\b(?:thank you for (?:applying|your application)|(?:we|we've) received your application)\b/i
  ];

  const confirmationUrlPattern = /\/(?:confirmation|thank[-_]?you|thankyou|thanks|applied|application[-_]submitted|application[-_]success|submission[-_]success|success|submitted)\/?$/i;

  const selectors = 'h1, h2, h3, [role="status"], [role="alert"], [data-testid*="success" i], [data-testid*="confirmation" i], main p';
  let timer;
  let pending = false;
  let attempts = 0;

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

  function detectConfirmation() {
    if (hasActiveSubmitButton()) return null;

    const candidates = [...document.querySelectorAll(selectors)];
    for (const element of candidates) {
      if (!isVisible(element) || element.closest('footer, [hidden], [aria-hidden="true"]')) continue;
      const text = element.innerText?.replace(/\s+/g, ' ').trim();
      if (!text || text.length > 320) continue;

      // Negative check
      if (/\b(?:if|once|after|when|before|until|unless)\b.{0,50}\b(?:application|submit(?:ted)?|receiv(?:e|ed))\b|\b(?:not (?:been )?(?:submitted|received|sent)|unable to submit|submission failed|not successful)\b/i.test(text)) {
        continue;
      }

      for (const pattern of confirmationPatterns) {
        const match = pattern.exec(text);
        if (match) {
          return match[0] || text.slice(0, 100);
        }
      }
    }

    const pathname = window.location.pathname.toLowerCase();
    return confirmationUrlPattern.test(pathname) ? `URL confirmation path: ${pathname}` : null;
  }

  async function check() {
    if (pending || attempts >= 5) return;
    const evidence = detectConfirmation();
    if (!evidence) return;

    pending = true;
    attempts++;
    try {
      if (await chrome.runtime.sendMessage({ type: 'application-confirmation', evidence })) {
        observer.disconnect();
        clearTimeout(timer);
        return;
      }
    } catch {}
    pending = false;
    schedule(2000 * attempts);
  }

  function schedule(delay = 200) {
    if (pending || attempts >= 5 || timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      void check();
    }, delay);
  }

  const observer = new MutationObserver(() => schedule());
  observer.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden', 'class'] });
  schedule();
})();
