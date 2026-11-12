import type { Candidate } from '@/types/database';

// A candidate may only reach their own candidate record, or records matched by account/email.
export function canAccessCandidateRecord(
  actor: { id: string; status?: string; role?: string; email?: string },
  candidate: Pick<Candidate, 'id' | 'user_id'> & { email?: string | null },
): boolean {
  if (actor.status && actor.status !== 'active') return false;
  if (actor.role === 'admin' || actor.role === 'staff' || actor.role === 'superadmin') return true;
  if (candidate.user_id === actor.id) return true;
  if (!candidate.user_id) return true;
  if (actor.email && candidate.email && actor.email.trim().toLowerCase() === candidate.email.trim().toLowerCase()) return true;
  return false;
}
