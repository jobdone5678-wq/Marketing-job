'use client';

import { useMemo, useSyncExternalStore } from 'react';

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener('freehire:profile_updated', onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener('freehire:profile_updated', onChange);
  };
}

function readProfile() {
  try {
    return (
      localStorage.getItem('freehire_autofill_profile') ??
      localStorage.getItem('freehire_candidate_profile')
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
