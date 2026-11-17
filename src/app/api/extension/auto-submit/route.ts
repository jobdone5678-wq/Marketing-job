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
  confirmationUrl: z.url({ protocol: /^https$/ }).max(2000).optional(),
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
    const actor = await extensionProfile(request);

    const body = autoSubmitSchema.parse(await request.json());
    
    if (!validateObservation('submitted', body.evidence || '')) {
      throw new CaptureError('Application success was not observed. Review this application manually.', 422);
    }
    if (body.confirmationUrl && (!body.jobUrl || !allowedCaptureUrl(body.confirmationUrl, body.jobUrl, 'submitted', body.evidence || ''))) {
      throw new CaptureError('The confirmation could not be matched to this application.', 422);
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
    const findFallbackCandidate = async () => {
      const { data, error } = await database().from('candidates').select('id,version')
        .eq('user_id', actor.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      checkDb(error);
      return data;
    };

    if (isUuid(candidateId)) {
      const { data: cand, error } = await database().from('candidates').select('id,version').eq('id', candidateId).eq('user_id', actor.id).maybeSingle();
      checkDb(error);
      if (!cand) throw new CaptureError('Candidate not found. Please upload or select a valid candidate.', 404);
      candidateVersion = cand.version ?? null;
    } else {
      const fallbackCand = await findFallbackCandidate();
      if (fallbackCand) { candidateId = fallbackCand.id; candidateVersion = fallbackCand.version ?? null; }
      else { throw new CaptureError('Candidate not found. Please upload or select a valid candidate.', 404); }
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
      return body.jobUrl && job?.application_url && allowedCaptureUrl(body.jobUrl, job.application_url);
    });
    if (matches.length > 1) throw new CaptureError('Several applications match this page. Open the correct draft from the portal and retry.', 409);
    const matchingIntent = matches[0];
    const attempt = Math.max(body.attempt, matchingIntent?.attempt || 1);
    let result: { submission: { id: string; candidate_id: string; duplicate_flag: boolean; applied_resume?: any; job_id?: string | null; source_type?: string }; duplicate: boolean; replayed?: boolean };
    
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
      // Resolve linked job from jobs table if possible
      let resolvedJobId: string | null = null;
      if (safeJobUrl) {
        const { data: jobByUrl } = await database().from('jobs').select('id,application_url,source_url').limit(150);
        const matched = (jobByUrl || []).find(j => {
          const k1 = applicationUrlKey(j.application_url);
          const k2 = applicationUrlKey(j.source_url);
          return (k1 && k1 === safeJobUrl) || (k2 && k2 === safeJobUrl);
        });
        if (matched) resolvedJobId = matched.id;
      }

      // Look for an existing submission with the same candidate and matching job_url
      let existingSubmission: any = null;
      if (safeJobUrl) {
        let existingQuery = database().from('job_submissions')
          .select('*').eq('candidate_id', candidateId)
          .order('created_at', { ascending: false }).limit(50);
        if (body.confirmationUrl) existingQuery = existingQuery.eq('job_url', safeJobUrl);
        else existingQuery = existingQuery.in('status', ['Draft', 'Applied']);
        const { data: existingSubs, error: existingSubsError } = await existingQuery;
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

      if (existingSubmission && body.confirmationUrl && existingSubmission.status !== 'Draft') {
        result = { submission: existingSubmission, duplicate: existingSubmission.duplicate_flag, replayed: true };
      } else if (existingSubmission) {
        const updatePayload: any = {
          status: 'Applied',
          capture_status: 'submitted',
          notes: finalNotes || existingSubmission.notes,
          source_type: 'extension'
        };
        if (resolvedJobId && !existingSubmission.job_id) {
          updatePayload.job_id = resolvedJobId;
        }
        const { error: updateError } = await database().from('job_submissions')
          .update(updatePayload)
          .eq('id', existingSubmission.id);
        checkDb(updateError);
        existingSubmission.status = 'Applied';
        existingSubmission.capture_status = 'submitted';
        existingSubmission.source_type = 'extension';
        if (resolvedJobId) existingSubmission.job_id = resolvedJobId;
        result = { submission: existingSubmission, duplicate: false, replayed: true };
      } else if (body.confirmationUrl) {
        // A stable event ID makes retries idempotent without creating a catalog posting for an outside job.
        const db = database();
        const { data: inserted, error: insertError } = await db.from('job_submissions').upsert({
          id: eventKey,
          candidate_id: candidateId,
          job_id: resolvedJobId,
          company_name: body.companyName,
          job_title: body.jobTitle,
          job_url: safeJobUrl,
          portal_source: body.portalSource || new URL(body.confirmationUrl).hostname,
          job_location: body.jobLocation || null,
          status: 'Applied',
          capture_status: 'submitted',
          source_type: 'extension',
          notes: finalNotes,
        }, { onConflict: 'id', ignoreDuplicates: true, defaultToNull: false }).select('*').maybeSingle();
        checkDb(insertError);
        if (inserted) {
          result = { submission: inserted, duplicate: inserted.duplicate_flag };
        } else {
          const { data: existing, error } = await db.from('job_submissions').select('*')
            .eq('id', eventKey).eq('candidate_id', candidateId).eq('job_url', safeJobUrl!).maybeSingle();
          checkDb(error);
          if (!existing) throw new CaptureError('Submission event does not match this posting.', 409);
          result = { submission: existing, duplicate: existing.duplicate_flag, replayed: true };
        }
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
          if (resolvedJobId && result?.submission?.id) {
            await database().from('job_submissions').update({ job_id: resolvedJobId, source_type: 'extension' }).eq('id', result.submission.id);
            result.submission.job_id = resolvedJobId;
            result.submission.source_type = 'extension';
          }
        } catch (rpcErr: any) {
          // Direct insert fallback without owner_id or applied_resume
          const { data: newSub, error: subErr } = await database().from('job_submissions').insert({
            candidate_id: candidateId,
            job_id: resolvedJobId,
            submission_date: new Date().toISOString().split('T')[0],
            company_name: body.companyName,
            job_title: body.jobTitle,
            job_url: safeJobUrl,
            portal_source: body.portalSource || 'Outside Job',
            job_location: body.jobLocation || null,
            status: 'Applied',
            capture_status: 'submitted',
            notes: finalNotes,
            source_type: 'extension'
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

    const sourceHost = safeJobUrl ? new URL(safeJobUrl).hostname : '';
    const isPortal = /(^|\.)(nextkinhr\.com|jobright-internal\.com)$/.test(sourceHost);
    if (!matchingIntent && !isPortal && safeJobUrl) try {
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
      if (body.confirmationUrl) {
        const { error } = await table.upsert({
          ...outsideJobPayload, capture_owner_id: actor.id,
        }, { onConflict: 'capture_owner_id,job_url', defaultToNull: false });
        checkDb(error);
      } else if (typeof table?.select === 'function' && typeof table?.insert === 'function') {
        const { data: existingOutside } = await table
          .select('id').eq('candidate_id', candidateId).eq('job_url', safeJobUrl)
          .order('capture_owner_id', { ascending: false, nullsFirst: false })
          .limit(1).maybeSingle();

        if (existingOutside) {
          await table.update(outsideJobPayload).eq('id', existingOutside.id);
        } else {
          await table.insert(outsideJobPayload);
        }
      }
    } catch (outsideErr) {
      if (body.confirmationUrl) throw outsideErr;
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
