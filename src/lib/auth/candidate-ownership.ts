import 'server-only';
import { database, checkDb } from '@/lib/db/admin';
import type { UserProfile } from '@/types/database';

export interface OwnedCandidate {
  id: string;
  full_name: string;
  user_id: string | null;
  email: string | null;
}

export async function ownedCandidates(profile: UserProfile): Promise<OwnedCandidate[]> {
  const db = database();
  const owned = new Map<string, OwnedCandidate>();
  const { data: byUser, error: userError } = await db
    .from('candidates')
    .select('id, full_name, user_id, email')
    .eq('user_id', profile.id);
  checkDb(userError);
  for (const row of byUser || []) owned.set(row.id, row as OwnedCandidate);
  if (profile.email) {
    const { data: byEmail, error: emailError } = await db
      .from('candidates')
      .select('id, full_name, user_id, email')
      .eq('email', profile.email);
    checkDb(emailError);
    for (const row of byEmail || []) owned.set(row.id, row as OwnedCandidate);
  }
  return [...owned.values()];
}

export async function ensureOwnedCandidate(
  profile: UserProfile,
  fallbackName?: string | null
): Promise<OwnedCandidate | null> {
  const owned = await ownedCandidates(profile);
  const primary = owned.find((row) => row.user_id === profile.id) ?? owned[0] ?? null;
  if (primary) {
    const patch: Record<string, unknown> = {};
    if (!primary.user_id) patch.user_id = profile.id;
    if (!primary.email && profile.email) patch.email = profile.email;
    if (Object.keys(patch).length) {
      const { data: updated, error } = await database()
        .from('candidates')
        .update(patch)
        .eq('id', primary.id)
        .select('id, full_name, user_id, email')
        .maybeSingle();
      checkDb(error);
      if (updated) return updated as OwnedCandidate;
    }
    return primary;
  }
  const fullName = (fallbackName || profile.full_name || '').trim() || 'Candidate';
  const { data: created, error } = await database()
    .from('candidates')
    .insert({
      user_id: profile.id,
      email: profile.email || null,
      full_name: fullName,
      is_active_bench: true,
      notes: 'Created via RTR self-service upload',
    })
    .select('id, full_name, user_id, email')
    .maybeSingle();
  checkDb(error);
  return (created as OwnedCandidate) ?? null;
}
