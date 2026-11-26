export interface StructuralSchema<T = any> {
  safeParse(input: unknown): { success: true; data: T } | { success: false; error: { message: string } };
}

export interface ProviderClientConfig {
  baseUrl: string;
  apiKey?: string;
  model: string;
  agent?: any;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
  headers?: Record<string, string>;
  supportsStructuredOutputs?: boolean;
  supportsJsonMode?: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type ProviderStatusCode =
  | 'OK'
  | 'ABORTED'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'INVALID_RESPONSE';

export interface GenerateCompletionOptions {
  /** `json_prompt` uses one request and parses JSON requested by the caller's prompt. */
  responseFormat?: 'json_object' | 'json_prompt' | 'text';
  schemaName?: 'plan' | 'choose';
  schema?: StructuralSchema<any>;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  maxRetries?: number;
  retryBaseDelayMs?: number;
}

export interface TokenUsageTelemetry {
  inputTokens?: number;
  outputTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface ChatCompletionResult {
  text: string;
  rawJson?: any;
  usage?: TokenUsageTelemetry;
  durationMs?: number;
  finishReason?: string;
  status?: 'OK';
}

/**
 * Redacts API keys, bearer tokens, email addresses, and SSN-like patterns from diagnostic text.
 */
export function redactSensitiveText(text: string): string {
  if (!text) return '';
  return text
    .replace(/\bBearer\s+[A-Za-z0-9._\-~+/]+=*/gi, 'Bearer [REDACTED]')
    .replace(/\b(?:sk|vck|gsk)_[A-Za-z0-9_\-]{8,}|\bsk-[A-Za-z0-9_\-]{8,}|AIzaSy[A-Za-z0-9_\-]{8,}/g, '[REDACTED_KEY]')
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[REDACTED_EMAIL]')
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED_SSN]');
}

export function deriveProviderStatusCode(status: number, code?: string): ProviderStatusCode {
  if (code === 'ABORTED' || status === 499) return 'ABORTED';
  if (code === 'TIMEOUT' || status === 504) return 'TIMEOUT';
  if (code === 'RATE_LIMIT' || code === 'RATE_LIMITED' || status === 429) return 'RATE_LIMITED';
  if (
    code === 'MALFORMED_JSON' ||
    code === 'SCHEMA_VALIDATION_ERROR' ||
    code === 'HTML_RESPONSE' ||
    code === 'INVALID_RESPONSE' ||
    code === 'TRUNCATED_RESPONSE' ||
    code === 'MODEL_REFUSAL' ||
    code === 'MISSING_CHOICE' ||
    code === 'INVALID_CONTENT' ||
    status === 502
  ) {
    return 'INVALID_RESPONSE';
  }
  return 'NETWORK_ERROR';
}

export class ProviderError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly statusCode: ProviderStatusCode;
  readonly responseBody?: string;

  constructor(
    message: string,
    status: number = 500,
    code?: string,
    responseBody?: string,
    statusCode?: ProviderStatusCode,
  ) {
    super(redactSensitiveText(message));
    this.name = 'ProviderError';
    this.status = status;
    this.code = code;
    this.responseBody = responseBody;
    this.statusCode = statusCode ?? deriveProviderStatusCode(status, code);
  }
}

/**
 * Strips markdown code fences (e.g. ```json ... ```) and extracts pure JSON.
 */
export function stripMarkdownFences(text: string): string {
  if (!text) return '';
  const trimmed = text.trim();

  // Match ```json ... ``` or ``` ... ```
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch && fenceMatch[1]) {
    return fenceMatch[1].trim();
  }

  // If there's surrounding prose without fences, find outermost JSON bounds
  const firstBrace = trimmed.indexOf('{');
  const firstBracket = trimmed.indexOf('[');
  let startIdx = -1;

  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    startIdx = firstBrace;
    const lastBrace = trimmed.lastIndexOf('}');
    if (lastBrace > startIdx) {
      return trimmed.slice(startIdx, lastBrace + 1).trim();
    }
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
    const lastBracket = trimmed.lastIndexOf(']');
    if (lastBracket > startIdx) {
      return trimmed.slice(startIdx, lastBracket + 1).trim();
    }
  }

  return trimmed;
}

