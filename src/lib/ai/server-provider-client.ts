import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText, NoObjectGeneratedError, Output } from 'ai';
import { z } from 'zod';
import {
  ProviderClient,
  ProviderError,
  extractTokenUsage,
  signalToProviderError,
  stripMarkdownFences,
  validateCompletionEnvelope,
  validateStructuredPayload,
  withBoundedRetries,
} from './provider-client';
import type {
  ProviderClientConfig,
  ChatMessage,
  GenerateCompletionOptions,
  ChatCompletionResult,
  TokenUsageTelemetry,
} from './provider-client';
import {
  PlanContractSchema,
  ChooseContractSchema,
} from './structured-contracts';
import { createSsrfSafeFetch } from './ssrf-fetch-adapter';
import type { SafeAgentResult } from './ssrf-guard';

export interface CapabilityRecord {
  supportsStructured: boolean;
  supportsJsonMode: boolean;
  expiresAt: number;
}

export interface ServerVercelProviderClientConfig extends ProviderClientConfig {
  supportsStructuredOutputs?: boolean;
  supportsJsonMode?: boolean;
}

export interface ServerChatCompletionResult extends ChatCompletionResult {
  text: string;
  rawJson?: any;
  usage?: TokenUsageTelemetry;
  durationMs: number;
  finishReason?: string;
  status?: 'OK';
}

/**
 * Normalizes OpenAI-compatible base URL by trimming whitespace and trailing slashes.
 */
export function normalizeUrl(url: string): string {
  if (!url) return '';
  return url.trim().replace(/\/+$/, '');
}

/**
 * Resolves baseURL for @ai-sdk/openai-compatible (which appends /chat/completions)
 * while maintaining parity with ProviderClient.resolveCompletionsUrl.
 */
export function resolveAiSdkBaseUrl(baseUrl: string): string {
  const trimmed = normalizeUrl(baseUrl);
  if (trimmed.endsWith('/chat/completions')) {
    return trimmed.slice(0, -'/chat/completions'.length);
  }
  if (trimmed.endsWith('/v1')) {
    return trimmed;
  }
  return `${trimmed}/v1`;
}

/**
 * Checks whether an error is an HTTP 400 with explicitly unsupported parameter error text.
 */
export function isUnsupportedParamError(err: any): boolean {
  const status = err?.statusCode ?? err?.status ?? err?.cause?.statusCode ?? err?.cause?.status;
  if (status !== 400) return false;

  const bodyText = [
    typeof err?.responseBody === 'string' ? err.responseBody : '',
    typeof err?.message === 'string' ? err.message : '',
    err?.cause ? String(err.cause) : '',
  ]
    .join(' ')
    .toLowerCase();

  return (
    bodyText.includes('unsupported_parameter') ||
    bodyText.includes('unsupported parameter') ||
    bodyText.includes('json_schema') ||
    bodyText.includes('response_format') ||
    bodyText.includes('extra_forbidden') ||
    bodyText.includes('unrecognized request argument') ||
    bodyText.includes('json_object') ||
    bodyText.includes('not supported')
  );
}

/**
 * Detects whether response body text or content type represents an HTML error page.
 */
function isHtml(text?: string | null, contentType?: string | null): boolean {
  if (contentType && contentType.toLowerCase().includes('text/html')) {
    return true;
  }
  if (!text) return false;
  const clean = text.trim().toLowerCase();
  return clean.startsWith('<!doctype html') || /<html[\s>]/i.test(clean);
}

/**
 * Translates errors into ProviderError with proper HTTP status and error code.
 */
