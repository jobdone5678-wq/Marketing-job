import { browser } from 'wxt/browser';
import { track } from './analytics';
import type { AnswerOffer } from './answerOffer';
import {
  ExtensionApiError,
  generateAutofillAnswer,
  getAutofillSessionProfile,
  getAutofillSettings,
  getReusableAnswers,
  requestAutofillChoice,
  requestAutofillPlan,
  saveBankAnswer,
} from './freehire';
import { isAutofillProse, isPrivateAutofillField } from './autofillSafety';
import { demographicChoices, demographicKey, demographicOptionKey, mixedDemographicChoices, type DemographicPreferences } from '../../src/lib/profile/demographic-preferences';
import { inferQuestionDescriptor, type FormContext } from '../../src/lib/ai/planner';
import { validateGroundedAnswer } from '../../src/lib/ai/grounded';
import { findReusableAnswer } from '../../src/lib/ai/reusable-answers';
import { buildVerifiedFacts } from '../../src/lib/ai/verified-facts';
import { normalizeLabel, offeredChoice } from './fieldKeys';
import { profileToValues } from './form';
import { confirmedFieldValue, looksLikeApplication, planLabelFills, scopeToApplication } from './fillPlan';
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
  const { jobPosting, headline, title, url } = reply.snapshot;
  if (!URL.canParse(url)) return {};
  const page = new URL(url);
  return {
    pageTitle: title.slice(0, 300),
    jobTitle: (jobPosting?.title || headline).slice(0, 300),
    company: jobPosting?.company?.slice(0, 300),
    jobDescription: jobPosting?.description?.slice(0, 5000),
    url: page.origin + page.pathname,
  };
}

export async function runAutofill(token: string, panel: FillPanel, signal: AbortSignal, demographics?: DemographicPreferences) {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined || !tab.url || !/^https?:\/\//i.test(tab.url)) return;
  const target = { tabId: tab.id, url: tab.url };
  await fillApplication(token, panel, signal, target, demographics);
}

