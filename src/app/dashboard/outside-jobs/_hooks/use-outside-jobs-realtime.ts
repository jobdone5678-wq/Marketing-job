'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/client';
import { toast } from 'sonner';
import { OutsideJob } from '../page';

export function useOutsideJobsRealtime(
  setJobs: React.Dispatch<React.SetStateAction<OutsideJob[]>>
) {
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('outside_jobs_realtime_feed')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'outside_jobs',
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const row = payload.new as OutsideJob;
            setJobs((prev) => [row, ...prev]);
            toast.success(`⚡ New outside job captured: ${row.company || 'Company'}`);
          } else if (payload.eventType === 'UPDATE') {
            const row = payload.new as OutsideJob;
            setJobs((prev) => prev.map((job) => (job.id === row.id ? { ...job, ...row } : job)));
          } else if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as { id: string };
            setJobs((prev) => prev.filter((job) => job.id !== oldRow.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [setJobs]);
}