function translateToProviderError(err: any, deadline: number, signal?: AbortSignal): ProviderError {
  if (err instanceof ProviderError) {
    return err;
  }
  if (err?.cause instanceof ProviderError) {
    return err.cause;
  }

  // Pre-aborted or in-flight caller signal check
  if (signal?.aborted) {
    return signalToProviderError(signal);
  }

  // Explicit abort / timeout error instances (before HTTP status checks)
  if (err?.name === 'TimeoutError' || err?.cause?.name === 'TimeoutError') {
    return new ProviderError('Request timed out', 504, 'TIMEOUT', undefined, 'TIMEOUT');
  }
  if (err?.name === 'AbortError' || err?.cause?.name === 'AbortError') {
    if (Date.now() >= deadline) {
      return new ProviderError('Request timed out', 504, 'TIMEOUT', undefined, 'TIMEOUT');
    }
    return new ProviderError('Request was aborted', 499, 'ABORTED', undefined, 'ABORTED');
  }

  // AI SDK NoObjectGeneratedError (JSON parse error or schema validation error on Tier 1 / Tier 2)
  if (NoObjectGeneratedError.isInstance(err) || err?.name === 'AI_NoObjectGeneratedError') {
    const rawText = typeof err?.text === 'string' ? err.text : undefined;
    if (rawText && isHtml(rawText)) {
      return new ProviderError(
        'Endpoint returned HTML error page instead of JSON',
        502,
        'HTML_RESPONSE',
        rawText,
      );
    }
    const causeName = err?.cause?.name || '';
    const causeMsg = String(err?.cause?.message || err?.message || '');
    if (
      causeName.includes('JSONParse') ||
      err?.cause instanceof SyntaxError ||
      /json/i.test(causeName)
    ) {
      return new ProviderError(
        `Provider returned malformed JSON response: ${causeMsg}`,
        502,
        'MALFORMED_JSON',
        rawText,
      );
    }
    return new ProviderError(
      `Response failed schema validation: ${causeMsg}`,
      502,
      'SCHEMA_VALIDATION_ERROR',
      rawText,
    );
  }

  // Check HTTP status codes BEFORE message-substring timeout heuristics
  const status = err?.statusCode ?? err?.status ?? err?.cause?.statusCode ?? err?.cause?.status;
  const responseBody =
    typeof err?.responseBody === 'string'
      ? err.responseBody
      : typeof err?.cause?.responseBody === 'string'
      ? err.cause.responseBody
      : typeof err?.text === 'string'
      ? err.text
      : undefined;

  // HTML response check
  if (status === 502 || isHtml(responseBody)) {
    return new ProviderError(
      'Endpoint returned HTML error page instead of JSON',
      status === 429 || status === 503 ? status : 502,
      'HTML_RESPONSE',
      responseBody,
    );
  }

  // 200 OK with unparseable non-HTML response (e.g. JSONParseError from createJsonResponseHandler)
  if (status === 200) {
    return new ProviderError(
      'Provider returned malformed JSON response',
      502,
      'MALFORMED_JSON',
      responseBody,
    );
  }

  if (status === 401) {
    return new ProviderError(err?.message || 'Unauthorized', 401, 'AUTH_ERROR', responseBody);
  }
  if (status === 403) {
    return new ProviderError(err?.message || 'Forbidden', 403, 'FORBIDDEN', responseBody);
  }
  if (status === 404) {
    return new ProviderError(err?.message || 'Not Found', 404, 'NOT_FOUND', responseBody);
  }
  if (status === 429) {
    return new ProviderError(err?.message || 'Rate limit exceeded', 429, 'RATE_LIMIT', responseBody);
  }
  if (typeof status === 'number') {
    return new ProviderError(
      err?.message || `Provider returned HTTP ${status}`,
      status,
      'HTTP_ERROR',
      responseBody,
    );
  }

  // Fallback timeout / abort heuristics for network errors without HTTP status
  if (
    Date.now() >= deadline ||
    /timeout/i.test(err?.message || '') ||
    /timed out/i.test(err?.message || '')
  ) {
    return new ProviderError('Request timed out', 504, 'TIMEOUT');
  }
  if (/abort/i.test(err?.message || '')) {
    return new ProviderError('Request was aborted', 499, 'ABORTED');
  }
  if (err?.message && /redirect/i.test(err.message)) {
    return new ProviderError('Redirects are not permitted', 308, 'REDIRECT_BLOCKED');
  }

  return new ProviderError(`Provider request failed: ${err?.message || err}`, 500, 'NETWORK_ERROR', undefined, 'NETWORK_ERROR');
}

/**
 * Splits ChatMessage[] into system instructions and non-system messages for Vercel AI SDK.
 */
function formatMessagesForAiSdk(messages: ChatMessage[]) {
  const systemParts: string[] = [];
  const modelMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  for (const m of messages) {
    if (m.role === 'system') {
      systemParts.push(m.content);
    } else {
      modelMessages.push({
        role: m.role,
        content: m.content,
      });
    }
  }

  if (modelMessages.length === 0) {
    modelMessages.push({ role: 'user', content: '' });
  }

  const system = systemParts.length > 0 ? systemParts.join('\n\n') : undefined;

  return { system, modelMessages };
}

