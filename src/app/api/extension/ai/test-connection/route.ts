import { z } from 'zod';
import {
  getUserAiProviderConfig,
  getUserAiProviderSecret,
  resolveAuthUserId,
} from '../../../../../lib/ai/ai-provider-data.ts';
import { decryptSecret } from '../../../../../lib/ai/encryption.ts';
import { createSafeAgent, SSRFError } from '../../../../../lib/ai/ssrf-guard.ts';

export const runtime = 'nodejs';

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
});

export async function POST(request: Request, options?: TestConnectionRouteOptions) {
  try {
    const userId = await resolveAuthUserId(request, options?.db);
    if (!userId) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return Response.json({ ok: false, error: 'Invalid JSON request body' }, { status: 400 });
    }

    const parseResult = testConnectionSchema.safeParse(body);
    if (!parseResult.success) {
      return Response.json(
        { ok: false, error: 'Invalid test connection payload', issues: parseResult.error.issues },
        { status: 400 },
      );
    }

    const input = parseResult.data;
    let targetUrl = (input.baseUrl || input.base_url || '').trim() || undefined;

    if (!targetUrl) {
      const existing = await getUserAiProviderConfig(userId, options?.db);
      targetUrl = (existing?.base_url || '').trim() || (process.env.OPENAI_BASE_URL || '').trim() || undefined;
    }

    if (!targetUrl) {
      return Response.json(
        { ok: false, error: 'A valid Base URL is required to test the connection (e.g. https://openrouter.ai/api/v1)' },
        { status: 400 },
      );
    }

    // 1. SSRF Guard: Validate destination IP and bind socket
    let safeAgentResult;
    try {
      safeAgentResult = await createSafeAgent(targetUrl, { allowCustom: true });
    } catch (err: any) {
      if (err instanceof SSRFError) {
        return Response.json(
          { ok: false, error: err.message, code: err.code },
          { status: 400 },
        );
      }
      return Response.json({ ok: false, error: err.message }, { status: 400 });
    }

    // 2. Resolve API Key
    let apiKey = input.apiKey || input.api_key;
    if (!apiKey || apiKey.includes('••••')) {
      const secret = await getUserAiProviderSecret(userId, options?.db);
      if (secret) {
        try {
          apiKey = decryptSecret(
            {
              encrypted: secret.encrypted_api_key,
              iv: secret.iv,
              authTag: secret.auth_tag,
            },
            userId,
            secret.key_origin,
          );
        } catch {
          return Response.json(
            { ok: false, error: 'Failed to decrypt stored provider credentials' },
            { status: 400 },
          );
        }
      }
    }

    // 3. Lightweight ping against /models
    const pingUrl = targetUrl.endsWith('/') ? `${targetUrl}models` : `${targetUrl}/models`;
    const startTime = Date.now();
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    try {
      const fetchFn = options?.fetchFn || fetch;
      const res = await fetchFn(pingUrl, {
        method: 'GET',
        headers,
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
        // @ts-ignore
        agent: safeAgentResult.agent,
      });

      const latencyMs = Date.now() - startTime;
      if (res.ok) {
        return Response.json({
          ok: true,
          message: 'Connection successful',
          latencyMs,
          status: res.status,
        });
      } else if (res.status === 401 || res.status === 403) {
        return Response.json(
          { ok: false, error: `Authentication failed (status ${res.status})`, status: res.status },
          { status: 401 },
        );
      } else {
        return Response.json(
          { ok: false, error: `Provider returned status ${res.status}`, status: res.status },
          { status: 502 },
        );
      }
    } catch (err: any) {
      return Response.json(
        { ok: false, error: `Connection failed: ${err.message}` },
        { status: 502 },
      );
    }
  } catch (err: any) {
    console.error('POST /api/extension/ai/test-connection error:', err);
    return Response.json({ ok: false, error: err?.message || 'Internal server error' }, { status: 500 });
  }
}
