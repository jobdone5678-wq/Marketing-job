import { z } from 'zod';
import {
  getUserAiProviderConfig,
  getUserAiProviderSecret,
  saveUserAiProviderConfig,
  saveUserAiProviderSecret,
  deleteUserAiProviderSecret,
  resolveAuthUserId,
} from '../../../../../lib/ai/ai-provider-data.ts';
import { encryptSecret, decryptSecret } from '../../../../../lib/ai/encryption.ts';

export const runtime = 'nodejs';

export function maskApiKey(key: string): string {
  if (!key) return '';
  const trimmed = key.trim();
  if (trimmed.length <= 8) {
    return '••••' + trimmed.slice(-2);
  }
  if (trimmed.startsWith('sk-or-')) {
    return `sk-or-••••${trimmed.slice(-4)}`;
  }
  const prefix = trimmed.slice(0, 6);
  return `${prefix}••••${trimmed.slice(-4)}`;
}

export function getOriginFromBaseUrl(baseUrl: string): string {
  try {
    const u = new URL(baseUrl);
    return u.origin;
  } catch {
    return baseUrl;
  }
}

export interface SettingsRouteOptions {
  db?: any;
}

const updateSettingsSchema = z.object({
  mode: z.enum(['server', 'portal_byok', 'extension_byok', 'local']).optional(),
  provider: z.string().min(1).max(100).optional(),
  baseUrl: z.string().url().max(2000).nullable().optional(),
  base_url: z.string().url().max(2000).nullable().optional(),
  modelId: z.string().min(1).max(200).nullable().optional(),
  model_id: z.string().min(1).max(200).nullable().optional(),
  routing: z.enum(['server', 'proxy', 'direct']).optional(),
  credentialSource: z.enum(['server', 'portal', 'extension', 'local']).optional(),
  credential_source: z.enum(['server', 'portal', 'extension', 'local']).optional(),
  configVersion: z.number().int().min(1).optional(),
  config_version: z.number().int().min(1).optional(),
  apiKey: z.string().max(2000).nullable().optional(),
  api_key: z.string().max(2000).nullable().optional(),
});

export async function GET(request: Request, options?: SettingsRouteOptions) {
  try {
    const userId = await resolveAuthUserId(request, options?.db);
    if (!userId) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const config = await getUserAiProviderConfig(userId, options?.db);
    const secret = await getUserAiProviderSecret(userId, options?.db);

    let maskedApiKey: string | null = null;
    let hasApiKey = false;

    if (secret && secret.encrypted_api_key) {
      hasApiKey = true;
      try {
        const plain = decryptSecret(
          {
            encrypted: secret.encrypted_api_key,
            iv: secret.iv,
            authTag: secret.auth_tag,
          },
          userId,
          secret.key_origin,
        );
        maskedApiKey = maskApiKey(plain);
      } catch {
        maskedApiKey = '••••••••';
      }
    }

    return Response.json({
      mode: config?.mode || 'server',
      provider: config?.provider || 'server',
      baseUrl: config?.base_url || null,
      modelId: config?.model_id || null,
      routing: config?.routing || 'server',
      credentialSource: config?.credential_source || 'server',
      configVersion: config?.config_version || 1,
      hasApiKey,
      maskedApiKey,
    });
  } catch (err: any) {
    console.error('GET /api/extension/ai/settings error:', err);
    return Response.json({ ok: false, error: err?.message || 'Failed to fetch AI settings' }, { status: 500 });
  }
}

