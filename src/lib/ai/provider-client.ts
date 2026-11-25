export interface ProviderClientConfig {
  baseUrl: string;
  apiKey?: string;
  model: string;
  agent?: any;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
  headers?: Record<string, string>;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GenerateCompletionOptions {
  responseFormat?: 'json_object' | 'text';
  schemaName?: 'plan' | 'choose';
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
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
}

export class ProviderError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly responseBody?: string;

  constructor(message: string, status: number = 500, code?: string, responseBody?: string) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
    this.code = code;
    this.responseBody = responseBody;
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
  if (trimmed.endsWith('/v1')) {
    return `${trimmed}/chat/completions`;
  }
  return `${trimmed}/v1/chat/completions`;
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
    lower.includes('unsupported parameter') ||
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

  get supportsJsonMode(): boolean {
    return this._supportsJsonMode;
  }

  set supportsJsonMode(value: boolean) {
    this._supportsJsonMode = value;
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
    } else {
      this.baseUrl = configOrBaseUrl.baseUrl;
      this.apiKey = configOrBaseUrl.apiKey;
      this.model = configOrBaseUrl.model;
      this.agent = configOrBaseUrl.agent;
      this.defaultTimeoutMs = configOrBaseUrl.timeoutMs ?? 20_000;
      this.customFetch = configOrBaseUrl.fetchFn;
      this.customHeaders = configOrBaseUrl.headers;
    }

    if (!this.baseUrl) {
      throw new Error('ProviderClient requires a non-empty baseUrl');
    }
  }

  /**
   * Generates chat completion with capability detection, timeout, and markdown stripping.
   */
  async generateChatCompletion(
    messages: ChatMessage[],
    options?: GenerateCompletionOptions,
  ): Promise<ChatCompletionResult> {
    const wantsJson = options?.responseFormat !== 'text';
    const sendJsonMode = wantsJson && this.supportsJsonMode;

    try {
      return await this._executeRequest(messages, options, sendJsonMode);
    } catch (err: any) {
      // If HTTP 400 indicates unsupported response_format, cache capability and retry
      if (
        sendJsonMode &&
        err instanceof ProviderError &&
        err.status === 400 &&
        err.responseBody &&
        isUnsupportedParamError(err.status, err.responseBody)
      ) {
        this.supportsJsonMode = false;
        // Retry with prompt-constrained JSON instead
        return await this._executeRequest(messages, options, false);
      }
      throw err;
    }
  }

  private async _executeRequest(
    messages: ChatMessage[],
    options?: GenerateCompletionOptions,
    sendJsonMode: boolean = false,
  ): Promise<ChatCompletionResult> {
    const url = resolveCompletionsUrl(this.baseUrl);
    const timeoutMs = options?.timeoutMs ?? this.defaultTimeoutMs;

    let effectiveMessages = [...messages];
    // If json mode is not supported by provider, constrain via prompt
    if (options?.responseFormat !== 'text' && !sendJsonMode) {
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

    if (sendJsonMode) {
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

    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    // Link caller's signal if passed
    if (options?.signal) {
      if (options.signal.aborted) {
        clearTimeout(timer);
        throw new ProviderError('Request was aborted', 499, 'ABORTED');
      }
      options.signal.addEventListener('abort', () => controller.abort(), { once: true });
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
    try {
      response = await fetchFn(url, requestInit);
    } catch (fetchErr: any) {
      clearTimeout(timer);
      if (timedOut || fetchErr.name === 'AbortError' || fetchErr.message?.includes('aborted')) {
        throw new ProviderError(`Request timed out after ${timeoutMs}ms`, 504, 'TIMEOUT');
      }
      if (fetchErr.message && /redirect/i.test(fetchErr.message)) {
        throw new ProviderError('Redirects are not permitted', 308, 'REDIRECT_BLOCKED');
      }
      throw new ProviderError(`Network fetch error: ${fetchErr.message}`, 500, 'FETCH_ERROR');
    } finally {
      clearTimeout(timer);
    }

    const contentType = response.headers.get('content-type');
    const rawBody = await response.text();

    if (isHtml(rawBody, contentType)) {
      throw new ProviderError('Endpoint returned HTML error page instead of JSON', 502, 'HTML_RESPONSE', rawBody);
    }

    if (!response.ok) {
      throw new ProviderError(
        `Provider returned HTTP ${response.status}: ${rawBody}`,
        response.status,
        'HTTP_ERROR',
        rawBody,
      );
    }

    let parsedResponse: any;
    try {
      parsedResponse = JSON.parse(rawBody);
    } catch {
      throw new ProviderError('Provider returned malformed JSON response', 502, 'MALFORMED_JSON', rawBody);
    }

    const choice = parsedResponse.choices?.[0];
    const messageContent = choice?.message?.content ?? choice?.text ?? '';

    // Strip markdown fences
    const cleanedText = stripMarkdownFences(messageContent);

    let rawJson: any = undefined;
    try {
      rawJson = JSON.parse(cleanedText);
    } catch {
      // If rawJson parsing fails, rawJson remains undefined
    }

    return {
      text: cleanedText,
      rawJson,
    };
  }
}
