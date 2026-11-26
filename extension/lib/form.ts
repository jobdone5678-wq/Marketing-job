/**
 * The extension's "eyes + hands" for a page's form: a serialisable observation
 * (extractForm) the agent can reason over, and an executor (fillByLabel) that
 * writes values back, dispatching native input/change events so React/Angular
 * ATS forms register the change. Both work in *questions* (collectQuestions),
 * not raw controls, so a question rendered as 29 checkboxes stays one field; a
 * question is addressed by its label, which survives both a re-render between
 * the observation and the fill and the fan-out across a tab's frames, neither of
 * which a position in the list does.
 */

import { collapse, COMBO_TRIGGER, comboOptions, displayedValues, isComboWidget, isChoicePlaceholder, isOnScreen } from './comboWidget';
import type { FieldTag, FormField, LabelFill, FillOutcome, FillStatus, OptionsState, ResumeAttachmentStatus, SavedResumeFile, Upload, WidgetType } from './protocol';
import type { AutofillProfile } from './nextkinhr';
import { easyApplyDialog, easyApplyFieldError, isStoredResumeChoice } from './easyApply';
import { choiceType, extractHelperText, extractLabel, extractPlaceholder, extractSection, precedingPrompt, textFromIds } from './formLabel';
import { demographicKey, isCommunitySelfIdQuestion } from '../../src/lib/profile/demographic-preferences';
import { asksVisaSponsorship, binaryChoice, formatAuthorizedCountries, matchChoice, matchFieldKey, normalizeLabel, workAuthorizationCountry } from './fieldKeys';

const userEditedControls = new WeakSet<Element>();
let snapshotSeq = 0;

/** Marks a DOM control as edited by the user so autofill will not overwrite it. */
export function markUserEdited(el: Element): void {
  userEditedControls.add(el);
}

/** Clears the user-edited flag on a DOM control (e.g. when emptied by the user). */
export function clearUserEdited(el: Element): void {
  userEditedControls.delete(el);
}

/** Returns true when a DOM control was marked as user-edited. */
export function isUserEdited(el: Element): boolean {
  return userEditedControls.has(el);
}

export type Fillable = HTMLElement;
const CHOICES = 'input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"]';

// Input types that are not free-fill targets.
const SKIP_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image', 'file']);

function isSafeChoiceButton(btn: HTMLButtonElement): boolean {
  if (/^(submit|reset)$/i.test(btn.getAttribute('type') ?? '')) return false;
  if (btn.form && btn.type !== 'button') return false;
  return true;
}

function buttonOptionLabel(btn: HTMLButtonElement): string {
  return collapse(btn.textContent) || collapse(btn.getAttribute('aria-label'));
}

function isSafeSegmentedButton(btn: HTMLButtonElement): boolean {
  if (btn.matches(':disabled') || btn.closest('[aria-disabled="true"]')) return false;
  if (isHidden(btn)) return false;
  if (isComboWidget(btn) || choiceType(btn)) return false;
  if (!isSafeChoiceButton(btn)) return false;
  const norm = normalizeLabel(buttonOptionLabel(btn));
  return norm === 'yes' || norm === 'no';
}

function isBooleanButtonsQuestion(controls: Fillable[]): boolean {
  return controls.length === 2 &&
    controls.every((el) => el instanceof HTMLButtonElement && !isComboWidget(el) && !choiceType(el));
}

function isBooleanButtonSelected(btn: HTMLButtonElement): boolean {
  if (btn.hasAttribute('aria-pressed') || btn.hasAttribute('aria-checked')) {
    return btn.getAttribute('aria-pressed') === 'true' || btn.getAttribute('aria-checked') === 'true';
  }
  for (const attr of ['data-selected', 'data-active', 'data-checked']) {
    const val = btn.getAttribute(attr);
    if (val === 'true') return true;
    if (val === 'false') return false;
  }
  return /(?:^|[^a-z])(?:active|selected|checked)(?:[^a-z]|$)/i.test(btn.className);
}

/**
 * The ordered list of fillable controls on the page. An open Easy Apply dialog is
 * the whole application, so only its controls count: LinkedIn's search box and
 * message composer sit on the same page.
 */
function collectFillable(doc: Document): Fillable[] {
  const easyApply = easyApplyDialog(doc);
  const all = Array.from((easyApply ?? doc).querySelectorAll<Fillable>(`input, select, textarea, button, ${COMBO_TRIGGER}, ${CHOICES}`));
  return all.filter((el) => {
    if (el.matches(':disabled') || el.closest('[aria-disabled="true"]')) return false;
    if (el instanceof HTMLButtonElement && /^(submit|reset)$/i.test(el.getAttribute('type') ?? '')) return false;
    if (el.matches(COMBO_TRIGGER) && el.querySelector('input:not([type="hidden"]), select, textarea')) return false;
    if (!(el instanceof HTMLInputElement) && choiceType(el) && el.querySelector(CHOICES)) return false;
    if (el instanceof HTMLButtonElement && choiceType(el) && !isSafeChoiceButton(el)) return false;
    if (easyApply && isStoredResumeChoice(el)) return false;
    if (el instanceof HTMLInputElement && SKIP_TYPES.has(el.type)) return false;
    if (isHidden(el)) return false;
    if (el instanceof HTMLButtonElement && !el.matches(COMBO_TRIGGER) && !choiceType(el)) {
      return booleanButtonGroup(el) !== null;
    }
    return true;
  });
}

/**
 * One question the page asks. Usually a single control, but a question can be
 * rendered as several — "which countries do you anticipate working in" is 29
 * checkboxes under one `legend`. Treating those as 29 fields both swamps the
 * report and hides the actual question from the agent, so the question, not the
 * control, is the unit the rest of this module works in.
 */