export class ServerVercelProviderClient extends ProviderClient {
  private static capabilityCache = new Map<string, CapabilityRecord>();
  public static readonly MAX_CACHE_ENTRIES = 100;
  public static readonly DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

  constructor(
    configOrBaseUrl: ServerVercelProviderClientConfig | string,
    apiKey?: string,
    model?: string,
    options?: Partial<ServerVercelProviderClientConfig>,
  ) {
    super(configOrBaseUrl, apiKey, model, options);

    if (typeof configOrBaseUrl === 'string') {
      if (typeof options?.supportsStructuredOutputs === 'boolean') {
        this.supportsStructuredOutputs = options.supportsStructuredOutputs;
      }
      if (typeof options?.supportsJsonMode === 'boolean') {
        this.supportsJsonMode = options.supportsJsonMode;
      }
    } else {
      if (typeof configOrBaseUrl.supportsStructuredOutputs === 'boolean') {
        this.supportsStructuredOutputs = configOrBaseUrl.supportsStructuredOutputs;
      }
      if (typeof configOrBaseUrl.supportsJsonMode === 'boolean') {
        this.supportsJsonMode = configOrBaseUrl.supportsJsonMode;
      }
    }
  }

  static getCacheKey(baseUrl: string, model: string): string {
    return `${normalizeUrl(baseUrl)}::${(model || 'default').trim()}`;
  }

  static clearCache(): void {
    ServerVercelProviderClient.capabilityCache.clear();
  }

  static getCache(): Map<string, CapabilityRecord> {
    const now = Date.now();
    const copy = new Map<string, CapabilityRecord>();
    ServerVercelProviderClient.capabilityCache.forEach((entry, key) => {
      if (now >= entry.expiresAt) {
        ServerVercelProviderClient.capabilityCache.delete(key);
      } else {
        copy.set(key, { ...entry });
      }
    });
    return copy;
  }

  static getCachedCapability(baseUrl: string, model: string): CapabilityRecord | undefined {
    const key = ServerVercelProviderClient.getCacheKey(baseUrl, model);
    const entry = ServerVercelProviderClient.capabilityCache.get(key);
    if (!entry) return undefined;
    if (Date.now() >= entry.expiresAt) {
      ServerVercelProviderClient.capabilityCache.delete(key);
      return undefined;
    }
    return { ...entry };
  }

  static setCachedCapability(
    baseUrl: string,
    model: string,
    capability: Partial<Omit<CapabilityRecord, 'expiresAt'>> & { expiresAt?: number; ttlMs?: number },
  ): void {
    const key = ServerVercelProviderClient.getCacheKey(baseUrl, model);
    const existing = ServerVercelProviderClient.getCachedCapability(baseUrl, model);
    const ttlMs = capability.ttlMs ?? ServerVercelProviderClient.DEFAULT_TTL_MS;
    const expiresAt = capability.expiresAt ?? Date.now() + ttlMs;

    const record: CapabilityRecord = {
      supportsStructured: capability.supportsStructured ?? existing?.supportsStructured ?? true,
      supportsJsonMode: capability.supportsJsonMode ?? existing?.supportsJsonMode ?? true,
      expiresAt,
    };

    if (
      !ServerVercelProviderClient.capabilityCache.has(key) &&
      ServerVercelProviderClient.capabilityCache.size >= ServerVercelProviderClient.MAX_CACHE_ENTRIES
    ) {
      // Purge expired entries before evicting oldest active entry
      const now = Date.now();
      ServerVercelProviderClient.capabilityCache.forEach((entry, k) => {
        if (now >= entry.expiresAt) {
          ServerVercelProviderClient.capabilityCache.delete(k);
        }
      });

      if (
        ServerVercelProviderClient.capabilityCache.size >=
        ServerVercelProviderClient.MAX_CACHE_ENTRIES
      ) {
        const oldestKey = ServerVercelProviderClient.capabilityCache.keys().next().value;
        if (oldestKey) {
          ServerVercelProviderClient.capabilityCache.delete(oldestKey);
        }
      }
    }

    ServerVercelProviderClient.capabilityCache.set(key, record);
  }

