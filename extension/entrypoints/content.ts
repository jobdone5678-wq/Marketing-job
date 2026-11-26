import { startErrorTelemetry } from '../lib/telemetry';
import { extractSnapshot, hasJobPostingMarkup } from '../lib/scraper';
import { attachSavedResume, clearUserEdited, extractForm, extractUploads, fillByLabel, markUserEdited } from '../lib/form';
import { revealField } from '../lib/revealField';
import { easyApplyDialog, easyApplyOnResumeStep, easyApplySent, linkedInPostingClosed } from '../lib/easyApply';
import { isFreehireOrigin } from '../lib/freehire';
import { runStep } from '../lib/combobox';
import { debounce } from '../lib/debounce';
import { applicationReceiptEvidence, collectApplicationAnswers, observeApplicationPage } from '../lib/applicationCapture';
import type { RuntimeMessage } from '../lib/protocol';

/** How long the page waits for typing to stop before telling the panel its form
 *  changed. One re-read when the user pauses, not one per keystroke. */
const FORM_CHANGE_QUIET_MS = 400;

// Answers the user types themselves must move the panel's counter, or it
// reports a form as less finished than it is. One delegated listener rather
// than one per control: an ATS form re-renders constantly, and per-control
// listeners would have to be re-attached on every render (and leak the ones
// they replaced). The panel is told only that something changed — it re-reads
// the form, which is the one account that cannot drift.
const notifyPanel = () => {
  void browser.runtime.sendMessage({ kind: 'FORM_CHANGED' } satisfies RuntimeMessage).catch(() => {
    // No panel listening (it is closed, or this frame outlived it). Nothing
    // to do: the next open re-reads the form anyway.
  });
};

/** Whether a node is, or contains, something the panel would ask about. Keeps the
 *  observer below from waking the panel for every unrelated re-render — an ATS
 *  page swaps nodes constantly. */
function holdsControl(node: Node): boolean {
  if (!(node instanceof Element)) return false;
  return node.matches('input, select, textarea') || node.querySelector('input, select, textarea') !== null;
}

/**
 * Injected into every page, and into every frame of it — apply forms are
 * routinely served from an ATS iframe, so a top-document-only script would see
 * an empty page. The extension's eyes + hands: it reads the page (snapshot,
 * form) and writes fills back. Owns no state; the background relay addresses
 * each frame individually and tags what comes back.
 */
