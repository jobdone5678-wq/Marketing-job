import 'server-only';
import { database, checkDb } from '@/lib/db/admin';
import { candidateAccess } from '@/lib/resumes/repository';
import type { Candidate, UserProfile } from '@/types/database';

export async function recommendationContext(profile: UserProfile, params: URLSearchParams) {
  let candidate: Candidate | null = null;
  const requested = params.get('candidateId');
  if (requested) candidate = await candidateAccess(profile, requested) as Candidate;
  else if (profile.role === 'client' || profile.role === 'candidate') {
    const { data, error } = await database().from('candidates').select('*').eq('user_id', profile.id)
      .eq('provenance_status', 'confirmed').order('updated_at', { ascending: false }).order('id').limit(1).maybeSingle();
    checkDb(error);
    candidate = data as Candidate | null;
  }
  // Candidates browse the public feed ranked against their own reviewed resume.
  const enabled = true;
  const ready = candidate?.provenance_status === 'confirmed';
  return {
    candidate: ready ? candidate : null,
    recommendation: {
      enabled,
      requiresProfile: enabled && !ready,
      staffSeeAll: false,
      candidateId: candidate?.id || null,
      candidateName: candidate?.full_name || null,
    },
  };
}
