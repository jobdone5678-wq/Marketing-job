'use client';

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
    if (loading) return;
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
    const text = snapshots
      .map((s) => {
        const header = `${s.portal || 'Portal'} — Attempt ${s.attempt} · Revision ${s.revision} (${new Date(s.observed_at).toLocaleString()})`;
        const body = s.answers
          .map((a) => `${cleanFieldLabel(a.label, a.key)}:\n${a.value}`)
          .join('\n\n');
        return `${header}\n\n${body}`;
      })
      .join('\n\n---\n\n');

    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="text-primary mt-2 inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium hover:underline"
        aria-haspopup="dialog"
      >
        <FileText className="size-3.5 shrink-0" />
        <span>View captured application answers</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[88vh] flex-col sm:max-w-xl">
          <DialogHeader>
            <p className="text-muted-foreground mb-0.5 text-[10px] font-semibold tracking-widest uppercase">
              Extension observation
            </p>
            <DialogTitle>Captured Application Answers</DialogTitle>
            <DialogDescription className="text-xs">
              Form answers observed by the browser extension at the moment of submission.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            {loading && (
              <div className="text-muted-foreground py-10 text-center text-xs">
                Loading captured answers…
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border p-3 text-xs"
              >
                {error}
              </div>
            )}

            {!loading && !error && snapshots && snapshots.length === 0 && (
              <div className="text-muted-foreground py-10 text-center text-xs">
                No answer snapshot was recorded for this application. Review manually if needed.
              </div>
            )}

            {!loading &&
              !error &&
              snapshots?.map((snapshot) => (
                <section
                  key={snapshot.id}
                  className="border-border bg-card space-y-3 rounded-lg border p-4 shadow-xs"
                >
                  <div className="border-border/60 flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-xs">
                    <span className="text-foreground flex items-center gap-1.5 font-semibold capitalize">
                      <Globe className="text-muted-foreground size-3.5" />
                      {snapshot.portal || 'Application portal'} · Attempt {snapshot.attempt} (Rev{' '}
                      {snapshot.revision})
                    </span>
                    <span className="text-muted-foreground flex items-center gap-1 text-[11px]">
                      <Clock className="size-3" />
                      {new Date(snapshot.observed_at).toLocaleString()}
                    </span>
                  </div>

                  <dl className="space-y-3">
                    {snapshot.answers.map((answer) => (
                      <div key={answer.key} className="space-y-1">
                        <dt className="text-foreground text-xs font-semibold">
                          {cleanFieldLabel(answer.label, answer.key)}
                        </dt>
                        <dd className="bg-muted/40 border-border/40 text-foreground rounded-md border px-3 py-2 font-mono text-xs break-words whitespace-pre-wrap">
                          {answer.value || (
                            <span className="text-muted-foreground italic">(blank)</span>
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
          </div>

          <DialogFooter className="border-border/60 flex flex-row items-center justify-between gap-2 border-t pt-3">
            <div>
              {snapshots && snapshots.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={copyAll}
                  className="gap-1.5 text-xs"
                >
                  {copied ? (
                    <Check className="size-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                  <span>{copied ? 'Copied' : 'Copy answers'}</span>
                </Button>
              )}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
