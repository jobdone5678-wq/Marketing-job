import 'server-only';
import {cookies} from 'next/headers';
import {createClient} from '@/lib/server';
import {database} from '@/lib/db/admin';
import {CaptureError} from '@/lib/email-confirmations/server';
import {profileAccess,type ProfileAccess} from './profile-access';
import type {UserProfile} from '@/types/database';

const inflightAuth = new Map<string, Promise<UserProfile>>();

async function fetchProfile(): Promise<UserProfile> {
  const client = await createClient();
  const {data:{user},error} = await client.auth.getUser();
  if(error||!user) throw new CaptureError('Sign in to continue.',401);
  // Check current account status for every protected operation; a suspended session must stop immediately.
  const {data:profile,error:profileError} = await database().from('profiles').select('*').eq('id',user.id).single();
  if(profileError||!profile) throw new CaptureError('An approved active account is required.',403);
  return profile as UserProfile;
}

export async function requireProfile(access:ProfileAccess='candidate_or_staff'):Promise<UserProfile> {
  let sessionKey = '';
  try {
    const store = await cookies();
    const all = store.getAll();
    if(all.length > 0) {
      sessionKey = all.map(c => `${c.name}=${c.value}`).sort().join(';');
    }
  } catch {
    // cookies() may throw outside request context
  }

  let profilePromise: Promise<UserProfile>;
  if (sessionKey) {
    const inflight = inflightAuth.get(sessionKey);
    if (inflight) {
      profilePromise = inflight;
    } else {
      profilePromise = fetchProfile().finally(() => {
        inflightAuth.delete(sessionKey);
      });
      inflightAuth.set(sessionKey, profilePromise);
    }
  } else {
    profilePromise = fetchProfile();
  }

  const profile = await profilePromise;
  if(!profileAccess(profile, access)) throw new CaptureError('An approved active account is required.',403);
  return profile;
}

