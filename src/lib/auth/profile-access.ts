// candidate is the only valid account role.
// Every authenticated request must resolve to an active candidate profile.
export function profileAccess(profile: { role: string; status: string } | null): boolean {
  if (!profile || profile.status !== 'active') return false;
  return profile.role === 'candidate';
}
