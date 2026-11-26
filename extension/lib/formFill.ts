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
  type PlanApiResponse,
} from './freehire';
import { isAutofillProse, isBlockedAutofillField, isPrivateAutofillField } from './autofillSafety';
import {
  inferQuestionDescriptor,
  type Field,
  type FormContext,
} from '../../src/lib/ai/planner';
import { extractCountryCodeFromLocation } from './countryResolver';
import { validateGroundedAnswer } from '../../src/lib/ai/grounded';
import { findReusableAnswer } from '../../src/lib/ai/reusable-answers';
import { buildVerifiedFacts } from '../../src/lib/ai/verified-facts';
import { asksVisaSponsorship, matchFieldKey, normalizeLabel, offeredChoice, workAuthorizationCountry } from './fieldKeys';
import { countryLabel } from './labels';
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

const CLIENT_429_RETRY_DELAY_MS = 1200;

async function waitForRetry(delayMs: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return false;
  if (delayMs <= 0) return true;
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve(!signal.aborted);
    }, delayMs);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function retryOnceOnRateLimit<T>(fn: () => Promise<T>, signal: AbortSignal): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (
      err instanceof ExtensionApiError &&
      (err.status === 429 || err.status === 503) &&
      (await waitForRetry(CLIENT_429_RETRY_DELAY_MS, signal))
    ) {
      return fn();
    }
    throw err;
  }
}

export interface AutofillDiagnostics {
  requiresReview: Array<{ fieldId?: string; label: string; value?: string; reason?: string }>;
  unresolved: Array<{
    fieldId?: string;
    label: string;
    reason?: string;
    reasonCode?: string;
    stage?: string;
    retryable?: boolean;
  }>;
}

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
  /** Structured diagnostics for fields requiring review or unresolved after planning. */
  diagnostics?(report: AutofillDiagnostics): void;
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

function fieldKey(field: { fieldId?: string; frame?: number; form?: number; label: string }) {
  if (field.fieldId) return `${field.frame ?? 0}:${field.fieldId}`;
  return `${field.frame}:${field.form}:${normalizeLabel(field.label)}`;
}

type CapturedPlannerField = Field & {
  id: string;
  placeholder?: string;
  section?: string;
  snapshotId?: string;
  currentValue?: string;
  userEdited?: boolean;
  optionsState?: FramedField['optionsState'];
  parentFieldIds?: string[];
};

function plannerField(field: FramedField): CapturedPlannerField {
  const id = field.fieldId ? `${field.frame}:${field.fieldId}` : `${field.frame}:${field.form}:${field.index}`;
  const currentValue = field.currentValue ?? field.value;
  return {
    id,
    label: field.label,
    ...(field.name ? { name: field.name } : {}),
    type: field.tag === 'textarea' ? 'textarea' : field.type,
    required: field.required,
    combo: field.combo,
    ...(field.multiple ? { multiple: true } : {}),
    options: field.options,
    ...(field.optionsState ? { optionsState: field.optionsState } : {}),
    frame: field.frame,
    form: field.form,
    ...(field.helperText ? { helperText: field.helperText } : {}),
    ...(field.placeholder ? { placeholder: field.placeholder } : {}),
    ...(field.section ? { section: field.section } : {}),
    ...(field.snapshotId ? { snapshotId: field.snapshotId } : {}),
    ...(currentValue ? { currentValue } : {}),
    ...(field.userEdited !== undefined ? { userEdited: field.userEdited } : {}),
    ...(field.parentFieldIds?.length ? { parentFieldIds: field.parentFieldIds } : {}),
    ...(field.widgetType ? { widgetType: field.widgetType } : {}),
  };
}

function isUpstreamLocationField(field: FramedField): boolean {
  const key = matchFieldKey(field.label, field);
  if (key === 'intendedWorkCountry' || key === 'country' || key === 'city' || key === 'location') return true;
  const desc = inferQuestionDescriptor(plannerField(field));
  return (
    desc.canonical_name === 'intended_work_country' ||
    desc.canonical_name === 'country' ||
    desc.canonical_name === 'location'
  );
}

function hasEarlierUnfilledLocation(fields: FramedField[], index: number, done?: ReadonlySet<string>): boolean {
  for (let i = 0; i < index; i++) {
    const candidate = fields[i];
    if (candidate && isUpstreamLocationField(candidate) && !done?.has(fieldKey(candidate))) return true;
  }
  return false;
}