export interface Question {
  /** The question's own text: a control's label, or the group's legend. */
  label: string;
  /**
   * One control, or the group's controls in document order. Never empty —
   * every construction site starts it from a single control — encoded as a
   * non-empty tuple so `controls[0]` and single-element destructuring stay
   * typed as `Fillable`, not `Fillable | undefined`.
   */
  controls: [Fillable, ...Fillable[]];
  helperText?: string;
  widgetType?: WidgetType;
}

/** The ordered list of questions — the index space for observe + act. */
export function collectQuestions(doc: Document): Question[] {
  const questions: Question[] = [];
  const groups: Question[] = [];
  const byContainer = new Map<Element, Map<string, Question>>();

  for (const el of collectFillable(doc)) {
    const group = groupOf(el);
    if (!group) {
      questions.push({ label: extractLabel(el), controls: [el] });
      continue;
    }
    let inContainer = byContainer.get(group.container);
    if (!inContainer) {
      inContainer = new Map();
      byContainer.set(group.container, inContainer);
    }
    const open = inContainer.get(group.key);
    if (open) {
      open.controls.push(el);
      continue;
    }
    const question: Question = { label: group.question, controls: [el] };
    inContainer.set(group.key, question);
    questions.push(question);
    groups.push(question);
  }

  // A group of one is not a group: a lone "I agree to the terms" checkbox under
  // a `Consent` legend is already its own question, and carrying the legend
  // instead of its label would lose what the user is agreeing to.
  for (const group of groups) {
    if (group.controls.length === 1) group.label = extractLabel(group.controls[0]);
  }
  for (const question of questions) {
    question.widgetType = inferWidgetType(question.controls);
    const helper = extractHelperText(question.controls[0], question.label);
    if (helper) question.helperText = helper;
  }
  return questions;
}

function inferWidgetType(controls: Question['controls']): WidgetType {
  const [el] = controls;
  if (isBooleanButtonsQuestion(controls)) return 'boolean_buttons';
  if (controls.length > 1) return choiceType(el) === 'checkbox' ? 'checkbox_group' : 'radio';
  if (isComboWidget(el)) return 'combobox';
  if (el instanceof HTMLSelectElement) return 'select';
  if (el instanceof HTMLTextAreaElement) return 'textarea';
  const choice = choiceType(el);
  if (choice === 'radio') return 'radio';
  if (choice === 'checkbox') return 'checkbox';
  return 'text';
}

/**
 * The group a control would answer within, or null when it is its own question.
 *
 * Deliberately narrow, because over-grouping hides fields from the agent while
 * under-grouping only makes the report long. The control must be a checkbox or
 * radio — an `Address` fieldset's text inputs are separate questions despite the
 * shared legend — and its container must be labelled, since without a label
 * there is no question text to report.
 *
 * `key` splits a container that holds more than one question: a
 * "Demographic Questions" fieldset wrapping both a Yes/No radio pair and a
 * country checklist asks two things, and merging them would offer all the options
 * at once and leave the second question unanswerable. Controls answering together
 * share a `name` and a type, which is how the live forms mark them.
 */
function groupOf(el: Fillable): { container: Element; question: string; key: string } | null {
  if (el instanceof HTMLButtonElement && !isComboWidget(el) && !choiceType(el)) {
    const pair = booleanButtonGroup(el);
    return pair ? { ...pair, key: 'boolean_buttons' } : null;
  }
  const type = choiceType(el);
  if (!type) return null;
  const labelled = labelledContainer(el);
  if (labelled) {
    const choices = Array.from(labelled.container.querySelectorAll<Fillable>(CHOICES))
      .filter((choice) => choice.closest('fieldset, [role="group"], [role="radiogroup"]') === labelled.container);
    const names = new Set(choices.map((choice) => choice.getAttribute('name')?.trim()).filter(Boolean));
    const labels = new Set(choices.map((choice) => normalizeLabel(extractLabel(choice))));
    const noQuestionMark = choices.every((choice) => !extractLabel(choice).includes('?'));
    const distinctCheckboxes = type === 'checkbox' && names.size > 1 && noQuestionMark;
    const checkboxGroup = type === 'checkbox' && noQuestionMark &&
      !(labels.has('yes') && labels.has('no')) && !/\bquestions\b/i.test(labelled.question);
    if ((distinctCheckboxes || checkboxGroup || labelled.container.matches('[role="radiogroup"]') ||
        /\b(?:which|select|choose|check|how|what|where)\b|\?/i.test(labelled.question)) &&
        choices.length > 1 && choices.includes(el) && choices.every((choice) => choiceType(choice) === type) &&
        !labelled.container.querySelector('fieldset, [role="group"], [role="radiogroup"]')) {
      return { ...labelled, key: type };
    }
  }
  const inferred = questionBeforeOptions(el);
  if (inferred?.binaryPair) return { ...inferred, key: 'binary radio' };
  if (!labelled && inferred && type === 'checkbox') return { ...inferred, key: 'checkbox list' };
  const name = el.getAttribute('name')?.trim() ?? '';
  if (!name) return inferred ? { ...inferred, key: `${type}:${inferred.question}` } : null;
  const group = labelled ?? (el instanceof HTMLInputElement ? namedByControls(el) : null) ?? inferred;
  return group ? { ...group, key: `${type} ${name}` } : null;
}

