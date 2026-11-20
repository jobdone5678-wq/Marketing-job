import { browser } from 'wxt/browser';
import { debounce } from './debounce';
import type { RuntimeMessage } from './protocol';
import { extractJobPosting } from './scraper';

const submitLabel = /^(?:submit(?: my| your)? application|send application|submit and apply|complete application)$/i;
const confirmation =
  /^(?:thank you for (?:applying|your application|submitting your application)|(?:your )?(?:job )?application (?:has been |was |is )?(?:(?:successfully )?(?:submitted|received|sent|confirmed)|successful)|(?:(?:you (?:have )?|you've )?successfully submitted|(?:you (?:have )?|you've )submitted) (?:your |the )?(?:job )?application|submission (?:received|confirmed|successful)|(?:we(?: have|'ve)?) (?:successfully )?received your application|(?:you(?: have|'ve) )?successfully applied|(?:you (?:have )?|you've )?applied successfully)(?=$|[.!,:]|\s+(?:to|for|successfully)\b)/i;

export function confirmsSubmission(text: string): boolean {
  const heading = text.replace(/\s+/g, ' ').trim().replace(/^thank you[!.]\s+/i, '');
  return confirmation.test(heading) &&
    !/\b(?:if|once|after|when|before|until|unless)\b.{0,50}\b(?:application|submit(?:ted)?|receiv(?:e|ed))\b|\b(?:not (?:been )?(?:submitted|received|sent)|unable to submit|submission failed|not successful)\b/i.test(heading);
}

export function watchSubmission(doc: Document): void {
  const send = (message: RuntimeMessage) => {
    void browser.runtime.sendMessage(message).catch(() => {});
  };
  const sendReceipt = async (evidence: string) => {
    for (const delay of [0, 400, 1000]) {
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      const handled = await browser.runtime.sendMessage({
        kind: 'APPLICATION_CONFIRMED', evidence,
      } satisfies RuntimeMessage).catch(() => false);
      if (handled === true) return;
    }
  };
  let announced = false;
  const check = debounce(() => {
    if (announced) return;
    const messages = doc.querySelectorAll<HTMLElement>(
      'h1, h2, h3, p, [role="status"], [role="alert"], [aria-live]',
    );
    for (const message of messages) {
      const text = message.innerText?.trim() ?? '';
      const evidence = text.replace(/\s+/g, ' ').replace(/^thank you[!.]\s+/i, '').slice(0, 300);
      if (message.getClientRects().length && confirmsSubmission(evidence)) {
        announced = true;
        void sendReceipt(evidence);
        break;
      }
    }
  }, 200);
  doc.addEventListener(
    'submit',
    (event) => {
      if (!event.isTrusted || !(event.target instanceof HTMLFormElement)) return;
      const button = event instanceof SubmitEvent ? event.submitter : null;
      const label = button instanceof HTMLInputElement ? button.value : button?.textContent?.trim();
      const isApplicationForm = Boolean(event.target.querySelector('input[type="file"]')) ||
        Boolean(label && submitLabel.test(label));
      if (isApplicationForm) send({ kind: 'APPLICATION_SUBMIT', job: extractJobPosting(doc) ?? undefined });
      else send({ kind: 'APPLICATION_SUBMIT' });
    },
    true,
  );
  doc.addEventListener(
    'click',
    (event) => {
      if (!event.isTrusted || !(event.target instanceof Element)) return;
      const button = event.target.closest<HTMLElement>('button, input[type="submit"], [role="button"]');
      const label = button instanceof HTMLInputElement ? button.value : button?.textContent?.trim();
      if (label && submitLabel.test(label)) {
        send({ kind: 'APPLICATION_SUBMIT', job: extractJobPosting(doc) ?? undefined });
      }
    },
    true,
  );
  new MutationObserver(check).observe(doc.documentElement, { childList: true, subtree: true, characterData: true });
  check();
}