  get supportsStructuredOutputs(): boolean {
    const cap = ServerVercelProviderClient.getCachedCapability(this.baseUrl, this.model);
    return cap ? cap.supportsStructured : true;
  }

  set supportsStructuredOutputs(value: boolean) {
    ServerVercelProviderClient.setCachedCapability(this.baseUrl, this.model, {
      supportsStructured: value,
    });
  }

  override get supportsJsonMode(): boolean {
    const cap = ServerVercelProviderClient.getCachedCapability(this.baseUrl, this.model);
    return cap ? cap.supportsJsonMode : true;
  }

  override set supportsJsonMode(value: boolean) {
    ServerVercelProviderClient.setCachedCapability(this.baseUrl, this.model, {
      supportsJsonMode: value,
    });
  }

  private wrapEnvelopeValidation(fetchFn: typeof fetch): typeof fetch {
    return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const response = await fetchFn(input, init);
      const contentType = response.headers.get('content-type') || '';
      if (contentType.toLowerCase().includes('text/event-stream')) {
        return response;
      }
      if (response.ok) {
        const bodyText = await response.text();
        if (isHtml(bodyText, contentType)) {
          throw new ProviderError(
            'Endpoint returned HTML error page instead of JSON',
            502,
            'HTML_RESPONSE',
            bodyText,
            'INVALID_RESPONSE',
          );
        }
        let parsed: any;
        try {
          parsed = JSON.parse(bodyText);
        } catch {
          throw new ProviderError(
            'Provider returned malformed JSON response',
            502,
            'MALFORMED_JSON',
            bodyText,
            'INVALID_RESPONSE',
          );
        }
        if (parsed && typeof parsed === 'object' && 'choices' in parsed) {
          validateCompletionEnvelope(parsed, bodyText);
        }
        return new Response(bodyText, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      }
      return response;
    };
  }

  private getEffectiveFetch(): typeof fetch | undefined {
    if (this.agent) {
      let parsedUrl: URL | undefined;
      try {
        parsedUrl = new URL(this.baseUrl);
      } catch {
        parsedUrl = undefined;
      }
      const urlProtocol: 'http:' | 'https:' = parsedUrl?.protocol === 'https:' ? 'https:' : 'http:';
      const urlPort = parsedUrl
        ? parsedUrl.port
          ? parseInt(parsedUrl.port, 10)
          : urlProtocol === 'https:'
          ? 443
          : 80
        : 80;

      const safeAgentResult: SafeAgentResult =
        typeof this.agent === 'object' &&
        this.agent !== null &&
        'agent' in this.agent &&
        'validatedUrl' in this.agent
          ? (this.agent as SafeAgentResult)
          : {
              agent: this.agent,
              validatedUrl: this.baseUrl,
              targetIp: typeof this.agent.targetIp === 'string' ? this.agent.targetIp : '',
              hostname:
                typeof this.agent.hostname === 'string' && this.agent.hostname
                  ? this.agent.hostname
                  : parsedUrl?.hostname || 'localhost',
              port: typeof this.agent.targetPort === 'number' ? this.agent.targetPort : urlPort,
              protocol:
                this.agent.protocol === 'https:' || this.agent.protocol === 'http:'
                  ? this.agent.protocol
                  : urlProtocol,
              redirect: 'error',
            };
      return this.wrapEnvelopeValidation(createSsrfSafeFetch(safeAgentResult, this.customFetch));
    }

    const baseFetch = this.customFetch || globalThis.fetch;
    return this.wrapEnvelopeValidation(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      let response: Response;
      try {
        response = await baseFetch(input, { ...init, redirect: 'error' });
      } catch (fetchErr: any) {
        if (fetchErr?.message && /redirect/i.test(fetchErr.message)) {
          throw new ProviderError('Redirects are not permitted', 308, 'REDIRECT_BLOCKED', undefined, 'NETWORK_ERROR');
        }
        throw fetchErr;
      }
      if (response.status >= 300 && response.status < 400) {
        throw new ProviderError('Redirects are not permitted', 308, 'REDIRECT_BLOCKED', undefined, 'NETWORK_ERROR');
      }
      const contentType = response.headers.get('content-type') || '';
      if (contentType.toLowerCase().includes('text/event-stream')) {
        return response;
      }
      const bodyText = await response.text();
      if (isHtml(bodyText, contentType)) {
        throw new ProviderError(
          'Endpoint returned HTML error page instead of JSON',
          response.status === 429 || response.status === 503 ? response.status : 502,
          'HTML_RESPONSE',
          bodyText,
          response.status === 429 ? 'RATE_LIMITED' : 'INVALID_RESPONSE',
        );
      }
      return new Response(bodyText, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    });
  }