/** Segmented [Yes] / [No] button pair beneath a question prompt or labelled container. */
function booleanButtonGroup(el: HTMLButtonElement): { container: Element; question: string } | null {
  if (!isSafeSegmentedButton(el)) return null;
  for (let container = el.parentElement; container && !container.matches('form, body, [role="dialog"]'); container = container.parentElement) {
    if (container.querySelector('input:not([type="hidden"]), select, textarea, [role="combobox"], [role="radio"], [role="checkbox"]')) break;
    const buttons = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).filter(
      (btn) => !btn.matches(':disabled') && !btn.closest('[aria-disabled="true"]') && !isHidden(btn),
    );
    if (buttons.length < 2) continue;
    if (buttons.length !== 2) break;
    if (!buttons.every(isSafeSegmentedButton)) break;
    const norms = new Set(buttons.map((btn) => normalizeLabel(buttonOptionLabel(btn))));
    if (!norms.has('yes') || !norms.has('no')) break;

    const first = buttons[0];
    if (!first) break;
    let branch: Element = first;
    while (branch.parentElement && branch.parentElement !== container) branch = branch.parentElement;

    const ariaQuestion =
      textFromIds(el.ownerDocument, container.getAttribute('aria-labelledby')) ||
      collapse(container.getAttribute('aria-label')) ||
      collapse(Array.from(container.children).find((c) => c.tagName === 'LEGEND')?.textContent);

    let question = ariaQuestion;
    if (!question) {
      const beforeBranch: Element[] = [];
      for (const child of Array.from(container.children)) {
        if (child === branch || child.contains(first)) break;
        if (isOnScreen(child) && !child.matches('button') && !child.querySelector('button')) beforeBranch.push(child);
      }
      const heading = beforeBranch.find((child) => child.matches('label, legend, h1, h2, h3, h4, h5, h6')) ??
        beforeBranch.find((child) => /\?\s*\*?$|^(?:describe|explain|tell us|share|provide|list)\b/i.test(collapse(child.textContent))) ??
        beforeBranch.find((child) => {
          const text = collapse(child.textContent);
          return Boolean(text) && !norms.has(normalizeLabel(text));
        });
      question = collapse(heading?.textContent);
    }
    if (!question) {
      const prefix: string[] = [];
      for (const node of container.childNodes) {
        if (node === branch || node.contains(first)) break;
        prefix.push(node.textContent ?? '');
      }
      const prefixText = collapse(prefix.join(' '));
      if (prefixText) question = prefixText;
    }
    if (!question) {
      const parent = container.parentElement;
      const canWalkUp = Boolean(parent && !parent.matches('form, body, [role="dialog"]') &&
        !parent.querySelector('input:not([type="hidden"]), select, textarea, [role="combobox"], [role="radio"], [role="checkbox"]') &&
        parent.querySelectorAll('button').length === 2);
      if (!canWalkUp) {
        question = precedingPrompt(container, (text) => /\?\s*\*?$/.test(text));
      }
    }
    if (question && question.length <= 2000 && !norms.has(normalizeLabel(question))) {
      return { container, question };
    }
  }
  return null;
}

const isDemographicPrompt = (text: string) =>
  Boolean(demographicKey(text)) || isCommunitySelfIdQuestion(text);

/** ATS forms often put a plain-text heading above a list of choices (with or without `name`). */
function questionBeforeOptions(el: Fillable): { container: Element; question: string; binaryPair: boolean } | null {
  const type = choiceType(el);
  if (!type) return null;
  for (let container = el.parentElement; container; container = container.parentElement) {
    if (container.matches('form, body, [role="dialog"]')) break;
    const otherControls = Array.from(container.querySelectorAll<Fillable>(
      'input:not([type="radio"]):not([type="checkbox"]):not([type="hidden"]), select, textarea',
    ));
    const choices = Array.from(container.querySelectorAll<Fillable>(CHOICES));
    if (choices.some((item) => choiceType(item) !== type)) break;
    if (choices.length < 2) {
      if (otherControls.length) break;
      continue;
    }
    const hasNestedSubgroup = Array.from(container.children).some((child) => {
      const sub = child.querySelectorAll(CHOICES);
      return sub.length >= 2 && sub.length < choices.length;
    });
    if (hasNestedSubgroup) break;
    const labels = new Set(choices.map((choice) => normalizeLabel(extractLabel(choice))));
    const binaryPair = type === 'radio' && choices.length === 2 && labels.has('yes') && labels.has('no');
    const firstName = choices[0]?.getAttribute('name')?.trim() ?? '';
    const sameName = Boolean(firstName) && choices.every((choice) => (choice.getAttribute('name')?.trim() ?? '') === firstName);
    const checkboxList =
      type === 'checkbox' &&
      !(labels.has('yes') && labels.has('no')) &&
      choices.every((choice) => !extractLabel(choice).includes('?'));
    if (!sameName && !binaryPair && !checkboxList) break;
    const first = choices[0];
    if (!first) break;
    let branch = first as Element;
    while (branch.parentElement && branch.parentElement !== container) branch = branch.parentElement;
    const isPrompt = (text: string) => /\?\s*(?:\*\s*)?(?:please select all that apply\.?\s*)?$/i.test(text) ||
      (checkboxList && isDemographicPrompt(text));
    const prefix: string[] = [];
    for (const node of container.childNodes) {
      if (first && node.contains(first)) break;
      if (node instanceof Element && (node.matches('label[for]') && choices.some((choice) => choice.id === node.getAttribute('for')))) continue;
      prefix.push(node.textContent ?? '');
    }
    const question = precedingPrompt(branch, isPrompt) || collapse(prefix.join(' ')) || precedingPrompt(container, isPrompt);
    // The Other detail box belongs alongside an explicit demographic checkbox question.
    // A different text field in an unlabelled container gives no such evidence.
    if (otherControls.length && (!checkboxList || !isDemographicPrompt(question) ||
        otherControls.some((control) => !/^other(?:\b|_)/i.test(extractLabel(control))))) break;
    if (question && question.length <= 2000 && !labels.has(normalizeLabel(question)) &&
        (sameName || checkboxList || /\?\s*\*?$/.test(question))) {
      return { container, question, binaryPair: binaryPair && !sameName };
    }
  }
  return null;
}

/**
 * A radio group whose own container states no question, but whose radios are each named after
 * it (LinkedIn Easy Apply's Yes/No: the aria-label is the question, the option text sits beside).
 */
