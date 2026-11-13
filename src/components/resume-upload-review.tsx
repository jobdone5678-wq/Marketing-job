"use client";
import { useEffect, useId, useState } from 'react';
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
  const fileInputId=useId();
  const [documentId, setId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [extraction, setExtraction] = useState<ResumeExtraction | null>(null);
  const [retry, setRetry] = useState(0);
  const [processingNote,setProcessingNote]=useState('');

  useEffect(() => {
    if (!documentId) return;
    let stopped = false;
    const requested=new Set<string>();
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {

        const r = await api<{
          document: { status: string; candidate_version: number | null };
          extraction: { data: ResumeExtraction } | null;
          task: { id?:string; status: string; error: string | null } | null;
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

          if (typeof window !== 'undefined') {
            try {
              const f = r.extraction.data.fields as Record<string, unknown>;
              const fn = String(f?.full_name || '').trim();
              const skills = Array.isArray(f?.skills) ? f.skills : String(f?.primary_skills || '').split(/[,;]+/).map((s: string) => s.trim()).filter(Boolean);
              const title = String(f?.current_job_title || f?.target_job_titles || '').trim();
              const expYears = f?.total_experience_years ? `${f.total_experience_years}+ years of experience` : '';
              const skillsSummary = skills.slice(0, 5).join(', ');
              const dynamicBio = (title || skillsSummary) ? `${title}${expYears ? ` with ${expYears}` : ''}${skillsSummary ? ` specializing in ${skillsSummary}` : ''}. Proven track record of developing applications and delivering technical results.`.trim() : '';

              const candPayload = {
                id: documentId,
                full_name: fn,
                first_name: fn.split(/\s+/)[0] || '',
                last_name: fn.split(/\s+/).slice(1).join(' ') || '',
                email: String(f?.email || ''),
                phone: String(f?.phone || ''),
                current_job_title: title,
                summary: dynamicBio,
                bio: dynamicBio,
                skills,
                current_city: String(f?.current_city || f?.city || ''),
                current_state: String(f?.current_state || f?.state || ''),
                linkedin_url: String(f?.linkedin_url || ''),
                source_text: ((r.extraction.data as Record<string, unknown>).rawText as string || "") || '',
                confirmed_facts: {
                  full_name: fn,
                  first_name: fn.split(/\s+/)[0] || '',
                  last_name: fn.split(/\s+/).slice(1).join(' ') || '',
                  email: String(f?.email || ''),
                  phone: String(f?.phone || ''),
                  current_job_title: title,
                  summary: dynamicBio,
                  bio: dynamicBio,
                  raw_text: ((r.extraction.data as Record<string, unknown>).rawText as string || "") || ''
                }
              };
              window.postMessage({
                type: 'NEXTKIN_RESUME_UPLOADED',
                candidate: candPayload,
                resume: {
                  filename: fn ? `${fn}_Resume.pdf` : 'Uploaded_Resume.pdf',
                  raw_text: candPayload.source_text,
                  source_text: candPayload.source_text,
                  full_name: fn,
                  email: candPayload.email,
                  phone: candPayload.phone,
                  skills: candPayload.skills,
                  summary: dynamicBio,
                  bio: dynamicBio,
                  uploadedAt: Date.now()
                }
              }, '*');
            } catch (err) {
              console.warn('[ResumeUploadBroadcastErr]', err);
            }
          }
          return;
        }

        if (r.task?.status === 'failed') {
          setProcessingNote('');
          setError(r.task.error || 'Processing failed. Enter details manually or retry.');
          setBusy(false);
          return;
        }

        if(r.task?.id&&r.task.status==='queued'&&!requested.has(r.task.id)){
          requested.add(r.task.id);
          void api<{status:string;message?:string}>(`/api/tasks/${r.task.id}/process`,{method:'POST'}).then(response=>{
            if(!stopped)setProcessingNote(response.status==='waiting_for_worker'?response.message||'Waiting for the processing worker.':'');
          }).catch(()=>{if(!stopped)setProcessingNote('Checking saved resume status. If it stays queued, ask your administrator to check the processing worker.');});
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
    // Stop polling the previous document before starting another upload.
    setId('');
    setError('');
    setProcessingNote('');
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

        if (typeof window !== 'undefined') {
          try {
            const f = r.extraction.fields as Record<string, unknown>;
            const fn = String(f?.full_name || '').trim();
            const skills = Array.isArray(f?.skills) ? f.skills : String(f?.primary_skills || '').split(/[,;]+/).map((s: string) => s.trim()).filter(Boolean);
            const title = String(f?.current_job_title || f?.target_job_titles || '').trim();
            const expYears = f?.total_experience_years ? `${f.total_experience_years}+ years of experience` : '';
            const skillsSummary = skills.slice(0, 5).join(', ');
            const dynamicBio = (title || skillsSummary) ? `${title}${expYears ? ` with ${expYears}` : ''}${skillsSummary ? ` specializing in ${skillsSummary}` : ''}. Proven track record of developing applications and delivering technical results.`.trim() : '';

            const candPayload = {
              id: r.documentId,
              full_name: fn,
              first_name: fn.split(/\s+/)[0] || '',
              last_name: fn.split(/\s+/).slice(1).join(' ') || '',
              email: String(f?.email || ''),
              phone: String(f?.phone || ''),
              current_job_title: title,
              summary: dynamicBio,
              bio: dynamicBio,
              skills,
              current_city: String(f?.current_city || f?.city || ''),
              current_state: String(f?.current_state || f?.state || ''),
              linkedin_url: String(f?.linkedin_url || ''),
              source_text: ((r.extraction as Record<string, unknown>).rawText as string || "") || '',
              confirmed_facts: {
                full_name: fn,
                first_name: fn.split(/\s+/)[0] || '',
                last_name: fn.split(/\s+/).slice(1).join(' ') || '',
                email: String(f?.email || ''),
                phone: String(f?.phone || ''),
                current_job_title: title,
                summary: dynamicBio,
                bio: dynamicBio,
                raw_text: ((r.extraction as Record<string, unknown>).rawText as string || "") || '',
                filename: file.name
              }
            };
            window.postMessage({
              type: 'NEXTKIN_RESUME_UPLOADED',
              candidate: candPayload,
              resume: {
                filename: file.name,
                raw_text: candPayload.source_text,
                source_text: candPayload.source_text,
                full_name: fn,
                email: candPayload.email,
                phone: candPayload.phone,
                skills: candPayload.skills,
                summary: dynamicBio,
                bio: dynamicBio,
                uploadedAt: Date.now()
              }
            }, '*');
          } catch (err) {
            console.warn('[ResumeUploadBroadcastErr]', err);
          }
        }
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
      className="resume-upload-review rounded-lg border p-5 space-y-4"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (consent && !busy && e.dataTransfer.files[0]) void upload(e.dataTransfer.files[0]);
      }}
    >
      <h2 className="font-semibold">Upload and review a resume</h2>
      <p className="text-sm text-muted-foreground">
        PDF or Word (.docx), up to 10 MiB and 20 PDF pages. Review the extracted facts before saving. Processing time depends on the document and provider.
      </p>
      <label className="resume-consent-row">
        <input
          type="checkbox"
          className="resume-consent-checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        <span>I have permission to upload this resume and consent to processing by the configured AI provider.</span>
      </label>
      <div className="space-y-2">
      <label htmlFor={fileInputId} className="block text-sm font-medium">Resume file</label>
      <input
        id={fileInputId}
        aria-label="Resume file"
        aria-describedby={`${fileInputId}-help`}
        className="resume-file-input"
        type="file"
        accept=".pdf,.docx"
        disabled={!consent || busy}
        onChange={(e) => {
          if (e.target.files?.[0]) void upload(e.target.files[0]);
        }}
      />
      <p id={`${fileInputId}-help`} className="text-xs leading-relaxed text-muted-foreground">{consent?'Choose a PDF or Word (.docx) file to upload.':'Check the permission box above to enable file selection.'}</p>
      </div>
      {status && (
        <p role="status" className="text-sm flex items-center gap-2 font-medium">
          {busy && (
            <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full" />
          )}
          Resume: {status === 'queued' ? 'Extracting candidate details with AI...' : status}
          {busy && status !== 'queued' ? ' (processing...)' : ''}
        </p>
      )}
      {processingNote&&!extraction&&<p role="status" className="text-sm text-muted-foreground">{processingNote}</p>}
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
              setProcessingNote('');
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
