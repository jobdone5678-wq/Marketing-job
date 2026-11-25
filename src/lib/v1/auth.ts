import { createHash } from 'node:crypto';

export interface RouteDbOptions {
  db?: any;
  params?: Promise<Record<string, string>>;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getDbClient(db?: any): Promise<any> {
  if (db) return db;
  const { database } = await import('../db/admin');
  return database();
}

export async function resolveV1UserId(
  request: Request,
  db?: any,
  { bearerOnly = false } = {}
): Promise<string | null> {
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (!token) return null;

    // Allow direct UUID bearer token when running with injected test DB (PGlite)
    if (db && UUID_REGEX.test(token)) {
      return token;
    }

    const client = await getDbClient(db);
    const tokenHash = createHash('sha256').update(token).digest('hex');

    try {
      if (typeof client.query === 'function') {
        const res = await client.query(
          `SELECT owner_id, expires_at, revoked_at FROM public.extension_credentials WHERE token_hash = $1 LIMIT 1`,
          [tokenHash]
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
    } catch {
      // Ignore if extension_credentials is absent in isolated unit DB
    }

    if (client.auth && typeof client.auth.getUser === 'function') {
      try {
        const {
          data: { user },
          error,
        } = await client.auth.getUser(token);
        if (!error && user?.id) {
          return user.id;
        }
      } catch {
        // Fall through
      }
    }
  }

  if (bearerOnly) return null;

  try {
    const { createClient } = await import('../server');
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (!error && user?.id) {
      return user.id;
    }
  } catch {
    // Outside Next.js request context
  }

  return null;
}

export class DomainValidationError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 400, code = 'VALIDATION_ERROR') {
    super(message);
    this.name = 'DomainValidationError';
    this.status = status;
    this.code = code;
  }
}

export function v1ErrorResponse(error: unknown): Response {
  if (error instanceof DomainValidationError) {
    return Response.json(
      { ok: false, error: error.message, code: error.code },
      { status: error.status }
    );
  }
  const status =
    typeof (error as { status?: unknown })?.status === 'number'
      ? (error as { status: number }).status
      : 500;
  const message =
    error instanceof Error && status < 500 ? error.message : 'Internal server error.';
  return Response.json({ ok: false, error: message }, { status });
}
