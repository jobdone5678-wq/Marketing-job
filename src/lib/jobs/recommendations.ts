import 'server-only';
import { database, checkDb } from '@/lib/db/admin';
import { candidateAccess } from '@/lib/resumes/repository';
import type { Candidate, UserProfile } from '@/types/database';

export async function recommendationContext(profile: UserProfile, params: URLSearchParams) {
  let candidate: Candidate | null = null;
  const requested = params.get('candidateId');
  if (requested) {
    try {
      candidate = await candidateAccess(profile, requested) as Candidate;
    } catch {
      candidate = null;
    }
  }

  if (!candidate && ['client', 'candidate', 'admin', 'staff'].includes(profile.role)) {
    // 1. Try finding candidate linked by user_id
    const { data: byUser, error: errUser } = await database().from('candidates').select('*').eq('user_id', profile.id)
      .eq('provenance_status', 'confirmed').order('updated_at', { ascending: false }).order('id').limit(1).maybeSingle();
    checkDb(errUser);
    candidate = byUser as Candidate | null;

    // 2. Fall back to matching by user email
    if (!candidate && profile.email) {
      const { data: byEmail, error: errEmail } = await database().from('candidates').select('*')
        .ilike('email', profile.email)
        .order('updated_at', { ascending: false }).order('id').limit(1).maybeSingle();
      checkDb(errEmail);
      candidate = byEmail as Candidate | null;
    }

    // 3. Fall back to confirmed candidate without user_id or latest confirmed candidate
    if (!candidate) {
      const { data: fallback, error: errFallback } = await database().from('candidates').select('*')
        .eq('provenance_status', 'confirmed')
        .order('updated_at', { ascending: false }).order('id').limit(1).maybeSingle();
      checkDb(errFallback);
      candidate = fallback as Candidate | null;
    }
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
