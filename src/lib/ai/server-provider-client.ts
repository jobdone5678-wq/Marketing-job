import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText, NoObjectGeneratedError, Output } from 'ai';
import { z } from 'zod';
import {
  ProviderClient,
  ProviderError,
  stripMarkdownFences,
} from './provider-client.ts';
import type {
  ProviderClientConfig,
  ChatMessage,
  GenerateCompletionOptions,
  ChatCompletionResult,
  TokenUsageTelemetry,
} from './provider-client.ts';
import {
  PlanContractSchema,
  ChooseContractSchema,
} from './structured-contracts.ts';
import { createSsrfSafeFetch } from './ssrf-fetch-adapter.ts';
import type { SafeAgentResult } from './ssrf-guard.ts';

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
 * Converts an aborted AbortSignal into the matching ProviderError (TIMEOUT vs ABORTED).
 */
function signalAbortToProviderError(signal: AbortSignal): ProviderError {
  const reason = (signal as any).reason;
  const isTimeout =
    reason?.name === 'TimeoutError' || (reason && /timeout/i.test(String(reason)));
  if (isTimeout) {
    return new ProviderError('Request timed out', 504, 'TIMEOUT');
  }
  return new ProviderError('Request was aborted', 499, 'ABORTED');
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
    return signalAbortToProviderError(signal);
  }

  // Explicit abort / timeout error instances (before HTTP status checks)
  if (err?.name === 'TimeoutError' || err?.cause?.name === 'TimeoutError') {
    return new ProviderError('Request timed out', 504, 'TIMEOUT');
  }
  if (err?.name === 'AbortError' || err?.cause?.name === 'AbortError') {
    if (Date.now() >= deadline) {
      return new ProviderError('Request timed out', 504, 'TIMEOUT');
    }
    return new ProviderError('Request was aborted', 499, 'ABORTED');
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
      502,
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

  return new ProviderError(`Provider request failed: ${err?.message || err}`, 500, 'FETCH_ERROR');
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

  private getEffectiveFetch(): typeof fetch | undefined {
    if (this.agent) {
      const safeAgentResult: SafeAgentResult =
        typeof this.agent === 'object' && this.agent && 'targetIp' in this.agent
          ? (this.agent as SafeAgentResult)
          : {
              agent: this.agent,
              validatedUrl: this.baseUrl,
              targetIp: '',
              hostname: (() => {
                try {
                  return new URL(this.baseUrl).hostname;
                } catch {
                  return 'localhost';
                }
              })(),
              port: (() => {
                try {
                  const u = new URL(this.baseUrl);
                  return u.port ? parseInt(u.port, 10) : u.protocol === 'https:' ? 443 : 80;
                } catch {
                  return 80;
                }
              })(),
              protocol: (() => {
                try {
                  return new URL(this.baseUrl).protocol === 'https:' ? 'https:' : 'http:';
                } catch {
                  return 'http:';
                }
              })(),
            };
      return createSsrfSafeFetch(safeAgentResult, this.customFetch);
    }

    const baseFetch = this.customFetch || globalThis.fetch;
    return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      let response: Response;
      try {
        response = await baseFetch(input, { ...init, redirect: 'error' });
      } catch (fetchErr: any) {
        if (fetchErr?.message && /redirect/i.test(fetchErr.message)) {
          throw new ProviderError('Redirects are not permitted', 308, 'REDIRECT_BLOCKED');
        }
        throw fetchErr;
      }
      if (response.status >= 300 && response.status < 400) {
        throw new ProviderError('Redirects are not permitted', 308, 'REDIRECT_BLOCKED');
      }
      const contentType = response.headers.get('content-type') || '';
      if (contentType.toLowerCase().includes('text/event-stream')) {
        return response;
      }
      const bodyText = await response.text();
      if (isHtml(bodyText, contentType)) {
        throw new ProviderError(
          'Endpoint returned HTML error page instead of JSON',
          502,
          'HTML_RESPONSE',
          bodyText,
        );
      }
      return new Response(bodyText, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    };
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
   */
  async generateChatCompletion(
    messages: ChatMessage[],
    options?: GenerateCompletionOptions & { schema?: z.ZodType<any> },
  ): Promise<ServerChatCompletionResult> {
    const startTime = Date.now();
    const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;
    const deadline = startTime + timeoutMs;

    // Pre-aborted signal check
    if (options?.signal?.aborted) {
      throw signalAbortToProviderError(options.signal);
    }

    if (deadline - Date.now() <= 0) {
      throw new ProviderError('Request timed out', 504, 'TIMEOUT');
    }

    const checkDeadline = (): number => {
      if (options?.signal?.aborted) {
        throw signalAbortToProviderError(options.signal);
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new ProviderError('Request timed out', 504, 'TIMEOUT');
      }
      return remaining;
    };

    // Telemetry tracking
    let aggregatedPromptTokens: number | undefined = undefined;
    let aggregatedCompletionTokens: number | undefined = undefined;
    let aggregatedTotalTokens: number | undefined = undefined;

    const recordUsage = (usage: any) => {
      if (!usage) return;
      const hasRaw = usage.raw && typeof usage.raw === 'object';
      const pTokens = hasRaw
        ? usage.raw.prompt_tokens ?? usage.raw.input_tokens
        : usage.inputTokens ?? usage.promptTokens;
      const cTokens = hasRaw
        ? usage.raw.completion_tokens ?? usage.raw.output_tokens
        : usage.outputTokens ?? usage.completionTokens;
      const tTokens = hasRaw ? usage.raw.total_tokens : usage.totalTokens;

      if (typeof pTokens === 'number') {
        aggregatedPromptTokens = (aggregatedPromptTokens ?? 0) + pTokens;
      }
      if (typeof cTokens === 'number') {
        aggregatedCompletionTokens = (aggregatedCompletionTokens ?? 0) + cTokens;
      }
      if (typeof tTokens === 'number') {
        aggregatedTotalTokens = (aggregatedTotalTokens ?? 0) + tTokens;
      }
    };

    const formatUsage = (): TokenUsageTelemetry | undefined => {
      if (
        aggregatedPromptTokens !== undefined ||
        aggregatedCompletionTokens !== undefined ||
        aggregatedTotalTokens !== undefined
      ) {
        return {
          inputTokens: aggregatedPromptTokens,
          outputTokens: aggregatedCompletionTokens,
          promptTokens: aggregatedPromptTokens,
          completionTokens: aggregatedCompletionTokens,
          totalTokens: aggregatedTotalTokens,
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
        return {
          text: result.text,
          rawJson: undefined,
          usage: formatUsage(),
          durationMs: Date.now() - startTime,
        };
      } catch (rawErr: any) {
        recordUsage(rawErr?.usage);
        throw translateToProviderError(rawErr, deadline, options?.signal);
      }
    }

    // Schema selection
    let schema: z.ZodType<any> | undefined = options?.schema;
    if (!schema) {
      if (options?.schemaName === 'plan') {
        schema = PlanContractSchema;
      } else if (options?.schemaName === 'choose') {
        schema = ChooseContractSchema;
      }
    }

    // ==========================================
    // Tier 1: Structured Output
    // ==========================================
    let tier1Passed = false;
    let tier1Result: ServerChatCompletionResult | undefined = undefined;

    if (this.supportsStructuredOutputs && schema) {
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
        tier1Result = {
          text: typeof result.output === 'string' ? result.output : JSON.stringify(result.output),
          rawJson: result.output,
          usage: formatUsage(),
          durationMs: Date.now() - startTime,
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

    if (this.supportsJsonMode) {
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

        let rawJson = result.output;
        if (schema) {
          const parsed = schema.safeParse(rawJson);
          if (!parsed.success) {
            throw new ProviderError(
              `Response failed schema validation: ${parsed.error.message}`,
              502,
              'SCHEMA_VALIDATION_ERROR',
              typeof rawJson === 'string' ? rawJson : JSON.stringify(rawJson),
            );
          }
          rawJson = parsed.data;
        }

        tier2Result = {
          text: typeof rawJson === 'string' ? rawJson : JSON.stringify(rawJson),
          rawJson,
          usage: formatUsage(),
          durationMs: Date.now() - startTime,
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
    const tier3Messages = modelMessages.map((msg, idx) => {
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
          );
        }
        throw new ProviderError(
          `Malformed JSON response in prompt-constrained fallback: ${jsonErr.message}`,
          502,
          'MALFORMED_JSON',
          result.text,
        );
      }

      if (schema) {
        const parsed = schema.safeParse(rawJson);
        if (!parsed.success) {
          throw new ProviderError(
            `Response failed schema validation: ${parsed.error.message}`,
            502,
            'SCHEMA_VALIDATION_ERROR',
            cleanedText,
          );
        }
        rawJson = parsed.data;
      }

      return {
        text: typeof rawJson === 'string' ? rawJson : JSON.stringify(rawJson),
        rawJson,
        usage: formatUsage(),
        durationMs: Date.now() - startTime,
      };
    } catch (rawErr: any) {
      recordUsage(rawErr?.usage);
      throw translateToProviderError(rawErr, deadline, options?.signal);
    }
  }
}
