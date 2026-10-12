import 'server-only';
import {createClient} from '@/lib/server';
import {database} from '@/lib/db/admin';
import {CaptureError} from '@/lib/email-confirmations/server';
import {profileAccess,type ProfileAccess} from './profile-access';
import type {UserProfile} from '@/types/database';

export async function requireProfile(access:ProfileAccess='candidate_or_staff'):Promise<UserProfile> {
  const client=await createClient();
  const {data:{user},error}=await client.auth.getUser();
  if(error||!user)throw new CaptureError('Sign in to continue.',401);
  // Check current account status for every protected operation; a suspended session must stop immediately.
  const {data:profile,error:profileError}=await database().from('profiles').select('*').eq('id',user.id).single();
  if(profileError||!profile||!profileAccess(profile as UserProfile,access))throw new CaptureError('An approved active account is required.',403);
  return profile as UserProfile;
}
