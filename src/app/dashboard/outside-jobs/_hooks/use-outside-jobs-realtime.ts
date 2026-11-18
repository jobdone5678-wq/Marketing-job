'use client';

import { useEffect } from 'react';
import { useApplicationRealtime } from '@/hooks/use-application-realtime';

export function useOutsideJobsRealtime(refresh: () => void) {
  useApplicationRealtime(refresh, true);
  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    refresh();
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [refresh]);
}