/**
 * Normalizes OpenAI-compatible base URL to completions endpoint.
 */
export function resolveCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (trimmed.endsWith('/chat/completions')) {
    return trimmed;
  }
  const path = URL.canParse(trimmed) ? new URL(trimmed).pathname : trimmed;
  if (/\/v\d+[a-z0-9_-]*(?:\/|$)/i.test(path)) {
    return `${trimmed}/chat/completions`;
  }
  return `${trimmed}/v1/chat/completions`;
}

/**
 * Extracts finite token counts without inventing missing metrics.
 */
export function extractTokenUsage(usage: any): TokenUsageTelemetry | undefined {
  if (!usage || typeof usage !== 'object') return undefined;
  const hasRaw = usage.raw && typeof usage.raw === 'object';
  const pTokens = hasRaw
    ? usage.raw.prompt_tokens ?? usage.raw.input_tokens
    : usage.prompt_tokens ?? usage.input_tokens ?? usage.inputTokens ?? usage.promptTokens;
  const cTokens = hasRaw
    ? usage.raw.completion_tokens ?? usage.raw.output_tokens
    : usage.completion_tokens ?? usage.output_tokens ?? usage.outputTokens ?? usage.completionTokens;
  const tTokens = hasRaw ? usage.raw.total_tokens : usage.total_tokens ?? usage.totalTokens;

  const result: TokenUsageTelemetry = {};
  let hasAny = false;

  if (typeof pTokens === 'number' && Number.isFinite(pTokens)) {
    result.inputTokens = pTokens;
    result.promptTokens = pTokens;
    hasAny = true;
  }
  if (typeof cTokens === 'number' && Number.isFinite(cTokens)) {
    result.outputTokens = cTokens;
    result.completionTokens = cTokens;
    hasAny = true;
  }
  if (typeof tTokens === 'number' && Number.isFinite(tTokens)) {
    result.totalTokens = tTokens;
    hasAny = true;
  }

  return hasAny ? result : undefined;
}

/**
 * Validates completion envelope (choice existence, non-refusal, non-truncation, string content).
 */
export function validateCompletionEnvelope(
  parsedResponse: any,
  rawBody?: string,
): { content: string; finishReason?: string } {
  if (!parsedResponse || typeof parsedResponse !== 'object' || !Array.isArray(parsedResponse.choices) || parsedResponse.choices.length === 0) {
    throw new ProviderError(
      'Provider response missing completion choice',
      502,
      'INVALID_RESPONSE',
      rawBody,
      'INVALID_RESPONSE',
    );
  }

  const choice = parsedResponse.choices[0];
  const finishReason = typeof choice?.finish_reason === 'string' ? choice.finish_reason : undefined;

  if (typeof choice?.message?.refusal === 'string' && choice.message.refusal.trim().length > 0) {
    throw new ProviderError(
      'Provider refused completion request',
      502,
      'MODEL_REFUSAL',
      rawBody,
      'INVALID_RESPONSE',
    );
  }
  if (finishReason === 'content_filter') {
    throw new ProviderError(
      'Provider refused completion request (content_filter)',
      502,
      'MODEL_REFUSAL',
      rawBody,
      'INVALID_RESPONSE',
    );
  }
  if (finishReason === 'length') {
    throw new ProviderError(
      'Provider completion was truncated (finish_reason: length)',
      502,
      'TRUNCATED_RESPONSE',
      rawBody,
      'INVALID_RESPONSE',
    );
  }

  const messageContent = choice?.message?.content ?? choice?.text;
  if (typeof messageContent !== 'string') {
    throw new ProviderError(
      'Provider completion content is not a string',
      502,
      'INVALID_RESPONSE',
      rawBody,
      'INVALID_RESPONSE',
    );
  }

  return { content: messageContent, finishReason };
}

const PLAN_JSON_SCHEMA: Record<string, any> = {
  type: 'object',
  additionalProperties: false,
  required: ['fills'],
  properties: {
    fills: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label'],
        properties: {
          label: { type: 'string' },
          value: { type: ['string', 'null'] },
          fieldId: { type: 'string' },
          evidenceIds: { type: 'array', items: { type: 'string' } },
          action: { type: 'string', enum: ['fill', 'skip', 'defer_combobox'] },
          searchQuery: { type: 'string' },
          dependsOnFieldId: { type: 'string' },
        },
      },
    },
  },
};

