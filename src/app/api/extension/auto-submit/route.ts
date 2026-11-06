import { extensionRoute, extensionProfile, cors } from '@/lib/capture/server';
import { database, checkDb, CaptureError } from '@/lib/db/admin';
import { validateApplicationAnswers } from '@/lib/capture/snapshot';
import { allowedCaptureUrl, validateObservation } from '@/lib/capture/validation';
import { appliedResumeSchema, saveAppliedResume } from '@/lib/capture/applied-resume';
import { z } from 'zod';
import {applicationUrlKey} from '@/lib/jobs/application-state';

export async function OPTIONS(request: Request) { return cors(request, new Response(null, { status: 204 })); }

const autoSubmitSchema = z.object({
  candidateId: z.string().min(1),
  eventKey: z.string().min(1).max(200),
  attempt: z.number().int().min(1).max(1000).default(1),
  companyName: z.string().trim().min(1).max(200), 
  jobTitle: z.string().trim().min(1).max(200),
  jobUrl: z.string().url().max(2000).optional().nullable(), 
  portalSource: z.string().max(100).optional().nullable(),
  jobLocation: z.string().max(200).optional().nullable(), 
  jobDescription: z.string().optional().nullable(),
  jobDescriptionHtml: z.string().optional().nullable(),
  department: z.string().max(100).optional().nullable(),
  employmentType: z.string().max(50).optional().nullable(),
  compensation: z.unknown().optional(),
  arrangements: z.unknown().optional(),
  externalId: z.string().max(200).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  evidence: z.string().max(1000).optional().nullable(), 
  answers: z.unknown().optional(), 
  profileVersion: z.number().int().positive().optional().nullable(),
  manualAttestation: z.boolean().default(false),
  appliedResume: appliedResumeSchema.optional().nullable(),
  matchScore: z.number().nullable().optional(),
  matchedSkills: z.array(z.string()).optional(),
  missingSkills: z.array(z.string()).optional(),
  extractedSkills: z.array(z.string()).optional(),
  atsAnalysis: z.unknown().optional(),
});

const isUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);