function namedByControls(el: HTMLInputElement): { container: Element; question: string } | null {
  const container = el.closest('fieldset, [role="radiogroup"]');
  const question = collapse(el.getAttribute('aria-label'));
  if (!container || el.type !== 'radio' || !question) return null;
  // Radios labelled "Yes" and "No" name their options, not a shared question.
  const group = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="radio"]')).filter(
    (radio) => radio.name === el.name,
  );
  return group.every((radio) => collapse(radio.getAttribute('aria-label')) === question)
    ? { container, question }
    : null;
}

/** The nearest container that states the question its controls answer. */
function labelledContainer(el: Element): { container: Element; question: string } | null {
  const selector = 'fieldset, [role="group"], [role="radiogroup"]';
  for (let group = el.closest(selector); group; group = group.parentElement?.closest(selector) ?? null) {
    const legend = Array.from(group.children).find((c) => c.tagName === 'LEGEND');
    const question =
      textFromIds(el.ownerDocument, group.getAttribute('aria-labelledby')) ||
      collapse(group.getAttribute('aria-label')) || collapse(legend?.textContent);
    if (question) return { container: group, question };
  }
  return null;
}

/**
 * True when the control is not on screen for the user — a display:none recaptcha
 * textarea, a collapsed section, a widget's stashed input. `type=hidden` is
 * already excluded above; this catches the CSS-hidden ones, which a real ATS
 * form is full of and which the agent has no business reading or writing.
 */
function isHidden(el: Fillable): boolean {
  if (el.hidden || el.closest('[hidden]')) return true;
  // checkVisibility walks the ancestors for us. Where it is missing (an older
  // browser), fall back to treating the control as visible rather than dropping
  // fields we cannot judge.
  return typeof el.checkVisibility === 'function' && !el.checkVisibility();
}

/** Serialises the page's form into indexed FormFields. Pure over the document. */
export function extractForm(doc: Document): FormField[] {
  const forms = Array.from(doc.querySelectorAll('form'));
  const snapshotId = `snap_${++snapshotSeq}`;
  const seenFieldIds = new Map<string, number>();
  const questions = collectQuestions(doc);
  const fields = questions.map((q, i) => {
    const field = describeQuestion(q, i, forms);
    field.snapshotId = snapshotId;
    field.fieldId = assignUniqueFieldId(q, field, seenFieldIds);
    return field;
  });
  annotateParentFieldIds(questions, fields);
  return fields;
}

function assignUniqueFieldId(
  question: Question,
  field: FormField,
  seen: Map<string, number>,
): string {
  const [el] = question.controls;
  const raw =
    el.id.trim() ||
    el.getAttribute('name')?.trim() ||
    normalizeLabel(field.label).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) ||
    `q${field.index}`;
  const base = `f${field.form}:${raw}`;
  const count = (seen.get(base) ?? 0) + 1;
  seen.set(base, count);
  return count === 1 ? base : `${base}#${count}`;
}

function annotateParentFieldIds(questions: Question[], fields: FormField[]): void {
  const domIdToFieldId = new Map<string, string>();
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const f = fields[i];
    if (!q || !f?.fieldId) continue;
    for (const c of q.controls) {
      if (c.id.trim()) domIdToFieldId.set(c.id.trim(), f.fieldId);
    }
  }

  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    const question = questions[i];
    if (!field || !question || !field.fieldId) continue;
    const parents = new Set<string>();
    const [el] = question.controls;
    const explicitAttr = el.getAttribute('data-parent-field-id') ?? el.getAttribute('data-depends-on') ?? '';
    for (const ref of explicitAttr.split(/[\s,]+/).filter(Boolean)) {
      const mapped = domIdToFieldId.get(ref) ?? fields.find((cand) => cand.fieldId === ref)?.fieldId;
      if (mapped && mapped !== field.fieldId) parents.add(mapped);
    }

    const isLocationDependent =
      asksVisaSponsorship(field.label) ||
      Boolean(workAuthorizationCountry(field.label)) ||
      /\b(?:this location|this country|selected location)\b/i.test(field.label);
    if (isLocationDependent) {
      for (let j = i - 1; j >= 0; j--) {
        const prev = fields[j];
        if (!prev?.fieldId || prev.form !== field.form) continue;
        if ((prev.section ?? '') !== (field.section ?? '')) continue;
        const prevKey = matchFieldKey(prev.label, prev);
        if (
          prevKey === 'intendedWorkCountry' ||
          prevKey === 'country' ||
          prevKey === 'location' ||
          /\b(?:which country|work location|intend to work from)\b/i.test(prev.label)
        ) {
          parents.add(prev.fieldId);
          break;
        }
      }
    }

    if (parents.size > 0) {
      field.parentFieldIds = [...parents];
    }
  }
}

/**
 * The resume/CV uploads the page is offering, each tagged with the form that
 * owns it.
 *
 * File inputs are handled separately from regular questions. They reliably mark
 * a form as an application. Measured across Greenhouse
 * (board, embed and site-with-iframe), Lever and Ashby: every open application
 * offered one, and no page that was not showing an application did. That is what
 * lets a job-alert signup be told from a short application form, which counting
 * fields or required markers cannot do.
 */
export function extractUploads(doc: Document): Upload[] {
  return uploadInputs(doc).map(({ input, form, resume }) => {
    const upload: Upload = { form };
    if (resume) {
      upload.resume = true;
      if (input.files?.length) upload.hasFile = true;
    }
    return upload;
  });
}

