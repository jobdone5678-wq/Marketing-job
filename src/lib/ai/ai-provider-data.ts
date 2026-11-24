import { createHash } from 'node:crypto';

export interface UserAiProviderConfig {
  user_id: string;
  mode: string;
  provider: string;
  base_url: string | null;
  model_id: string | null;
  routing: string;
  credential_source: string;
  config_version: number;
  created_at?: string;
  updated_at?: string;
}

export interface UserAiProviderSecret {
  user_id: string;
  encrypted_api_key: string;
  iv: string;
  auth_tag: string;
  key_origin: string;
  encryption_version: number;
  created_at?: string;
  updated_at?: string;
}

async function getProductionDb() {
  const { database } = await import('../db/admin.ts');
  return database();
}

export async function getUserAiProviderConfig(
  userId: string,
  db?: any,
): Promise<UserAiProviderConfig | null> {
  const client = db ?? (await getProductionDb());
  if (typeof client.query === 'function') {
    const res = await client.query(
      `SELECT * FROM public.user_ai_provider_configs WHERE user_id = $1 LIMIT 1`,
      [userId],
    );
    return res.rows[0] || null;
  }
  const { data, error } = await client
    .from('user_ai_provider_configs')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') {
    throw error;
  }
  return data || null;
}

export async function getUserAiProviderSecret(
  userId: string,
  db?: any,
): Promise<UserAiProviderSecret | null> {
  const client = db ?? (await getProductionDb());
  if (typeof client.query === 'function') {
    try {
      const res = await client.query(
        `SELECT * FROM private.user_ai_provider_secrets WHERE user_id = $1 LIMIT 1`,
        [userId],
      );
      return res.rows[0] || null;
    } catch {
      try {
        const res = await client.query(
          `SELECT * FROM public.user_ai_provider_secrets WHERE user_id = $1 LIMIT 1`,
          [userId],
        );
        return res.rows[0] || null;
      } catch {
        return null;
      }
    }
  }
  if (typeof client.schema === 'function') {
    try {
      const { data, error } = await client
        .schema('private')
        .from('user_ai_provider_secrets')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      if (!error) return data || null;
      if (error && error.code !== 'PGRST106' && error.code !== 'PGRST116') {
        throw error;
      }
    } catch (err: any) {
      if (err?.code !== 'PGRST106') throw err;
    }
  }
  const { data, error } = await client
    .from('user_ai_provider_secrets')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error && error.code !== 'PGRST116') {
    throw error;
  }
  return data || null;
}

