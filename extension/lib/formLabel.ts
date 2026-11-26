// How a form control is named for a person: the label text the autofill matches questions by.
import { collapse } from './comboWidget';
import type { Fillable } from './form';

/** Best-effort human label for a control, in decreasing reliability. */
export function extractLabel(el: Fillable): string {
  const labels = el instanceof HTMLInputElement || el instanceof HTMLSelectElement ||
    el instanceof HTMLTextAreaElement || el instanceof HTMLButtonElement ? el.labels : null;
  const fromLabels = Array.from(labels ?? [])
    .map(labelText)
    .filter(Boolean)
    .join(' ');
  if (fromLabels) return fromLabels;

  const placeholder = collapse(el.getAttribute('placeholder'));
  const ariaLabel = collapse(el.getAttribute('aria-label'));
  return (
    textFromIds(el.ownerDocument, el.getAttribute('aria-labelledby')) ||
    // LinkedIn names a radio after its QUESTION; the option's own words sit beside it.
    (el instanceof HTMLInputElement && choiceType(el) ? visibleTextBeside(el) : '') ||
    // A typeahead often repeats its placeholder as aria-label; the visible label is the question.
    (ariaLabel === placeholder ? '' : ariaLabel) ||
    visibleTextBeside(el, 'label') ||
    placeholder ||
    ariaLabel ||
    (choiceType(el) ? collapse(labelText(el)) : '') ||
    collapse(el.getAttribute('name')) ||
    collapse(el.id)
  );
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
    if (text && (only || text.length <= 80)) return text;
  }
  return '';
}

function labelText(label: Element): string {
  const nestedContent = 'select, option, datalist, textarea, button, [role="listbox"], [role="option"], [aria-live], [role="status"], [role="alert"], [class*="-noOptionsMessage"], [class*="-loadingMessage"]';
  if (!label.querySelector(nestedContent)) return label.textContent?.trim() ?? '';
  const clone = label.cloneNode(true) as Element;
  clone.querySelectorAll(nestedContent).forEach((node) => node.remove());
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
