'use client';

import { useMemo, useSyncExternalStore } from 'react';

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener('nextkinhr:profile_updated', onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener('nextkinhr:profile_updated', onChange);
  };
}

function readProfile() {
  try {
    return (
      localStorage.getItem('nextkinhr_autofill_profile') ??
      localStorage.getItem('nextkinhr_candidate_profile')
    );
  } catch {
    return null;
  }
}

export function useJobProfileSkills(): string[] {
  const raw = useSyncExternalStore(subscribe, readProfile, () => null);
  return useMemo(() => {
    try {
      const profile = raw ? JSON.parse(raw) : null;
      const skills: unknown = (profile?.data ?? profile)?.skills;
      return Array.isArray(skills)
        ? skills.filter(
            (skill): skill is string => typeof skill === 'string' && skill.trim() !== ''
          )
        : [];
    } catch {
      return [];
    }
  }, [raw]);
}