  private getModel(supportsStructuredOutputs: boolean = false) {
    const trimmedKey = this.apiKey?.trim();
    const provider = createOpenAICompatible({
      name: 'custom-provider',
      baseURL: resolveAiSdkBaseUrl(this.baseUrl),
      apiKey: trimmedKey && trimmedKey.length > 0 ? trimmedKey : undefined,
      headers: this.customHeaders,
      fetch: this.getEffectiveFetch(),
      supportsStructuredOutputs,
    });
    return provider(this.model);
  }

  /**
   * Generates chat completion with 3-tier fallback (Structured Outputs -> JSON Mode -> Prompt-Constrained Text),
   * shared deadline enforcement, capability caching, and usage telemetry.
   * For `plan`/`choose` callers passing `responseFormat: 'json_prompt'`, executes a single direct
   * prompt-constrained attempt with Zod schema validation within the single deadline.
   */
  async generateChatCompletion(
    messages: ChatMessage[],
    options?: GenerateCompletionOptions & { schema?: z.ZodType<any> },
  ): Promise<ServerChatCompletionResult> {
    const startTime = Date.now();
    const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;
    return withBoundedRetries(
      () => this._generateSingleWithFallback(messages, options, startTime, timeoutMs),
      {
        timeoutMs,
        maxRetries: options?.maxRetries,
        baseDelayMs: options?.retryBaseDelayMs,
        signal: options?.signal,
      },
    );
  }

  private validateSdkFinishReason(finishReason?: string, rawText?: string): void {
    if (finishReason === 'length') {
      throw new ProviderError(
        'Provider completion was truncated (finish_reason: length)',
        502,
        'TRUNCATED_RESPONSE',
        rawText,
        'INVALID_RESPONSE',
      );
    }
    if (finishReason === 'content-filter') {
      throw new ProviderError(
        'Provider refused completion request (content_filter)',
        502,
        'MODEL_REFUSAL',
        rawText,
        'INVALID_RESPONSE',
      );
    }
  }

