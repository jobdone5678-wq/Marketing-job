import { randomBytes, createHash } from 'node:crypto';
import { createServerClient } from '@supabase/ssr';
import { cookies as getNextCookies } from 'next/headers';
import { database, checkDb } from '@/lib/db/admin';
import { cors } from '@/lib/capture/server';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit';

const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex');

export async function OPTIONS(request: Request) {
  return cors(request, new Response(null, { status: 204 }));
}

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const limit = checkRateLimit(`quick-pair:${ip}`, { windowMs: 60000, max: 20 });
    if (!limit.allowed) {
      return cors(
        request,
        Response.json(
          { error: 'Too many pairing attempts. Please wait a minute and try again.' },
          { status: 429, headers: { 'Retry-After': String(Math.ceil(limit.resetInMs / 1000)) } }
        )
      );
    }

    const nextCookieStore = await getNextCookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookies: {
          getAll() {
            return nextCookieStore.getAll();
          },
          setAll() {},
        },
      }
    );

    let user = null;
    try {
      const { data, error: uErr } = await supabase.auth.getUser();
      if (!uErr && data?.user) {
        user = data.user;
      }
    } catch (authErr) {
      console.warn('Supabase auth.getUser() error in quick-pair:', authErr);
    }

    if (!user) {
      return cors(
        request,
        Response.json(
          { error: 'Not logged in. Please sign in to NextKinHR at this URL first.' },
          { status: 401 }
        )
      );
    }

    const { data: profile, error: pErr } = await database()
      .from('profiles')
      .select('id, full_name, email, role, status')
      .eq('id', user.id)
      .maybeSingle();

    if (pErr) {
      console.warn('Profile fetch error in quick-pair:', pErr);
    }

    if (!profile) {
      return cors(
        request,
        Response.json(
          { error: 'Profile not found. Please log in or complete your registration on NextKinHR first.' },
          { status: 403 }
        )
      );
    }

    if (profile.status !== 'active' || !['job_seeker', 'client', 'recruiter', 'technical_recruiter', 'super_admin'].includes(profile.role)) {
      return cors(
        request,
        Response.json(
          { error: 'Active candidate, job seeker, recruiter or admin account required to use the extension.' },
          { status: 403 }
        )
      );
    }

    const token = randomBytes(32).toString('base64url');
    const { data: credential, error: cErr } = await database()
      .from('extension_credentials')
      .insert({
        owner_id: profile.id,
        token_hash: tokenHash(token),
      })
      .select('id')
      .single();
    checkDb(cErr);

    if (!credential) {
      return cors(
        request,
        Response.json({ error: 'Failed to create extension credentials.' }, { status: 500 })
      );
    }

    return cors(
      request,
      Response.json({
        success: true,
        token,
        credentialId: credential.id,
        user: {
          id: profile.id,
          name: profile.full_name || profile.email,
          email: profile.email,
          role: profile.role,
        },
      })
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Quick pairing failed';
    return cors(request, Response.json({ error: msg }, { status: 500 }));
  }
}