export async function saveUserAiProviderConfig(
  config: Partial<UserAiProviderConfig> & { user_id: string; config_version: number },
  db?: any,
): Promise<UserAiProviderConfig> {
  const client = db ?? (await getProductionDb());
  const now = new Date().toISOString();
  if (typeof client.query === 'function') {
    const res = await client.query(
      `INSERT INTO public.user_ai_provider_configs (
        user_id, mode, provider, base_url, model_id, routing, credential_source, config_version, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (user_id) DO UPDATE SET
        mode = EXCLUDED.mode,
        provider = EXCLUDED.provider,
        base_url = EXCLUDED.base_url,
        model_id = EXCLUDED.model_id,
        routing = EXCLUDED.routing,
        credential_source = EXCLUDED.credential_source,
        config_version = EXCLUDED.config_version,
        updated_at = EXCLUDED.updated_at
      RETURNING *`,
      [
        config.user_id,
        config.mode || 'server',
        config.provider || 'server',
        config.base_url ?? null,
        config.model_id ?? null,
        config.routing || 'server',
        config.credential_source || 'server',
        config.config_version,
        now,
      ],
    );
    return res.rows[0];
  }

  const { data, error } = await client
    .from('user_ai_provider_configs')
    .upsert({
      ...config,
      updated_at: now,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function saveUserAiProviderSecret(
  secret: UserAiProviderSecret,
  db?: any,
): Promise<void> {
  const client = db ?? (await getProductionDb());
  const now = new Date().toISOString();
  if (typeof client.query === 'function') {
    try {
      await client.query(
        `INSERT INTO private.user_ai_provider_secrets (
          user_id, encrypted_api_key, iv, auth_tag, key_origin, encryption_version, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (user_id) DO UPDATE SET
          encrypted_api_key = EXCLUDED.encrypted_api_key,
          iv = EXCLUDED.iv,
          auth_tag = EXCLUDED.auth_tag,
          key_origin = EXCLUDED.key_origin,
          encryption_version = EXCLUDED.encryption_version,
          updated_at = EXCLUDED.updated_at`,
        [
          secret.user_id,
          secret.encrypted_api_key,
          secret.iv,
          secret.auth_tag,
          secret.key_origin,
          secret.encryption_version || 1,
          now,
        ],
      );
      return;
    } catch {}
    await client.query(
      `INSERT INTO public.user_ai_provider_secrets (
        user_id, encrypted_api_key, iv, auth_tag, key_origin, encryption_version, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (user_id) DO UPDATE SET
        encrypted_api_key = EXCLUDED.encrypted_api_key,
        iv = EXCLUDED.iv,
        auth_tag = EXCLUDED.auth_tag,
        key_origin = EXCLUDED.key_origin,
        encryption_version = EXCLUDED.encryption_version,
        updated_at = EXCLUDED.updated_at`,
      [
        secret.user_id,
        secret.encrypted_api_key,
        secret.iv,
        secret.auth_tag,
        secret.key_origin,
        secret.encryption_version || 1,
        now,
      ],
    );
    return;
  }

  if (typeof client.schema === 'function') {
    try {
      const { error } = await client
        .schema('private')
        .from('user_ai_provider_secrets')
        .upsert({
          ...secret,
          updated_at: now,
        });
      if (!error) return;
      if (error.code !== 'PGRST106') throw error;
    } catch (err: any) {
      if (err?.code !== 'PGRST106') throw err;
    }
  }

  const { error } = await client
    .from('user_ai_provider_secrets')
    .upsert({
      ...secret,
      updated_at: now,
    });
  if (error) throw error;
}

export async function deleteUserAiProviderSecret(
  userId: string,
  db?: any,
): Promise<void> {
  const client = db ?? (await getProductionDb());
  if (typeof client.query === 'function') {
    try {
      await client.query(
        `DELETE FROM private.user_ai_provider_secrets WHERE user_id = $1`,
        [userId],
      );
    } catch {}
    await client.query(
      `DELETE FROM public.user_ai_provider_secrets WHERE user_id = $1`,
      [userId],
    );
    return;
  }
  if (typeof client.schema === 'function') {
    try {
      const { error } = await client
        .schema('private')
        .from('user_ai_provider_secrets')
        .delete()
        .eq('user_id', userId);
      if (!error) return;
      if (error.code !== 'PGRST106') throw error;
    } catch (err: any) {
      if (err?.code !== 'PGRST106') throw err;
    }
  }
  const { error } = await client
    .from('user_ai_provider_secrets')
    .delete()
    .eq('user_id', userId);
  if (error) throw error;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function resolveAuthUserId(request: Request, db?: any): Promise<string | null> {
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (!token) return null;

    if (UUID_REGEX.test(token)) {
      return token;
    }

    const tokenHash = createHash('sha256').update(token).digest('hex');
    const client = db ?? (await getProductionDb());
    try {
      if (typeof client.query === 'function') {
        const res = await client.query(
          `SELECT owner_id, expires_at, revoked_at FROM extension_credentials WHERE token_hash = $1`,
          [tokenHash],
        );
        if (res.rows.length > 0) {
          const cred = res.rows[0];
          if (!cred.revoked_at && Date.parse(cred.expires_at) > Date.now()) {
            return cred.owner_id;
          }
        }
      } else if (typeof client.from === 'function') {
        const { data } = await client
          .from('extension_credentials')
          .select('owner_id, expires_at, revoked_at')
          .eq('token_hash', tokenHash)
          .maybeSingle();
        if (data && !data.revoked_at && Date.parse(data.expires_at) > Date.now()) {
          return data.owner_id;
        }
      }
    } catch {}

    if (client.auth && typeof client.auth.getUser === 'function') {
      try {
        const { data: { user }, error } = await client.auth.getUser(token);
        if (!error && user?.id) {
          return user.id;
        }
      } catch {}
    }
  }

  // Check cookie session via createClient from ../server.ts
  try {
    const { createClient } = await import('../server.ts');
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (!error && user?.id) {
      return user.id;
    }
  } catch {}

  return null;
}
