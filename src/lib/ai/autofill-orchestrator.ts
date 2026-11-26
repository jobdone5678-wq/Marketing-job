/**
 * NextKinHR AI Autofill Engine: Server-Enforced Orchestrator Service
 *
 * Implements server-side planning and combobox option choice:
 * - Checks SERVER_ENABLE_STRUCTURED_AI_PLANNER feature flag (default true)
 * - Verifies candidate ownership against authenticated actor (auth.uid())
 * - Resolves AI credentials (portal BYOK with AAD decryption & SSRF guard, or server default)
 * - Enforces zero-silent-fallback on BYOK authentication failures (returns 401)
 * - Executes NextKinHR planFormBatch and chooseComboboxOption with typed grounding validation
 */

import { setTimeout as delayTimer } from 'node:timers/promises';
import { isVercelAiSdkEnabled, resolveDefaultServerAiConfig } from './server-ai-config';
import { decryptSecret } from './encryption';
import { createSafeAgent, type DnsLookupFn } from './ssrf-guard';
import { createSsrfSafeFetch } from './ssrf-fetch-adapter';
import {
  ProviderClient,
  ProviderError,
  redactSensitiveText,
  type TokenUsageTelemetry,
} from './provider-client';
import { ServerVercelProviderClient } from './server-provider-client';
import { buildVerifiedFacts } from './verified-facts';
import {
  planFormBatch,
  type Field,
  type Fill,
  type FormContext,
  type PlanResult,
  type UnresolvedDiagnostic,
} from './planner';
import { chooseComboboxOption } from './chooser';
import { isBlockedAutofillField } from './autofill-field-safety';
import { isUnreviewedResume } from '../candidate/confirmed-facts';
import { listScreeningAnswerBank } from '../candidate/answerbank';
import { listExperienceBank } from '../candidate/experience';
import { getDemographicPreferences } from '../candidate/demographic-preferences-store';
import { getScreeningAnswers, resolveAutofillScreening } from '../ingest/screeninganswers';
import { getUserAiProviderSecret } from './ai-provider-data';
import { experienceSkillQuestion } from './grounded';
import { findReusableAnswer } from './reusable-answers';
import { requestJevChoice } from './jev-choice';

export { isVercelAiSdkEnabled, resolveDefaultServerAiConfig } from './server-ai-config';

export class OrchestratorError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 500, code = 'ORCHESTRATOR_ERROR') {
    super(message);
    this.name = 'OrchestratorError';
    this.status = status;
    this.code = code;
  }
}

import type {
  PlanApiRequest,
  ChooseApiRequest,
  PlanApiResponse,
  ChooseApiResponse,
} from './autofill-api-types';
export type {
  PlanApiRequest,
  ChooseApiRequest,
  PlanApiResponse,
  ChooseApiResponse,
};

export interface OrchestratorOptions {
  db?: any;
  fetchFn?: typeof fetch;
  dnsLookup?: DnsLookupFn;
  rateLimitRetryDelaysMs?: number[];
  signal?: AbortSignal;
  globalDeadlineMs?: number;
}

const DEFAULT_RATE_LIMIT_RETRY_DELAYS_MS = [1500, 2500];
const DEFAULT_GLOBAL_DEADLINE_MS = 50_000;

function isUpstreamTransientError(err: unknown): err is ProviderError {
  return (
    err instanceof ProviderError &&
    (err.status === 429 ||
      err.status === 503 ||
      err.code === 'RATE_LIMIT' ||
      err.statusCode === 'RATE_LIMITED' ||
      err.statusCode === 'NETWORK_ERROR') &&
    err.status !== 401 &&
    err.status !== 403 &&
    err.status !== 404 &&
    err.status !== 400 &&
    err.code !== 'REDIRECT_BLOCKED' &&
    err.code !== 'SSRF_BLOCKED'
  );
}

function isUpstreamRateLimitError(err: unknown): err is ProviderError {
  return (
    err instanceof ProviderError &&
    (err.status === 429 || err.code === 'RATE_LIMIT' || err.statusCode === 'RATE_LIMITED')
  );
}

function isUpstreamUnavailableError(err: unknown): err is ProviderError {
  return err instanceof ProviderError && err.status === 503;
}