function isLocationLinkedWorkAuth(label: string): boolean {
  return asksVisaSponsorship(label) || matchFieldKey(label) === 'visaSponsorshipNeeded' || Boolean(workAuthorizationCountry(label));
}

function splitCheckboxChoices(value: string, options?: string[]): string[] | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!options?.length) {
    const parts = trimmed.split(',').map((s) => s.trim()).filter(Boolean);
    return parts.length ? Array.from(new Set(parts)) : undefined;
  }
  const exact = options.find((opt) => opt === trimmed || opt.toLowerCase() === trimmed.toLowerCase());
  if (exact) return [exact];

  const sorted = options.toSorted((a, b) => b.length - a.length);
  const matched: string[] = [];
  let rest = trimmed;
  while (rest.length > 0) {
    rest = rest.replace(/^[,\s]+/, '');
    if (!rest) break;
    const hit =
      sorted.find((opt) => rest.startsWith(opt) && /^(?:\s*,\s*|$)/.test(rest.slice(opt.length))) ??
      sorted.find(
        (opt) =>
          rest.toLowerCase().startsWith(opt.toLowerCase()) &&
          /^(?:\s*,\s*|$)/.test(rest.slice(opt.length)),
      );
    if (!hit) break;
    if (!matched.includes(hit)) matched.push(hit);
    rest = rest.slice(hit.length);
  }
  if (matched.length > 0 && rest.replace(/^[,\s]+/, '').length === 0) {
    return matched;
  }

  const fallbackParts = trimmed.split(',').map((s) => s.trim()).filter(Boolean);
  const mapped: string[] = [];
  for (const part of fallbackParts) {
    const match = options.find((opt) => opt === part || opt.toLowerCase() === part.toLowerCase());
    if (!match) return undefined;
    if (!mapped.includes(match)) mapped.push(match);
  }
  return mapped.length ? mapped : undefined;
}

function unambiguousContextCountry(context: FormContext): string | undefined {
  const codes = new Set<string>();
  for (const raw of [context.jobTitle, context.pageTitle]) {
    if (!raw) continue;
    for (const segment of raw.split(/[-–—|,/()]+/)) {
      const token = segment.trim();
      if (!token) continue;
      if (/^[a-z]{2}$/i.test(token) && !/^(?:US|UK)$/.test(token)) continue;
      const code = extractCountryCodeFromLocation(token);
      if (code) codes.add(code);
    }
  }
  return codes.size === 1 ? Array.from(codes)[0] : undefined;
}

