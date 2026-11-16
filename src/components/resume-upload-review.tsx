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
  const [fileName, setFileName] = useState('');

  const broadcastResume = (docId: string, extData: ResumeExtraction, fName?: string, savedCandidateId?: string) => {
    if (typeof window === 'undefined') return;
    try {
      const f = (extData.fields || {}) as Record<string, unknown>;
      const fn = String(f?.full_name || '').trim();
      const skills = Array.isArray(f?.skills)
        ? (f.skills as string[])
        : String(f?.primary_skills || '').split(/[,;]+/).map((s: string) => s.trim()).filter(Boolean);
      const title = String(f?.current_job_title || f?.target_job_titles || '').trim();
      const expYears = f?.total_experience_years ? `${f.total_experience_years}+ years of experience` : '';
      const skillsSummary = skills.slice(0, 5).join(', ');
      const dynamicBio = (title || skillsSummary)
        ? `${title}${expYears ? ` with ${expYears}` : ''}${skillsSummary ? ` specializing in ${skillsSummary}` : ''}. Proven track record of developing applications and delivering technical results.`.trim()
        : '';
      const rawText = ((extData as Record<string, unknown>).rawText as string) || '';
      const resolvedFilename = fName || fileName || String((extData as Record<string, unknown>).filename || `${fn || 'Candidate'}_Resume.pdf`);
      const city = String(f?.current_city || f?.city || '');
      const state = String(f?.current_state || f?.state || '');
      const loc = [city, state].filter(Boolean).join(', ') || String(f?.full_address || f?.preferred_locations || '');
      const resolvedCandidateId = savedCandidateId || candidateId || docId;

      const isAuthorizedInUsa = typeof f?.authorized_in_usa === 'boolean'
        ? f.authorized_in_usa
        : (f?.authorized_in_usa === 'true' ? true : (f?.authorized_in_usa === 'false' ? false : true));
      const needSponsorshipNow = typeof f?.need_sponsorship_now === 'boolean'
        ? f.need_sponsorship_now
        : (f?.need_sponsorship_now === 'true' ? true : false);
      const needSponsorshipFuture = typeof f?.need_sponsorship_future === 'boolean'
        ? f.need_sponsorship_future
        : (f?.need_sponsorship_future === 'true' ? true : false);
      const visaStatus = String(f?.visa_status || '');
      const gender = String(f?.gender || '');
      const veteran = String(f?.veteran || f?.veteran_status || '');
      const disability = String(f?.disability || f?.disability_status || '');
      const workAuth = String(f?.work_authorization || '') || (isAuthorizedInUsa
        ? (visaStatus ? `Authorized in USA (${visaStatus})` : 'Authorized to work in the US')
        : (visaStatus || 'Requires sponsorship'));

      const candPayload = {
        id: resolvedCandidateId,
        candidate_id: resolvedCandidateId,
        full_name: fn,
        first_name: fn.split(/\s+/)[0] || '',
        last_name: fn.split(/\s+/).slice(1).join(' ') || '',
        email: String(f?.email || ''),
        phone: String(f?.phone || ''),
        current_job_title: title,
        current_employer: String(f?.current_employer || ''),
        summary: dynamicBio,
        bio: dynamicBio,
        skills,
        primary_skills: Array.isArray(skills) ? skills.join(', ') : String(skills || ''),
        secondary_skills: String(f?.secondary_skills || ''),
        current_city: city,
        current_state: state,
        location: loc,
        full_address: String(f?.full_address || ''),
        authorized_in_usa: isAuthorizedInUsa,
        need_sponsorship_now: needSponsorshipNow,
        need_sponsorship_future: needSponsorshipFuture,
        visa_status: visaStatus,
        work_authorization: workAuth,
        work_auth: workAuth,
        gender: gender,
        veteran: veteran,
        veteran_status: veteran,
        disability: disability,
        disability_status: disability,
        linkedin_url: String(f?.linkedin_url || ''),
        highest_qualification: String(f?.highest_qualification || ''),
        degree: String(f?.highest_qualification || ''),
        university_name: String(f?.university_name || ''),
        school: String(f?.university_name || ''),
        graduation_year: String(f?.graduation_year || ''),
        total_experience_years: f?.total_experience_years ? String(f.total_experience_years) : null,
        certifications: String(f?.certifications || ''),
        employment_history: Array.isArray(f?.employment_history) ? f.employment_history : [],
        education_history: Array.isArray(f?.education_history) ? f.education_history : [],
        source_text: rawText,
        confirmed_facts: {
          full_name: fn,
          first_name: fn.split(/\s+/)[0] || '',
          last_name: fn.split(/\s+/).slice(1).join(' ') || '',
          email: String(f?.email || ''),
          phone: String(f?.phone || ''),
          current_job_title: title,
          current_employer: String(f?.current_employer || ''),
          current_city: city,
          current_state: state,
          location: loc,
          authorized_in_usa: isAuthorizedInUsa,
          need_sponsorship_now: needSponsorshipNow,
          need_sponsorship_future: needSponsorshipFuture,
          visa_status: visaStatus,
          work_authorization: workAuth,
          work_auth: workAuth,
          gender: gender,
          veteran: veteran,
          veteran_status: veteran,
          disability: disability,
          disability_status: disability,
          primary_skills: Array.isArray(skills) ? skills.join(', ') : String(skills || ''),
          linkedin_url: String(f?.linkedin_url || ''),
          highest_qualification: String(f?.highest_qualification || ''),
          degree: String(f?.highest_qualification || ''),
          university_name: String(f?.university_name || ''),
          school: String(f?.university_name || ''),
          graduation_year: String(f?.graduation_year || ''),
          total_experience_years: f?.total_experience_years ? String(f.total_experience_years) : null,
          certifications: String(f?.certifications || ''),
          summary: dynamicBio,
          bio: dynamicBio,
          raw_text: rawText,
          filename: resolvedFilename
        }
      };

      const resumePayload = {
        id: docId,
        filename: resolvedFilename,
        raw_text: rawText,
        source_text: rawText,
        full_name: fn,
        email: candPayload.email,
        phone: candPayload.phone,
        current_job_title: title,
        skills: candPayload.skills,
        summary: dynamicBio,
        bio: dynamicBio,
        location: loc,
        authorized_in_usa: isAuthorizedInUsa,
        work_authorization: workAuth,
        work_auth: workAuth,
        uploadedAt: Date.now()
      };

      window.postMessage({
        type: 'NEXTKIN_RESUME_UPLOADED',
        candidate: candPayload,
        resume: resumePayload
      }, '*');

      window.postMessage({
        type: 'candidate_updated',
        candidate: candPayload,
        resume: resumePayload
      }, '*');
    } catch (err) {
      console.warn('[ResumeUploadBroadcastErr]', err);
    }
  };

  useEffect(() => {
    if (!documentId) return;
    let stopped = false;
    const requested=new Set<string>();
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {

        const r = await api<{
          document: { id: string; status: string; candidate_version: number | null };
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
            r.document.id,
            r.document.candidate_version
          );
          setBusy(false);

          broadcastResume(r.document.id, r.extraction.data);
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
  }, [documentId, onDraft, retry, fileName]);

  async function upload(file: File) {
    // Stop polling the previous document before starting another upload.
    setId('');
    setError('');
    setProcessingNote('');
    setExtraction(null);
    setFileName(file.name);
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
        extraction?: { data: ResumeExtraction };
      }>('/api/resumes', { method: 'POST', body: form });

      setId(r.documentId);
      if (r.extraction) {
        setExtraction(r.extraction.data);
        onDraft(
          {
            ...r.extraction.data.fields,
            employment_history: r.extraction.data.employmentHistory,
            education_history: r.extraction.data.educationHistory,
          },
          r.documentId,
          null
        );
        setStatus('review');
        setBusy(false);

        broadcastResume(r.documentId, r.extraction.data, file.name);
        return;
      }
      setStatus(r.status || 'queued');
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  // Save to dashboard - calls confirm_resume API
  const handleSaveResume = async () => {
    if (!documentId || !extraction) return;
    setBusy(true);
    setError('');
    try {
      const fields = {
        ...extraction.fields,
        employment_history: extraction.employmentHistory,
        education_history: extraction.educationHistory
      };
      const result = await api<{ candidateId?: string }>(`/api/resumes/${documentId}/confirm`, {
        method: 'POST',
        body: JSON.stringify({
          version: null,
          fields
        })
      });
      broadcastResume(documentId, extraction, fileName, result?.candidateId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

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

      {/* AI Extraction View */}
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

      {/* Save Button */}
      {extraction && (
        <div className="flex gap-3 pt-4">
          <Button
            onClick={handleSaveResume}
            disabled={busy || !consent}
            className="flex-1"
          >
            {busy && (
              <span className="animate-spin mr-2">⟳</span>
            )}
            Save to Profile
          </Button>
        </div>
      )}
    </section>
  );
}