"use client";
	import { useEffect, useId, useState } from 'react';
	import { api } from '@/lib/api-client';
	import { Button } from '@/components/ui/button';
	import { Input } from '@/components/ui/input';
	import type { ResumeExtraction } from '@/lib/ai/schemas';
	import { ShieldCheck, ExternalLink } from 'lucide-react';

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
	  const [editingField, setEditingField] = useState<string | null>(null);
	  const [editValue, setEditValue] = useState<string>('');

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
	                  raw_text: ((r.extraction.data as Record<string, unknown>).rawText as string || "") || '',
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
	            ...r.extraction.data.fields,
	            employment_history: r.extraction.data.employmentHistory,
	            education_history: r.extraction.data.educationHistory,
	          },
	          r.documentId,
	          null
	        );
	        setStatus('review');
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

	  // Helper to edit a field inline
	  const startEdit = (field: string, currentValue: string) => {
	    setEditingField(field);
	    setEditValue(currentValue || '');
	  };
	  const cancelEdit = () => {
	    setEditingField(null);
	    setEditValue('');
	  };
	  const saveEdit = (field: string) => {
	    if (extraction) {
	      const updated = {
	        ...extraction,
	        fields: {
	          ...extraction.fields,
	          [field]: editValue || null
	        }
	      };
	      // Also update employment_history or education_history if needed
	      if (field === 'employment_history') {
	        const rows = editValue.split('\n---\n');
	        updated.employmentHistory = rows.map(r => ({ employer: r, title: null, start: null, end: null, location: null, evidence: r }));
	      }
	      setExtraction(updated);
	      onDraft(
	        {
	          ...updated.fields,
	          employment_history: updated.employmentHistory,
	          education_history: updated.educationHistory,
	        },
	        documentId,
	        null
	      );
	    }
	    setEditingField(null);
	    setEditValue('');
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

	      {/* SECTION-WISE EXTRACTION VIEW */}
	      {extraction && (
	        <div className="space-y-6">
	          {/* Profile Section */}
	          <section className="rounded-lg border border-border/60 bg-card p-4">
	            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
	              <ShieldCheck className="size-3.5" /> Profile
	            </h3>
	            <div className="grid sm:grid-cols-2 gap-3">
	              <div className="space-y-1.5">
	                <label className="text-xs font-semibold text-foreground">Full Name</label>
	                {editingField === 'full_name' ? (
	                  <div className="flex gap-2">
	                    <Input
	                      value={editValue}
	                      onChange={(e) => setEditValue(e.target.value)}
	                      className="h-7 text-xs"
	                    />
	                    <Button size="sm" variant="ghost" onClick={() => saveEdit('full_name')} className="h-7 px-2">✓</Button>
	                    <Button size="sm" variant="ghost" onClick={cancelEdit} className="h-7 px-2">✕</Button>
	                  </div>
	                ) : (
	                  <div
	                    className="p-2 rounded border border-border/40 bg-muted/20 text-sm cursor-pointer hover:bg-muted/30"
	                    onClick={() => startEdit('full_name', String(extraction.fields.full_name || ''))}
	                  >
	                    {extraction.fields.full_name || <span className="text-muted-foreground italic">Not extracted</span>}
	                  </div>
				)}
	              </div>
	              <div className="space-y-1.5">
	                <label className="text-xs font-semibold text-foreground">Email</label>
	                {editingField === 'email' ? (
	                  <div className="flex gap-2">
	                    <Input
	                      type="email"
	                      value={editValue}
	                      onChange={(e) => setEditValue(e.target.value)}
	                      className="h-7 text-xs"
	                    />
	                    <Button size="sm" variant="ghost" onClick={() => saveEdit('email')} className="h-7 px-2">✓</Button>
	                    <Button size="sm" variant="ghost" onClick={cancelEdit} className="h-7 px-2">✕</Button>
	                  </div>
	                ) : (
	                  <div
	                    className="p-2 rounded border border-border/40 bg-muted/20 text-sm cursor-pointer hover:bg-muted/30"
	                  onClick={() => startEdit('email', extraction.fields.email || '')}
	                  >
	                    {extraction.fields.email || <span className="text-muted-foreground italic">Not extracted</span>}
	                  </div>
	 	          </div>
	              </div>
		          <div className="space-y-1.5">
		            <label className="text-xs font-semibold text-foreground">Phone</label>
		            {editingField === 'phone' ? (
		              <div className="flex gap-2">
		                <Input
						  type="tel"
						  value={editValue}
						  onChange={(e) => setEditValue(e.target.value)}
						  className="h-7 text-xs"
		                />
		                <Button size="sm" variant="ghost" onClick={() => saveEdit('phone')} className="h-7 px-2">✓</Button>
		                <Button size="sm" variant="ghost" onClick={cancelEdit} className="h-7 px-2">✕</Button>
		              </div>
		            ) : (
		              <div
		                className="p-2 rounded border border-border/40 bg-muted/20 text-sm cursor-pointer hover:bg-muted/30"
		                onClick={() => startEdit('phone', extraction.fields.phone || '')}
		              >
		                {extraction.fields.phone || <span className="text-muted-foreground italic">Not extracted</span>}
		              </div>
		            )}
		          </div>
		          <div className="space-y-1.5">
		            <label className="text-xs font-semibold text-foreground">LinkedIn</label>
		            {editingField === 'linkedin_url' && extraction.fields.linkedin_url ? (
		              <div className="flex gap-2">
		                <Input
						  value={editValue}
						  onChange={(e) => setEditValue(e.target.value)}
						  className="h-7 text-xs"
		                />
		                <Button size="sm" variant="ghost" onClick={() => saveEdit('linkedin_url')} className="h-7 px-2">✓</Button>
		                <Button size="sm" variant="ghost" onClick={cancelEdit} className="h-7 px-2">✕</Button>
		              </div>
		            ) : (
		              <div
		                className="p-2 rounded border border-border/40 bg-muted/20 text-sm cursor-pointer hover:bg-muted/30"
		                onClick={() => extraction.fields.linkedin_url && startEdit('linkedin_url', extraction.fields.linkedin_url as string)}
		               >
		                {extraction.fields.linkedin_url ? (
		                  <a
		                    href={extraction.fields.linkedin_url as string}
		                    target="_blank"
		                    rel="noopener noreferrer"
		                    className="text-primary hover:underline break-all"
		                  >
		                    {extraction.fields.linkedin_url as string}
		                  </a>
		                ) : <span className="text-muted-foreground italic">Not extracted</span>}
		              </div>
		            )}
		          </div>
		          <div className="space-y-1.5 sm:col-span-2">
		            <label className="text-xs font-semibold text-foreground">Current Job Title</label>
		            {editingField === 'current_job_title' ? (
		              <div className="flex gap-2">
		                <Input
						  value={editValue}
						  onChange={(e) => setEditValue(e.target.value)}
						  className="h-7 text-xs"
		                />
		                <Button size="sm" variant="ghost" onClick={() => saveEdit('current_job_title')} className="h-7 px-2">✓</Button>
		                <Button size="sm" variant="ghost" onClick={cancelEdit} className="h-7 px-2">✕</Button>
		              </div>
		            ) : (
		              <div
		                className="p-2 rounded border border-border/40 bg-muted/20 text-sm cursor-pointer hover:bg-muted/30"
		                onClick={() => startEdit('current_job_title', extraction.fields.current_job_title || '')}
		              >
		                {extraction.fields.current_job_title || <span className="text-muted-foreground italic">Not extracted</span>}
		              </div>
		            )}
		          </div>
		          <div className="space-y-1.5">
		            <label className="text-xs font-semibold text-foreground">Location</label>
		            {editingField === 'location' ? (
		              <div className="flex gap-2">
		                <Input
						  value={editValue}
						  onChange={(e) => setEditValue(e.target.value)}
						  className="h-7 text-xs"
		                />
		                <Button size="sm" variant="ghost" onClick={() => saveEdit('location')} className="h-7 px-2">✓</Button>
		                <Button size="sm" variant="ghost" onClick={cancelEdit} className="h-7 px-2">✕</Button>
		              </div>
		            ) : (
		              <div
		                className="p-2 rounded border border-border/40 bg-muted/20 text-sm cursor-pointer hover:bg-muted/30"
		                onClick={() => startEdit('location', [extraction.fields.current_city, extraction.fields.current_state].filter(Boolean).join(', ') || '')}
		              >
		                {[(extraction.fields.current_city as string), (extraction.fields.current_state as string)].filter(Boolean).join(', ') || <span className="text-muted-foreground italic">Not extracted</span>}
		              </div>
		            )}
		          </div>
	            </div>
	          </section>

	          {/* Skills Section */}
	          <section className="rounded-lg border border-border/60 bg-card p-4">
	            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Skills</h3>
	            <div className="flex flex-wrap gap-1.5">
	              {(extraction.fields.primary_skills as string)?.split(/[,;\n]/)?.filter(Boolean)?.map((skill: string, i: number) => (
	                <span key={i} className="rounded-md border bg-muted/40 px-2 py-1 text-xs">
	                  {skill.trim()}
	                </span>
	              ))}
	            </div>
	          </section>

	          {/* Work Experience Section */}
	          <section className="rounded-lg border border-border/60 bg-card p-4">
	            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Work Experience</h3>
	            <ol className="space-y-4">
	              {extraction.employmentHistory?.map((exp, i) => (
	                <li key={i} className="border-l border-border pl-3">
	                  <p className="text-sm font-medium">{exp.title || <span className="text-muted-foreground">Job Title</span>}</p>
	                  <p className="text-xs text-muted-foreground">{exp.employer || <span className="text-muted-foreground">Employer</span>}</p>
	                  <p className="text-xs text-muted-foreground">
	                    {exp.start} — {exp.end}
	                  </p>
	                  {exp.evidence && (
	                 	<p className="text-xs text-muted-foreground/70 mt-1 italic">
	                 	  Evidence: {exp.evidence}
	                 	</p>
	                  )}
	                </li>
	              ))}
	            </ol>
	          </section>

	          {/* Education Section */}
	          <section className="rounded-lg border border-border/60 bg-card p-4">
	            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Education</h3>
	            <div className="space-y-3">
	              {extraction.educationHistory?.map((edu, i) => (
	                <div key={i} className="border-b border-border/40 pb-2 last:border-b-0">
	                  <p className="text-sm font-medium">{edu.degree || <span className="text-muted-foreground">Degree</span>}</p>
	                  <p className="text-xs text-muted-foreground">{edu.institution || <span className="text-muted-foreground">Institution</span>}</p>
	                  {edu.start && <p className="text-xs text-muted-foreground">{edu.start} — {edu.end}</p>}
	                  {edu.evidence && (
	                 	<p className="text-xs text-muted-foreground/70 italic">
	                 	  Evidence: {edu.evidence}
	                 	</p>
	                 	)}
	                </div>
	              ))}
	            </div>
	          </section>

	          {/* Warnings & Evidence Section */}
	          {extraction.warnings?.length > 0 && (
	            <section className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-4">
	              <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-300 mb-2">Extraction Notes</h3>
	              <ul className="space-y-1">
	                {extraction.warnings.map((w, i) => (
	                  <li key={i} className="text-xs text-amber-800 dark:text-amber-300">
	                    ⚠️ {w}
	                  </li>
	                ))}
	              </ul>
	            </section>
	          )}
	        </div>
	      )}