export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  main() {
    startErrorTelemetry('content');
    const onLinkedIn = /(^|\.)linkedin\.com$/.test(location.hostname);
    const documentKey = crypto.getRandomValues(new Uint32Array(4)).join('-');
    browser.runtime.onMessage.addListener((message: RuntimeMessage) => {
      switch (message.kind) {
        case 'GET_PAGE_SNAPSHOT':
          return Promise.resolve<RuntimeMessage>({
            kind: 'PAGE_SNAPSHOT',
            snapshot: extractSnapshot(document),
          });
        case 'GET_JOB_POSTING_MARKUP':
          return Promise.resolve<RuntimeMessage>({
            kind: 'JOB_POSTING_MARKUP',
            present: hasJobPostingMarkup(document),
          });
        case 'GET_FRAMED_FORM':
          // freehire's own pages (profile, tailor) are not an application to read.
          if (isFreehireOrigin(location.origin)) {
            return Promise.resolve<RuntimeMessage>({ kind: 'FORM', fields: [], uploads: [] });
          }
          // The frame tag is stamped by the background relay, which is the only
          // side that knows this frame's id. The document key binds résumé
          // attachment to the same document that exposed the upload.
          const fields = extractForm(document);
          return Promise.resolve<RuntimeMessage>({
            kind: 'FORM',
            snapshotId: fields[0]?.snapshotId,
            fields,
            uploads: extractUploads(document).map((upload) =>
              upload.resume ? { ...upload, documentKey } : upload,
            ),
            easyApply: easyApplyDialog(document) !== null,
            resumeStep: easyApplyOnResumeStep(document),
            sent: easyApplySent(document),
            applicationPage: observeApplicationPage(document),
            // Rides the form read: it already runs on every page change, and the panel
            // must know before it offers to tailor a CV for this job.
            closed: onLinkedIn && linkedInPostingClosed(document),
          });
        case 'FILL_BY_LABEL':
          // A revealed fill scrolls to each question and outlines it as the value
          // lands — the panel's walk, watched. The reveal runs first so the user
          // is looking at the control before it changes.
          if (message.reveal) {
            for (const fill of message.fills) {
              revealField(document, { label: fill.label, form: fill.form });
            }
          }
          return Promise.resolve<RuntimeMessage>({
            kind: 'FILL_OUTCOMES',
            outcomes: fillByLabel(document, message.fills),
          });
        case 'REVEAL_FIELD':
          return Promise.resolve<RuntimeMessage>({
            kind: 'REVEAL_RESULT',
            found: revealField(document, message.request),
          });
        case 'COMBOBOX_STEP':
          // The only asynchronous handler here: a widget re-renders when its
          // framework decides to, so the step awaits the result.
          return runStep(document, message.step).then((reply): RuntimeMessage => ({ kind: 'COMBOBOX_REPLY', reply }));
        case 'ATTACH_SAVED_RESUME':
          return Promise.resolve<RuntimeMessage>({
            kind: 'ATTACH_SAVED_RESUME_RESULT',
            status: message.documentKey === documentKey && !isFreehireOrigin(location.origin) &&
              (window !== window.top || location.href === message.target.url)
              ? attachSavedResume(document, message.form, message.resume)
              : 'unavailable',
          });
        default:
          return undefined;
      }
    });

    const announce = debounce(notifyPanel, FORM_CHANGE_QUIET_MS);
    const onUserControlEvent = (event: Event) => {
      if (event.isTrusted && event.target instanceof Element) {
        const el = event.target;
        if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
          markUserEdited(el);
        } else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
          if (el.value.trim()) markUserEdited(el);
          else clearUserEdited(el);
        } else {
          markUserEdited(el);
        }
      }
      announce();
    };
    document.addEventListener('input', onUserControlEvent, true);
    document.addEventListener('change', onUserControlEvent, true);
    document.addEventListener('submit', (event) => {
      if (!(event.target instanceof HTMLFormElement) || isFreehireOrigin(location.origin)) return;
      const form = Array.from(document.querySelectorAll('form')).indexOf(event.target);
      if (form < 0) return;
      const answers = collectApplicationAnswers(extractForm(document).filter((field) => field.form === form), true);
      void browser.runtime.sendMessage({
        kind: 'APPLICATION_SUBMITTING', form, answers, page: observeApplicationPage(document),
      } satisfies RuntimeMessage).catch(() => {});
    }, true);

    // A form the page renders later — the next step of an ATS application, an
    // "Apply" button expanding one in place — arrives with no page load and no
    // typing, so neither the panel's tab listeners nor the two above would ever
    // notice it.
    //
    // Only a change in HOW MANY controls the page holds is announced. A React ATS
    // form re-renders its inputs constantly, and announcing every re-render kept
    // the panel re-reading the form without pause — which is what starved its
    // reads and left the checklist permanently absent. Typing is already covered
    // by the two listeners above, where the count does not change.
    let controlCount = document.querySelectorAll('input, select, textarea').length;
    const announceIfCountChanged = debounce(() => {
      const count = document.querySelectorAll('input, select, textarea').length;
      if (count === controlCount) return;
      controlCount = count;
      notifyPanel();
    }, FORM_CHANGE_QUIET_MS);
    // LinkedIn closing the posting (its apply button disabled, a notice added) adds no control,
    // yet the panel must stop offering to tailor; so that state is announced on its own.
    let postingClosed = onLinkedIn && linkedInPostingClosed(document);
    let receiptEvidence = applicationReceiptEvidence(document);
    const announceIfReceiptChanged = debounce(() => {
      const evidence = applicationReceiptEvidence(document);
      if (evidence === receiptEvidence) return;
      receiptEvidence = evidence;
      notifyPanel();
    }, FORM_CHANGE_QUIET_MS);
    const announceIfClosedChanged = debounce(() => {
      const closed = linkedInPostingClosed(document);
      if (closed === postingClosed) return;
      postingClosed = closed;
      notifyPanel();
    }, FORM_CHANGE_QUIET_MS);
    new MutationObserver((records) => {
      if (onLinkedIn) announceIfClosedChanged();
      announceIfReceiptChanged();
      for (const record of records) {
        if ([...record.addedNodes, ...record.removedNodes].some(holdsControl)) {
          announceIfCountChanged();
          return;
        }
      }
    }).observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['disabled', 'aria-disabled', 'open', 'hidden', 'aria-hidden'],
    });
    // A full navigation can finish before the new frame's message listener is ready.
    notifyPanel();
  },
});