  private async _generateSingleWithFallback(
    messages: ChatMessage[],
    options: (GenerateCompletionOptions & { schema?: z.ZodType<any> }) | undefined,
    startTime: number,
    timeoutMs: number,
  ): Promise<ServerChatCompletionResult> {
    const deadline = startTime + timeoutMs;

    // Pre-aborted signal check
    if (options?.signal?.aborted) {
      throw signalToProviderError(options.signal);
    }

    if (deadline - Date.now() <= 0) {
      throw new ProviderError('Request timed out', 504, 'TIMEOUT', undefined, 'TIMEOUT');
    }

    const checkDeadline = (): number => {
      if (options?.signal?.aborted) {
        throw signalToProviderError(options.signal);
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new ProviderError('Request timed out', 504, 'TIMEOUT', undefined, 'TIMEOUT');
      }
      return remaining;
    };

    // Telemetry tracking
    let aggregatedPromptTokens: number | undefined = undefined;
    let aggregatedCompletionTokens: number | undefined = undefined;
    let aggregatedTotalTokens: number | undefined = undefined;

    const recordUsage = (usage: any) => {
      const extracted = extractTokenUsage(usage);
      if (!extracted) return;
      if (extracted.promptTokens !== undefined) {
        aggregatedPromptTokens = (aggregatedPromptTokens ?? 0) + extracted.promptTokens;
      }
      if (extracted.completionTokens !== undefined) {
        aggregatedCompletionTokens = (aggregatedCompletionTokens ?? 0) + extracted.completionTokens;
      }
      if (extracted.totalTokens !== undefined) {
        aggregatedTotalTokens = (aggregatedTotalTokens ?? 0) + extracted.totalTokens;
      }
    };

    const formatUsage = (): TokenUsageTelemetry | undefined => {
      if (
        aggregatedPromptTokens !== undefined ||
        aggregatedCompletionTokens !== undefined ||
        aggregatedTotalTokens !== undefined
      ) {
        return {
          ...(aggregatedPromptTokens !== undefined
            ? { inputTokens: aggregatedPromptTokens, promptTokens: aggregatedPromptTokens }
            : {}),
          ...(aggregatedCompletionTokens !== undefined
            ? { outputTokens: aggregatedCompletionTokens, completionTokens: aggregatedCompletionTokens }
            : {}),
          ...(aggregatedTotalTokens !== undefined ? { totalTokens: aggregatedTotalTokens } : {}),
        };
      }
      return undefined;
    };

    const { system, modelMessages } = formatMessagesForAiSdk(messages);

    // If text format requested explicitly, execute single attempt
    if (options?.responseFormat === 'text') {
      const remaining = checkDeadline();
      const timeoutSignal = AbortSignal.timeout(remaining);
      const attemptSignal = options?.signal
        ? AbortSignal.any([options.signal, timeoutSignal])
        : timeoutSignal;

      try {
        const model = this.getModel(false);
        const result = await generateText({
          model,
          system,
          messages: modelMessages,
          temperature: options?.temperature ?? 0,
          maxOutputTokens: options?.maxTokens,
          abortSignal: attemptSignal,
          maxRetries: 0,
        });
        recordUsage(result.usage);
        this.validateSdkFinishReason(result.finishReason, result.text);
        if (typeof result.text !== 'string') {
          throw new ProviderError('Provider completion content is not a string', 502, 'INVALID_RESPONSE', undefined, 'INVALID_RESPONSE');
        }
        return {
          text: result.text,
          rawJson: undefined,
          usage: formatUsage(),
          durationMs: Date.now() - startTime,
          ...(result.finishReason ? { finishReason: result.finishReason } : {}),
          status: 'OK',
        };
      } catch (rawErr: any) {
        recordUsage(rawErr?.usage);
        throw translateToProviderError(rawErr, deadline, options?.signal);
      }
    }

    // Schema selection (always use Zod schemas on the server)
    const schema: z.ZodType<any> | undefined =
      (options?.schema as z.ZodType<any> | undefined) ??
      (options?.schemaName === 'plan'
        ? PlanContractSchema
        : options?.schemaName === 'choose'
          ? ChooseContractSchema
          : undefined);
    const validationOpts = schema ? { ...options, schema } : options;

    // ==========================================
    // Tier 1: Structured Output
    // ==========================================
    let tier1Passed = false;
    let tier1Result: ServerChatCompletionResult | undefined = undefined;

    if (options?.responseFormat !== 'json_prompt' && this.supportsStructuredOutputs && schema) {
      const remaining = checkDeadline();
      const timeoutSignal = AbortSignal.timeout(remaining);
      const attemptSignal = options?.signal
        ? AbortSignal.any([options.signal, timeoutSignal])
        : timeoutSignal;

      try {
        const model = this.getModel(true);
        const result = await generateText({
          model,
          system,
          messages: modelMessages,
          output: Output.object({ schema }),
          temperature: options?.temperature ?? 0,
          maxOutputTokens: options?.maxTokens,
          abortSignal: attemptSignal,
          maxRetries: 0,
        });
        recordUsage(result.usage);
        this.validateSdkFinishReason(result.finishReason);
        const rawJson = validateStructuredPayload(result.output, validationOpts);
        tier1Result = {
          text: typeof rawJson === 'string' ? rawJson : JSON.stringify(rawJson),
          rawJson,
          usage: formatUsage(),
          durationMs: Date.now() - startTime,
          ...(result.finishReason ? { finishReason: result.finishReason } : {}),
          status: 'OK',
        };
        tier1Passed = true;
      } catch (rawErr: any) {
        recordUsage(rawErr?.usage);
        const translated = translateToProviderError(rawErr, deadline, options?.signal);
        if (isUnsupportedParamError(rawErr)) {
          this.supportsStructuredOutputs = false;
          // Fall through to Tier 2
        } else {
          throw translated;
        }
      }
    }

    if (tier1Passed && tier1Result) {
      return tier1Result;
    }

    // ==========================================
    // Tier 2: JSON Mode
    // ==========================================
    let tier2Passed = false;
    let tier2Result: ServerChatCompletionResult | undefined = undefined;

    if (options?.responseFormat !== 'json_prompt' && this.supportsJsonMode) {
      const remaining = checkDeadline();
      const timeoutSignal = AbortSignal.timeout(remaining);
      const attemptSignal = options?.signal
        ? AbortSignal.any([options.signal, timeoutSignal])
        : timeoutSignal;

      try {
        const model = this.getModel(false);
        const result = await generateText({
          model,
          system,
          messages: modelMessages,
          output: Output.json(),
          temperature: options?.temperature ?? 0,
          maxOutputTokens: options?.maxTokens,
          abortSignal: attemptSignal,
          maxRetries: 0,
        });
        recordUsage(result.usage);
        this.validateSdkFinishReason(result.finishReason);

        const rawJson = validateStructuredPayload(
          result.output,
          validationOpts,
          typeof result.output === 'string' ? result.output : JSON.stringify(result.output),
        );

        tier2Result = {
          text: typeof rawJson === 'string' ? rawJson : JSON.stringify(rawJson),
          rawJson,
          usage: formatUsage(),
          durationMs: Date.now() - startTime,
          ...(result.finishReason ? { finishReason: result.finishReason } : {}),
          status: 'OK',
        };
        tier2Passed = true;
      } catch (rawErr: any) {
        recordUsage(rawErr?.usage);
        const translated = translateToProviderError(rawErr, deadline, options?.signal);
        if (isUnsupportedParamError(rawErr)) {
          this.supportsJsonMode = false;
          // Fall through to Tier 3
        } else {
          throw translated;
        }
      }
    }

    if (tier2Passed && tier2Result) {
      return tier2Result;
    }

    // ==========================================
    // Tier 3: Prompt-Constrained Text
    // ==========================================
    const remaining = checkDeadline();
    const timeoutSignal = AbortSignal.timeout(remaining);
    const attemptSignal = options?.signal
      ? AbortSignal.any([options.signal, timeoutSignal])
      : timeoutSignal;

    const jsonConstraint =
      '\n\nIMPORTANT: Respond with valid JSON only. Do not include markdown fences, preamble, or commentary.';
    const tier3Messages = options?.responseFormat === 'json_prompt' ? modelMessages : modelMessages.map((msg, idx) => {
      if (idx === modelMessages.length - 1) {
        return { ...msg, content: msg.content + jsonConstraint };
      }
      return msg;
    });

    try {
      const model = this.getModel(false);
      const result = await generateText({
        model,
        system,
        messages: tier3Messages,
        temperature: options?.temperature ?? 0,
        maxOutputTokens: options?.maxTokens,
        abortSignal: attemptSignal,
        maxRetries: 0,
      });
      recordUsage(result.usage);
      this.validateSdkFinishReason(result.finishReason, result.text);
      if (typeof result.text !== 'string') {
        throw new ProviderError('Provider completion content is not a string', 502, 'INVALID_RESPONSE', undefined, 'INVALID_RESPONSE');
      }

      const cleanedText = stripMarkdownFences(result.text);

      let rawJson: any;
      try {
        rawJson = JSON.parse(cleanedText);
      } catch (jsonErr: any) {
        if (isHtml(result.text)) {
          throw new ProviderError(
            'Endpoint returned HTML error page instead of JSON',
            502,
            'HTML_RESPONSE',
            result.text,
            'INVALID_RESPONSE',
          );
        }
        throw new ProviderError(
          `Malformed JSON response in prompt-constrained fallback: ${jsonErr.message}`,
          502,
          'MALFORMED_JSON',
          result.text,
          'INVALID_RESPONSE',
        );
      }

      rawJson = validateStructuredPayload(rawJson, validationOpts, cleanedText);

      return {
        text: typeof rawJson === 'string' ? rawJson : JSON.stringify(rawJson),
        rawJson,
        usage: formatUsage(),
        durationMs: Date.now() - startTime,
        ...(result.finishReason ? { finishReason: result.finishReason } : {}),
        status: 'OK',
      };
    } catch (rawErr: any) {
      recordUsage(rawErr?.usage);
      throw translateToProviderError(rawErr, deadline, options?.signal);
    }
  }
}
