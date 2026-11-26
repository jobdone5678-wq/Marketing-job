// How a form control is named for a person: the label text the autofill matches questions by.
import { collapse, isChoicePlaceholder, isComboWidget, isLocationRejection, isOnScreen } from './comboWidget';
import { normalizeLabel } from './fieldKeys';
import { demographicKey } from '../../src/lib/profile/demographic-preferences';
import type { Fillable } from './form';

/** Best-effort human label for a control, in decreasing reliability. */
export function extractLabel(el: Fillable): string {
  if (el instanceof HTMLButtonElement && !el.matches('[role="combobox"], [aria-haspopup="listbox"], [aria-autocomplete]')) {
    return collapse(labelText(el)) || collapse(el.getAttribute('aria-label')) || collapse(el.id);
  }
  const labels = el instanceof HTMLInputElement || el instanceof HTMLSelectElement ||
    el instanceof HTMLTextAreaElement || el instanceof HTMLButtonElement ? el.labels : null;
  const fromLabels = Array.from(labels ?? [])
    .map(labelText)
    .filter(Boolean)
    .join(' ');
  const isChoice = el instanceof HTMLSelectElement || isComboWidget(el);
  const placeholderText = (text: string) => genericPrompt.test(text) ||
    (isChoice && (isChoicePlaceholder(text) || /^(?:start typing|search)[. …]*$/i.test(text)));
  if (fromLabels && !placeholderText(fromLabels)) return fromLabels;

  const placeholder = collapse(el.getAttribute('placeholder'));
  const ariaLabel = collapse(el.getAttribute('aria-label'));
  const ariaHeading = textFromIds(el.ownerDocument, el.getAttribute('aria-labelledby'));
  return (
    (placeholderText(ariaHeading) ? '' : ariaHeading) ||
    // LinkedIn names a radio after its QUESTION; the option's own words sit beside it.
    (el instanceof HTMLInputElement && choiceType(el) ? visibleTextBeside(el) : '') ||
    // A typeahead often repeats its placeholder as aria-label; the visible label is the question.
    (ariaLabel === placeholder || placeholderText(ariaLabel) ? '' : ariaLabel) ||
    visibleTextBeside(el, 'label') ||
    (!choiceType(el) && (isChoice || [fromLabels, ariaHeading, ariaLabel, placeholder].some(placeholderText))
      ? nearbyPrompt(el, isChoice) : '') ||
    placeholder ||
    ariaLabel ||
    (choiceType(el) ? collapse(labelText(el)) : '') ||
    collapse(el.getAttribute('name')) ||
    collapse(el.id)
  );
}

const genericPrompt = /^(?:type|enter|write) (?:your|an?) (?:response|answer)(?:\s+here)?[. …]*$/i;
const questionPrompt = /\?\s*\*?$|^(?:describe|explain|tell us|share|provide|list)\b/i;
const namedControl = 'input:not([type="hidden"]), select, textarea, [role="combobox"], [role="checkbox"], [role="radio"], [aria-haspopup="listbox"]';
const helperTags = 'p, span, div, small';
const headingTags = 'label, legend, h1, h2, h3, h4, h5, h6';
const liveOrErrorSelector = '[role="status"], [role="alert"], [aria-live]:not([aria-live="off"])';

/**
 * Best-effort helper/hint text for a question without merging it into `questionLabel`.
 * Reads `aria-describedby` first (ignoring error, location-rejection, and live-status nodes),
 * then falls back to immediate helper sibling/sub-label elements between the heading and control.
 */
export function extractHelperText(el: Fillable, questionLabel: string): string {
  const errIds = new Set((el.getAttribute('aria-errormessage') ?? '').split(/\s+/).filter(Boolean));
  const group = (choiceType(el) || el instanceof HTMLButtonElement)
    ? el.closest('fieldset, [role="group"], [role="radiogroup"]')
    : null;
  const rawIds = [
    ...(el.getAttribute('aria-describedby') ?? '').split(/\s+/),
    ...(group?.getAttribute('aria-describedby') ?? '').split(/\s+/),
  ].filter(Boolean);

  const fromDescribedBy: string[] = [];
  const seenIds = new Set<string>();
  for (const id of rawIds) {
    if (seenIds.has(id) || errIds.has(id)) continue;
    seenIds.add(id);
    const node = el.ownerDocument.getElementById(id);
    if (!node || isExcludedHelperNode(node, el, true)) continue;
    const text = cleanHelperText(node, el, questionLabel);
    if (text && !fromDescribedBy.includes(text)) fromDescribedBy.push(text);
  }
  if (fromDescribedBy.length) return fromDescribedBy.join(' ');

  const normQuestion = normalizeLabel(questionLabel);
  if (!normQuestion) return '';

  for (let node: Element = el, depth = 0; depth < 4 && node.parentElement; depth++, node = node.parentElement) {
    const parent = node.parentElement;
    const candidates: string[] = [];
    let foundHeading = false;

    for (let sibling = node.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
      if (sibling.matches(namedControl) || sibling.querySelector(namedControl) ||
          sibling.matches('button') || sibling.querySelector('button')) break;
      if (!isOnScreen(sibling)) continue;
      const raw = collapse(labelText(sibling));
      if (raw && normalizeLabel(raw) === normQuestion) {
        foundHeading = true;
        break;
      }
      if (sibling.matches(headingTags)) break;
      if (sibling.matches(helperTags) && !isExcludedHelperNode(sibling, el, false)) {
        const text = cleanHelperText(sibling, el, questionLabel);
        if (text && !candidates.includes(text)) candidates.unshift(text);
      }
    }

    if (foundHeading) return candidates.join(' ');
    if (parent.matches('form, body, [role="dialog"]')) break;
  }
  return '';
}

