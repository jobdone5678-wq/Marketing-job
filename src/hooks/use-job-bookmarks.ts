'use client';

import { useSyncExternalStore } from 'react';
import { toast } from 'sonner';

const KEY = 'nextkinhr_saved_freehire_jobs';
const LEGACY_KEY = 'freehire_tracked_applications';
const CHANGE_EVENT = 'nextkinhr:job-bookmarks-changed';

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function readSavedJobs(): string {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved !== null) return saved;
    const legacy: { slug?: string; stage?: string }[] = JSON.parse(
      localStorage.getItem(LEGACY_KEY) ?? '[]'
    );
    return JSON.stringify(
      legacy.filter((entry) => entry.stage === 'saved').map((entry) => entry.slug)
    );
  } catch {
    return '[]';
  }
}

function parseSavedJobs(raw: string): string[] {
  try {
    const data: unknown = JSON.parse(raw);
    return Array.isArray(data)
      ? data.filter((value): value is string => typeof value === 'string')
      : [];
  } catch {
    return [];
  }
}

export function useJobBookmarks() {
  const raw = useSyncExternalStore(subscribe, readSavedJobs, () => '[]');

  function toggleSavedJob(slug: string) {
    const current = new Set(parseSavedJobs(readSavedJobs()));
    if (!current.delete(slug)) current.add(slug);
    try {
      localStorage.setItem(KEY, JSON.stringify([...current]));
      window.dispatchEvent(new Event(CHANGE_EVENT));
    } catch {
      toast.error('Could not update the bookmark on this device.');
    }
  }

  return { savedJobs: new Set(parseSavedJobs(raw)), toggleSavedJob };
}