const CHOOSE_JSON_SCHEMA: Record<string, any> = {
  type: 'object',
  additionalProperties: false,
  required: ['choice'],
  properties: {
    choice: { type: ['string', 'null'] },
    evidenceIds: { type: 'array', items: { type: 'string' } },
    reason: { type: 'string' },
  },
};

const VALID_PLAN_ACTIONS = new Set(['fill', 'skip', 'defer_combobox']);

function isPlainRecord(val: unknown): val is Record<string, unknown> {
  return Boolean(val && typeof val === 'object' && !Array.isArray(val));
}

function validatePlanShape(input: unknown): { success: true; data: any } | { success: false; error: { message: string } } {
  if (!isPlainRecord(input) || !Array.isArray(input.fills)) {
    return { success: false, error: { message: 'Expected object with fills array' } };
  }
  const validatedFills: Record<string, unknown>[] = [];
  for (let i = 0; i < input.fills.length; i++) {
    const item = input.fills[i];
    if (!isPlainRecord(item)) {
      return { success: false, error: { message: `fills[${i}] must be an object` } };
    }
    if (typeof item.label !== 'string') {
      return { success: false, error: { message: `fills[${i}].label must be a string` } };
    }
    if (item.value !== undefined && item.value !== null && typeof item.value !== 'string') {
      return { success: false, error: { message: `fills[${i}].value must be a string or null` } };
    }
    if (item.fieldId !== undefined && typeof item.fieldId !== 'string') {
      return { success: false, error: { message: `fills[${i}].fieldId must be a string` } };
    }
    if (item.evidenceIds !== undefined && (!Array.isArray(item.evidenceIds) || item.evidenceIds.some((e) => typeof e !== 'string'))) {
      return { success: false, error: { message: `fills[${i}].evidenceIds must be string[]` } };
    }
    if (item.action !== undefined && (typeof item.action !== 'string' || !VALID_PLAN_ACTIONS.has(item.action))) {
      return { success: false, error: { message: `fills[${i}].action must be fill, skip, or defer_combobox` } };
    }
    if (item.searchQuery !== undefined && typeof item.searchQuery !== 'string') {
      return { success: false, error: { message: `fills[${i}].searchQuery must be a string` } };
    }
    if (item.dependsOnFieldId !== undefined && typeof item.dependsOnFieldId !== 'string') {
      return { success: false, error: { message: `fills[${i}].dependsOnFieldId must be a string` } };
    }
    validatedFills.push({
      label: item.label,
      ...(item.value !== undefined ? { value: item.value } : {}),
      ...(item.fieldId !== undefined ? { fieldId: item.fieldId } : {}),
      ...(item.evidenceIds !== undefined ? { evidenceIds: item.evidenceIds } : {}),
      ...(item.action !== undefined ? { action: item.action } : {}),
      ...(item.searchQuery !== undefined ? { searchQuery: item.searchQuery } : {}),
      ...(item.dependsOnFieldId !== undefined ? { dependsOnFieldId: item.dependsOnFieldId } : {}),
    });
  }
  return { success: true, data: { fills: validatedFills } };
}

function validateChooseShape(input: unknown): { success: true; data: any } | { success: false; error: { message: string } } {
  if (!isPlainRecord(input)) {
    return { success: false, error: { message: 'Expected object for choose response' } };
  }
  if (input.choice !== null && typeof input.choice !== 'string') {
    return { success: false, error: { message: 'choice must be a string or null' } };
  }
  if (input.evidenceIds !== undefined && (!Array.isArray(input.evidenceIds) || input.evidenceIds.some((e) => typeof e !== 'string'))) {
    return { success: false, error: { message: 'evidenceIds must be string[]' } };
  }
  if (input.reason !== undefined && typeof input.reason !== 'string') {
    return { success: false, error: { message: 'reason must be a string' } };
  }
  return {
    success: true,
    data: {
      choice: input.choice,
      ...(input.evidenceIds !== undefined ? { evidenceIds: input.evidenceIds } : {}),
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
    },
  };
}