export async function withUpstreamTransientRetry<T>(
  run: () => Promise<T>,
  delaysMs: number[] = DEFAULT_RATE_LIMIT_RETRY_DELAYS_MS,
  signal?: AbortSignal,
  deadlineAt?: number,
): Promise<T> {
  let attempt = 0;
  while (true) {
    if (signal?.aborted) {
      throw new ProviderError('Request was aborted', 499, 'ABORTED', undefined, 'ABORTED');
    }
    if (deadlineAt !== undefined && Date.now() >= deadlineAt) {
      throw new ProviderError('Autofill global deadline exceeded', 504, 'TIMEOUT', undefined, 'TIMEOUT');
    }
    try {
      return await run();
    } catch (err) {
      if (!isUpstreamTransientError(err) || attempt >= delaysMs.length || signal?.aborted) {
        throw err;
      }
      const rawDelay = Math.max(0, delaysMs[attempt] ?? 0);
      const remaining = deadlineAt !== undefined ? deadlineAt - Date.now() : Infinity;
      if (remaining <= 0) {
        throw new ProviderError('Autofill global deadline exceeded', 504, 'TIMEOUT', undefined, 'TIMEOUT');
      }
      const delay = Math.min(rawDelay, remaining);
      attempt += 1;
      if (delay > 0) {
        await delayTimer(delay, undefined, { signal });
      }
    }
  }
}

/**
 * Checks server feature flag SERVER_ENABLE_STRUCTURED_AI_PLANNER.
 * Enabled by default (undefined or 'true'); disabled if set to 'false' or '0'.
 */
export function checkFeatureFlag(): void {
  const flag = process.env.SERVER_ENABLE_STRUCTURED_AI_PLANNER;
  if (flag === 'false' || flag === '0') {
    throw new OrchestratorError(
      'Structured AI planner is disabled on this server',
      403,
      'FEATURE_DISABLED'
    );
  }
}

async function getDb(options?: OrchestratorOptions): Promise<any> {
  if (options?.db) return options.db;
  const admin = await import('@/lib/db/admin');
  return admin.database();
}

async function loadDemographicPreferencesSafe(actorId: string, db: any) {
  try {
    return await getDemographicPreferences(actorId, db);
  } catch (err: any) {
    const msg = String(err?.message || '').toLowerCase();
    if (
      err?.code === '42P01' ||
      err?.code === 'PGRST205' ||
      msg.includes('does not exist') ||
      msg.includes('no such table') ||
      msg.includes('unknown table') ||
      msg.includes('not implemented')
    ) {
      return { enabled: false, answers: {} };
    }
    throw err;
  }
}