function fallbackLocationSearch(
  field: FramedField,
  profile: { location?: string; country?: string; intended_work_country?: string },
  values: Record<string, string>,
): string | undefined {
  if (!isUpstreamLocationField(field)) return undefined;
  const helper = field.helperText ?? '';
  if (/\bcity\b/i.test(helper) && profile.location?.trim()) {
    const location = profile.location.trim();
    if (matchFieldKey(field.label, field) !== 'intendedWorkCountry') return location;
    const country = values.intendedWorkCountry?.trim();
    const intended = extractCountryCodeFromLocation(country);
    const home = extractCountryCodeFromLocation(profile.country);
    const source = extractCountryCodeFromLocation(location);
    if (intended && (source ?? home) === intended) {
      return source ? location : [location, country].filter(Boolean).join(', ');
    }
  }
  const direct = values.intendedWorkCountry?.trim() || profile.country?.trim() || profile.location?.trim();
  return direct || undefined;
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
  const requiresReviewItems: AutofillDiagnostics['requiresReview'] = [];
  const unresolvedDiagnostics: AutofillDiagnostics['unresolved'] = [];
  const seenDiagnosticKeys = new Set<string>();
  const recordRequiresReview = (entry: AutofillDiagnostics['requiresReview'][number]) => {
    const diagKey = `review:${entry.fieldId ?? entry.label}`;
    if (seenDiagnosticKeys.has(diagKey)) return;
    seenDiagnosticKeys.add(diagKey);
    requiresReviewItems.push(entry);
  };
  const recordUnresolved = (entry: AutofillDiagnostics['unresolved'][number]) => {
    const diagKey = `unresolved:${entry.fieldId ?? entry.label}:${entry.reasonCode ?? ''}`;
    if (seenDiagnosticKeys.has(diagKey)) return;
    seenDiagnosticKeys.add(diagKey);
    unresolvedDiagnostics.push(entry);
  };
  let started = false;
  let usedAi = false;
  const hooks: WalkHooks = {
    ...panel.walk,
    stopped,
    answered(label, frame, form, fieldId) {
      done.add(fieldKey({ fieldId, label, frame, form }));
      panel.known(label);
      panel.walk.answered(label, frame, form, fieldId);
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
    field: { fieldId?: string; label: string; frame: number; form: number },
    choose: (options: string[]) => Promise<string | string[] | undefined>,
    search?: string,
    exact = false,
  ): Promise<string | undefined> {
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
          !isBlockedAutofillField({ ...field, options })) {
        queried = (await step('query', search))?.status === 'queried';
        if (queried) {
          offer = await step('options');
          options = offer?.options ?? [];
          chosen = options.length && !stopped() ? await choose(options) : undefined;
        }
      }
      if (!options.length || stopped()) return undefined;
      const choices = Array.isArray(chosen) ? chosen : chosen ? [chosen] : [];
      if (!choices.length || (choices.length > 1 && !offer?.multiple)) return undefined;
      const committed: string[] = [];
      let lastCommittedDisplay = '';
      for (const choice of choices) {
        if (stopped() || !options.includes(choice)) return undefined;
        if (committed.length && (await step('open'))?.status !== 'opened') return undefined;
        if ((await step('select', choice, committed.slice()))?.status !== 'selected') return undefined;
        const verified = await step('verify', choice);
        if (verified?.status !== 'verified') return undefined;
        const display = verified.committed?.trim() || choice;
        committed.push(choice);
        lastCommittedDisplay = display;
        hooks.wrote();
      }
      hooks.answered(field.label, field.frame, field.form, field.fieldId);
      return choices.length === 1 ? lastCommittedDisplay : committed.join(', ');
    } catch (err) {
      if (err instanceof PlanRefused || (err instanceof ExtensionApiError && [401, 403, 429].includes(err.status))) {
        throw err;
      }
      if (!stopped()) issues.push(field.label);
      return undefined;
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
    const knownFieldIds = new Set(scoped.map((f) => plannerField(f).id));
    const committedParentsByScope = new Map<string, string[]>();
    const dynamicParentsByFieldId = new Map<string, string[]>();
    const scopeSectionKey = (f: { frame: number; form: number; section?: string }) =>
      `${f.frame}:${f.form}:${f.section ?? ''}`;
    const recordCommittedParent = (f: FramedField) => {
      const pid = plannerField(f).id;
      for (const key of [scopeSectionKey(f), `${f.frame}:${f.form}`]) {
        const list = committedParentsByScope.get(key) ?? [];
        if (!list.includes(pid)) list.push(pid);
        committedParentsByScope.set(key, list);
      }
    };
    const uniqueFields = (fields: FramedField[]) => {
      const counts = new Map<string, number>();
      for (const field of fields) {
        const key = fieldKey(field);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      return fields.filter((field) => {
        const key = fieldKey(field);
        const currentVal = (field.currentValue ?? field.value).trim();
        return (
          scopes.has(`${field.frame}:${field.form}`) &&
          counts.get(key) === 1 &&
          !done.has(key) &&
          !field.userEdited &&
          !currentVal &&
          field.label.trim() &&
          field.label.length <= 2000 &&
          !(field.type === 'radio' && !field.options?.length && /^(?:yes|no)$/i.test(normalizeLabel(field.label))) &&
          !isBlockedAutofillField(field)
        );
      });
    };
    const previouslyResolved: Record<string, string> = {};
    const recordResolvedFromForm = (allFields: FramedField[]) => {
      for (const f of allFields) {
        const val = (f.currentValue ?? f.value).trim();
        if (scopes.has(`${f.frame}:${f.form}`) && !isBlockedAutofillField(f) && val) {
          previouslyResolved[f.label] = val;
        }
      }
    };
    const attachConditionalParents = (allFields: FramedField[]): FramedField[] =>
      allFields.map((f) => {
        if (!scopes.has(`${f.frame}:${f.form}`)) return f;
        const id = plannerField(f).id;
        if (!knownFieldIds.has(id)) {
          knownFieldIds.add(id);
          const parents =
            committedParentsByScope.get(scopeSectionKey(f)) ??
            committedParentsByScope.get(`${f.frame}:${f.form}`);
          if (parents?.length) {
            dynamicParentsByFieldId.set(id, [...parents]);
          }
        }
        const extra = dynamicParentsByFieldId.get(id);
        if (!extra?.length) return f;
        const merged = Array.from(new Set([...(f.parentFieldIds ?? []), ...extra]));
        return { ...f, parentFieldIds: merged };
      });
    const remaining = async () => {
      const reply = await ask({ kind: 'GET_FRAMED_FORM', target });
      if (reply?.kind !== 'FRAMED_FORM') return [];
      const annotated = attachConditionalParents(reply.fields);
      recordResolvedFromForm(annotated);
      return uniqueFields(annotated);
    };

    // Capture page context before writing any candidate data into the form.
    const contextRequest = jobContext(target);
    if (stopped()) return;
    const { data: profile, meta } = await getAutofillSessionProfile(token, signal);
    if (stopped()) return;
    const values = profileToValues(profile);
    const initialUnfilled = uniqueFields(scoped);
    const phaseALabelFields = initialUnfilled.filter(
      (field) => !field.combo && !isLocationLinkedWorkAuth(field.label),
    );
    await walk(planLabelFills(phaseALabelFields, values, profile.authorized_countries));
    for (const f of phaseALabelFields) {
      if (done.has(fieldKey(f))) recordCommittedParent(f);
    }
    if (stopped()) return;
    const phaseARemaining = await remaining();
    for (let i = 0; i < phaseARemaining.length; i++) {
      if (stopped()) return;
      const field = phaseARemaining[i];
      if (!field) continue;
      if (isLocationLinkedWorkAuth(field.label)) continue;
      const confirmedValue = confirmedFieldValue(field.label, values, profile.authorized_countries, field).trim();
      const value = confirmedValue && /\bcity\b/i.test(field.helperText ?? '')
        ? fallbackLocationSearch(field, profile, values) ?? confirmedValue : confirmedValue;
      if (!field.combo || !value) continue;
      const committed = await fillCombobox(field, async (options) => {
        if (isPrivateAutofillField({ ...field, options })) return;
        return offeredChoice(value, options, field.label);
      }, value);
      if (committed) recordCommittedParent(field);
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
    for (let i = 0; i < fields.length; i++) {
      if (stopped()) return;
      const field = fields[i];
      if (!field) continue;
      if (isPrivateAutofillField(field)) continue;
      if (hasEarlierUnfilledLocation(fields, i, done) && isLocationLinkedWorkAuth(field.label)) continue;
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

    const attemptedPhaseBKeys = new Set<string>();
    const committedByFieldId = new Map<string, string>();
    const failedFieldIds = new Set<string>();
    const failedLocationFields: FramedField[] = [];
    const batchSize = 5;
    const maxPhaseBPasses = 4;
    let reportedPlanError = false;
    let abortAiPlanning = false;
    usedAi = true;

    const markFailedField = (field: FramedField) => {
      const id = plannerField(field).id;
      failedFieldIds.add(id);
      if (isUpstreamLocationField(field) && !failedLocationFields.some((f) => plannerField(f).id === id)) {
        failedLocationFields.push(field);
      }
    };

    const findFailedEarlierLocation = (field: FramedField): FramedField | undefined => {
      let latest: FramedField | undefined;
      for (const loc of failedLocationFields) {
        if (loc.frame === field.frame && loc.form === field.form && loc.index < field.index) {
          if (!latest || loc.index > latest.index) latest = loc;
        }
      }
      return latest;
    };

    const reportBatchError = (error: unknown): boolean => {
      if (error instanceof PlanRefused) {
        panel.refused(error);
        return true;
      }
      if (!reportedPlanError) {
        const status = error instanceof ExtensionApiError ? error.status : undefined;
        const reason =
          error instanceof ExtensionApiError
            ? error.message.replace(/\s*\(HTTP \d+\)$/, '').trim()
            : '';
        const unavailableReasons: Record<string, string> = {
          AI_NOT_CONFIGURED: 'Server AI has no provider key configured (HTTP 503).',
          CONFIG_UNAVAILABLE: 'NextKinHR could not load AI provider settings (HTTP 503). Retry shortly.',
          UPSTREAM_UNAVAILABLE: 'The AI provider is unavailable (HTTP 503). Run Test Connection in AI Provider Settings or retry shortly.',
        };
        const code = error instanceof ExtensionApiError ? error.code : undefined;
        const message =
          status === 503
            ? code && Object.hasOwn(unavailableReasons, code)
              ? unavailableReasons[code]
              : 'NextKinHR could not complete AI planning (HTTP 503). Retry shortly.'
            : status === 504
              ? 'AI planning timed out (HTTP 504).'
              : status === 429
                ? 'AI provider rate-limited a batch (HTTP 429). Wait a moment or switch AI models in AI Provider Settings;'
                : reason && (!status || !reason.includes(`HTTP ${status}`))
                  ? `${reason}${status ? ` (HTTP ${status})` : ''}.`
                  : `AI planning could not complete a batch${status ? ` (HTTP ${status})` : ''}.`;
        panel.notice(
          status === 429
            ? `${message} autofill will still check the remaining fields.`
            : `${message} Autofill will check the remaining fields.`,
        );
        reportedPlanError = true;
      }
      // Only abort the entire AI pass on hard auth failures (401/403) or billing/plan refusals.
      // Transient 429 rate limits isolate the batch/combo so subsequent fields and prose answers still run.
      return error instanceof ExtensionApiError && [401, 403].includes(error.status);
    };

    const replanSingleField = async (
      pField: Field & { id: string },
      extraResolved?: Record<string, string>,
    ): Promise<NonNullable<PlanApiResponse['executableFills']>[number] | undefined> => {
      try {
        const replan = await retryOnceOnRateLimit(
          () =>
            requestAutofillPlan(
              {
                candidateId,
                fields: [pField],
                context: {
                  ...context,
                  previouslyResolved: { ...previouslyResolved, ...extraResolved },
                },
              },
              token,
              signal,
            ),
          signal,
        );
        if (!replan.ok) return undefined;
        return (replan.executableFills ?? []).find(
          (f) => f.fieldId === pField.id && f.grounded === true && typeof f.value === 'string' && f.value.trim(),
        );
      } catch (err) {
        if (stopped()) return undefined;
        if (reportBatchError(err)) {
          abortAiPlanning = true;
        }
        return undefined;
      }
    };

    const runPhaseBCombo = async (field: FramedField, search?: string): Promise<string | undefined> => {
      const id = plannerField(field).id;
      try {
        const committed = await fillCombobox(
          field,
          async (options) => {
            if (isBlockedAutofillField({ ...field, options })) return;
            const result = await retryOnceOnRateLimit(
              () =>
                requestAutofillChoice(
                  {
                    candidateId,
                    question: plannerField(field),
                    options,
                    context: {
                      ...context,
                      ...(field.helperText ? { helperText: field.helperText } : {}),
                      previouslyResolved: { ...previouslyResolved },
                    },
                  },
                  token,
                  signal,
                ),
              signal,
            );
            return result.ok ? result.choice ?? undefined : undefined;
          },
          search,
        );
        if (committed) {
          committedByFieldId.set(id, committed);
          previouslyResolved[field.label] = committed;
          recordCommittedParent(field);
        } else {
          markFailedField(field);
        }
        return committed;
      } catch (err) {
        if (stopped()) return undefined;
        markFailedField(field);
        if (reportBatchError(err)) {
          abortAiPlanning = true;
        }
        return undefined;
      }
    };

    for (let pass = 0; pass < maxPhaseBPasses; pass++) {
      if (stopped() || abortAiPlanning) break;
      const passFields = pass === 0 ? fields : await remaining();
      if (stopped()) return;
      const candidates = passFields.filter(
        (field) =>
          !attemptedPhaseBKeys.has(fieldKey(field)) &&
          !isBlockedAutofillField(field) &&
          !(field.tag === 'textarea' && isAutofillProse(field.label)),
      );
      if (!candidates.length) break;

      let wroteInPass = false;
      for (let start = 0; start < candidates.length; start += batchSize) {
        if (stopped() || abortAiPlanning) break;
        const batch = candidates.slice(start, start + batchSize);
        for (const field of batch) attemptedPhaseBKeys.add(fieldKey(field));
        const plannedBatch = batch.map(plannerField);
        const byId = new Map(batch.map((field) => [plannerField(field).id, field]));
        const byLabel = new Map(batch.map((field) => [normalizeLabel(field.label), field]));

        let plan: PlanApiResponse;
        try {
          plan = await retryOnceOnRateLimit(
            () =>
              requestAutofillPlan(
                {
                  candidateId,
                  fields: plannedBatch,
                  context: { ...context, previouslyResolved: { ...previouslyResolved } },
                },
                token,
                signal,
              ),
            signal,
          );
          if (!plan.ok) throw new Error(plan.error || 'The server could not plan autofill.');
        } catch (error) {
          if (stopped()) return;
          if (reportBatchError(error)) {
            abortAiPlanning = true;
            break;
          }
          // Batch fault isolation: continue handling comboboxes from this failed batch before moving to the next batch.
          for (const field of batch) {
            if (stopped() || abortAiPlanning) break;
            if (field.combo) {
              if (
                isLocationLinkedWorkAuth(field.label) &&
                findFailedEarlierLocation(field) &&
                !unambiguousContextCountry(context)
              ) {
                markFailedField(field);
                continue;
              }
              const committed = await runPhaseBCombo(field, fallbackLocationSearch(field, profile, values));
              if (committed) wroteInPass = true;
            } else if (isUpstreamLocationField(field)) {
              markFailedField(field);
            }
          }
          continue;
        }
        if (stopped()) return;

        const fillById = new Map<string, NonNullable<PlanApiResponse['executableFills']>[number]>();
        for (const fill of plan.executableFills ?? []) {
          const targetField = fill.fieldId
            ? byId.get(fill.fieldId)
            : byLabel.get(normalizeLabel(fill.label));
          if (!targetField) continue;
          const requiresReview = (fill as typeof fill & { requiresReview?: boolean }).requiresReview === true;
          if (requiresReview) {
            recordRequiresReview({
              fieldId: plannerField(targetField).id,
              label: targetField.label,
              value: fill.value,
              reason: 'Requires manual review before filling',
            });
            recordUnresolved({
              fieldId: plannerField(targetField).id,
              label: targetField.label,
              reason: 'Requires manual review before filling',
              reasonCode: 'REQUIRES_REVIEW',
              stage: 'planner',
              retryable: false,
            });
            continue;
          }
          if (fill.grounded === true && typeof fill.value === 'string' && fill.value.trim()) {
            fillById.set(plannerField(targetField).id, fill);
          }
        }
        for (const fill of plan.fills ?? []) {
          const requiresReview = (fill as typeof fill & { requiresReview?: boolean }).requiresReview === true;
          if (!requiresReview) continue;
          const targetField = fill.fieldId
            ? byId.get(fill.fieldId)
            : byLabel.get(normalizeLabel(fill.label));
          recordRequiresReview({
            fieldId: fill.fieldId ?? (targetField ? plannerField(targetField).id : undefined),
            label: targetField?.label ?? fill.label,
            value: fill.value,
            reason: 'Requires manual review before filling',
          });
        }
        const planUnresolved = (plan as PlanApiResponse & {
          unresolved?: AutofillDiagnostics['unresolved'];
        }).unresolved;
        for (const item of planUnresolved ?? []) {
          recordUnresolved(item);
        }

        const deferredPlanById = new Map<string, NonNullable<PlanApiResponse['deferredPlans']>[number]>();
        for (const dp of plan.deferredPlans ?? []) {
          const targetField = dp.fieldId
            ? byId.get(dp.fieldId)
            : byLabel.get(normalizeLabel(dp.label));
          if (targetField) {
            deferredPlanById.set(plannerField(targetField).id, dp);
          }
        }
        for (const defId of plan.deferredFieldIds ?? []) {
          const targetField = byId.get(defId);
          if (targetField && !deferredPlanById.has(defId)) {
            deferredPlanById.set(defId, { fieldId: defId, label: targetField.label });
          }
        }
        const hasExplicitDeferred = Array.isArray(plan.deferredPlans) || Array.isArray(plan.deferredFieldIds);

        const batchTentativeValueById = new Map<string, string>();
        for (const [id, dp] of deferredPlanById.entries()) {
          if (dp.searchQuery) batchTentativeValueById.set(id, dp.searchQuery);
        }
        for (const [id, f] of fillById.entries()) {
          if (!batchTentativeValueById.has(id)) batchTentativeValueById.set(id, f.value);
        }

        for (const field of batch) {
          if (stopped() || abortAiPlanning) break;
          const pField = plannerField(field);
          const id = pField.id;

          if (field.combo) {
            let dp = deferredPlanById.get(id);
            if (!dp) {
              if (hasExplicitDeferred) {
                markFailedField(field);
                continue;
              }
              dp = { fieldId: id, label: field.label };
            }
            const failedEarlierLoc = !dp.dependsOnFieldId && isLocationLinkedWorkAuth(field.label)
              ? findFailedEarlierLocation(field)
              : undefined;
            const depId = dp.dependsOnFieldId ?? (failedEarlierLoc ? plannerField(failedEarlierLoc).id : undefined);
            if (depId && failedFieldIds.has(depId) && !unambiguousContextCountry(context)) {
              markFailedField(field);
              continue;
            }
            const searchQuery = dp.searchQuery ?? fallbackLocationSearch(field, profile, values);
            const committed = await runPhaseBCombo(field, searchQuery);
            if (committed) wroteInPass = true;
            continue;
          }

          let fill = fillById.get(id);
          if (!fill) {
            if (isUpstreamLocationField(field)) markFailedField(field);
            continue;
          }

          const failedEarlierLoc = !fill.dependsOnFieldId && isLocationLinkedWorkAuth(field.label)
            ? findFailedEarlierLocation(field)
            : undefined;
          const depId = fill.dependsOnFieldId ?? (failedEarlierLoc ? plannerField(failedEarlierLoc).id : undefined);
          if (depId) {
            if (failedFieldIds.has(depId)) {
              const ctxCountry = unambiguousContextCountry(context);
              if (!ctxCountry) {
                markFailedField(field);
                continue;
              }
              const tentativeVal = batchTentativeValueById.get(depId);
              const tentativeCountry = tentativeVal ? extractCountryCodeFromLocation(tentativeVal) : undefined;
              if (ctxCountry !== tentativeCountry) {
                const depLabel = byId.get(depId)?.label ?? failedEarlierLoc?.label ?? 'work location';
                const updated = await replanSingleField(pField, { [depLabel]: countryLabel(ctxCountry) });
                if (abortAiPlanning) break;
                if (!updated) {
                  markFailedField(field);
                  continue;
                }
                fill = updated;
              }
            } else if (byId.has(depId)) {
              const committedVal = committedByFieldId.get(depId);
              if (committedVal !== undefined) {
                const tentativeVal = batchTentativeValueById.get(depId);
                const committedCountry = extractCountryCodeFromLocation(committedVal);
                const tentativeCountry = tentativeVal ? extractCountryCodeFromLocation(tentativeVal) : undefined;
                if (committedCountry !== tentativeCountry || (!committedCountry && committedVal !== tentativeVal)) {
                  const updated = await replanSingleField(pField);
                  if (abortAiPlanning) break;
                  if (!updated) {
                    markFailedField(field);
                    continue;
                  }
                  fill = updated;
                }
              }
            }
          }

          let choices: string[] | undefined;
          if (field.widgetType === 'checkbox_group' || field.multiple) {
            choices = splitCheckboxChoices(fill.value, field.options);
            if (!choices?.length && field.options?.length) continue;
          }
          const labelFill: LabelFill = {
            ...(field.fieldId ? { fieldId: field.fieldId } : {}),
            label: field.label,
            value: choices ? choices.join(', ') : fill.value,
            frame: field.frame,
            form: field.form,
            ...(choices ? { choices } : {}),
          };
          await walk([labelFill]);
          if (done.has(fieldKey(field))) {
            wroteInPass = true;
            committedByFieldId.set(id, labelFill.value);
            previouslyResolved[field.label] = labelFill.value;
            recordCommittedParent(field);
          } else {
            markFailedField(field);
          }
        }
      }

      if (!wroteInPass) break;
    }

    if (stopped() || abortAiPlanning) return;

    if (stopped()) return;
    for (const field of await remaining()) {
      if (stopped()) return;
      if (field.tag !== 'textarea' || field.combo || !isAutofillProse(field.label)) continue;
      hooks.filling(field.label);
      try {
        const result = await retryOnceOnRateLimit(
          () =>
            generateAutofillAnswer(
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
            ),
          signal,
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
      if (requiresReviewItems.length) {
        panel.notice(`Review required before filling: ${nameSome(requiresReviewItems.map((r) => r.label))}.`);
      }
      panel.diagnostics?.({
        requiresReview: requiresReviewItems,
        unresolved: unresolvedDiagnostics,
      });
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
