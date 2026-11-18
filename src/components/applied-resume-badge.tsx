'use client';

import { useState } from 'react';
import { FileText, Download, Eye, Copy, Check } from 'lucide-react';
import type { AppliedResumeSnapshot } from '@/types/database';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { WorkspaceError } from '@/components/workspace-ui';
import { downloadBytes } from '@/lib/candidate-resume-export';

type Props = {
  submissionId: string;
  candidateName?: string;
  companyName?: string;
  jobTitle?: string;
  appliedResume?: AppliedResumeSnapshot | null;
};
export function AppliedResumeBadge(props: Props) {
  return (
    <AppliedResumeView
      key={`${props.submissionId}:${props.appliedResume?.resumeId || ''}:${props.appliedResume?.filename || ''}:${props.appliedResume?.appliedAt || ''}:${props.appliedResume?.matchScore ?? ''}`}
      {...props}
    />
  );
}
function AppliedResumeView({
  submissionId,
  candidateName,
  companyName,
  jobTitle,
  appliedResume,
}: Props) {
  const resume = appliedResume || null;
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [copied, setCopied] = useState(false);
  const tailored = !!resume?.isTailored;
  const score =
    typeof resume?.matchScore === 'number' && Number.isFinite(resume.matchScore)
      ? resume.matchScore
      : null;
  const extension = resume?.filename.split('.').pop()?.toUpperCase() || 'FILE';
  async function preview() {
    setOpen(true);
    setError(
      resume
        ? ''
        : 'No recorded resume snapshot is available for this application. Candidate-wide fallback documents cannot establish which file was applied.'
    );
  }

  async function download() {
    setBusy(true);
    setError('');
    try {
      if (resume?.archiveHash) {
        const response = await fetch(
          `/api/submissions/${encodeURIComponent(submissionId)}/applied-resume?download=1`
        );
        if (!response.ok) throw new Error('The recorded resume could not be downloaded.');
        downloadBytes(
          new Uint8Array(await response.arrayBuffer()),
          resume.mimeType,
          resume.filename
        );
        return;
      }
      if (resume?.base64) {
        const bytes = Uint8Array.from(atob(resume.base64), (character) => character.charCodeAt(0));
        downloadBytes(bytes, resume.mimeType, resume.filename);
        return;
      }
      throw new Error(
        'Original file bytes were not archived with this application. The recorded text is available in the preview; a new export would be a reconstructed document.'
      );
    } catch (e) {
      setError((e as Error).message);
      setOpen(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="flex max-w-[300px] flex-col items-start gap-1.5">
        {resume ? (
          <>
            <button
              type="button"
              onClick={() => void preview()}
              className={`inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1.5 text-[10px] font-medium transition-shadow hover:shadow-sm ${tailored ? 'border-border bg-muted/40 text-foreground font-semibold' : 'border-border bg-background text-foreground'}`}
            >
              <FileText className="size-3 shrink-0" />
              <span>Applied Resume{score !== null ? ` (${score}% match)` : ''}</span>
            </button>
            <p
              className="text-muted-foreground max-w-full truncate text-[10px]"
              title={resume.filename}
            >
              {resume.filename}
            </p>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="xs"
                disabled={busy || !(resume?.base64 || resume?.archiveHash)}
                onClick={() => void download()}
                aria-label={`Download applied resume ${resume.filename}`}
              >
                <Download className="size-3" />
                {busy ? 'Preparing…' : extension}
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => void preview()}
                aria-label="Preview applied resume"
              >
                <Eye className="size-3" />
              </Button>
            </div>
          </>
        ) : (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => void preview()}
            className="text-muted-foreground"
          >
            <FileText className="size-3" />
            No recorded applied resume
          </Button>
        )}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-2xl">
          <DialogHeader>
            <p className="text-muted-foreground mb-1 text-[10px] font-semibold tracking-widest uppercase">
              Application document
            </p>
            <DialogTitle>Applied Resume Snapshot</DialogTitle>
            <DialogDescription>
              The exact recorded resume for {candidateName || 'this candidate'} ·{' '}
              {jobTitle || 'the role'} at {companyName || 'the company'}.
            </DialogDescription>
          </DialogHeader>
          {error && <WorkspaceError message={error} />}
          {resume && (
            <>
              <div className="border-border/60 bg-muted/30 flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-xs">
                <span className="min-w-0 font-medium break-all">{resume.filename}</span>
                <span className="text-muted-foreground">
                  {score === null ? 'ATS score not recorded' : `${score}% estimated match`}
                </span>
              </div>
              <div className="border-border/60 bg-card min-h-0 flex-1 overflow-y-auto rounded-lg border p-4">
                {resume.markdown ? (
                  <pre className="font-sans text-xs leading-7 break-words whitespace-pre-wrap">
                    {resume.markdown}
                  </pre>
                ) : (
                  <div className="py-10 text-center">
                    <FileText className="text-muted-foreground mx-auto mb-3 size-7" />
                    <p className="text-sm font-medium">Original {extension} document</p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      Download this recorded file to view its complete formatting.
                    </p>
                  </div>
                )}
              </div>
              {score !== null && (
                <p className="text-muted-foreground text-[11px]">
                  Estimated coverage of the recorded JD requirements; employer ATS systems may score
                  differently.
                </p>
              )}
              {resume.appliedAt && (
                <p className="text-muted-foreground text-[11px]">
                  Recorded {new Date(resume.appliedAt).toLocaleString()}
                </p>
              )}
            </>
          )}
          {resume && !resume.base64 && (
            <p className="text-muted-foreground text-xs">
              Original file bytes were not archived. The recorded text can be reviewed, but an exact
              original-file download is unavailable.
            </p>
          )}
          <div className="border-border/60 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
            <div>
              {resume?.markdown && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(resume.markdown || '');
                      setCopied(true);
                    } catch {
                      setError('Clipboard access was denied. Select and copy the preview text.');
                    }
                  }}
                >
                  {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  {copied ? 'Copied' : 'Copy text'}
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                Close
              </Button>
              {resume && (
                <Button
                  size="sm"
                  disabled={busy || !resume?.base64}
                  onClick={() => void download()}
                >
                  <Download className="size-3.5" />
                  {busy ? 'Preparing…' : `Download ${extension}`}
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
