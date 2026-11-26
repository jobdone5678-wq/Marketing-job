const OPENAI_URL = 'https://api.openai.com/v1';
export const VERCEL_AI_GATEWAY_URL = 'https://ai-gateway.vercel.sh/v1';
const DEFAULT_GATEWAY_MODEL = 'openai/gpt-4o-mini';

export function resolveDefaultServerAiConfig(): { baseUrl: string; apiKey: string; model: string } {
  const defaultKey = process.env.AI_PROVIDER_DEFAULT_API_KEY?.trim();
  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  const gatewayKey = process.env.AI_GATEWAY_API_KEY?.trim();
  const gatewaySelected = process.env.AI_PROVIDER?.trim().toLowerCase() === 'vercel_gateway';
  if (gatewaySelected || (!defaultKey && !openAiKey && gatewayKey)) {
    const model = process.env.AI_GATEWAY_MODEL?.trim() || DEFAULT_GATEWAY_MODEL;
    return {
      baseUrl: VERCEL_AI_GATEWAY_URL,
      apiKey: gatewayKey || '',
      model: model.includes('/') ? model : `openai/${model}`,
    };
  }
  const apiKey = defaultKey || openAiKey || '';

  // Read overrides from the same configuration family as the selected key.
  const baseOverride = (defaultKey ? process.env.AI_PROVIDER_DEFAULT_BASE_URL : process.env.OPENAI_BASE_URL)?.trim();
  const modelOverride = (defaultKey ? process.env.AI_PROVIDER_DEFAULT_MODEL : process.env.OPENAI_MODEL)?.trim();

  const detected = apiKey.startsWith('vck_')
    ? { baseUrl: VERCEL_AI_GATEWAY_URL, model: DEFAULT_GATEWAY_MODEL }
    : apiKey.startsWith('AIzaSy')
      ? { baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash' }
      : apiKey.startsWith('sk-or-')
        ? { baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini' }
        : apiKey.startsWith('sk-xt-')
          ? { baseUrl: 'https://api.xkiro.com/v1', model: 'gpt-4o-mini' }
          : /^sk-(?:proj|svcacct|admin)-/.test(apiKey)
            ? { baseUrl: OPENAI_URL, model: 'gpt-4o-mini' }
            : undefined;

  // A recognizable credential must never be forwarded to a stale provider URL.
  const normalizeBase = (url: string) => url.replace(/\/chat\/completions\/?$|\/+$/i, '');
  const matchesProvider = !baseOverride || (
    detected !== undefined && normalizeBase(baseOverride) === detected.baseUrl
  );
  const baseUrl = detected?.baseUrl || baseOverride || OPENAI_URL;
  const configuredModel = matchesProvider || !detected ? modelOverride : undefined;
  let model = configuredModel || detected?.model || 'gpt-4o-mini';
  const hostname = URL.canParse(baseUrl) ? new URL(baseUrl).hostname : '';
  if (hostname === 'generativelanguage.googleapis.com' && !model.startsWith('gemini-')) {
    model = 'gemini-2.5-flash';
  } else if ((hostname === 'openrouter.ai' || hostname === 'ai-gateway.vercel.sh') && !model.includes('/')) {
    model = `openai/${model}`;
  }
  return { baseUrl, apiKey, model };
}

/**
 * Checks rollback feature flag SERVER_ENABLE_VERCEL_AI_SDK.
 * Enabled by default; set to 'false' or '0' to use the legacy client.
 */
export function isVercelAiSdkEnabled(): boolean {
  const flag = process.env.SERVER_ENABLE_VERCEL_AI_SDK;
  return flag !== 'false' && flag !== '0';
}
