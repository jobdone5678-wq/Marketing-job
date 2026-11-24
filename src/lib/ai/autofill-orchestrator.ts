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

import { decryptSecret } from './encryption.ts';
import { createSafeAgent } from './ssrf-guard.ts';
import { ProviderClient, ProviderError } from './provider-client.ts';
import { buildVerifiedFacts } from './verified-facts.ts';
import { planFormBatch, type Field, type Fill, type FormContext, type PlanResult } from './planner.ts';
import { chooseComboboxOption, type ChooseResult } from './chooser.ts';

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
  answerBank?: any;
}

export interface ChooseApiRequest {
  candidateId: string;
  question: Field;
  options: string[];
  context?: FormContext;
  answerBank?: any;
}

export interface PlanApiResponse {
  ok: boolean;
  plan?: PlanResult;
  fills?: Fill[];
  unmapped?: string[];
  deferred?: string[];
  error?: string;
  code?: string;
}

export interface ChooseApiResponse {
  ok: boolean;
  choice?: string | null;
  evidenceIds?: string[];
  reason?: string;
  error?: string;
  code?: string;
}

export interface OrchestratorOptions {
  db?: any;
  fetchFn?: typeof fetch;
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
  const admin = await import('../db/admin.js');
  return admin.database();
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
  const { data: config } = await db
    .from('user_ai_provider_configs')
    .select('*')
    .eq('user_id', actorId)
    .maybeSingle();

  const isPortalMode =
    config &&
    (config.mode === 'portal' ||
      config.routing === 'portal' ||
      config.credential_source === 'portal');

  if (isPortalMode) {
    // 2. Portal BYOK mode
    const { data: secret } = await db
      .from('user_ai_provider_secrets')
      .select('*')
      .eq('user_id', actorId)
      .maybeSingle();

    if (!secret || !secret.encrypted_api_key || !secret.iv || !secret.auth_tag) {
      throw new OrchestratorError(
        'Custom provider authentication failed',
        401,
        'AUTH_FAILED'
      );
    }

    let apiKey: string;
    try {
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
      safeAgent = await createSafeAgent(targetUrl);
    } catch (err: any) {
      throw new OrchestratorError(
        err.message || 'SSRF verification failed',
        400,
        'SSRF_BLOCKED'
      );
    }

    return new ProviderClient({
      baseUrl: safeAgent.validatedUrl,
      apiKey,
      model: config.model_id || 'default',
      agent: safeAgent.agent,
      fetchFn: options?.fetchFn,
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
    safeAgent = await createSafeAgent(defaultBaseUrl);
  } catch (err: any) {
    throw new OrchestratorError(
      err.message || 'SSRF verification failed for server provider',
      500,
      'SSRF_BLOCKED'
    );
  }

  return new ProviderClient({
    baseUrl: safeAgent.validatedUrl,
    apiKey: defaultApiKey,
    model: defaultModel,
    agent: safeAgent.agent,
    fetchFn: options?.fetchFn,
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

  const client = await resolveProviderClient(actorId, options);
  const facts = buildVerifiedFacts(candidate, req.answerBank);

  try {
    const planResult = await planFormBatch(req.fields || [], facts, client, req.context);
    return {
      ok: true,
      plan: planResult,
      fills: planResult.fills,
      unmapped: planResult.unmapped,
      deferred: planResult.deferred,
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

  const client = await resolveProviderClient(actorId, options);
  const facts = buildVerifiedFacts(candidate, req.answerBank);

  try {
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
