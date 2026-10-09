import { randomBytes, createHash } from 'node:crypto';
import { createServerClient } from '@supabase/ssr';
import { cookies as getNextCookies } from 'next/headers';
import { database, checkDb } from '@/lib/db/admin';
import { cors } from '@/lib/capture/server';

const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex');

export async function OPTIONS(request: Request) {
  return cors(request, new Response(null, { status: 204 }));
}

export async function POST(request: Request) {
  try {
    const nextCookieStore = await getNextCookies();
    let bodyCookies: { name: string; value: string }[] = [];

    try {
      const body = await request.clone().json();
      if (body && Array.isArray(body.cookies)) {
        bodyCookies = body.cookies;
      }
    } catch {}

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookies: {
          getAll() {
            if (bodyCookies.length > 0) {
              return bodyCookies;
            }
            return nextCookieStore.getAll();
          },
          setAll() {},
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return cors(
        request,
        Response.json(
          { error: 'Not logged in. Please sign in to the Marketing Portal at this URL first.' },
          { status: 401 }
        )
      );
    }

    const { data: profile, error: pErr } = await database()
      .from('profiles')
      .select('id, full_name, email, role, status')
      .eq('id', user.id)
      .single();
    checkDb(pErr);

    if (!profile || profile.status !== 'active' || !['recruiter', 'super_admin'].includes(profile.role)) {
      return cors(
        request,
        Response.json(
          { error: 'Active recruiter or admin account required to use the extension.' },
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