function uploadInputs(doc: Document) {
  const forms = Array.from(doc.querySelectorAll('form'));
  return Array.from(doc.querySelectorAll<HTMLInputElement>('input[type="file"]'))
    .filter((input) => !input.matches(':disabled, [aria-disabled="true"]') && !isHidden(input))
    .map((input) => {
      const label = [extractLabel(input), input.name, input.id].join(' ')
        .normalize('NFD').replace(/\p{M}/gu, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ');
      const resume = /\b(?:resume|curriculum vitae|cv|lebenslauf)\b/i.test(label) &&
        !/\b(?:cover letter|coverletter|references?|transcript|portfolio)\b/i.test(label);
      return { input, form: formIndex(input, forms), resume };
    });
}

/** Writes the caller's saved file to the one résumé input in the named form. */
export function attachSavedResume(doc: Document, form: number, resume: SavedResumeFile): ResumeAttachmentStatus {
  const matches = uploadInputs(doc).filter((entry) => entry.form === form && entry.resume);
  const input = matches.length === 1 ? matches[0]?.input : undefined;
  if (!input?.isConnected) return 'unavailable';
  if (input.files?.length) return 'already_attached';

  const accepted = input.accept.toLowerCase().split(',').map((entry) => entry.trim()).filter(Boolean);
  const mime = resume.mimeType.toLowerCase();
  const name = resume.filename.toLowerCase();
  if (accepted.length && !accepted.some((entry) =>
    entry.startsWith('.') ? name.endsWith(entry) :
      entry.endsWith('/*') ? mime.startsWith(entry.slice(0, -1)) : entry === mime,
  )) return 'incompatible';

  try {
    const bytes = Uint8Array.from(atob(resume.base64), (char) => char.charCodeAt(0));
    if (!bytes.length) return 'failed';
    const file = new File([bytes], resume.filename, { type: mime });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    const observed = input.files?.[0];
    return input.isConnected && observed?.name === file.name && observed.size === file.size ? 'attached' : 'failed';
  } catch {
    return 'failed';
  }
}

/**
 * The index of the form a control answers within, or -1 when it sits outside
 * one.
 *
 * Asked of the control itself rather than of the tree around it. `.form` is the
 * form owner HTML defines, and a control carrying `form="signup"` answers that
 * form from wherever it is rendered — a distinction `closest('form')` cannot
 * make. (happy-dom does not implement the attribute, so no test here covers
 * that case; browsers do, which is where the extension runs.)
 *
 * It is also the only identity check happy-dom agrees with itself about across
 * versions. Under 20.11.6 `closest` hands back a different object than the
 * query list holds, so `===` fails and `isSameNode` is what matches; under
 * 20.11.13 that reversed — `===` matches and `isSameNode` returns false for a
 * node against itself. `.form` returns the very object `querySelectorAll`
 * collected under both, so `indexOf` is enough.
 */
export function formIndex(el: Fillable, forms: HTMLFormElement[]): number {
  const owner = 'form' in el ? el.form as HTMLFormElement | null : el.closest('form');
  return owner ? forms.indexOf(owner) : -1;
}

function resolveOptionsState(widget: WidgetType, options: string[] | undefined): OptionsState {
  if (widget === 'combobox') return options?.length ? 'loaded' : 'deferred';
  if (widget === 'select' || widget === 'radio' || widget === 'checkbox_group' || widget === 'boolean_buttons') {
    return options?.length ? 'loaded' : 'empty';
  }
  return 'unknown';
}

function describeQuestion({ label, controls, helperText, widgetType }: Question, index: number, forms: HTMLFormElement[]): FormField {
  const [el] = controls;
  const resolvedWidget = widgetType ?? inferWidgetType(controls);
  const booleanButtons = resolvedWidget === 'boolean_buttons';
  const tag: FieldTag = el instanceof HTMLSelectElement ? 'select' :
    el instanceof HTMLTextAreaElement ? 'textarea' : 'input';
  const field: FormField = {
    index,
    form: formIndex(el, forms),
    tag,
    type: booleanButtons ? 'radio' : (choiceType(el) ?? (el instanceof HTMLInputElement ? el.type : isComboWidget(el) ? 'select' : tag)),
    label,
    widgetType: resolvedWidget,
    name: el.getAttribute('name') ?? '',
    // A React-rendered ATS form typically validates in JS and marks the
    // requirement with ARIA rather than the native attribute.
    // Plenty of forms (LinkedIn Easy Apply's radio groups) mark it only as a trailing
    // asterisk in the question's text.
    required: controls.some((c) => ('required' in c && c.required) || c.getAttribute('aria-required') === 'true') || /\*\s*$/.test(label),
    value: 'value' in el && typeof el.value === 'string' && !booleanButtons ? el.value : '',
    combo: isComboWidget(el),
    userEdited: controls.some(isUserEdited),
  };
  const resolvedHelper = helperText ?? extractHelperText(el, label);
  if (resolvedHelper) field.helperText = resolvedHelper;
  const placeholder = extractPlaceholder(el);
  if (placeholder) field.placeholder = placeholder;
  const section = extractSection(el, label);
  if (section) field.section = section;
  const invalid = fieldError(el);
  if (invalid) field.invalid = invalid;

  if (booleanButtons) {
    field.options = controls.map(extractLabel);
    field.value = controls
      .filter((c) => isBooleanButtonSelected(c as HTMLButtonElement))
      .map(extractLabel)
      .join(', ');
  } else if (controls.length > 1) {
    // A group: the options are the controls' own labels, and its value is
    // whichever of them are already chosen.
    field.options = controls.map(extractLabel);
    if (choiceType(el) === 'checkbox') field.multiple = true;
    field.value = controls
      .filter(choiceChecked)
      .map(extractLabel)
      .join(', ');
  } else if (choiceType(el)) {
    // A lone box's value attribute is "on" whether or not it is ticked; the answer is
    // its state, read back the way `fillField` writes it.
    field.value = choiceChecked(el) ? 'Yes' : '';
  } else if (el instanceof HTMLSelectElement) {
    if (el.multiple) field.multiple = true;
    field.options = Array.from(el.options).filter(isSelectableOption).map((o) => collapse(o.textContent));
    // The answer is the chosen option's text; its value attribute is the ATS's own
    // code ("4417"), which means nothing to the person or to anyone reading it back.
    // An empty value stays empty: that is the "Select..." placeholder, not an answer.
    const selected = el.multiple
      ? Array.from(el.options).filter((option) => option.selected)
      : [el.options[el.selectedIndex]].filter((option): option is HTMLOptionElement => !!option);
    field.value = selected.filter(isSelectableOption).map((o) => collapse(o.textContent)).join(', ');
  } else if (field.combo) {
    const offered = comboOptions(el);
    if (offered.length) field.options = offered;
    // The widget's input is empty even after a commit; the answer is what it displays.
    field.value = displayedValues(el).join(', ');
  }
  field.currentValue = field.value;
  field.optionsState = resolveOptionsState(resolvedWidget, field.options);
  return field;
}

function isSelectableOption(option: HTMLOptionElement): boolean {
  return !!option.value && !option.disabled && !option.closest('optgroup[disabled]') &&
    !isChoicePlaceholder(collapse(option.textContent));
}

function verifyWrittenValue(
  after: FormField,
  expectedAnswer: string,
  choices?: string[],
): { ok: boolean; verifiedValue: string; error?: string } {
  const observed = after.value;
  if (choices?.length) {
    const ok = observed.trim() !== '';
    return ok
      ? { ok: true, verifiedValue: observed }
      : { ok: false, verifiedValue: observed, error: 'Selected choices were not retained in DOM' };
  }
  if (after.widgetType === 'checkbox') {
    const want = binaryChoice(expectedAnswer);
    if (want === true) {
      return observed === 'Yes'
        ? { ok: true, verifiedValue: observed }
        : { ok: false, verifiedValue: observed, error: 'Checkbox did not remain checked' };
    }
    if (want === false) {
      return observed === ''
        ? { ok: true, verifiedValue: observed }
        : { ok: false, verifiedValue: observed, error: 'Checkbox did not remain unchecked' };
    }
  }
  if (expectedAnswer.trim() && observed.trim() === '') {
    return { ok: false, verifiedValue: observed, error: 'Control value remained empty after write' };
  }
  if (after.widgetType === 'text' || after.widgetType === 'textarea') {
    if (observed.trim() !== expectedAnswer.trim()) {
      return {
        ok: false,
        verifiedValue: observed,
        error: `DOM value mismatch: expected "${expectedAnswer.trim()}", got "${observed.trim()}"`,
      };
    }
  }
  return { ok: true, verifiedValue: observed };
}

export function fillByLabel(doc: Document, fills: LabelFill[]): FillOutcome[] {
  const questions = collectQuestions(doc);
  const forms = Array.from(doc.querySelectorAll('form'));
  const unfillable = unfillableLabels(doc);
  const seenFieldIds = new Map<string, number>();
  const questionByFieldId = new Map<string, Question>();
  questions.forEach((q, i) => {
    const described = describeQuestion(q, i, forms);
    const id = assignUniqueFieldId(q, described, seenFieldIds);
    questionByFieldId.set(id, q);
  });

  return fills.map(({ fieldId, label, value, form, onlyEmpty, choices, requiresReview }) => {
    const withId = fieldId ? { fieldId } : {};
    if (requiresReview) {
      return { ...withId, label, status: 'not_fillable' as const, verificationError: 'Requires manual review' };
    }

    let question: Question | undefined;
    if (fieldId) {
      question = questionByFieldId.get(fieldId);
      if (!question) {
        const miss = findQuestion(unfillable, questions, forms, label, form);
        return {
          ...withId,
          label,
          status: 'miss' in miss ? miss.miss : ('not_found' as const),
        };
      }
    } else {
      const resolved = findQuestion(unfillable, questions, forms, label, form);
      if ('miss' in resolved) return { label, status: resolved.miss };
      question = resolved.found;
    }

    const before = describeQuestion(question, 0, forms);
    if (before.userEdited || (onlyEmpty && before.value.trim())) {
      return { ...withId, label, status: 'not_fillable' as const };
    }
    if (question.controls.length === 1 && isComboWidget(question.controls[0])) {
      return { ...withId, label, status: 'deferred_combobox' as const };
    }
    if (choices) {
      const applied = applyExactChoices(question, choices);
      if (!applied) return { ...withId, label, status: 'no_option' as const };
      const after = describeQuestion(question, 0, forms);
      const verified = verifyWrittenValue(after, choices.join(', '), choices);
      if (!verified.ok) {
        return {
          ...withId,
          label,
          status: 'not_fillable' as const,
          verifiedValue: verified.verifiedValue,
          verificationError: verified.error,
        };
      }
      return {
        ...withId,
        label,
        status: 'filled' as const,
        ...(fieldId ? { verifiedValue: verified.verifiedValue } : {}),
      };
    }
    const answer = needsNumber(question, label) ? (numericAnswer(value) ?? value) : value;
    const applied = answerQuestion(question, answer);
    if (!applied) return { ...withId, label, status: 'no_option' as const };
    const after = describeQuestion(question, 0, forms);
    const verified = verifyWrittenValue(after, answer);
    if (!verified.ok) {
      return {
        ...withId,
        label,
        status: 'not_fillable' as const,
        verifiedValue: verified.verifiedValue,
        verificationError: verified.error,
      };
    }
    return {
      ...withId,
      label,
      status: 'filled' as const,
      ...(fieldId ? { verifiedValue: verified.verifiedValue } : {}),
    };
  });
}

function applyExactChoices({ controls }: Question, choices: string[]): boolean {
  const [first] = controls;
  if (!choices.length || new Set(choices).size !== choices.length) return false;
  if (first instanceof HTMLSelectElement) {
    if (!first.multiple && choices.length > 1) return false;
    const offered = Array.from(first.options).filter(isSelectableOption);
    const matches = choices.map((choice) => {
      const exact = offered.filter((option) => collapse(option.textContent) === choice);
      return exact.length ? exact : offered.filter((option) => normalizeLabel(collapse(option.textContent)) === normalizeLabel(choice));
    });
    if (matches.some((options) => options.length !== 1)) return false;
    const chosen = new Set(matches.flat());
    Array.from(first.options).forEach((option) => { option.selected = chosen.has(option); });
    dispatchNative(first);
    const selected = Array.from(first.selectedOptions);
    return selected.length === chosen.size && selected.every((option) => chosen.has(option));
  }
  const isButtons = isBooleanButtonsQuestion(controls);
  const type = choiceType(first);
  if (controls.length < 2 || (!type && !isButtons) || ((type === 'radio' || isButtons) && choices.length > 1)) return false;
  const matches = choices.map((choice) => {
    const exact = controls.filter((control) => extractLabel(control) === choice);
    return exact.length ? exact : controls.filter((control) => normalizeLabel(extractLabel(control)) === normalizeLabel(choice));
  });
  if (matches.some((options) => options.length !== 1)) return false;
  return matches.flat().every((control) => fillField(control, 'true'));
}

/** The page's own verdict that a control's answer is wrong, as its message; '' when none. */
function fieldError(el: Fillable): string {
  return easyApplyFieldError(el) || (el.getAttribute('aria-invalid') === 'true' ? 'Invalid' : '');
}

/**
 * Whether a single text control takes a bare number. The markup says so for a
 * number input or a numeric keyboard; Easy Apply's salary question says nothing yet
 * rejects anything but digits ("5000 USD/month" is "Invalid input").
 */
function needsNumber({ controls }: Question, label: string): boolean {
  if (controls.length !== 1) return false;
  const [el] = controls;
  if (!(el instanceof HTMLInputElement)) return false;
  if (el.type === 'number' || /^(numeric|decimal)$/.test(el.inputMode)) return true;
  return matchFieldKey(label) === 'desiredSalary' && easyApplyDialog(el.ownerDocument)?.contains(el) === true;
}

/**
 * The first amount in a free-text answer as plain digits: "5000 USD/month" → "5000",
 * "€60,000" → "60000", "60k" → "60000". Null when the answer holds no number, so the
 * caller keeps the text rather than writing nothing.
 */
export function numericAnswer(value: string): string | null {
  const m = /(\d[\d.,\s]*\d|\d)\s*(k\b)?/i.exec(value);
  if (!m?.[1]) return null;
  // A separator followed by exactly three digits groups thousands; any other is a decimal point.
  const n = Number(
    m[1]
      .replace(/[.,\s](?=\d{3}(?!\d))/g, '')
      .replace(',', '.')
      .replace(/\s/g, ''),
  );
  if (!Number.isFinite(n)) return null;
  return String(Math.round(m[2] ? n * 1000 : n));
}

/**
 * The one question a fill addresses, or why the label did not name one.
 *
 * The misses are kept apart because each implies a different next step for the
 * harness, and collapsing them into "not found" — which is what this did — invites
 * a retry in the two cases where a retry cannot succeed.
 */
type Resolution =
  | { found: Question }
  // Extract, not a bare union of the four names: the outcome vocabulary is
  // FillStatus's, so a status renamed there must fail to compile here rather than
  // leave this listing a name the wire no longer uses.
  | { miss: Extract<FillStatus, 'ambiguous' | 'wrong_form' | 'not_fillable' | 'not_found'> };

/**
 * Resolves a fill's `label`, narrowed to `form` when the fill names one.
 *
 * An unscoped fill matching several questions is `ambiguous` rather than the first
 * of them: on a page carrying an application form beside a job-alert signup the two
 * are indistinguishable from here, and writing into the wrong one is worse than
 * writing into neither.
 */
export function findQuestion(
  unfillable: () => Set<string>,
  questions: Question[],
  forms: HTMLFormElement[],
  label: string,
  form: number | undefined,
): Resolution {
  const target = normalizeLabel(label);
  const matches = questions.filter((q) => normalizeLabel(q.label) === target);

  if (form === undefined) {
    const [first, ...rest] = matches;
    if (rest.length > 0) return { miss: 'ambiguous' };
    if (first) return { found: first };
    return { miss: absentOrUnfillable(unfillable, target) };
  }

  // `find`, so a label repeated INSIDE one form resolves to the first of them —
  // knowingly. `(label, frame, form)` is not a key: a multi-entry section asking
  // "Employer" once per job carries the label several times in one form, and each
  // of the fills the agent fans out lands on control #1 while the rest stay empty.
  // Refusing here instead would take that page from partly filled to not filled at
  // all, which is the worse answer while nothing on the wire can name a control
  // more precisely. What closes it is an addressing scheme with a per-control id,
  // not a refusal.
  const scoped = matches.find((q) => formIndex(q.controls[0], forms) === form);
  if (scoped) return { found: scoped };
  // The label is asked somewhere in this frame, just not in the form named — the
  // index is what is wrong, not the question.
  if (matches.length > 0) return { miss: 'wrong_form' };
  return { miss: absentOrUnfillable(unfillable, target) };
}

/**
 * The labels the page carries on a control `collectFillable` dropped, read at most
 * once and only if something actually misses.
 *
 * Lazy because the scan is over the whole document and `extractLabel` walks
 * `getElementById` for every `aria-labelledby` it meets. Per miss, on an ATS form
 * with several hundred controls and thirty unanswered questions, that is thirty
 * full passes synchronously in the content script — and a call whose fills all land
 * should not pay for it at all.
 */
export function unfillableLabels(doc: Document): () => Set<string> {
  let read: Set<string> | undefined;
  return () => (read ??= readUnfillableLabels(doc));
}

function readUnfillableLabels(doc: Document): Set<string> {
  const labels = new Set<string>();
  for (const el of doc.querySelectorAll<Fillable>('input, select, textarea')) {
    // Never a fill target in the first place, so its absence is not a refusal.
    if (el instanceof HTMLInputElement && SKIP_TYPES.has(el.type)) continue;
    const droppedByCollectFillable = el.matches(':disabled') || isHidden(el);
    if (!droppedByCollectFillable) continue;
    labels.add(normalizeLabel(extractLabel(el)));
  }
  return labels;
}

/**
 * Tells a label the page never asks from one it asks through a control nothing can
 * write to.
 *
 * `collectFillable` drops a disabled or invisible control before any of this runs,
 * which is right — keeping one in the match set would risk writing into it — but it
 * left the two indistinguishable downstream. So the check happens here, on the miss
 * path only, against the controls that were filtered out.
 *
 * Only individually-labelled controls are examined; a disabled member of a grouped
 * question (a legend over 29 checkboxes) still reads as `not_found`. The group's
 * label lives on the legend rather than on any one control, and a partially
 * disabled group is not the case this exists for.
 */
function absentOrUnfillable(unfillable: () => Set<string>, target: string): 'not_fillable' | 'not_found' {
  return unfillable().has(target) ? 'not_fillable' : 'not_found';
}

/**
 * Answers one question. A group is answered by ticking the controls whose own
 * labels are the chosen options; if any of them is not on offer, nothing is
 * ticked, so a wrong choice is reported rather than half-applied.
 *
 * Ticking only, never clearing: a group may already carry an answer the user
 * chose by hand, and autofill has no business undoing it.
 */
function answerQuestion({ controls, label }: Question, value: string): boolean {
  if (controls.length === 1) return fillField(controls[0], value, label);

  const chosen = chosenOptions(controls, value, label);
  if (!chosen) return false;
  if ((choiceType(controls[0]) === 'radio' || isBooleanButtonsQuestion(controls)) && chosen.length !== 1) return false;
  return chosen.every((control) => fillField(control, 'true'));
}

/**
 * The controls a group's requested value names, or null when it names one the
 * group does not offer.
 *
 * A group reports every chosen option as one comma-joined value and must accept
 * that value back — but an option may carry a comma of its own, so splitting on
 * commas would turn "Germany, Korea, Republic of" into three countries the group
 * has never heard of. Instead the value is consumed from the front, taking the
 * *longest* option that matches at each step, which recovers both readings
 * unambiguously.
 */
function chosenOptions(controls: Fillable[], value: string, label: string): Fillable[] | null {
  const exact = controls.filter((control) => matchChoice(value, extractLabel(control), label));
  if (exact.length === 1) return exact;
  if (exact.length > 1) return null;
  const byLongestLabel = controls.toSorted((a, b) => extractLabel(b).length - extractLabel(a).length);
  const chosen: Fillable[] = [];
  let rest = value.trim();

  while (rest) {
    const next = byLongestLabel.find((c) => startsWithOption(rest, extractLabel(c)));
    if (!next) return null;
    chosen.push(next);
    rest = rest
      .slice(extractLabel(next).trim().length)
      .replace(/^\s*,\s*/, '')
      .trim();
  }
  return chosen.length ? chosen : null;
}

/** True when `value` opens with exactly this option, not merely with its prefix. */
function startsWithOption(value: string, option: string): boolean {
  const label = option.trim();
  if (!label) return false;
  const head = value.slice(0, label.length);
  if (normalizeLabel(head) !== normalizeLabel(label)) return false;
  // "Germany" must not match inside "Germanywest": what follows has to end the
  // option, either at the string's end or at the separator.
  const tail = value.slice(label.length);
  return tail === '' || /^\s*,/.test(tail);
}

/** Writes one control, dispatching native events. Returns false if unfillable. */
function fillField(el: Fillable, value: string, label = ''): boolean {
  const type = choiceType(el);
  if (type) {
    const checked = binaryChoice(value);
    if (checked === undefined || (type === 'radio' && !checked)) return false;
    if (!(el instanceof HTMLInputElement) && !/^(?:true|false)$/.test(el.getAttribute('aria-checked') ?? '')) return false;
    const button = el.closest('button');
    if ((button && button.type !== 'button' && button.form) || el.closest('a[href]')) return false;
    // React's checkbox/radio change plugin observes native click activation.
    if (choiceChecked(el) !== checked) el.click();
    return choiceChecked(el) === checked;
  }
  if (el instanceof HTMLButtonElement && !isComboWidget(el)) {
    if (!isSafeChoiceButton(el) || el.closest('a[href]')) return false;
    if (binaryChoice(value) !== true) return false;
    if (!isBooleanButtonSelected(el)) el.click();
    return true;
  }
  if (el instanceof HTMLSelectElement) {
    const matches = Array.from(el.options).filter(
      (o) =>
        isSelectableOption(o) && (matchChoice(value, collapse(o.textContent), label) ||
        normalizeLabel(o.value) === normalizeLabel(value)),
    );
    if (matches.length !== 1 || !matches[0]) return false;
    el.value = matches[0].value;
    dispatchNative(el);
    return el.value === matches[0].value;
  }
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return false;
  setNativeValue(el, value);
  return true;
}

function choiceChecked(el: Fillable): boolean {
  return el instanceof HTMLInputElement ? el.checked : el.getAttribute('aria-checked') === 'true';
}

// React/Angular track the input's value via a native setter; calling it (rather
// than el.value =) plus bubbling input/change is what makes them notice the fill.
export function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  dispatchNative(el);
}

function dispatchNative(el: Fillable): void {
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/** The autofill profile as the label-keyed values `planLabelFills` fills from. */
export function profileToValues(p: AutofillProfile): Record<string, string> {
  return {
    fullName: p.full_name,
    firstName: p.first_name,
    lastName: p.last_name,
    email: p.email,
    phone: p.phone,
    city: p.location,
    state: p.state ?? '',
    country: p.country ?? '',
    postalCode: p.postal_code ?? '',
    intendedWorkCountry: p.intended_work_country || p.country || '',
    linkedin: p.linkedin,
    github: p.github,
    portfolio: p.portfolio,
    authorizedCountries: formatAuthorizedCountries(p.authorized_countries),
    visaSponsorshipNeeded: p.visa_sponsorship_needed,
    desiredSalary: p.desired_salary,
    noticePeriod: p.notice_period,
    willingToRelocate: p.willing_to_relocate,
    age18OrOlder: p.age_18_or_older,
  };
}
