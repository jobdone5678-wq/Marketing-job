// How a form control is named for a person: the label text the autofill matches questions by.
import { collapse, isLocationRejection, isOnScreen } from './comboWidget';
import type { Fillable } from './form';

/** Best-effort human label for a control, in decreasing reliability. */
export function extractLabel(el: Fillable): string {
  const labels = el instanceof HTMLInputElement || el instanceof HTMLSelectElement ||
    el instanceof HTMLTextAreaElement || el instanceof HTMLButtonElement ? el.labels : null;
  const fromLabels = Array.from(labels ?? [])
    .map(labelText)
    .filter(Boolean)
    .join(' ');
  if (fromLabels && !genericPrompt.test(fromLabels)) return fromLabels;

  const placeholder = collapse(el.getAttribute('placeholder'));
  const ariaLabel = collapse(el.getAttribute('aria-label'));
  const ariaHeading = textFromIds(el.ownerDocument, el.getAttribute('aria-labelledby'));
  return (
    (genericPrompt.test(ariaHeading) ? '' : ariaHeading) ||
    // LinkedIn names a radio after its QUESTION; the option's own words sit beside it.
    (el instanceof HTMLInputElement && choiceType(el) ? visibleTextBeside(el) : '') ||
    // A typeahead often repeats its placeholder as aria-label; the visible label is the question.
    (ariaLabel === placeholder || genericPrompt.test(ariaLabel) ? '' : ariaLabel) ||
    visibleTextBeside(el, 'label') ||
    (!choiceType(el) && [fromLabels, ariaHeading, ariaLabel, placeholder].some((text) => genericPrompt.test(text))
      ? nearbyPrompt(el) : '') ||
    placeholder ||
    ariaLabel ||
    (choiceType(el) ? collapse(labelText(el)) : '') ||
    collapse(el.getAttribute('name')) ||
    collapse(el.id)
  );
}

const genericPrompt = /^(?:type|enter|write) (?:your|an?) (?:response|answer)(?:\s+here)?[. …]*$/i;
const questionPrompt = /\?\s*\*?$|^(?:describe|explain|tell us|share|provide|list)\b/i;
const namedControl = 'input:not([type="hidden"]), select, textarea, [role="combobox"], [role="checkbox"], [role="radio"]';

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

function nearbyPrompt(el: Fillable): string {
  for (let node: Element = el, depth = 0; depth < 3 && node.parentElement; depth++, node = node.parentElement) {
    const text = precedingPrompt(node);
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
    if (box.querySelectorAll('input, select, textarea').length > 1) return '';
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
