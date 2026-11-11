// Candidate and client are the only valid account roles.
// Every authenticated request must resolve to an active candidate or client profile.
export function profileAccess(profile: { role: string; status: string } | null): boolean {
  if (!profile || profile.status !== 'active') return false;
  return profile.role === 'client' || profile.role === 'candidate';
}
