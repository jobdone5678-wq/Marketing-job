import { z } from 'zod';
import {
  getUserAiProviderConfig,
  getUserAiProviderSecret,
  resolveAuthUserId,
} from './ai-provider-data';
import { decryptSecret } from './encryption';
import { ProviderClient, ProviderError } from './provider-client';
import { isVercelAiSdkEnabled, resolveDefaultServerAiConfig } from './server-ai-config';
import { ServerVercelProviderClient } from './server-provider-client';
import { createSafeAgent, SSRFError } from './ssrf-guard';
import { createSsrfSafeFetch } from './ssrf-fetch-adapter';
import { checkRateLimit } from '../rate-limit';

export interface TestConnectionRouteOptions {
  db?: any;
  fetchFn?: typeof fetch;
}

const testConnectionSchema = z.object({
  baseUrl: z.union([z.string().url().max(2000), z.literal('')]).nullable().optional(),
  base_url: z.union([z.string().url().max(2000), z.literal('')]).nullable().optional(),
  apiKey: z.string().max(2000).nullable().optional(),
  api_key: z.string().max(2000).nullable().optional(),
  modelId: z.string().max(200).nullable().optional(),
  model_id: z.string().max(200).nullable().optional(),
  provider: z.string().max(100).optional(),
  mode: z.enum(['server', 'portal_byok', 'extension_byok', 'local']).optional(),
});

function failure(error: string, status: number, details = {}) {
  return Response.json({ ok: false, error, status, ...details }, { status });
}

export async function testAiConnection(request: Request, options?: TestConnectionRouteOptions) {
  try {
    const userId = await resolveAuthUserId(request, options?.db);
    if (!userId) return failure('Unauthorized', 401);

    const limit = checkRateLimit(`ai-test-connection:${userId}`, { windowMs: 60_000, max: 20 });
    if (!limit.allowed) return failure('Too many connection tests. Retry shortly.', 429);

    const result = testConnectionSchema.safeParse(await request.json().catch(() => null));
    if (!result.success) {
      return failure('Invalid test connection payload', 400, { issues: result.error.issues });
    }

    const input = result.data;
    let baseUrl = (input.baseUrl || input.base_url || '').trim();
    let apiKey = (input.apiKey || input.api_key || '').trim();
    let model = (input.modelId || input.model_id || '').trim();
    const serverMode = input.mode === 'server' || (!input.mode && input.provider === 'server' && !apiKey);
    if (serverMode) {
      ({ baseUrl, apiKey, model } = resolveDefaultServerAiConfig());
      if (!apiKey) return failure('Server AI is not configured.', 503);
    } else {
      const saved = await getUserAiProviderConfig(userId, options?.db);
      const portalConfig = saved?.mode === 'portal_byok' ? saved : null;
      baseUrl ||= portalConfig?.base_url || '';
      model ||= portalConfig?.model_id || '';
      if (!apiKey || apiKey.includes('••••')) {
        const secret = portalConfig && await getUserAiProviderSecret(userId, options?.db);
        if (!secret || !baseUrl || new URL(baseUrl).origin !== new URL(secret.key_origin).origin) {
          return failure('Provide an API key for this provider.', 401);
        }
        try {
          apiKey = decryptSecret(
            { encrypted: secret.encrypted_api_key, iv: secret.iv, authTag: secret.auth_tag },
            userId,
            secret.key_origin,
          );
        } catch {
          return failure('Failed to decrypt stored provider credentials', 401);
        }
      }
    }

    if (!baseUrl) return failure('A valid Base URL is required to test the connection.', 400);
    const safeAgent = await createSafeAgent(baseUrl, { allowCustom: true });
    if (!model) return failure('Select a model to test chat completion.', 400);
    if (/recraft|dall-e|midjourney|flux|stable-diffusion/i.test(model)) {
      return failure(`Model "${model}" is an image generation model. Select a text model.`, 422);
    }

    const startTime = Date.now();
    const useSdk = isVercelAiSdkEnabled();
    const Client = useSdk ? ServerVercelProviderClient : ProviderClient;
    const client = new Client({
      baseUrl: safeAgent.validatedUrl,
      apiKey,
      model,
      timeoutMs: 15_000,
      agent: safeAgent.agent,
      fetchFn: useSdk ? options?.fetchFn : createSsrfSafeFetch(safeAgent, options?.fetchFn),
    });
    const completion = await client.generateChatCompletion(
      [{ role: 'user', content: 'Reply with OK.' }],
      { responseFormat: 'text', maxTokens: 128, signal: request.signal },
    );
    if (!completion.text.trim()) return failure('The model returned no text.', 502);
    return Response.json({ ok: true, message: 'Chat completion verified', latencyMs: Date.now() - startTime, status: 200 });
  } catch (error) {
    if (error instanceof SSRFError) return failure(error.message, 400, { code: error.code });
    if (error instanceof ProviderError) {
      const status = error.status === 403 ? 401 : error.status;
      const exposedStatus = [401, 429, 503, 504].includes(status) ? status : 502;
      return failure(`Chat completion failed (HTTP ${error.status}).`, exposedStatus, { providerStatus: error.status });
    }
    return failure('Connection test failed.', 500);
  }
}