export function resolveContractSchema(
  options?: Pick<GenerateCompletionOptions, 'schemaName' | 'schema'>,
): StructuralSchema<any> | undefined {
  if (options?.schema) return options.schema;
  if (options?.schemaName === 'plan') return { safeParse: validatePlanShape };
  if (options?.schemaName === 'choose') return { safeParse: validateChooseShape };
  return undefined;
}

/**
 * Validates parsed JSON against the required contract schema when configured.
 */
export function validateStructuredPayload(
  rawJson: any,
  options?: Pick<GenerateCompletionOptions, 'schemaName' | 'schema'>,
  rawText?: string,
): any {
  const schema = resolveContractSchema(options);
  if (!schema) return rawJson;
  const parsed = schema.safeParse(rawJson);
  if (!parsed.success) {
    throw new ProviderError(
      `Response failed schema validation: ${parsed.error.message}`,
      502,
      'SCHEMA_VALIDATION_ERROR',
      rawText,
      'INVALID_RESPONSE',
    );
  }
  return parsed.data;
}

/**
 * Returns provider-side JSON Schema for plan/choose contracts.
 */
export function buildProviderJsonSchema(schemaName: 'plan' | 'choose' | string): Record<string, any> | undefined {
  const jsonSchema =
    schemaName === 'plan'
      ? PLAN_JSON_SCHEMA
      : schemaName === 'choose'
        ? CHOOSE_JSON_SCHEMA
        : undefined;
  if (!jsonSchema) return undefined;
  return {
    type: 'json_schema',
    json_schema: {
      name: schemaName,
      schema: jsonSchema,
    },
  };
}

/**
 * Converts an AbortSignal abort into TIMEOUT vs ABORTED ProviderError.
 */
export function signalToProviderError(signal: AbortSignal): ProviderError {
  const reason = (signal as any).reason;
  const isTimeout =
    reason?.name === 'TimeoutError' || (reason && /timeout/i.test(String(reason)));
  if (isTimeout) {
    return new ProviderError('Request timed out', 504, 'TIMEOUT', undefined, 'TIMEOUT');
  }
  return new ProviderError('Request was aborted', 499, 'ABORTED', undefined, 'ABORTED');
}

function isRetryableTransientError(err: unknown): boolean {
  if (!(err instanceof ProviderError)) return false;
  return (
    err.statusCode === 'RATE_LIMITED' ||
    err.status === 503 ||
    err.code === 'NETWORK_ERROR' ||
    err.code === 'FETCH_ERROR'
  );
}

async function sleepWithSignal(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return;
  if (signal?.aborted) {
    throw signalToProviderError(signal);
  }
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signalToProviderError(signal!));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export async function withBoundedRetries<T>(
  run: (remainingMs: number) => Promise<T>,
  options: {
    timeoutMs: number;
    maxRetries?: number;
    baseDelayMs?: number;
    signal?: AbortSignal;
  },
): Promise<T> {
  const startTime = Date.now();
  const deadline = startTime + options.timeoutMs;
  const maxRetries = Math.max(0, Math.min(3, options.maxRetries ?? 0));
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? 250);

  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (options.signal?.aborted) {
      throw signalToProviderError(options.signal);
    }
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw new ProviderError(`Request timed out after ${options.timeoutMs}ms`, 504, 'TIMEOUT', undefined, 'TIMEOUT');
    }

    try {
      return await run(remainingMs);
    } catch (err) {
      lastErr = err;
      if (attempt >= maxRetries || !isRetryableTransientError(err)) {
        throw err;
      }
      const delay = Math.min(baseDelayMs * Math.pow(2, attempt), Math.max(0, deadline - Date.now() - 10));
      if (delay <= 0) {
        throw err;
      }
      await sleepWithSignal(delay, options.signal);
    }
  }

  throw lastErr;
}

/**
 * Detects whether response body contains an HTML error or landing page.
 */