async function fillApplication(
  token: string,
  panel: FillPanel,
  signal: AbortSignal,
  target: AutofillTarget,
  demographics?: DemographicPreferences,
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
  async function fillCombobox(
    field: { label: string; frame: number; form: number },
    choose: (options: string[]) => Promise<string | string[] | undefined>,
    search?: string,
    exact = false,
  ) {
    hooks.filling(field.label);
    const step = async (action: ComboboxStep['action'], value = '', expectedSelections?: string[]) => {
      if (stopped() && action !== 'clear') return;
      const reply = await ask({
        kind: 'COMBOBOX_STEP', target,
        step: {
          action, label: field.label, value, frame: field.frame, form: field.form,
          onlyEmpty: !expectedSelections?.length, expectedSelections, exact,
        },
      });
      return reply?.kind === 'COMBOBOX_REPLY' ? reply.reply : undefined;
    };
    let queried = false;
    try {
      const opened = (await step('open'))?.status === 'opened';
      let offer = opened ? await step('options') : undefined;
      let options = offer?.options ?? [];
      let chosen = options.length && !stopped() ? await choose(options) : undefined;
      if (search && (!chosen || (Array.isArray(chosen) && !chosen.length)) && !stopped() &&
          !isPrivateAutofillField({ ...field, options })) {
        queried = (await step('query', search))?.status === 'queried';
        if (queried) {
          offer = await step('options');
          options = offer?.options ?? [];
          chosen = options.length && !stopped() ? await choose(options) : undefined;
        }
      }
      if (!options.length || stopped()) return;
      const choices = Array.isArray(chosen) ? chosen : chosen ? [chosen] : [];
      if (!choices.length || (choices.length > 1 && !offer?.multiple)) return;
      const committed: string[] = [];
      for (const choice of choices) {
        if (stopped() || !options.includes(choice)) return;
        if (committed.length && (await step('open'))?.status !== 'opened') return;
        if ((await step('select', choice, committed.slice()))?.status !== 'selected') return;
        if ((await step('verify', choice))?.status !== 'verified') return;
        committed.push(choice);
        hooks.wrote();
      }
      hooks.answered(field.label, field.frame, field.form);
    } catch {
      if (!stopped()) issues.push(field.label);
    } finally {
      if (queried) await step('clear').catch(() => undefined);
      hooks.filling(null);
    }
  }
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
      panel.offerOverride((nextSignal) => fillApplication(token, panel, nextSignal, target, demographics, true));
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
    const uniqueFields = (fields: FramedField[], privateFields = false) => {
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
          !(field.type === 'radio' && !field.options?.length && /^(?:yes|no)$/i.test(normalizeLabel(field.label))) &&
          isPrivateAutofillField(field) === privateFields
        );
      });
    };
    const remaining = async () => {
      const reply = await ask({ kind: 'GET_FRAMED_FORM', target });
      return reply?.kind === 'FRAMED_FORM' ? uniqueFields(reply.fields) : [];
    };

    // Capture page context before writing any candidate data into the form.
    const contextRequest = jobContext(target);
    if (demographics?.enabled) {
      for (const field of uniqueFields(scoped, true)) {
        if (stopped()) return;
        const optionKey = field.type === 'checkbox' && !field.options?.length ? demographicOptionKey(field.label) : undefined;
        const key = optionKey ?? demographicKey(field.label);
        const saved = key
          ? demographics.answers[key] ?? (key === 'veteran' ? demographics.answers.protectedVeteran : undefined)
          : undefined;
        if (!key) {
          if (field.type === 'checkbox' && field.multiple && field.options?.length) {
            const choices = mixedDemographicChoices(demographics.answers, field.options);
            if (choices.length) {
              await walk([{ label: field.label, frame: field.frame, form: field.form, value: choices.join(', '), choices }]);
            }
          }
          continue;
        }
        if (!saved?.length) continue;
        if (field.combo) {
          await fillCombobox(field, async (options) => demographicChoices(key, saved, options), undefined, true);
        } else if (field.options?.length && (field.tag === 'select' || field.type === 'radio' || field.type === 'checkbox')) {
          const choices = demographicChoices(key, saved, field.options);
          if (choices.length && (field.multiple || choices.length === 1)) {
            await walk([{ label: field.label, frame: field.frame, form: field.form, value: choices.join(', '), choices }]);
          }
        } else if (field.type === 'checkbox' && (optionKey
          ? saved.some((answer) => demographicChoices(key, [answer], [field.label]).length)
          : demographicChoices(key, saved, [field.label]).length)) {
          await walk([{ label: field.label, frame: field.frame, form: field.form, value: 'true' }]);
        }
      }
    }
    if (stopped()) return;
    const { data: profile, meta } = await getAutofillSessionProfile(token, signal);
    if (stopped()) return;
    const values = profileToValues(profile);
    await walk(
      planLabelFills(
        uniqueFields(scoped).filter((field) => !field.combo),
        values,
        profile.authorized_countries
      )
    );
    if (stopped()) return;
    for (const field of await remaining()) {
      if (stopped()) return;
      const value = confirmedFieldValue(field.label, values, profile.authorized_countries).trim();
      if (!field.combo || !value) continue;
      await fillCombobox(field, async (options) => {
        if (isPrivateAutofillField({ ...field, options })) return;
        return offeredChoice(value, options, field.label);
      }, value);
    }

    if (stopped()) return;
    let fields = await remaining();
    if (!fields.length || stopped()) return;
    const candidateId = meta?.candidateId;
    if (!candidateId) {
      panel.notice('Save a confirmed candidate profile in the portal to use AI autofill.');
      return;
    }

    const bank = await getReusableAnswers(token, signal).catch(() => []);
    if (stopped()) return;
    const bankFills: LabelFill[] = [];
    for (const field of fields) {
      if (stopped()) return;
      const entry = findReusableAnswer(field.label, bank);
      if (!entry) continue;
      const facts = buildVerifiedFacts({ ...profile, expected_salary: profile.desired_salary },
        [{ question: field.label, answer: entry.answer }], meta?.screening);
      const descriptor = inferQuestionDescriptor(plannerField(field));
      const grounded = (value: string) => validateGroundedAnswer(value, facts, descriptor).action === 'fill';
      const choice = (options: string[]) => {
        const value = offeredChoice(entry.answer, options, field.label);
        return value && grounded(value) ? value : undefined;
      };
      if (field.combo) {
        await fillCombobox(field, async (options) =>
          isPrivateAutofillField({ ...field, options }) ? undefined : choice(options),
          grounded(entry.answer) ? entry.answer : undefined);
      } else {
        const value = field.options?.length ? choice(field.options) :
          /^(?:text|textarea|email|tel|url|number|date)$/.test(descriptor.type ?? '') && grounded(entry.answer)
            ? entry.answer : undefined;
        if (value) bankFills.push({ label: field.label, frame: field.frame, form: field.form, value });
      }
    }
    if (bankFills.length && !stopped()) await walk(bankFills);
    if (bank.length && !stopped()) fields = await remaining();
    if (!fields.length || stopped()) return;

    const [{ jobDescription, ...context }, settings] = await Promise.all([
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
    const candidates = fields.filter(
      (field) => !field.combo && !(field.tag === 'textarea' && isAutofillProse(field.label)),
    ).map(plannerField);
    // Keep each request within one server-side planner batch.
    const batchSize = 4;
    let consecutiveFailures = 0;
    let reportedPlanError = false;
    usedAi = true;
    for (let start = 0; start < candidates.length; start += batchSize) {
      if (stopped()) return;
      const batch = candidates.slice(start, start + batchSize);
      const byId = new Map(batch.map((field) => [field.id, field]));
      let plan: Awaited<ReturnType<typeof requestAutofillPlan>>;
      try {
        plan = await requestAutofillPlan({ candidateId, fields: batch, context }, token, signal);
        if (!plan.ok) throw new Error(plan.error || 'The server could not plan autofill.');
      } catch (error) {
        if (stopped()) return;
        if (error instanceof PlanRefused) {
          panel.refused(error);
          break;
        }
        if (!reportedPlanError) {
          const status = error instanceof ExtensionApiError ? error.status : undefined;
          const message = status === 504 ? 'AI planning timed out (HTTP 504).' :
            `AI planning could not complete a batch${status ? ` (HTTP ${status})` : ''}.`;
          panel.notice(`${message} Autofill will check the remaining fields.`);
          reportedPlanError = true;
        }
        if (++consecutiveFailures >= 2 ||
            (error instanceof ExtensionApiError && [401, 403, 429].includes(error.status))) break;
        continue;
      }
      if (stopped()) return;

      consecutiveFailures = 0;
      const plannedFills: LabelFill[] = [];
      for (const fill of plan.executableFills ?? []) {
        const field = fill.fieldId ? byId.get(fill.fieldId) : undefined;
        if (field && fill.grounded === true && typeof fill.value === 'string' && fill.value.trim()) {
          plannedFills.push({ label: field.label, value: fill.value, frame: field.frame, form: field.form });
        }
      }
      await walk(plannedFills);
    }
    if (stopped()) return;
    for (const field of await remaining()) {
      if (stopped()) return;
      if (!field.combo) continue;
      await fillCombobox(field, async (options) => {
        if (isPrivateAutofillField({ ...field, options })) return;
        const result = await requestAutofillChoice(
          { candidateId, question: plannerField(field), options },
          token,
          signal
        );
        return result.ok ? result.choice ?? undefined : undefined;
      });
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
            jobDescription,
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
