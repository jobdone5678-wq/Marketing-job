"use client";

import { useState } from 'react';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { FileText, Clock, Globe, Copy, Check } from 'lucide-react';
import { cleanFieldLabel } from '@/lib/clean-field-label';

export { cleanFieldLabel };

type Snapshot = {
  id: string;
  attempt: number;
  revision: number;
  portal: string;
  portal_url: string;
  answers: { key: string; label: string; value: string }[];
  observed_at: string;
  created_at: string;
};

export function ApplicationAnswerSnapshot({ submissionId }: { submissionId: string }) {
  const [open, setOpen] = useState(false);
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  async function load() {
    if (snapshots) return;
    setLoading(true);
    setError('');
    try {
      const res = await api<{ snapshots: Snapshot[] }>(`/api/submissions/${submissionId}/answers`);
      setSnapshots(res.snapshots);
    } catch (e) {
      setError((e as Error).message || 'Failed to load captured answers.');
    } finally {
      setLoading(false);
    }
  }

  function handleOpen() {
    setOpen(true);
    void load();
  }

  function copyAll() {
    if (!snapshots?.length) return;
    const text = snapshots.map(s => {
      const header = `${s.portal || 'Portal'} — Attempt ${s.attempt} · Revision ${s.revision} (${new Date(s.observed_at).toLocaleString()})`;
      const body = s.answers.map(a => `${cleanFieldLabel(a.label, a.key)}:\n${a.value}`).join('\n\n');
      return `${header}\n\n${body}`;
    }).join('\n\n---\n\n');

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline cursor-pointer"
        aria-haspopup="dialog"
      >
        <FileText className="size-3.5 shrink-0" />
        <span>View captured application answers</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[88vh] flex-col sm:max-w-xl">
          <DialogHeader>
            <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Extension observation
            </p>
            <DialogTitle>Captured Application Answers</DialogTitle>
            <DialogDescription className="text-xs">
              Form answers observed by the browser extension at the moment of submission.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto space-y-4 pr-1">
            {loading && (
              <div className="py-10 text-center text-xs text-muted-foreground">
                Loading captured answers…
              </div>
            )}

            {error && (
              <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                {error}
              </div>
            )}

            {!loading && !error && snapshots && snapshots.length === 0 && (
              <div className="py-10 text-center text-xs text-muted-foreground">
                No answer snapshot was recorded for this application. Review manually if needed.
              </div>
            )}

            {!loading && !error && snapshots?.map(snapshot => (
              <section
                key={snapshot.id}
                className="rounded-lg border border-border bg-card p-4 shadow-xs space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2 text-xs">
                  <span className="font-semibold text-foreground flex items-center gap-1.5 capitalize">
                    <Globe className="size-3.5 text-muted-foreground" />
                    {snapshot.portal || 'Application portal'} · Attempt {snapshot.attempt} (Rev {snapshot.revision})
                  </span>
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Clock className="size-3" />
                    {new Date(snapshot.observed_at).toLocaleString()}
                  </span>
                </div>

                <dl className="space-y-3">
                  {snapshot.answers.map(answer => (
                    <div key={answer.key} className="space-y-1">
                      <dt className="text-xs font-semibold text-foreground">
                        {cleanFieldLabel(answer.label, answer.key)}
                      </dt>
                      <dd className="rounded-md bg-muted/40 border border-border/40 px-3 py-2 text-xs text-foreground whitespace-pre-wrap break-words font-mono">
                        {answer.value || <span className="italic text-muted-foreground">(blank)</span>}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>

          <DialogFooter className="flex flex-row items-center justify-between gap-2 border-t border-border/60 pt-3">
            <div>
              {snapshots && snapshots.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={copyAll}
                  className="gap-1.5 text-xs"
                >
                  {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy answers'}</span>
                </Button>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