function isHtml(text: string, contentType?: string | null): boolean {
  if (contentType && contentType.toLowerCase().includes('text/html')) {
    return true;
  }
  const clean = text.trim().toLowerCase();
  return clean.startsWith('<!doctype html') || /<html[\s>]/i.test(clean);
}

/**
 * Checks if error text represents an unsupported parameter error (e.g. response_format).
 */
function isUnsupportedParamError(status: number, bodyText: string): boolean {
  if (status !== 400) return false;
  const lower = bodyText.toLowerCase();
  return (
    lower.includes('response_format') ||
    lower.includes('json_schema') ||
    lower.includes('unsupported parameter') ||
    lower.includes('unsupported_parameter') ||
    lower.includes('unrecognized request argument') ||
    lower.includes('extra_forbidden') ||
    lower.includes('json_object')
  );
}

export class ProviderClient {
  readonly baseUrl: string;
  readonly apiKey?: string;
  readonly model: string;
  readonly agent?: any;
  readonly defaultTimeoutMs: number;
  readonly customFetch?: typeof fetch;
  readonly customHeaders?: Record<string, string>;

  // Capability cache: true until proven unsupported by HTTP 400
  protected _supportsJsonMode: boolean = true;
  protected _supportsStructuredOutputs: boolean = true;

  get supportsJsonMode(): boolean {
    return this._supportsJsonMode;
  }

  set supportsJsonMode(value: boolean) {
    this._supportsJsonMode = value;
  }

  get supportsStructuredOutputs(): boolean {
    return this._supportsStructuredOutputs;
  }

  set supportsStructuredOutputs(value: boolean) {
    this._supportsStructuredOutputs = value;
  }

  constructor(
    configOrBaseUrl: ProviderClientConfig | string,
    apiKey?: string,
    model?: string,
    options?: Partial<ProviderClientConfig>,
  ) {
    if (typeof configOrBaseUrl === 'string') {
      this.baseUrl = configOrBaseUrl;
      this.apiKey = apiKey;
      this.model = model || 'gpt-4o-mini';
      this.agent = options?.agent;
      this.defaultTimeoutMs = options?.timeoutMs ?? 20_000;
      this.customFetch = options?.fetchFn;
      this.customHeaders = options?.headers;
      if (typeof options?.supportsJsonMode === 'boolean') {
        this._supportsJsonMode = options.supportsJsonMode;
      }
      if (typeof options?.supportsStructuredOutputs === 'boolean') {
        this._supportsStructuredOutputs = options.supportsStructuredOutputs;
      }
    } else {
      this.baseUrl = configOrBaseUrl.baseUrl;
      this.apiKey = configOrBaseUrl.apiKey;
      this.model = configOrBaseUrl.model;
      this.agent = configOrBaseUrl.agent;
      this.defaultTimeoutMs = configOrBaseUrl.timeoutMs ?? 20_000;
      this.customFetch = configOrBaseUrl.fetchFn;
      this.customHeaders = configOrBaseUrl.headers;
      if (typeof configOrBaseUrl.supportsJsonMode === 'boolean') {
        this._supportsJsonMode = configOrBaseUrl.supportsJsonMode;
      }
      if (typeof configOrBaseUrl.supportsStructuredOutputs === 'boolean') {
        this._supportsStructuredOutputs = configOrBaseUrl.supportsStructuredOutputs;
      }
    }

    if (!this.baseUrl) {
      throw new Error('ProviderClient requires a non-empty baseUrl');
    }
  }

  /**
   * Generates chat completion with capability detection, timeout, runtime schema validation,
   * telemetry (`usage`, `durationMs`), and optional bounded retries.
   */
  async generateChatCompletion(
    messages: ChatMessage[],
    options?: GenerateCompletionOptions,
  ): Promise<ChatCompletionResult> {
    const startTime = Date.now();
    const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;
    return withBoundedRetries(
      (remainingMs) => this._executeWithCapabilityFallback(messages, options, startTime, remainingMs),
      {
        timeoutMs,
        maxRetries: options?.maxRetries,
        baseDelayMs: options?.retryBaseDelayMs,
        signal: options?.signal,
      },
    );
  }

