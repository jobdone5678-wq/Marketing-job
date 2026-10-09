"use client";
import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import type { ResumeExtraction } from '@/lib/ai/schemas';

export function ResumeUploadReview({
  candidateId,
  onDraft,
}: {
  candidateId?: string;
  onDraft: (fields: Record<string, unknown>, documentId: string, version: number | null) => void;
}) {
  const [consent, setConsent] = useState(false);
  const [documentId, setId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [extraction, setExtraction] = useState<ResumeExtraction | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!documentId) return;
    let stopped = false;
    let pollCount = 0;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        pollCount++;
        const r = await api<{
          document: { status: string; candidate_version: number | null };
          extraction: { data: ResumeExtraction } | null;
          task: { status: string; error: string | null } | null;
        }>(`/api/resumes/${documentId}`);
        if (stopped) return;
        setStatus(r.document.status);

        if (r.extraction) {
          setExtraction(r.extraction.data);
          onDraft(
            {
              ...r.extraction.data.fields,
              employment_history: r.extraction.data.employmentHistory,
              education_history: r.extraction.data.educationHistory,
            },
            documentId,
            r.document.candidate_version
          );
          setBusy(false);
          return;
        }

        if (r.task?.status === 'failed') {
          setError(r.task.error || 'Processing failed. Enter details manually or retry.');
          setBusy(false);
          return;
        }

        // If still queued after 2 polls, trigger immediate process inline
        if (pollCount >= 2 && r.document.status === 'queued') {
          try {
            await api(`/api/resumes/${documentId}/process`, { method: 'POST', body: '{}' });
          } catch {
            // Ignore error and continue poll
          }
        }

        timer = setTimeout(poll, 1500);
      } catch (e) {
        if (!stopped) {
          setError((e as Error).message);
          setBusy(false);
        }
      }
    }

    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [documentId, onDraft, retry]);

  async function upload(file: File) {
    setError('');
    setExtraction(null);
    setBusy(true);
    setStatus('Processing with AI...');
    try {
      const form = new FormData();
      form.set('resume', file);
      form.set('consent', String(consent));
      if (candidateId) form.set('candidateId', candidateId);

      const r = await api<{
        documentId: string;
        status?: string;
        extraction?: ResumeExtraction;
      }>('/api/resumes', { method: 'POST', body: form });

      setId(r.documentId);
      if (r.extraction) {
        setExtraction(r.extraction);
        onDraft(
          {
            ...r.extraction.fields,
            employment_history: r.extraction.employmentHistory,
            education_history: r.extraction.educationHistory,
          },
          r.documentId,
          null
        );
        setStatus('review');
        setBusy(false);
        return;
      }
      setStatus(r.status || 'queued');
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <section
      className="rounded-lg border p-5 space-y-3"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (consent && !busy && e.dataTransfer.files[0]) void upload(e.dataTransfer.files[0]);
      }}
    >
      <h2 className="font-semibold">Upload and review a resume</h2>
      <p className="text-sm text-muted-foreground">
        PDF or Word (.docx), up to 10 MiB and 20 PDF pages. AI automatically extracts candidate facts in 2–3 seconds.
      </p>
      <label className="flex gap-2 text-sm cursor-pointer select-none">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        I have permission to upload this resume and consent to processing by the configured AI provider.
      </label>
      <input
        aria-label="Resume file"
        type="file"
        accept=".pdf,.docx"
        disabled={!consent || busy}
        onChange={(e) => {
          if (e.target.files?.[0]) void upload(e.target.files[0]);
        }}
      />
      {status && (
        <p role="status" className="text-sm flex items-center gap-2 font-medium">
          {busy && (
            <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full" />
          )}
          Resume: {status === 'queued' ? 'Extracting candidate details with AI...' : status}
          {busy && status !== 'queued' ? ' (processing...)' : ''}
        </p>
      )}
      {error && (
        <p role="alert" className="text-destructive text-sm font-medium">
          {error}
        </p>
      )}
      {documentId && !busy && error && (
        <Button
          type="button"
          onClick={async () => {
            try {
              await api(`/api/resumes/${documentId}/process`, { method: 'POST', body: '{}' });
              setBusy(true);
              setError('');
              setRetry((v) => v + 1);
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          Retry processing
        </Button>
      )}
      {extraction && (
        <details className="mt-3 text-xs bg-muted/40 p-3 rounded-lg border">
          <summary className="cursor-pointer font-medium text-foreground">
            View AI Extraction Evidence & Raw Data
          </summary>
          {extraction.warnings?.map((w, i) => (
            <p key={i} className="text-amber-600 dark:text-amber-400 mt-1">
              ⚠️ {w}
            </p>
          ))}
          {extraction.evidence?.map((e, i) => (
            <p key={i} className="text-xs text-muted-foreground mt-1">
              <strong>{e.field}</strong>: {e.snippet}
            </p>
          ))}
        </details>
      )}
    </section>
  );
}