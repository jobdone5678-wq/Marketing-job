import { browser } from 'wxt/browser';
import { track } from './analytics';
import type { AnswerOffer } from './answerOffer';
import {
  generateAutofillAnswer,
  getAutofillSessionProfile,
  getAutofillSettings,
  requestAutofillChoice,
  requestAutofillPlan,
  saveBankAnswer,
} from './freehire';
import { isAutofillProse, isPrivateAutofillField } from './autofillSafety';
import type { FormContext } from '../../src/lib/ai/planner';
import { normalizeLabel } from './fieldKeys';
import { profileToValues } from './form';
import { looksLikeApplication, planLabelFills, scopeToApplication } from './fillPlan';
import { walkFills, type WalkHooks } from './formWalk';
import { PlanRefused } from './planRefused';
import type {
  AutofillTarget,
  ComboboxStep,
  FramedField,
  LabelFill,
  RuntimeMessage,
} from './protocol';

/** What a fill tells the side panel, and asks of it. */
export interface FillPanel {
  /** A line for the panel's notices. */
  notice(text: string): void;
  /** Offer "Fill it anyway" with what it would run, or withdraw the offer (null). */
  offerOverride(run: ((signal: AbortSignal) => Promise<void>) | null): void;
  /** What the walk reports back. */
  walk: WalkHooks;
  /** Read the page's form again, so the checklist follows what was filled. */
  refreshPlan(): Promise<void>;
  /** A question whose answer freehire now holds, so it is not offered for saving. */
  known(label: string): void;
  /** The plan refused the agent: the panel shows its upgrade offer. */
  refused(err: PlanRefused): void;
}

/**
 * Names the first few labels and counts the rest. A real ATS form leaves
 * dozens of fields untouched (Greenhouse alone contributes a checkbox per
 * country), and a notice that lists them all is one the user cannot read.
 */
function nameSome(labels: string[], shown = 5): string {
  const trimmed = labels.map((l) => l.trim().replace(/\s+/g, ' ')).filter(Boolean);
  if (trimmed.length <= shown) return trimmed.join(', ');
  return `${trimmed.slice(0, shown).join(', ')} and ${trimmed.length - shown} more`;
}

function fieldKey(field: { frame?: number; form?: number; label: string }) {
  return `${field.frame}:${field.form}:${normalizeLabel(field.label)}`;
}

function plannerField(field: FramedField) {
  return {
    id: `${field.frame}:${field.form}:${field.index}`,
    label: field.label,
    type: field.tag === 'textarea' ? 'textarea' : field.type,
    required: field.required,
    combo: field.combo,
    options: field.options,
    frame: field.frame,
    form: field.form,
  };
}

async function ask(message: RuntimeMessage) {
  return (await browser.runtime.sendMessage(message)) as RuntimeMessage | undefined;
}

async function jobContext(target: AutofillTarget): Promise<FormContext> {
  const reply = await ask({ kind: 'GET_PAGE_SNAPSHOT', target }).catch(() => undefined);
  if (reply?.kind !== 'PAGE_SNAPSHOT' || !reply.snapshot.url) return {};
  const { jobPosting, headline, title, url, text } = reply.snapshot;
  if (!URL.canParse(url)) return {};
  const page = new URL(url);
  return {
    pageTitle: title.slice(0, 300),
    jobTitle: (jobPosting?.title || headline).slice(0, 300),
    company: jobPosting?.company?.slice(0, 300),
    jobDescription: (jobPosting?.description || text).slice(0, 5000),
    url: page.origin + page.pathname,
  };
}

export async function runAutofill(token: string, panel: FillPanel, signal: AbortSignal) {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined || !tab.url || !/^https?:\/\//i.test(tab.url)) return;
  const target = { tabId: tab.id, url: tab.url };
  await fillApplication(token, panel, signal, target);
}

