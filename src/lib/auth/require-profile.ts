import 'server-only';
import {createClient} from '@/lib/server';
import {CaptureError} from '@/lib/email-confirmations/server';
import {profileAccess} from './profile-access';
import type {UserProfile} from '@/types/database';
export async function requireProfile(access:'candidate_or_staff'|'staff'|'admin'='candidate_or_staff'):Promise<UserProfile> {
  const client=await createClient();
  const {data:{user},error}=await client.auth.getUser();
  if(error||!user)throw new CaptureError('Sign in to continue.',401);
  const {data:profile,error:profileError}=await client.from('profiles').select('*').eq('id',user.id).single();
  if(profileError||!profileAccess(profile,access))throw new CaptureError('An approved active account is required.',403);
  return profile as UserProfile;
}