export async function PUT(request: Request, options?: SettingsRouteOptions) {
  try {
    const userId = await resolveAuthUserId(request, options?.db);
    if (!userId) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'Invalid JSON request body' }, { status: 400 });
    }

    const parseResult = updateSettingsSchema.safeParse(body);
    if (!parseResult.success) {
      return Response.json(
        { error: 'Invalid settings payload', issues: parseResult.error.issues },
        { status: 400 },
      );
    }

    const input = parseResult.data;
    const baseUrl = input.baseUrl !== undefined ? input.baseUrl : input.base_url;
    const modelId = input.modelId !== undefined ? input.modelId : input.model_id;
    const clientVersion = input.configVersion ?? input.config_version;
    const incomingApiKey = input.apiKey !== undefined ? input.apiKey : input.api_key;

    const existing = await getUserAiProviderConfig(userId, options?.db);
    const currentVersion = existing ? existing.config_version : 1;

    // Optimistic locking validation
    if (existing) {
      if (clientVersion !== undefined && clientVersion !== currentVersion) {
        return Response.json(
          {
            ok: false,
            error: 'Optimistic locking failure: config_version mismatch',
            currentVersion,
          },
          { status: 409 },
        );
      }
    }

    const nextVersion = existing ? currentVersion + 1 : (clientVersion ? clientVersion + 1 : 1);

    // API Key handling: retain existing if omitted or masked
    const trimmedApiKey =
      typeof incomingApiKey === 'string' ? incomingApiKey.trim() : incomingApiKey;
    const isNewKey =
      typeof trimmedApiKey === 'string' &&
      trimmedApiKey !== '' &&
      !trimmedApiKey.includes('••••');

    const targetMode = input.mode || existing?.mode || 'server';
    const existingSecret = await getUserAiProviderSecret(userId, options?.db);

    if (
      targetMode === 'portal_byok' &&
      !isNewKey &&
      (incomingApiKey === null || trimmedApiKey === '' || !existingSecret?.encrypted_api_key)
    ) {
      return Response.json(
        { ok: false, error: 'An API key is required for Portal Encrypted BYOK mode.' },
        { status: 400 },
      );
    }

    if (isNewKey) {
      const targetBaseUrl = baseUrl || existing?.base_url || 'https://api.openai.com';
      const origin = getOriginFromBaseUrl(targetBaseUrl);
      const payload = encryptSecret(trimmedApiKey, userId, origin);

      await saveUserAiProviderSecret(
        {
          user_id: userId,
          encrypted_api_key: payload.encrypted,
          iv: payload.iv,
          auth_tag: payload.authTag,
          key_origin: origin,
          encryption_version: 1,
        },
        options?.db,
      );
    } else if (incomingApiKey === null || trimmedApiKey === '') {
      await deleteUserAiProviderSecret(userId, options?.db);
    }

    const targetRouting =
      input.routing ||
      (targetMode === 'portal_byok'
        ? 'proxy'
        : targetMode === 'extension_byok' || targetMode === 'local'
        ? 'direct'
        : existing?.routing || 'server');

    const targetCredSource =
      input.credentialSource ||
      input.credential_source ||
      (targetMode === 'portal_byok'
        ? 'portal'
        : targetMode === 'extension_byok'
        ? 'extension'
        : targetMode === 'local'
        ? 'local'
        : existing?.credential_source || 'server');

    // Update configuration metadata
    const updatedConfig = await saveUserAiProviderConfig(
      {
        user_id: userId,
        mode: targetMode,
        provider: input.provider || existing?.provider || 'server',
        base_url: baseUrl !== undefined ? baseUrl : (existing?.base_url ?? null),
        model_id: modelId !== undefined ? modelId : (existing?.model_id ?? null),
        routing: targetRouting,
        credential_source: targetCredSource,
        config_version: nextVersion,
      },
      options?.db,
    );

    const secretRecord = await getUserAiProviderSecret(userId, options?.db);
    const hasApiKey = Boolean(secretRecord?.encrypted_api_key);

    return Response.json({
      ok: true,
      configVersion: updatedConfig.config_version,
      mode: updatedConfig.mode,
      provider: updatedConfig.provider,
      baseUrl: updatedConfig.base_url,
      modelId: updatedConfig.model_id,
      routing: updatedConfig.routing,
      credentialSource: updatedConfig.credential_source,
      hasApiKey,
    });
  } catch (err: any) {
    console.error('PUT /api/extension/ai/settings error:', err);
    return Response.json({ ok: false, error: err?.message || 'Failed to save AI settings' }, { status: 500 });
  }
}