function isExcludedHelperNode(node: Element, el: Fillable, fromAriaDescribedBy: boolean): boolean {
  if (!isOnScreen(node)) return true;
  if (node.contains(el) || el.contains(node)) return true;
  if (node.matches(liveOrErrorSelector) || node.closest(liveOrErrorSelector)) return true;
  if (node.matches('[class*="error" i], [class*="invalid" i], [id*="error" i], [data-testid*="error" i], [data-testid="text-input-helper-text"]')) {
    return true;
  }
  if (node.matches(namedControl) || node.querySelector(namedControl)) return true;
  if (!fromAriaDescribedBy && (node.matches(headingTags) || node.matches('button') || node.querySelector('button'))) {
    return true;
  }
  return false;
}

function cleanHelperText(node: Element, el: Fillable, questionLabel: string): string {
  const text = collapse(labelText(node));
  if (!text || text.length > 1000) return '';
  if (isLocationRejection(text) || /^loading[.…\s]*$/i.test(text)) return '';
  if (el.getAttribute('aria-invalid') === 'true' && /^(?:invalid|required|error|this field is required)\b/i.test(text)) {
    return '';
  }
  const normQuestion = normalizeLabel(questionLabel);
  if (normQuestion && normalizeLabel(text) === normQuestion) return '';
  return text;
}

/** Reads a heading immediately before a control or an option list in its own section. */
export function precedingPrompt(element: Element, accepts = (text: string) => questionPrompt.test(text)): string {
  for (let sibling = element.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
    if (sibling.matches(namedControl) || sibling.querySelector(namedControl)) break;
    if (!isOnScreen(sibling)) continue;
    const text = collapse(labelText(sibling));
    if (text && text.length <= 2000 && accepts(text)) return text;
  }
  return '';
}

function nearbyPrompt(el: Fillable, isChoice = false): string {
  for (let node: Element = el, depth = 0; depth < 3 && node.parentElement; depth++, node = node.parentElement) {
    const text = precedingPrompt(node, (text) => questionPrompt.test(text) ||
      (isChoice && text.length <= 100 && Boolean(demographicKey(text))));
    if (text) return text;
    if (node.parentElement.matches('form, body, [role="dialog"]') ||
        Array.from(node.parentElement.querySelectorAll(namedControl)).some((control) => control !== el && !control.contains(el))) break;
  }
  return '';
}

export function choiceType(el: Fillable): 'radio' | 'checkbox' | undefined {
  const type = el instanceof HTMLInputElement ? el.type : el.getAttribute('role');
  return type === 'radio' || type === 'checkbox' ? type : undefined;
}

/**
 * The text a person reads next to a control the page did not tie to a `<label>`: that of the
 * nearest ancestor (three levels at most) holding no other control. `only` narrows it to a
 * descendant matching that selector; without it the ancestor's whole text counts, capped so a
 * container full of prose is not mistaken for an option.
 */
function visibleTextBeside(el: Fillable, only?: string): string {
  let box = el.parentElement;
  for (let depth = 0; box && depth < 3; depth++, box = box.parentElement) {
    if (box.querySelectorAll(namedControl).length > 1) return '';
    const candidate = only ? box.querySelector(only) : box;
    const text = candidate ? collapse(labelText(candidate)) : '';
    if (text && !genericPrompt.test(text) && (only || text.length <= 80)) return text;
  }
  return '';
}

function labelText(label: Element): string {
  const nestedContent = 'select, option, datalist, textarea, button, [role="listbox"], [role="option"], [aria-live], [role="status"], [role="alert"], [class*="-noOptionsMessage"], [class*="-loadingMessage"]';
  const text = label.textContent?.trim() ?? '';
  if (!label.querySelector(nestedContent) && !/\bno (?:matching )?locations? found\b/i.test(text)) return text;
  const clone = label.cloneNode(true) as Element;
  clone.querySelectorAll(nestedContent).forEach((node) => node.remove());
  if (/\bno (?:matching )?locations? found\b/i.test(text)) {
    clone.querySelectorAll('div, span, p').forEach((node) => {
      if (isLocationRejection(node.textContent) || /^loading[.…\s]*$/i.test(collapse(node.textContent))) node.remove();
    });
  }
  return clone.textContent?.trim() ?? '';
}

/** The joined text of the elements an `aria-labelledby`-style id list names. */
export function textFromIds(doc: Document, ids: string | null): string {
  if (!ids) return '';
  return ids
    .split(/\s+/)
    .map((id) => doc.getElementById(id))
    .map((element) => element ? collapse(labelText(element)) : '')
    .filter(Boolean)
    .join(' ');
}