  private async _executeWithCapabilityFallback(
    messages: ChatMessage[],
    options: GenerateCompletionOptions | undefined,
    startTime: number,
    remainingMs: number,
  ): Promise<ChatCompletionResult> {
    const wantsJson = options?.responseFormat !== 'text';
    const contractSchema = resolveContractSchema(options);
    const allowFormatHeader = wantsJson && options?.responseFormat !== 'json_prompt';
    const sendStructuredSchema = Boolean(allowFormatHeader && contractSchema && this.supportsStructuredOutputs);
    const sendJsonMode = Boolean(allowFormatHeader && !sendStructuredSchema && this.supportsJsonMode);
    const isSingleAttemptSchema = options?.schemaName === 'plan' || options?.schemaName === 'choose';
    const mode: 'structured' | 'json_object' | 'prompt' = sendStructuredSchema
      ? 'structured'
      : sendJsonMode
        ? 'json_object'
        : 'prompt';

    try {
      return await this._executeRequest(messages, options, mode, startTime, remainingMs);
    } catch (err: any) {
      if (
        (mode === 'structured' || mode === 'json_object') &&
        err instanceof ProviderError &&
        err.status === 400 &&
        err.responseBody &&
        isUnsupportedParamError(err.status, err.responseBody)
      ) {
        if (mode === 'structured') {
          this.supportsStructuredOutputs = false;
        } else {
          this.supportsJsonMode = false;
        }
        if (!isSingleAttemptSchema) {
          const nextRemaining = startTime + (options?.timeoutMs ?? this.defaultTimeoutMs) - Date.now();
          if (nextRemaining <= 0) {
            throw new ProviderError('Request timed out', 504, 'TIMEOUT', undefined, 'TIMEOUT');
          }
          const nextMode = mode === 'structured' && this.supportsJsonMode ? 'json_object' : 'prompt';
          return await this._executeRequest(messages, options, nextMode, startTime, nextRemaining);
        }
      }
      throw err;
    }
  }

