'use client';

import { useEffect } from 'react';

type LaunchJob = { jobUrl: string; title: string; company: string };

export function ApplicationHandoff({ job, actorId }: { job: LaunchJob; actorId?: string }) {
  useEffect(() => {
    const origin = window.location.origin;
    const watch = () =>
      window.postMessage({ type: 'NEXTKIN_APPLICATION_WATCH', job, actorId }, origin);
    const retry = window.setInterval(watch, 250);
    const go = () => {
      clearInterval(retry);
      window.location.replace(job.jobUrl);
    };
    const redirect = window.setTimeout(go, 1500);
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== origin) return;
      if (event.data?.type === 'NEXTKIN_APPLICATION_WATCHING') {
        clearTimeout(redirect);
        go();
      }
    };
    window.addEventListener('message', onMessage);
    watch();
    return () => {
      clearTimeout(redirect);
      clearInterval(retry);
      window.removeEventListener('message', onMessage);
    };
  }, [job, actorId]);

  return (
    <main className="mx-auto max-w-xl space-y-3 p-8 text-sm">
      <p>Opening the application for {job.title}…</p>
      <a href={job.jobUrl} className="text-primary hover:underline">
        Continue to the application
      </a>
    </main>
  );
}