async function loadProfileFallback(actorId: string, db: any): Promise<Record<string, unknown> | undefined> {
  try {
    const { data, error } = await db
      .from('profiles')
      .select('full_name, email, candidate_contacts')
      .eq('id', actorId)
      .maybeSingle();
    if (error || !data || typeof data !== 'object') return undefined;
    return data as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

async function loadVerifiedFacts(actorId: string, candidate: Parameters<typeof buildVerifiedFacts>[0], fields: Field[], db: any) {
  const skillsAsked = new Set(fields.map((field) => experienceSkillQuestion(field.label)).filter(Boolean));
  const [typedScreening, entries, experience, demographics, profileFallback] = await Promise.all([
    getScreeningAnswers(actorId, db),
    listScreeningAnswerBank(actorId, { db, sendableOnly: true }),
    skillsAsked.size ? listExperienceBank(actorId, { db, tailorableOnly: true }) : undefined,
    loadDemographicPreferencesSafe(actorId, db),
    loadProfileFallback(actorId, db),
  ]);
  const profileContacts =
    profileFallback?.candidate_contacts && typeof profileFallback.candidate_contacts === 'object'
      ? (profileFallback.candidate_contacts as Record<string, unknown>)
      : undefined;
  const fallbackName =
    (typeof profileContacts?.full_name === 'string' && profileContacts.full_name.trim()) ||
    (typeof profileFallback?.full_name === 'string' && profileFallback.full_name.trim()) ||
    undefined;
  const currentName = typeof candidate.full_name === 'string' ? candidate.full_name.trim() : '';
  const hydratedCandidate: Parameters<typeof buildVerifiedFacts>[0] = {
    ...candidate,
    ...((!currentName || currentName.toLowerCase() === 'applicant') && fallbackName ? { full_name: fallbackName } : {}),
    ...(!candidate.email && (profileContacts?.email || profileFallback?.email)
      ? { email: String(profileContacts?.email || profileFallback?.email) }
      : {}),
    ...(!candidate.phone && profileContacts?.phone ? { phone: String(profileContacts.phone) } : {}),
  };
  const answers = fields.flatMap(({ label }) => {
    const entry = findReusableAnswer(label, entries);
    return entry ? [{ question: label, answer: entry.answer }] : [];
  });
  const screening = resolveAutofillScreening(typedScreening, candidate.confirmed_facts?.screeningAnswers);
  const facts = buildVerifiedFacts(hydratedCandidate, answers, screening, demographics);
  const skills = new Set(experience?.atoms.flatMap((atom) => {
    if (atom.provenance !== 'manual' && atom.provenance !== 'stated_in_chat') return [];
    return (atom.skills ?? []).map((skill) => skill.trim().toLowerCase()).filter((skill) => skillsAsked.has(skill));
  }));
  if (skills.size) {
    const id = 'experience_bank.skills';
    facts.set(id, {
      id,
      value: [...skills],
      type: 'string[]',
      category: 'skill',
      source: 'experience_bank',
      provenance: 'user_confirmed',
    });
  }
  return facts;
}

/**
 * Resolves the appropriate ProviderClient for the authenticated actor.
 * For portal BYOK, decrypts secret using AAD (userId:origin) and binds socket IP via SSRF safe agent.
 * For default mode, routes via server .env keys.
 * Fails with 401 if BYOK secret is missing, corrupted, or rejected by upstream provider.
 */
export async function resolveProviderClient(
  actorId: string,
  options?: OrchestratorOptions
): Promise<ProviderClient> {
  const db = await getDb(options);
  const config = await loadProviderConfig(actorId, db);
  return buildProviderClient(actorId, db, config, options);
}

async function loadProviderConfig(actorId: string, db: any) {
  const { data: config, error: configError } = await db
    .from('user_ai_provider_configs')
    .select('*')
    .eq('user_id', actorId)
    .maybeSingle();
  if (configError) {
    throw new OrchestratorError('Could not load AI provider settings', 503, 'CONFIG_UNAVAILABLE');
  }
  return config;
}

function isPortalMode(config: Awaited<ReturnType<typeof loadProviderConfig>>): boolean {
  return Boolean(config && config.mode !== 'server' && (
    config.mode === 'portal' || config.mode === 'portal_byok' || config.routing === 'portal' ||
    config.routing === 'proxy' || config.credential_source === 'portal'
  ));
}

async function buildProviderClient(
  actorId: string,
  db: any,
  config: Awaited<ReturnType<typeof loadProviderConfig>>,
  options?: OrchestratorOptions,
): Promise<ProviderClient> {
  if (config?.mode === 'extension_byok' || config?.mode === 'local') {
    throw new OrchestratorError(
      'Select Server or Portal API key to use NextKinHR AI autofill.',
      422,
      'DIRECT_PROVIDER_MODE',
    );
  }

  if (isPortalMode(config)) {
    // 2. Portal BYOK mode
    const secret = await getUserAiProviderSecret(actorId, db);

    if (!secret || !secret.encrypted_api_key || !secret.iv || !secret.auth_tag) {
      throw new OrchestratorError(
        'Custom provider authentication failed',
        401,
        'AUTH_FAILED'
      );
    }

    let apiKey: string;
    try {
      const destination = new URL(config.base_url || secret.key_origin);
      if (destination.origin !== new URL(secret.key_origin).origin) throw new Error('Provider origin changed');
      apiKey = decryptSecret(
        {
          encrypted: secret.encrypted_api_key,
          iv: secret.iv,
          authTag: secret.auth_tag,
        },
        actorId,
        secret.key_origin
      );
    } catch {
      throw new OrchestratorError(
        'Custom provider authentication failed',
        401,
        'AUTH_FAILED'
      );
    }

    const targetUrl = config.base_url || secret.key_origin;
    let safeAgent;
    try {
      safeAgent = await createSafeAgent(targetUrl, {
        allowCustom: true,
        dnsLookup: options?.dnsLookup,
      });
    } catch (err: any) {
      throw new OrchestratorError(
        err.message || 'SSRF verification failed',
        400,
        'SSRF_BLOCKED'
      );
    }

    const useSdk = isVercelAiSdkEnabled();
    const ClientClass = useSdk ? ServerVercelProviderClient : ProviderClient;
    return new ClientClass({
      baseUrl: safeAgent.validatedUrl,
      apiKey,
      model: config.model_id || 'default',
      agent: safeAgent.agent,
      timeoutMs: 45_000,
      fetchFn: useSdk ? options?.fetchFn : createSsrfSafeFetch(safeAgent, options?.fetchFn),
    });
  }

  // 3. Default server provider
  const { baseUrl: defaultBaseUrl, apiKey: defaultApiKey, model: defaultModel } =
    resolveDefaultServerAiConfig();

  if (
    !defaultApiKey &&
    !options?.fetchFn &&
    !/^https?:\/\/(localhost|127\.0\.0\.1)\b/i.test(defaultBaseUrl)
  ) {
    throw new OrchestratorError(
      'Server AI is not configured. Add OPENAI_API_KEY, AI_PROVIDER_DEFAULT_API_KEY, or AI_GATEWAY_API_KEY (or use Portal API key mode).',
      503,
      'AI_NOT_CONFIGURED'
    );
  }

  let safeAgent;
  try {
    safeAgent = await createSafeAgent(defaultBaseUrl, {
      allowCustom: true,
      dnsLookup: options?.dnsLookup,
    });
  } catch (err: any) {
    throw new OrchestratorError(
      err.message || 'SSRF verification failed for server provider',
      500,
      'SSRF_BLOCKED'
    );
  }

  const useSdk = isVercelAiSdkEnabled();
  const ClientClass = useSdk ? ServerVercelProviderClient : ProviderClient;
  return new ClientClass({
    baseUrl: safeAgent.validatedUrl,
    apiKey: defaultApiKey,
    model: defaultModel,
    agent: safeAgent.agent,
    timeoutMs: 45_000,
    fetchFn: useSdk ? options?.fetchFn : createSsrfSafeFetch(safeAgent, options?.fetchFn),
  });
}

/**
 * Executes batch form planning on the server.
 */
export async function executePlan(
  req: PlanApiRequest,
  actorId: string,
  options?: OrchestratorOptions
): Promise<PlanApiResponse> {
  checkFeatureFlag();

  if (!req || !req.candidateId) {
    throw new OrchestratorError('candidateId is required', 400, 'BAD_REQUEST');
  }

  const db = await getDb(options);
  const { data: candidate, error } = await db
    .from('candidates')
    .select('*')
    .eq('id', req.candidateId)
    .eq('user_id', actorId)
    .maybeSingle();

  if (error || !candidate) {
    throw new OrchestratorError(
      'Candidate not found or unauthorized',
      404,
      'NOT_FOUND'
    );
  }
  if (candidate.provenance_status !== 'confirmed' || isUnreviewedResume(candidate.confirmed_facts ?? {})) {
    throw new OrchestratorError('Save a confirmed candidate profile before using AI autofill.', 422);
  }

  const deadlineAt =
    options?.globalDeadlineMs !== undefined
      ? Date.now() + Math.max(1, options.globalDeadlineMs)
      : Date.now() + DEFAULT_GLOBAL_DEADLINE_MS;

  try {
    const fields = (req.fields || []).filter((field) => field && !isBlockedAutofillField(field));
    const facts = await loadVerifiedFacts(actorId, candidate, fields, db);
    const planResult = await planFormBatch(
      fields,
      facts,
      () => resolveProviderClient(actorId, options),
      {
        ...req.context,
        signal: options?.signal ?? req.context?.signal,
        deadlineAt,
        runWithRetry: (fn) =>
          withUpstreamTransientRetry(
            fn,
            options?.rateLimitRetryDelaysMs,
            options?.signal ?? req.context?.signal,
            deadlineAt,
          ),
      },
    );
    return {
      ok: true,
      plan: planResult,
      fills: planResult.fills,
      executableFills: planResult.executableFills,
      unmapped: planResult.unmapped,
      unresolved: planResult.unresolved,
      deferred: planResult.deferred,
      deferredFieldIds: planResult.deferredFieldIds,
      deferredPlans: planResult.deferredPlans,
      telemetry: planResult.telemetry,
    };
  } catch (err: any) {
    throw mapOrchestratorProviderError(err);
  }
}

function mapOrchestratorProviderError(err: unknown): unknown {
  if (!(err instanceof ProviderError)) return err;
  if (err.status === 401 || err.code === 'AUTH_FAILED') {
    return new OrchestratorError('Custom provider authentication failed', 401, 'AUTH_FAILED');
  }
  if (err.status === 429 || err.code === 'RATE_LIMIT' || err.statusCode === 'RATE_LIMITED') {
    return new OrchestratorError(
      'AI provider rate-limited this request (HTTP 429). Wait a moment or switch models in AI Provider Settings.',
      429,
      'UPSTREAM_RATE_LIMITED',
    );
  }
  if (err.status === 503) {
    return new OrchestratorError(
      'AI provider returned HTTP 503 (Service Unavailable). Check your AI provider key, model, or retry shortly.',
      503,
      'UPSTREAM_UNAVAILABLE',
    );
  }
  if (err.statusCode === 'ABORTED') {
    return new OrchestratorError('Autofill request was aborted', 499, 'ABORTED');
  }
  if (err.statusCode === 'TIMEOUT') {
    return new OrchestratorError('Autofill request timed out', 504, 'TIMEOUT');
  }
  if (err.statusCode === 'INVALID_RESPONSE') {
    return new OrchestratorError(redactSensitiveText(err.message), 502, err.code || 'INVALID_RESPONSE');
  }
  return err;
}

/**
 * Executes combobox option choice on the server.
 */
export async function executeChoose(
  req: ChooseApiRequest,
  actorId: string,
  options?: OrchestratorOptions
): Promise<ChooseApiResponse> {
  checkFeatureFlag();

  if (!req || !req.candidateId) {
    throw new OrchestratorError('candidateId is required', 400, 'BAD_REQUEST');
  }

  if (!req.question || !Array.isArray(req.options)) {
    throw new OrchestratorError('question and options array are required', 400, 'BAD_REQUEST');
  }
  if (isBlockedAutofillField({ ...req.question, options: req.options })) {
    throw new OrchestratorError('This question requires manual review.', 422);
  }

  const db = await getDb(options);
  const { data: candidate, error } = await db
    .from('candidates')
    .select('*')
    .eq('id', req.candidateId)
    .eq('user_id', actorId)
    .maybeSingle();

  if (error || !candidate) {
    throw new OrchestratorError(
      'Candidate not found or unauthorized',
      404,
      'NOT_FOUND'
    );
  }
  if (candidate.provenance_status !== 'confirmed' || isUnreviewedResume(candidate.confirmed_facts ?? {})) {
    throw new OrchestratorError('Save a confirmed candidate profile before using AI autofill.', 422);
  }

  const deadlineAt =
    options?.globalDeadlineMs !== undefined
      ? Date.now() + Math.max(1, options.globalDeadlineMs)
      : Date.now() + DEFAULT_GLOBAL_DEADLINE_MS;

  try {
    const facts = await loadVerifiedFacts(actorId, candidate, [req.question], db);
    const jevKey = process.env.TYPESAFE_API_KEY?.trim();
    let config: ReturnType<typeof loadProviderConfig> | undefined;
    const getConfig = () => config ??= loadProviderConfig(actorId, db);
    const chooseResult = await withUpstreamTransientRetry(
      () =>
        chooseComboboxOption(
          req.question,
          req.options,
          facts,
          async () => buildProviderClient(actorId, db, await getConfig(), options),
          jevKey ? async (label, offered, profile) => {
            const settings = await getConfig();
            if (isPortalMode(settings) || (settings?.mode && settings.mode !== 'server')) return undefined;
            return requestJevChoice(jevKey, label, offered, profile, options?.fetchFn);
          } : undefined,
          req.context,
        ),
      options?.rateLimitRetryDelaysMs,
      options?.signal ?? req.context?.signal,
      deadlineAt,
    );
    return {
      ok: true,
      choice: chooseResult.choice,
      evidenceIds: chooseResult.evidenceIds || [],
      reason: chooseResult.reason,
      telemetry: chooseResult.telemetry,
    };
  } catch (err: any) {
    throw mapOrchestratorProviderError(err);
  }
}
