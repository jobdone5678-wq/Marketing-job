/**
 * FreeHire AI Autofill Engine: Server-Enforced Orchestrator Service
 *
 * Implements server-side planning and combobox option choice:
 * - Checks SERVER_ENABLE_STRUCTURED_AI_PLANNER feature flag (default true)
 * - Verifies candidate ownership against authenticated actor (auth.uid())
 * - Resolves AI credentials (portal BYOK with AAD decryption & SSRF guard, or server default)
 * - Enforces zero-silent-fallback on BYOK authentication failures (returns 401)
 * - Executes FreeHire planFormBatch and chooseComboboxOption with typed grounding validation
 */

import { decryptSecret } from './encryption';
import { createSafeAgent, type DnsLookupFn } from './ssrf-guard';
import { createSsrfSafeFetch } from './ssrf-fetch-adapter';
import { ProviderClient, ProviderError, type TokenUsageTelemetry } from './provider-client';
import { ServerVercelProviderClient } from './server-provider-client';
import { buildVerifiedFacts } from './verified-facts';
import { planFormBatch, type Field, type Fill, type FormContext, type PlanResult } from './planner';
import { chooseComboboxOption } from './chooser';
import { isPrivateAutofillField } from './autofill-field-safety';
import { isUnreviewedResume } from '../candidate/confirmed-facts';
import { foldQuestionForTopic, listScreeningAnswerBank, normalizeAnswerBankTopic } from '../candidate/answerbank';
import { listExperienceBank } from '../candidate/experience';
import { getScreeningAnswers } from '../ingest/screeninganswers';
import { getUserAiProviderSecret } from './ai-provider-data';
import { experienceSkillQuestion } from './grounded';

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

export interface PlanApiRequest {
  candidateId: string;
  fields: Field[];
  context?: FormContext;
}

export interface ChooseApiRequest {
  candidateId: string;
  question: Field;
  options: string[];
  context?: FormContext;
}

export interface PlanApiResponse {
  ok: boolean;
  plan?: PlanResult;
  fills?: Fill[];
  executableFills?: Fill[];
  unmapped?: string[];
  deferred?: string[];
  deferredFieldIds?: string[];
  telemetry?: {
    usage?: TokenUsageTelemetry;
    durationMs?: number;
  };
  error?: string;
  code?: string;
}

export interface ChooseApiResponse {
  ok: boolean;
  choice?: string | null;
  evidenceIds?: string[];
  reason?: string;
  telemetry?: {
    usage?: TokenUsageTelemetry;
    durationMs?: number;
  };
  error?: string;
  code?: string;
}

