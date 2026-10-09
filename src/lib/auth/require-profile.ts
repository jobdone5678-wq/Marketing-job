import 'server-only';
import { createClient } from '@/lib/server';
import { database } from '@/lib/db/admin';
import { CaptureError } from '@/lib/email-confirmations/server';
import { profileAccess } from './profile-access';
import type { UserProfile } from '@/types/database';
import { cookies } from 'next/headers';

interface CachedSession {
  profile: UserProfile;
  expiresAt: number;
}

const PROFILE_CACHE_TTL_MS = 30_000; // 30 seconds
const profileCache = new Map<string, CachedSession>();

function getCacheKey(cookieStore: Awaited<ReturnType<typeof cookies>>): string {
  const all = cookieStore.getAll();
  const tokenCookies = all
    .filter(c => c.name.startsWith('sb-') && (c.name.includes('auth-token') || c.name.includes('access-token')))
    .map(c => `${c.name}:${c.value}`)
    .sort()
    .join('|');
  return tokenCookies;
}

export async function requireProfile(access: 'candidate_or_staff' | 'staff' | 'admin' = 'candidate_or_staff'): Promise<UserProfile> {
  const cookieStore = await cookies();
  const cacheKey = getCacheKey(cookieStore);

  if (cacheKey) {
    const cached = profileCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      if (!profileAccess(cached.profile, access)) {
        throw new CaptureError('An approved active account is required.', 403);
      }
      return cached.profile;
    }
  }

  const client = await createClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) {
    if (cacheKey) profileCache.delete(cacheKey);
    throw new CaptureError('Sign in to continue.', 401);
  }

  // Use database() singleton with connection pooling & no RLS overhead
  const { data: profile, error: profileError } = await database()
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (profileError || !profile || !profileAccess(profile as UserProfile, access)) {
    if (cacheKey) profileCache.delete(cacheKey);
    throw new CaptureError('An approved active account is required.', 403);
  }

  const userProfile = profile as UserProfile;

  if (cacheKey) {
    // Keep cache bounded
    if (profileCache.size > 500) {
      profileCache.clear();
    }
    profileCache.set(cacheKey, {
      profile: userProfile,
      expiresAt: Date.now() + PROFILE_CACHE_TTL_MS,
    });
  }

  return userProfile;
}
