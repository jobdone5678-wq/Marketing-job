import type { AppRole, Candidate } from '@/types/database';

export function canAccessCandidateRecord(
  actor: { id: string; role: AppRole; status?: string },
  candidate: Pick<Candidate, 'id' | 'user_id' | 'assigned_recruiter_id' | 'assigned_technical_recruiter_id'>,
): boolean {
  if (actor.status && actor.status !== 'active') return false;
  if (actor.role === 'super_admin') return true;
  if (actor.role === 'client') return candidate.user_id === actor.id;
  if (actor.role === 'recruiter') return candidate.assigned_recruiter_id === actor.id;
  if (actor.role === 'technical_recruiter') return candidate.assigned_technical_recruiter_id === actor.id;
  return false;
}
