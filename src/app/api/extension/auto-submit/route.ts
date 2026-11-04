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
  eventKey: z.string().min(1), 
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
});

const isUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);

export async function POST(request: Request) {
  return extensionRoute(request, async () => {
    const actor = await extensionProfile(request);
    const body = autoSubmitSchema.parse(await request.json());
    if(!body.manualAttestation&&!validateObservation('submitted',body.evidence||''))throw new CaptureError('Application success was not observed. Review this application manually.',422);
    const answers = body.answers === undefined ? null : validateApplicationAnswers(body.answers);

    // Resolve Candidate (handles UUID or candidate slug/actor candidate)
    let candidateId = body.candidateId;
    let candidateVersion: number | null = null;
    if (isUuid(candidateId)) {
      const { data: cand } = await database().from('candidates').select('id,version').eq('id', candidateId).maybeSingle();
      if (cand) {
        candidateId = cand.id;
        candidateVersion = cand.version ?? null;
      } else {
        // Fallback to candidate owned by or assigned to actor
        const { data: fallbackCand } = await database().from('candidates').select('id,version')
          .or(`user_id.eq.${actor.id},assigned_recruiter_id.eq.${actor.id},assigned_technical_recruiter_id.eq.${actor.id}`)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!fallbackCand) throw new CaptureError('Selected candidate not found.', 404);
        candidateId = fallbackCand.id;
        candidateVersion = fallbackCand.version ?? null;
      }
    } else {
      const { data: fallbackCand } = await database().from('candidates').select('id,version')
        .or(`user_id.eq.${actor.id},assigned_recruiter_id.eq.${actor.id},assigned_technical_recruiter_id.eq.${actor.id}`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!fallbackCand) throw new CaptureError('Selected candidate not found.', 404);
      candidateId = fallbackCand.id;
      candidateVersion = fallbackCand.version ?? null;
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
      // Fallback: look for an existing submission with the same candidate and matching job_url
      // to prevent duplicates when the intent URL matching fails (e.g. unsupported ATS host).
      let existingSubmission: any = null;
      if (safeJobUrl) {
        const { data: existingSubs, error: existingSubsError } = await database().from('job_submissions')
          .select('*').eq('candidate_id', candidateId).eq('owner_id', actor.id)
          .in('status', ['Draft', 'Applied']).order('created_at', { ascending: false }).limit(50);
        checkDb(existingSubsError);
        existingSubmission = (existingSubs || []).find(sub => {
          const subKey = applicationUrlKey(sub.job_url);
          return subKey && subKey === safeJobUrl;
        });
      }

      if (existingSubmission) {
        // Update existing submission instead of creating a duplicate
        const { error: updateError } = await database().from('job_submissions')
          .update({ 
            status: 'Applied', 
            capture_status: 'submitted', 
            notes: body.notes || body.evidence || existingSubmission.notes,
            applied_resume: finalAppliedResume || existingSubmission.applied_resume
          })
          .eq('id', existingSubmission.id);
        checkDb(updateError);
        existingSubmission.status = 'Applied';
        existingSubmission.capture_status = 'submitted';
        result = { submission: existingSubmission, duplicate: false, replayed: true };
      } else {
        const { data, error } = await database().rpc('record_extension_submission', {
          p_actor: actor.id, 
          p_candidate: candidateId, 
          p_event_key: eventKey, 
          p_attempt: attempt,
          p_fields: { 
            companyName: body.companyName, 
            jobTitle: body.jobTitle, 
            jobUrl: safeJobUrl,
            portalSource: body.portalSource || 'Browser Extension', 
            jobLocation: body.jobLocation || null,
            jobDescription: body.jobDescription || null,
            jobDescriptionHtml: body.jobDescriptionHtml || null,
            department: body.department || null,
            employmentType: body.employmentType || 'unknown',
            compensation: body.compensation || null,
            arrangements: body.arrangements || null,
            externalId: body.externalId || null,
            notes: body.manualAttestation ? 'Manual attestation: ' + (body.notes || body.evidence || 'Applicant reports submission') : body.notes || body.evidence || 'Application submission observed by browser extension',
            appliedResume: finalAppliedResume 
          },
        });
        if (error?.message.includes('Candidate access denied')) throw new CaptureError('Candidate is not assigned to this account.', 404);
        checkDb(error);
        result = data as typeof result;
      }
    }

    if (finalAppliedResume) {
      await saveAppliedResume(result.submission.id, candidateId, finalAppliedResume);
      result.submission.applied_resume = finalAppliedResume;
    }

    let snapshot = null;
    if (answers) {
      let safeUrl = '';
      try { const parsed = new URL(safeJobUrl || request.headers.get('origin') || 'https://unknown.invalid'); parsed.search = ''; parsed.hash = ''; safeUrl = parsed.toString(); } catch { safeUrl = 'https://unknown.invalid'; }
      const { data: saved, error: snapshotError } = await database().rpc('save_application_answer_snapshot', {
        p_actor: actor.id, p_intent: matchingIntent?.id || null, p_submission: result.submission.id, p_candidate: candidateId,
        p_attempt: attempt, p_event_key: eventKey, p_portal: body.portalSource || new URL(safeUrl).hostname,
        p_url: safeUrl, p_profile_version: candidateVersion, p_answers: answers, p_observed_at: new Date().toISOString(),
      });
      checkDb(snapshotError); snapshot = saved;
    }
    return { success: true, submission: result.submission, isDuplicate: result.duplicate, replayed: Boolean(result.replayed), snapshot };
  });
}
