import { extensionRoute, extensionProfile, cors } from '@/lib/capture/server';
import { database, checkDb, CaptureError } from '@/lib/db/admin';
import { validateApplicationAnswers } from '@/lib/capture/snapshot';
import { allowedCaptureUrl, validateObservation } from '@/lib/capture/validation';
import { appliedResumeSchema, saveAppliedResume } from '@/lib/capture/applied-resume';
import { z } from 'zod';

export async function OPTIONS(request: Request) { return cors(request, new Response(null, { status: 204 })); }

const autoSubmitSchema = z.object({
  candidateId: z.uuid(), eventKey: z.uuid(), attempt: z.number().int().min(1).max(1000),
  companyName: z.string().trim().min(1).max(200), jobTitle: z.string().trim().min(1).max(200),
  jobUrl: z.string().url().max(2000).optional().nullable(), portalSource: z.string().max(100).optional().nullable(),
  jobLocation: z.string().max(200).optional().nullable(), notes: z.string().max(1000).optional().nullable(),
  evidence: z.string().max(1000).optional().nullable(), answers: z.unknown().optional(), profileVersion: z.number().int().positive().optional().nullable(),
  manualAttestation: z.boolean().default(false),
  appliedResume: appliedResumeSchema,
});

export async function POST(request: Request) {
  return extensionRoute(request, async () => {
    const actor = await extensionProfile(request);
    const body = autoSubmitSchema.parse(await request.json());
    if(!body.manualAttestation&&!validateObservation('submitted',body.evidence||''))throw new CaptureError('Application success was not observed. Review this application manually.',422);
    const answers = body.answers === undefined ? null : validateApplicationAnswers(body.answers);
    const {data:candidate,error:candidateError}=await database().from('candidates').select('id,version').eq('id',body.candidateId).maybeSingle();checkDb(candidateError);if(!candidate)throw new CaptureError('Selected candidate not found.',404);
    let safeJobUrl:string|null=null;try{if(body.jobUrl){const parsed=new URL(body.jobUrl);parsed.search='';parsed.hash='';safeJobUrl=parsed.toString();}}catch{}

    // Only the document observed on this application establishes what was applied.
    const finalAppliedResume = body.appliedResume || null;

    // A reopened application may lose its intent URL parameter. Reuse only an
    // exact application belonging to this actor and candidate, never a title match.
    const { data: intents, error: intentError } = await database().from('application_intents')
      .select('id,submission_id,attempt,job:jobs(application_url)').eq('owner_id', actor.id).eq('candidate_id', body.candidateId);
    checkDb(intentError);
    const matches = (intents || []).filter(intent => {
      const job = Array.isArray(intent.job) ? intent.job[0] : intent.job;
      return safeJobUrl && job?.application_url && allowedCaptureUrl(safeJobUrl, job.application_url);
    });
    if (matches.length > 1) throw new CaptureError('Several applications match this page. Open the correct draft from the portal and retry.', 409);
    const matchingIntent = matches[0];
    const attempt = Math.max(body.attempt, matchingIntent?.attempt || 1);
    let result: { submission: { id: string; candidate_id: string; duplicate_flag: boolean; applied_resume?: any }; duplicate: boolean; replayed?: boolean };
    if (matchingIntent) {
      const { error: observationError } = await database().rpc('record_browser_event', {
        p_actor: actor.id, p_intent: matchingIntent.id, p_key: body.eventKey, p_status: 'submitted', p_attempt: attempt,
        p_source: body.manualAttestation ? 'recruiter_attestation' : 'extension_observation',
        p_evidence: body.evidence || 'Applicant manually attested submission', p_url: safeJobUrl, p_observed: new Date().toISOString(),
      });
      checkDb(observationError);
      const { data: existing, error: existingError } = await database().from('job_submissions').select('*').eq('id', matchingIntent.submission_id).eq('candidate_id', body.candidateId).single();
      checkDb(existingError);
      if (!existing) throw new CaptureError('Application draft not found.', 404);
      result = { submission: existing, duplicate: existing.duplicate_flag };
    } else {
      const { data, error } = await database().rpc('record_extension_submission', {
        p_actor: actor.id, p_candidate: body.candidateId, p_event_key: body.eventKey, p_attempt: body.attempt,
        p_fields: { companyName: body.companyName, jobTitle: body.jobTitle, jobUrl: safeJobUrl,
          portalSource: body.portalSource || 'Browser Extension', jobLocation: body.jobLocation || null,
          notes: body.manualAttestation?'Manual attestation: '+(body.notes||body.evidence||'Applicant reports submission'):body.notes || body.evidence || 'Application submission observed by browser extension',
          appliedResume: finalAppliedResume },
      });
      if (error?.message.includes('Candidate access denied')) throw new CaptureError('Candidate is not assigned to this account.', 404);
      checkDb(error);
      result = data as typeof result;
    }

    if (finalAppliedResume) {
      await saveAppliedResume(result.submission.id, body.candidateId, finalAppliedResume);
      result.submission.applied_resume = finalAppliedResume;
    }

    let snapshot = null;
    if (answers) {
      let safeUrl = '';
      try { const parsed = new URL(safeJobUrl || request.headers.get('origin') || 'https://unknown.invalid'); parsed.search = ''; parsed.hash = ''; safeUrl = parsed.toString(); } catch { safeUrl = 'https://unknown.invalid'; }
      const { data: saved, error: snapshotError } = await database().rpc('save_application_answer_snapshot', {
        p_actor: actor.id, p_intent: matchingIntent?.id || null, p_submission: result.submission.id, p_candidate: body.candidateId,
        p_attempt: attempt, p_event_key: body.eventKey, p_portal: body.portalSource || new URL(safeUrl).hostname,
        p_url: safeUrl, p_profile_version: candidate.version ?? null, p_answers: answers, p_observed_at: new Date().toISOString(),
      });
      checkDb(snapshotError); snapshot = saved;
    }
    return { success: true, submission: result.submission, isDuplicate: result.duplicate, replayed: Boolean(result.replayed), snapshot };
  });
}
