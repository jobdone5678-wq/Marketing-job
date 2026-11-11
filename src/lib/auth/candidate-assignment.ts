import type { Candidate } from '@/types/database';

// A candidate may only reach their own candidate record.
export function canAccessCandidateRecord(
  actor: { id: string; status?: string },
  candidate: Pick<Candidate, 'id' | 'user_id'>,
): boolean {
  if (actor.status && actor.status !== 'active') return false;
  return candidate.user_id === actor.id;
}