  private async _executeRequest(
    messages: ChatMessage[],
    options: GenerateCompletionOptions | undefined,
    mode: 'structured' | 'json_object' | 'prompt',
    startTime: number,
    timeoutMs: number,
  ): Promise<ChatCompletionResult> {
    const url = resolveCompletionsUrl(this.baseUrl);
    const contractSchema = resolveContractSchema(options);

    const effectiveMessages = [...messages];
    // If json mode is not supported by provider, constrain via prompt
    if (options?.responseFormat !== 'text' && options?.responseFormat !== 'json_prompt' && mode === 'prompt') {
      const jsonConstraint =
        '\n\nIMPORTANT: Respond with valid JSON only. Do not include markdown fences, preamble, or commentary.';
      const lastMsg = effectiveMessages[effectiveMessages.length - 1];
      if (lastMsg) {
        effectiveMessages[effectiveMessages.length - 1] = {
          ...lastMsg,
          content: lastMsg.content + jsonConstraint,
        };
      }
    }

    const payload: Record<string, any> = {
      model: this.model,
      messages: effectiveMessages,
      temperature: options?.temperature ?? 0,
    };

    if (options?.maxTokens !== undefined) {
      payload.max_tokens = options.maxTokens;
    }

    if (mode === 'structured' && options?.schemaName) {
      const jsonSchemaFormat = buildProviderJsonSchema(options.schemaName);
      if (jsonSchemaFormat) {
        payload.response_format = jsonSchemaFormat;
      }
    } else if (mode === 'json_object') {
      payload.response_format = { type: 'json_object' };
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.customHeaders,
    };

    if (this.apiKey && this.apiKey.trim().length > 0) {
      headers['Authorization'] = `Bearer ${this.apiKey.trim()}`;
    }

    const fetchFn = this.customFetch || globalThis.fetch;
    const controller = new AbortController();
    let timedOut = false;
    let abortedByCaller = false;

    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    const abortRequest = () => {
      abortedByCaller = true;
      controller.abort();
    };
    // Link caller's signal if passed
    if (options?.signal) {
      if (options.signal.aborted) {
        clearTimeout(timer);
        throw signalToProviderError(options.signal);
      }
      options.signal.addEventListener('abort', abortRequest, { once: true });
    }

    const requestInit: RequestInit & { agent?: any; dispatcher?: any } = {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
      redirect: 'error',
    };

    if (this.agent) {
      requestInit.agent = this.agent;
      if (typeof this.agent === 'object' && 'dispatch' in this.agent) {
        requestInit.dispatcher = this.agent;
      }
    }

    let response: Response;
    let rawBody: string;
    try {
      response = await fetchFn(url, requestInit);
      rawBody = await response.text();
    } catch (fetchErr: any) {
      if (fetchErr instanceof ProviderError) throw fetchErr;
      clearTimeout(timer);
      if (abortedByCaller || options?.signal?.aborted) {
        throw options?.signal ? signalToProviderError(options.signal) : new ProviderError('Request was aborted', 499, 'ABORTED', undefined, 'ABORTED');
      }
      if (timedOut || fetchErr?.name === 'TimeoutError') {
        throw new ProviderError(`Request timed out after ${timeoutMs}ms`, 504, 'TIMEOUT', undefined, 'TIMEOUT');
      }
      if (fetchErr?.name === 'AbortError' || fetchErr?.message?.includes('aborted')) {
        throw new ProviderError(`Request timed out after ${timeoutMs}ms`, 504, 'TIMEOUT', undefined, 'TIMEOUT');
      }
      if (fetchErr?.message && /redirect/i.test(fetchErr.message)) {
        throw new ProviderError('Redirects are not permitted', 308, 'REDIRECT_BLOCKED', undefined, 'NETWORK_ERROR');
      }
      throw new ProviderError(`Network fetch error: ${fetchErr?.message || fetchErr}`, 500, 'NETWORK_ERROR', undefined, 'NETWORK_ERROR');
    } finally {
      clearTimeout(timer);
      options?.signal?.removeEventListener('abort', abortRequest);
    }

    const contentType = response.headers.get('content-type');

    if (isHtml(rawBody, contentType)) {
      const status = response.status === 429 || response.status === 503 ? response.status : 502;
      throw new ProviderError(
        'Endpoint returned HTML error page instead of JSON',
        status,
        'HTML_RESPONSE',
        rawBody,
        status === 429 ? 'RATE_LIMITED' : 'INVALID_RESPONSE',
      );
    }

    if (!response.ok) {
      const errCode =
        response.status === 429
          ? 'RATE_LIMIT'
          : response.status === 401
            ? 'AUTH_ERROR'
            : response.status === 403
              ? 'FORBIDDEN'
              : response.status === 404
                ? 'NOT_FOUND'
                : 'HTTP_ERROR';
      throw new ProviderError(
        `Provider returned HTTP ${response.status}: ${rawBody}`,
        response.status,
        errCode,
        rawBody,
      );
    }

    let parsedResponse: any;
    try {
      parsedResponse = JSON.parse(rawBody);
    } catch {
      throw new ProviderError('Provider returned malformed JSON response', 502, 'MALFORMED_JSON', rawBody, 'INVALID_RESPONSE');
    }

    const { content: messageContent, finishReason } = validateCompletionEnvelope(parsedResponse, rawBody);
    const usage = extractTokenUsage(parsedResponse.usage);

    // Strip markdown fences
    const cleanedText = stripMarkdownFences(messageContent);
    const expectsStructuredJson = Boolean(contractSchema) || options?.responseFormat === 'json_prompt';

    let rawJson: any = undefined;
    if (options?.responseFormat !== 'text') {
      try {
        rawJson = JSON.parse(cleanedText);
      } catch {
        if (expectsStructuredJson) {
          throw new ProviderError(
            'Provider did not return a valid JSON answer',
            502,
            'MALFORMED_JSON',
            cleanedText,
            'INVALID_RESPONSE',
          );
        }
        // If rawJson parsing fails for untyped call, rawJson remains undefined
      }
    }

    if (contractSchema) {
      rawJson = validateStructuredPayload(rawJson, options, cleanedText);
    }

    return {
      text: cleanedText,
      rawJson,
      ...(usage !== undefined ? { usage } : {}),
      durationMs: Date.now() - startTime,
      ...(finishReason !== undefined ? { finishReason } : {}),
      status: 'OK',
    };
  }
}