async function fillApplication(
  token: string,
  panel: FillPanel,
  signal: AbortSignal,
  target: AutofillTarget,
  force = false
) {
  const stopped = () => signal.aborted || panel.walk.stopped();
  const done = new Set<string>();
  const issues: string[] = [];
  let started = false;
  let usedAi = false;
  const hooks: WalkHooks = {
    ...panel.walk,
    stopped,
    answered(label, frame, form) {
      done.add(fieldKey({ label, frame, form }));
      panel.known(label);
      panel.walk.answered(label, frame, form);
    },
  };
  const walk = async (fills: LabelFill[]) => {
    await walkFills(
      fills.map((fill) => ({ ...fill, onlyEmpty: true })),
      hooks,
      target
    );
  };
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (stopped() || tab?.id !== target.tabId || tab.url !== target.url) return;
    const observed = await ask({ kind: 'GET_FRAMED_FORM', target });
    if (stopped()) return;
    if (observed?.kind !== 'FRAMED_FORM' || !observed.fields.length) {
      panel.notice('No form fields found on this page.');
      return;
    }
    if (!force && !looksLikeApplication(observed.uploads, observed.easyApply)) {
      panel.notice(
        "This doesn't look like the application form. Open the application, or choose Fill it anyway."
      );
      panel.offerOverride((nextSignal) => fillApplication(token, panel, nextSignal, target, true));
      return;
    }
    const uploadScopes = new Set(observed.uploads.map(({ frame, form }) => `${frame}:${form}`));
    if (uploadScopes.size > 1) {
      panel.notice('Could not identify one application form on this page.');
      return;
    }
    const scoped = scopeToApplication(observed.fields, observed.uploads);
    const scopes = new Set(scoped.map(({ frame, form }) => `${frame}:${form}`));
    if (scopes.size !== 1) {
      panel.notice('Could not identify one application form on this page.');
      return;
    }
    panel.offerOverride(null);
    started = true;
    const uniqueFields = (fields: FramedField[]) => {
      const counts = new Map<string, number>();
      for (const field of fields) {
        const key = fieldKey(field);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      return fields.filter((field) => {
        const key = fieldKey(field);
        return (
          scopes.has(`${field.frame}:${field.form}`) &&
          counts.get(key) === 1 &&
          !done.has(key) &&
          !field.value.trim() &&
          field.label.trim() &&
          field.label.length <= 2000 &&
          !isPrivateAutofillField(field)
        );
      });
    };
    const remaining = async () => {
      const reply = await ask({ kind: 'GET_FRAMED_FORM', target });
      return reply?.kind === 'FRAMED_FORM' ? uniqueFields(reply.fields) : [];
    };

    // Capture page context before writing any candidate data into the form.
    const contextRequest = jobContext(target);
    const { data: profile, meta } = await getAutofillSessionProfile(token, signal);
    if (stopped()) return;
    await walk(
      planLabelFills(
        uniqueFields(scoped).filter((field) => !field.combo),
        profileToValues(profile)
      )
    );

    if (stopped()) return;
    const fields = await remaining();
    if (!fields.length || stopped()) return;
    const candidateId = meta?.candidateId;
    if (!candidateId) {
      panel.notice('Save a confirmed candidate profile in the portal to use AI autofill.');
      return;
    }

    const [context, settings] = await Promise.all([
      contextRequest,
      getAutofillSettings(token, signal),
    ]);
    if (stopped()) return;
    if (settings.mode === 'extension_byok' || settings.mode === 'local') {
      panel.notice(
        'Select Server or Portal API key in AI provider mode to use NextKinHR AI autofill.'
      );
      return;
    }
    const candidates = fields.map(plannerField);
    const byId = new Map(candidates.map((field) => [field.id, field]));
    usedAi = true;
    const plan = await requestAutofillPlan(
      { candidateId, fields: candidates, context },
      token,
      signal
    );
    if (stopped()) return;
    if (!plan.ok) throw new Error(plan.error || 'The server could not plan autofill.');

    const plannedFills: LabelFill[] = [];
    for (const fill of plan.executableFills ?? []) {
      const field = fill.fieldId ? byId.get(fill.fieldId) : undefined;
      if (
        field &&
        !field.combo &&
        fill.grounded === true &&
        typeof fill.value === 'string' &&
        fill.value.trim()
      ) {
        plannedFills.push({
          label: field.label,
          value: fill.value,
          frame: field.frame,
          form: field.form,
        });
      }
    }
    await walk(plannedFills);
    if (stopped()) return;

    const deferredIds = new Set(
      plan.deferredFieldIds ??
        candidates.filter((field) => plan.deferred?.includes(field.label)).map((field) => field.id)
    );
    for (const fill of plan.executableFills ?? []) {
      if (fill.fieldId && byId.get(fill.fieldId)?.combo) deferredIds.add(fill.fieldId);
    }
    const pending = new Set((await remaining()).map(fieldKey));
    for (const field of candidates) {
      if (stopped()) return;
      if (!field.combo || !deferredIds.has(field.id) || !pending.has(fieldKey(field))) continue;
      hooks.filling(field.label);
      const step = async (action: ComboboxStep['action'], value = '') => {
        if (stopped()) return;
        const reply = await ask({
          kind: 'COMBOBOX_STEP',
          target,
          step: {
            action,
            label: field.label,
            value,
            frame: field.frame,
            form: field.form,
            onlyEmpty: true,
          },
        });
        return reply?.kind === 'COMBOBOX_REPLY' ? reply.reply : undefined;
      };
      try {
        if ((await step('open'))?.status !== 'opened') continue;
        const options = (await step('options'))?.options ?? [];
        if (!options.length || stopped()) continue;
        const result = await requestAutofillChoice(
          { candidateId, question: field, options, context },
          token,
          signal
        );
        if (!result.ok || !result.choice || !options.includes(result.choice) || stopped()) continue;
        if ((await step('select', result.choice))?.status !== 'selected') continue;
        if ((await step('verify', result.choice))?.status === 'verified') {
          hooks.wrote();
          hooks.answered(field.label, field.frame, field.form);
        }
      } catch {
        if (!stopped()) issues.push(field.label);
      }
    }

    if (stopped()) return;
    for (const field of await remaining()) {
      if (stopped()) return;
      if (field.tag !== 'textarea' || field.combo || !isAutofillProse(field.label)) continue;
      hooks.filling(field.label);
      try {
        const result = await generateAutofillAnswer(
          {
            candidateId,
            questionId: plannerField(field).id,
            fieldLabel: field.label,
            fieldType: 'textarea',
            jobTitle: context.jobTitle,
            companyName: context.company,
            jobDescription: context.jobDescription,
          },
          token,
          signal
        );
        if (result.ok && result.answer?.trim() && !stopped()) {
          await walk([
            { label: field.label, value: result.answer, frame: field.frame, form: field.form },
          ]);
        }
      } catch {
        if (!stopped()) issues.push(field.label);
      }
    }
  } catch (err) {
    if (stopped()) return;
    if (err instanceof PlanRefused) panel.refused(err);
    else panel.notice(`Autofill could not finish: ${err instanceof Error ? err.message : 'error'}`);
  } finally {
    hooks.filling(null);
    if (started && (!signal.aborted || panel.walk.stopped())) {
      if (!signal.aborted) await panel.refreshPlan();
      const count = done.size;
      track('autofill', { mode: usedAi ? 'agent' : 'basic', filled: count });
      if (stopped()) panel.notice(`Autofill stopped after ${count} completed fields.`);
      else if (count)
        panel.notice(
          `✓ Autofilled ${count} field${count === 1 ? '' : 's'} — review before submitting.`
        );
      else panel.notice('No fields were filled. Review the remaining questions.');
      if (issues.length) panel.notice(`Could not complete: ${nameSome(issues)}.`);
    }
  }
}

/**
 * Saves the answers the candidate chose into their answer bank, one at a time. One
 * refused answer (too long, no readable question) does not stop the rest; the
 * notice names what did not go through.
 *  `panel.saved` is told each question that reached the bank.
 */
export async function saveChosenAnswers(
  chosen: AnswerOffer[],
  token: string,
  panel: { notice(text: string): void; saved(question: string): void }
): Promise<void> {
  const failed: string[] = [];
  for (const offer of chosen) {
    try {
      await saveBankAnswer(offer.question, offer.answer, token);
      // Saved answers leave the offer: the next read must not ask for them again.
      panel.saved(offer.question);
    } catch {
      failed.push(offer.question);
    }
  }
  const saved = chosen.length - failed.length;
  track('answers_saved', { saved, failed: failed.length });
  if (saved > 0) {
    panel.notice(
      `✓ Saved ${saved} answer${saved === 1 ? '' : 's'} — freehire will fill them on the next form.`
    );
  }
  if (failed.length > 0) panel.notice(`Could not save: ${nameSome(failed)}.`);
}
