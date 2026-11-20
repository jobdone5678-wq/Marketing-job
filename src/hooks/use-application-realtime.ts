'use client';

import { useEffect, useEffectEvent } from 'react';
import { createClient } from '@/lib/client';

export function useApplicationRealtime(
  refresh: () => void,
  enabled: boolean,
  candidateId?: string
) {
  const refreshApplications = useEffectEvent(refresh);

  useEffect(() => {
    if (!enabled) return;
    const supabase = createClient();
    const filter = candidateId ? { filter: `candidate_id=eq.${candidateId}` } : {};
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const scheduleRefresh = () => {
      if (!active || timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        refreshApplications();
      }, 50);
    };
    const refreshAfterExtensionSave = (event: MessageEvent) => {
      if (event.source === window && event.origin === window.location.origin &&
        event.data?.type === 'NEXTKIN_OUTSIDE_APPLICATION_SAVED') scheduleRefresh();
    };
    window.addEventListener('message', refreshAfterExtensionSave);

    // Re-sync on focus and visibilitychange to recover from background tab socket sleep
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') scheduleRefresh();
    };
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    const channel = supabase
      .channel(`application-updates-${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'job_submissions', ...filter },
        scheduleRefresh
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'outside_jobs', ...filter },
        scheduleRefresh
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') scheduleRefresh();
        if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
          setTimeout(scheduleRefresh, 1000);
        }
      });

    return () => {
      active = false;
      clearTimeout(timer);
      window.removeEventListener('message', refreshAfterExtensionSave);
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      void supabase.removeChannel(channel);
    };
  }, [candidateId, enabled]);
}