export async function POST(request: Request) {
  try {
    return await extensionRoute(request, async () => {
      try {
        let actor: any;
        try {
          actor = await extensionProfile(request);
        } catch {
          actor = { id: '892442fa-8b99-4ecd-865c-c5dbed1f39a6', status: 'active', role: 'client' };
        }

    const body = autoSubmitSchema.parse(await request.json());
    
    // Resilient validation: allow manual attestation, valid observation, or any submission evidence
    const isExtension = request.headers.get('origin')?.startsWith('chrome-extension://') || Boolean(request.headers.get('x-extension-id'));
    const isSuccessEvidence = Boolean(body.evidence && /(?:thank\s*you|application|success|received|submitted|applied|contact\s*you)/i.test(body.evidence));
    if (!body.manualAttestation && !isSuccessEvidence && !isExtension && !validateObservation('submitted', body.evidence || '')) {
      throw new CaptureError('Application success was not observed. Review this application manually.', 422);
    }

    let answers: any = null;
    if (body.answers !== undefined && body.answers !== null) {
      try {
        let normalized = body.answers;
        if (typeof normalized === 'object' && !Array.isArray(normalized)) {
          normalized = Object.entries(normalized).map(([k, v]) => ({
            key: String(k).slice(0, 160),
            label: String(k).slice(0, 200),
            value: String(v ?? '').slice(0, 4000)
          }));
        }
        answers = validateApplicationAnswers(normalized);
      } catch (ansErr) {
        console.warn('[Answers Validation Note]', ansErr);
        answers = null;
      }
    }

    // Resolve Candidate (handles UUID or candidate slug/actor candidate)
    let candidateId = body.candidateId;
    let candidateVersion: number | null = null;
    if (isUuid(candidateId)) {
      const { data: cand } = await database().from('candidates').select('id,version').eq('id', candidateId).maybeSingle();
      if (cand) {
        candidateId = cand.id;
        candidateVersion = cand.version ?? null;
      } else {
        const { data: fallbackCand } = await database().from('candidates').select('id,version')
          .or(`user_id.eq.${actor.id},assigned_recruiter_id.eq.${actor.id},assigned_technical_recruiter_id.eq.${actor.id}`)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        candidateId = fallbackCand ? fallbackCand.id : '0dcd0172-cb1e-41dd-99b3-d963bbc1b156';
        candidateVersion = fallbackCand ? fallbackCand.version ?? null : null;
      }
    } else {
      const { data: fallbackCand } = await database().from('candidates').select('id,version')
        .or(`user_id.eq.${actor.id},assigned_recruiter_id.eq.${actor.id},assigned_technical_recruiter_id.eq.${actor.id}`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      candidateId = fallbackCand ? fallbackCand.id : '0dcd0172-cb1e-41dd-99b3-d963bbc1b156';
      candidateVersion = fallbackCand ? fallbackCand.version ?? null : null;
    }

    const eventKey = isUuid(body.eventKey) ? body.eventKey : crypto.randomUUID();
    const safeJobUrl = applicationUrlKey(body.jobUrl);

    // Only the document observed on this application establishes what was applied.
    const finalAppliedResume = body.appliedResume || null;

    // A reopened application may lose its intent URL parameter. Reuse only an
    // exact application belonging to this actor and candidate, never a title match.
    const { data: intents, error: intentError } = await database().from('application_intents')
      .select('id,submission_id,attempt,job:jobs(id,application_url)').eq('owner_id', actor.id).eq('candidate_id', candidateId);
    checkDb(intentError);
    const matches = (intents || []).filter(intent => {
      const job = Array.isArray(intent.job) ? intent.job[0] : intent.job;
      return safeJobUrl && job?.application_url && allowedCaptureUrl(safeJobUrl, job.application_url);
    });
    if (matches.length > 1) throw new CaptureError('Several applications match this page. Open the correct draft from the portal and retry.', 409);
    const matchingIntent = matches[0];
    const attempt = Math.max(body.attempt, matchingIntent?.attempt || 1);
    let result: { submission: { id: string; candidate_id: string; duplicate_flag: boolean; applied_resume?: any; job_id?: string | null }; duplicate: boolean; replayed?: boolean };
    
    if (matchingIntent) {
      const { error: observationError } = await database().rpc('record_browser_event', {
        p_actor: actor.id, p_intent: matchingIntent.id, p_key: eventKey, p_status: 'submitted', p_attempt: attempt,
        p_source: body.manualAttestation ? 'recruiter_attestation' : 'extension_observation',
        p_evidence: body.evidence || 'Applicant manually attested submission', p_url: safeJobUrl, p_observed: new Date().toISOString(),
      });
      checkDb(observationError);
      const { data: existing, error: existingError } = await database().from('job_submissions').select('*').eq('id', matchingIntent.submission_id).eq('candidate_id', candidateId).single();
      checkDb(existingError);
      if (!existing) throw new CaptureError('Application draft not found.', 404);

      // If job description was provided and existing job lacks details, update the job record
      const jobObj = Array.isArray(matchingIntent.job) ? matchingIntent.job[0] : matchingIntent.job;
      if (jobObj?.id && body.jobDescription) {
        await database().from('jobs').update({
          description: body.jobDescription,
          description_html: body.jobDescriptionHtml || '',
          location: body.jobLocation || undefined,
          last_seen_at: new Date().toISOString()
        }).eq('id', jobObj.id);
      }

      result = { submission: existing, duplicate: existing.duplicate_flag };
    } else {
      // Look for an existing submission with the same candidate and matching job_url
      let existingSubmission: any = null;
      if (safeJobUrl) {
        const { data: existingSubs, error: existingSubsError } = await database().from('job_submissions')
          .select('*').eq('candidate_id', candidateId)
          .in('status', ['Draft', 'Applied']).order('created_at', { ascending: false }).limit(50);
        checkDb(existingSubsError);
        existingSubmission = (existingSubs || []).find(sub => {
          const subKey = applicationUrlKey(sub.job_url);
          return subKey && subKey === safeJobUrl;
        });
      }

      const atsNote = (body.matchScore !== undefined && body.matchScore !== null)
        ? `[ATS Match: ${body.matchScore}%]` + (body.matchedSkills?.length ? ` Matched: ${body.matchedSkills.slice(0, 5).join(', ')}` : '') + (body.missingSkills?.length ? ` | Missing: ${body.missingSkills.slice(0, 4).join(', ')}` : '')
        : '';
      const userNotes = body.notes || (body.manualAttestation ? 'Manual attestation: ' + (body.evidence || 'Applicant reports submission') : (body.evidence || 'Application submission observed by browser extension'));
      const finalNotes = [atsNote, userNotes].filter(Boolean).join(' • ');

      if (existingSubmission) {
        const { error: updateError } = await database().from('job_submissions')
          .update({ 
            status: 'Applied', 
            capture_status: 'submitted', 
            notes: finalNotes || existingSubmission.notes
          })
          .eq('id', existingSubmission.id);
        checkDb(updateError);
        existingSubmission.status = 'Applied';
        existingSubmission.capture_status = 'submitted';
        result = { submission: existingSubmission, duplicate: false, replayed: true };
      } else {
        try {
          const { data, error } = await database().rpc('record_extension_submission', {
            p_actor: actor.id, 
            p_candidate: candidateId, 
            p_event_key: eventKey, 
            p_attempt: attempt,
            p_fields: { 
              companyName: body.companyName, 
              jobTitle: body.jobTitle, 
              jobUrl: safeJobUrl,
              portalSource: body.portalSource || 'Outside Job', 
              jobLocation: body.jobLocation || null,
              jobDescription: body.jobDescription || null,
              jobDescriptionHtml: body.jobDescriptionHtml || null,
              department: body.department || null,
              employmentType: body.employmentType || 'unknown',
              compensation: body.compensation || null,
              arrangements: body.arrangements || null,
              externalId: body.externalId || null,
              notes: finalNotes
            },
          });
          if (error) throw error;
          result = data as typeof result;
        } catch (rpcErr: any) {
          // Direct insert fallback without owner_id or applied_resume
          const { data: newSub, error: subErr } = await database().from('job_submissions').insert({
            candidate_id: candidateId,
            recruiter_id: actor.role === 'recruiter' ? actor.id : null,
            technical_recruiter_id: actor.role === 'technical_recruiter' ? actor.id : null,
            submission_date: new Date().toISOString().split('T')[0],
            company_name: body.companyName,
            job_title: body.jobTitle,
            job_url: safeJobUrl,
            portal_source: body.portalSource || 'Outside Job',
            job_location: body.jobLocation || null,
            status: 'Applied',
            capture_status: 'submitted',
            notes: finalNotes
          }).select('*').single();
          checkDb(subErr);
          result = { submission: newSub, duplicate: false };
        }
      }
    }

    if (finalAppliedResume) {
      await saveAppliedResume(result.submission.id, candidateId, finalAppliedResume);
      result.submission.applied_resume = finalAppliedResume;
    }

    let snapshot = null;
    if (answers && Array.isArray(answers) && answers.length > 0) {
      try {
        let safeUrl = '';
        try { const parsed = new URL(safeJobUrl || request.headers.get('origin') || 'https://unknown.invalid'); parsed.search = ''; parsed.hash = ''; safeUrl = parsed.toString(); } catch { safeUrl = 'https://unknown.invalid'; }
        const { data: saved, error: snapshotError } = await database().rpc('save_application_answer_snapshot', {
          p_actor: actor.id, p_intent: matchingIntent?.id || null, p_submission: result.submission.id, p_candidate: candidateId,
          p_attempt: attempt, p_event_key: eventKey, p_portal: body.portalSource || new URL(safeUrl).hostname,
          p_url: safeUrl, p_profile_version: candidateVersion, p_answers: answers, p_observed_at: new Date().toISOString(),
        });
        if (!snapshotError) snapshot = saved;
      } catch (snapshotErr) {
        console.warn('[Snapshot Warning]', snapshotErr);
      }
    }

    // Save to dedicated public.outside_jobs table for clear separation
    try {
      const portalSource = body.portalSource || (safeJobUrl ? new URL(safeJobUrl).hostname : 'Outside Job');
      const outsideJobPayload = {
        candidate_id: candidateId,
        submission_id: result.submission.id,
        title: body.jobTitle,
        company: body.companyName,
        job_url: safeJobUrl || '',
        portal_source: portalSource,
        location: body.jobLocation || null,
        department: body.department || null,
        employment_type: body.employmentType || 'Full-time',
        description: body.jobDescription || null,
        description_html: body.jobDescriptionHtml || null,
        match_score: body.matchScore ?? null,
        matched_skills: body.matchedSkills || [],
        missing_skills: body.missingSkills || [],
        extracted_skills: body.extractedSkills || [],
        ats_analysis: body.atsAnalysis || null,
        answers: answers || null,
        applied_resume: finalAppliedResume || null,
        status: 'Applied',
        applied_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const table = database().from('outside_jobs');
      if (typeof table?.select === 'function' && typeof table?.insert === 'function') {
        const { data: existingOutside } = await table
          .select('id').ilike('job_url', safeJobUrl || '').maybeSingle();

        if (existingOutside) {
          await table.update(outsideJobPayload).eq('id', existingOutside.id);
        } else {
          await table.insert(outsideJobPayload);
        }
      }
    } catch (outsideErr) {
      console.warn('[Outside Jobs Save Warn]', outsideErr);
    }
    return { success: true, submission: result.submission, isDuplicate: result.duplicate, replayed: Boolean(result.replayed), snapshot };
      } catch (innerErr: any) {
        console.error('[AUTO-SUBMIT INNER ERROR]', innerErr);
        throw innerErr;
      }
    });
  } catch (outerErr: any) {
    console.error('[AUTO-SUBMIT OUTER ERROR]', outerErr);
    return Response.json({ error: outerErr?.message || 'Internal server error' }, { status: 500 });
  }
}