export interface OrchestratorOptions {
  db?: any;
  fetchFn?: typeof fetch;
  dnsLookup?: DnsLookupFn;
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

/**
 * Checks rollback feature flag SERVER_ENABLE_VERCEL_AI_SDK.
 * Disabled by default; enabled only when explicitly set to 'true' or '1'.
 */
export function isVercelAiSdkEnabled(): boolean {
  const flag = process.env.SERVER_ENABLE_VERCEL_AI_SDK;
  return flag === 'true' || flag === '1';
}

async function getDb(options?: OrchestratorOptions): Promise<any> {
  if (options?.db) return options.db;
  const admin = await import('@/lib/db/admin');
  return admin.database();
}

async function loadVerifiedFacts(actorId: string, candidate: Parameters<typeof buildVerifiedFacts>[0], fields: Field[], db: any) {
  const skillsAsked = new Set(fields.map((field) => experienceSkillQuestion(field.label)).filter(Boolean));
  const [screening, entries, experience] = await Promise.all([
    getScreeningAnswers(actorId, db),
    listScreeningAnswerBank(actorId, { db, sendableOnly: true }),
    skillsAsked.size ? listExperienceBank(actorId, { db, tailorableOnly: true }) : undefined,
  ]);
  const reusable = entries.filter(({ question }) => !isPrivateAutofillField({ label: question }));
  const answers = fields.flatMap(({ label }) => {
    const normalized = foldQuestionForTopic(label);
    if (!normalized) return [];
    const topic = reusableAnswerTopic(label);
    const entry = reusable.find(({ question }) => foldQuestionForTopic(question) === normalized) ??
      (topic && reusable.find(({ question }) => reusableAnswerTopic(question) === topic));
    return entry ? [{ question: label, answer: entry.answer }] : [];
  });
  const facts = buildVerifiedFacts(candidate, answers, screening);
  const skills = new Set(experience?.atoms.flatMap((atom) => {
    if (atom.provenance !== 'manual' && atom.provenance !== 'stated_in_chat') return [];
    return (atom.skills ?? []).map((skill) => skill.trim().toLowerCase()).filter((skill) => skillsAsked.has(skill));
  }));
  if (skills.size) {
    const id = 'experience_bank.skills';
    facts.set(id, { id, value: [...skills], type: 'string[]', category: 'skill', source: 'experience_bank' });
  }
  return facts;
}

function reusableAnswerTopic(question: string) {
  const folded = foldQuestionForTopic(question);
  if (!folded) return;
  const topic = normalizeAnswerBankTopic(question);
  if (topic === 'notice_period' && /^(?:(?:what is your|your|current) )?notice period$|^how much notice (?:do you need|is required)$/.test(folded)) return topic;
  if (topic === 'salary_expectation' && /^(?:(?:what (?:is|are) your|your) )?(?:desired (?:salary|compensation)|(?:salary|compensation) expectations?)$/.test(folded)) return topic;
  if (topic === 'how_did_you_hear' && /^(?:how did you (?:hear|find out|learn)|where did you hear) about (?:us|this (?:role|position|job|opening|opportunity))$/.test(folded)) return topic;
  return undefined;
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

  // 1. Query user configuration
  const { data: config, error: configError } = await db
    .from('user_ai_provider_configs')
    .select('*')
    .eq('user_id', actorId)
    .maybeSingle();
  if (configError) {
    throw new OrchestratorError('Could not load AI provider settings', 503, 'CONFIG_UNAVAILABLE');
  }
  if (config?.mode === 'extension_byok' || config?.mode === 'local') {
    throw new OrchestratorError(
      'Select Server or Portal API key to use NextKinHR AI autofill.',
      422,
      'DIRECT_PROVIDER_MODE',
    );
  }

  const isPortalMode =
    config &&
    (config.mode === 'portal' ||
      config.mode === 'portal_byok' ||
      config.routing === 'portal' ||
      config.routing === 'proxy' ||
      config.credential_source === 'portal');

  if (isPortalMode) {
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
      fetchFn: useSdk ? options?.fetchFn : createSsrfSafeFetch(safeAgent, options?.fetchFn),
    });
  }

  // 3. Default server provider
  const defaultBaseUrl =
    process.env.AI_PROVIDER_DEFAULT_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    'https://api.openai.com/v1';
  const defaultApiKey =
    process.env.AI_PROVIDER_DEFAULT_API_KEY ||
    process.env.OPENAI_API_KEY ||
    '';
  const defaultModel =
    process.env.AI_PROVIDER_DEFAULT_MODEL ||
    process.env.OPENAI_MODEL ||
    'gpt-4o-mini';

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

  try {
    const fields = (req.fields || []).filter((field) => field && !isPrivateAutofillField(field));
    const [client, facts] = await Promise.all([
      resolveProviderClient(actorId, options),
      loadVerifiedFacts(actorId, candidate, fields, db),
    ]);
    const planResult = await planFormBatch(fields, facts, client, req.context);
    return {
      ok: true,
      plan: planResult,
      fills: planResult.fills,
      executableFills: planResult.executableFills,
      unmapped: planResult.unmapped,
      deferred: planResult.deferred,
      deferredFieldIds: planResult.deferredFieldIds,
      telemetry: planResult.telemetry,
    };
  } catch (err: any) {
    if (
      err instanceof ProviderError &&
      (err.status === 401 || err.code === 'AUTH_FAILED')
    ) {
      throw new OrchestratorError(
        'Custom provider authentication failed',
        401,
        'AUTH_FAILED'
      );
    }
    throw err;
  }
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
  if (isPrivateAutofillField({ ...req.question, options: req.options })) {
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

  try {
    const [client, facts] = await Promise.all([
      resolveProviderClient(actorId, options),
      loadVerifiedFacts(actorId, candidate, [req.question], db),
    ]);
    const chooseResult = await chooseComboboxOption(
      req.question,
      req.options,
      facts,
      client
    );
    return {
      ok: true,
      choice: chooseResult.choice,
      evidenceIds: chooseResult.evidenceIds || [],
      reason: chooseResult.reason,
      telemetry: chooseResult.telemetry,
    };
  } catch (err: any) {
    if (
      err instanceof ProviderError &&
      (err.status === 401 || err.code === 'AUTH_FAILED')
    ) {
      throw new OrchestratorError(
        'Custom provider authentication failed',
        401,
        'AUTH_FAILED'
      );
    }
    throw err;
  }
}
