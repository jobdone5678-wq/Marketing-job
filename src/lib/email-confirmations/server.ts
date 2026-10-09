import 'server-only';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/server';
import type { UserProfile } from '@/types/database';

export class CaptureError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

let _adminClient: ReturnType<typeof createSupabaseClient> | null = null;
export function adminClient() {
  if (_adminClient) return _adminClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new CaptureError('Server-side Supabase configuration is missing. See the recruiting setup guide.', 503);
  _adminClient = createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _adminClient;
}

export async function requireCaptureStaff() {
  const client = await createClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) throw new CaptureError('Sign in to manage email confirmations.', 401);
  const { data: profile, error: profileError } = await client.from('profiles').select('*').eq('id', user.id).single();
  if (profileError || !profile || profile.status !== 'active' || !['recruiter','super_admin'].includes(profile.role)) {
    throw new CaptureError('An active recruiter or administrator account is required.', 403);
  }
  return { client, profile: profile as UserProfile };
}

export function requireSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const configured = process.env.APP_URL;
  const expected = configured ? new URL(configured).origin : new URL(request.url).origin;
  if (!origin || origin !== expected) throw new CaptureError('Request origin is not permitted.', 403);
}

export function captureErrorResponse(error: unknown) {
  if (error instanceof CaptureError) return Response.json({ error: error.message }, { status: error.status });
  // Provider messages and database details may include personal data. Do not log them.
  return Response.json({ error: 'The request could not be completed. Check setup and try again.' }, { status: 500 });
}

export function checkDb(error: { message: string; code?: string } | null) {
  if (!error) return;
  if (['42P01','PGRST205','PGRST202','42703'].includes(error.code || '')) {
    throw new CaptureError('Apply the required database migrations before using this feature.', 503);
  }
  throw new CaptureError('The database operation failed. Nothing was reported as saved.', 500);
}
