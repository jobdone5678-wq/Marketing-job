let nodeCrypto: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  nodeCrypto = require('node:crypto');
} catch {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    nodeCrypto = require('crypto');
  } catch {}
}
import { extensionRoute, extensionProfile, cors } from '@/lib/capture/server';
import { database, checkDb, CaptureError } from '@/lib/db/admin';
import { validateApplicationAnswers } from '@/lib/capture/snapshot';
import { allowedCaptureUrl, validateObservation } from '@/lib/capture/validation';
import { appliedResumeSchema, saveAppliedResume } from '@/lib/capture/applied-resume';
import { z } from 'zod';
import { applicationUrlKey } from '@/lib/jobs/application-state';

export function computeIdempotencyKey(candidateId: string, canonicalJobUrl: string, dateStr: string): string {
  const input = `${candidateId}:${canonicalJobUrl}:${dateStr}`;
  if (nodeCrypto && typeof nodeCrypto.createHash === 'function') {
    return nodeCrypto.createHash('sha256').update(input).digest('hex');
  }
  if (typeof crypto !== 'undefined' && typeof (crypto as any).createHash === 'function') {
    return (crypto as any).createHash('sha256').update(input).digest('hex');
  }
  let h1 = 0xdeadbeef;
  let h2 = 0x41c64e6d;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const part1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const part2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return (part1 + part2).repeat(4);
}

export async function OPTIONS(request: Request) {
  return cors(request, new Response(null, { status: 204 }));
}

const autoSubmitSchema = z.object({
  candidateId: z.string().min(1).optional(),
  userId: z.string().optional(),
  eventKey: z.string().min(1).max(200).optional(),
  attemptId: z.string().min(1).max(200).optional(),
  attempt: z.number().int().min(1).max(1000).default(1),
  companyName: z.string().trim().min(1).max(200),
  jobTitle: z.string().trim().min(1).max(200),
  jobUrl: z.string().url().max(2000).optional().nullable(),
  confirmationUrl: z
    .url({ protocol: /^https$/ })
    .max(2000)
    .optional(),
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
  atsDetected: z.boolean().optional(),
  captureMethod: z.string().optional(),
}).passthrough();

const isUuid = (val: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);

function legacyReceiptKey(
  actor: string, candidate: string, posting: string | null, company: string, title: string,
  manual: boolean, legacyKey: string, attempt: number
) {
  const digest = nodeCrypto.createHash('sha256').update(JSON.stringify([
    'application-receipt', actor, candidate,
    posting ?? [company.toLowerCase(), title.toLowerCase()], manual, legacyKey, attempt,
  ])).digest('hex');
  const variant = ((Number.parseInt(digest[16], 16) & 3) | 8).toString(16);
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-8${digest.slice(13, 16)}-${variant}${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

export async function POST(request: Request) {
  const urlObj = new URL(request.url);
  const pathname = urlObj.pathname.replace(/\/$/, '');
  const requireReceipt = pathname === '/api/webhooks/application-submitted';

  try {
    return await extensionRoute(request, async () => {
      try {
        // 1. Authenticate user from trusted token header
        const actor = await extensionProfile(request);

        const body = autoSubmitSchema.parse(await request.json());

        // Never trust client-supplied user ID; must strictly match authenticated user
        if (body.userId && body.userId !== actor.id) {
          throw new CaptureError('Client-supplied user ID does not match authenticated user.', 403);
        }

        const rawEventKey = body.eventKey || body.attemptId || '';
        if (requireReceipt && (!body.confirmationUrl || !body.jobUrl || body.manualAttestation || !rawEventKey || !isUuid(rawEventKey))) {
          throw new CaptureError('A submission receipt and stable event ID are required.', 422);
        }
        if ((!requireReceipt && !body.candidateId) ||
          (requireReceipt && body.candidateId && !isUuid(body.candidateId))) {
          throw new CaptureError('Invalid candidate identifier.', 400);
        }

        // Validate observation evidence for non-manual submissions
        if (!body.manualAttestation && !validateObservation('submitted', body.evidence || '')) {
          throw new CaptureError(
            'Application success was not observed. Review this application manually.',
            422
          );
        }
        if (
          !body.manualAttestation &&
          body.confirmationUrl &&
          (!body.jobUrl ||
            !allowedCaptureUrl(body.confirmationUrl, body.jobUrl, 'submitted', body.evidence || ''))
        ) {
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
                value: String(v ?? '').slice(0, 4000),
              }));
            }
            answers = validateApplicationAnswers(normalized);
          } catch (ansErr) {
            console.warn('[Answers Validation Note]', ansErr);
            answers = null;
          }
        }

        // 2. Resolve Candidate & Validate Ownership strictly against trusted actor.id
        let candidateId = body.candidateId || '';
        let candidateVersion: number | null = null;

        if (candidateId) {
          if (!isUuid(candidateId)) {
            throw new CaptureError('Invalid candidate identifier.', 400);
          }
          const { data: cand, error: candError } = await database()
            .from('candidates')
            .select('id, version, user_id')
            .eq('id', candidateId)
            .maybeSingle();
          checkDb(candError);
          if (!cand) {
            throw new CaptureError('Candidate not found or access denied for this account.', 404);
          }
          if (cand.user_id && cand.user_id !== actor.id) {
            let hasAccess = false;
            if (typeof database().rpc === 'function') {
              const { data: accessData } = await database().rpc('candidate_actor_can_access', {
                p_actor: actor.id,
                p_candidate: candidateId,
              });
              hasAccess = Boolean(accessData);
            }
            if (!hasAccess) {
              throw new CaptureError('Candidate access denied for authenticated user.', 403);
            }
          }
          candidateVersion = cand.version ?? null;
        } else {
          // Resolve candidate owned by actor.id
          const { data: cands, error: candsErr } = await database()
            .from('candidates')
            .select('id, version')
            .eq('user_id', actor.id)
            .limit(2);
          checkDb(candsErr);
          if (cands && cands.length === 1) {
            candidateId = cands[0].id;
            candidateVersion = cands[0].version ?? null;
          } else if (cands && cands.length > 1) {
            throw new CaptureError(
              'Multiple candidates found for this account. Explicit candidateId is required.',
              400
            );
          } else {
            throw new CaptureError(
              'Candidate not found. Please upload or select a valid candidate.',
              404
            );
          }
        }

        const safeJobUrl = applicationUrlKey(body.jobUrl);
        const eventKey = isUuid(rawEventKey) ? rawEventKey : legacyReceiptKey(
          actor.id, candidateId, safeJobUrl, body.companyName, body.jobTitle,
          body.manualAttestation, rawEventKey, body.attempt
        );
        const finalAppliedResume = body.appliedResume || null;

        // Check for matching portal intent
        const { data: intents, error: intentError } = await database()
          .from('application_intents')
          .select('id,submission_id,attempt,job:jobs(id,application_url)')
          .eq('owner_id', actor.id)
          .eq('candidate_id', candidateId);
        checkDb(intentError);
        const matches = (intents || []).filter((intent: any) => {
          const job = Array.isArray(intent.job) ? intent.job[0] : intent.job;
          return (
            body.jobUrl &&
            job?.application_url &&
            allowedCaptureUrl(body.jobUrl, job.application_url)
          );
        });
        if (matches.length > 1) {
          throw new CaptureError(
            'Several applications match this page. Open the correct draft from the portal and retry.',
            409
          );
        }
        const matchingIntent = matches[0];
        const matchedJob = Array.isArray(matchingIntent?.job) ? matchingIntent.job[0] : matchingIntent?.job;
        const attempt = Math.max(body.attempt || 1, matchingIntent?.attempt || 1);

        const calendarDate = new Date().toISOString().slice(0, 10);
        const idempotencyKey = computeIdempotencyKey(
          candidateId,
          safeJobUrl || `${body.companyName}:${body.jobTitle}`,
          calendarDate
        );

        const atsNote =
          body.matchScore !== undefined && body.matchScore !== null
            ? `[ATS Match: ${body.matchScore}%]` +
              (body.matchedSkills?.length
                ? ` Matched: ${body.matchedSkills.slice(0, 5).join(', ')}`
                : '') +
              (body.missingSkills?.length
                ? ` | Missing: ${body.missingSkills.slice(0, 4).join(', ')}`
                : '')
            : '';
        const userNotes =
          body.notes ||
          (body.manualAttestation
            ? 'Manual attestation: ' + (body.evidence || 'Applicant reports submission')
            : body.evidence || 'Application submission observed by browser extension');
        const finalNotes = [atsNote, userNotes, `[IdempotencyKey: ${idempotencyKey}]`].filter(Boolean).join(' • ');

        const portalSource = body.portalSource || (body.confirmationUrl ? new URL(body.confirmationUrl).hostname : 'Outside Job');

        const db = database();
        const rpcPayload = {
          companyName: body.companyName,
          jobTitle: body.jobTitle,
          jobUrl: safeJobUrl,
          confirmationUrl: body.confirmationUrl || null,
          portalSource: portalSource,
          jobLocation: body.jobLocation || null,
          jobDescription: body.jobDescription || null,
          jobDescriptionHtml: body.jobDescriptionHtml || null,
          department: body.department || null,
          employmentType: body.employmentType || (requireReceipt ? 'Full-time' : 'unknown'),
          compensation: body.compensation || null,
          arrangements: body.arrangements || null,
          externalId: body.externalId || null,
          notes: finalNotes,
          evidence: body.evidence || null,
          matchScore: body.matchScore ?? null,
          matchedSkills: body.matchedSkills || [],
          missingSkills: body.missingSkills || [],
          extractedSkills: body.extractedSkills || [],
          atsAnalysis: body.atsAnalysis || null,
          answers: answers || null,
          intentId: matchingIntent?.id || null,
          postingKeys: [safeJobUrl, applicationUrlKey(matchedJob?.application_url)].filter(Boolean),
          source: body.manualAttestation ? 'recruiter_attestation' : 'extension_observation',
        };

        const { data: rpcData, error: rpcError } = await db.rpc('record_extension_submission', {
          p_actor: actor.id,
          p_candidate: candidateId,
          p_event_key: eventKey,
          p_attempt: attempt,
          p_fields: rpcPayload,
        });

        if (rpcError?.message?.includes('conflict')) throw new CaptureError(rpcError.message, 409);
        checkDb(rpcError);
        if (!rpcData?.submission?.id) throw new Error('Submission RPC returned no application.');
        const result = rpcData;
        const receiptAttempt = result.attempt ?? attempt;
        const observedAt = result.observed_at ?? new Date().toISOString();

        const archiveResume = async () => {
          if (!finalAppliedResume) return;
          const archivedResume = await saveAppliedResume(result.submission.id, candidateId, {
            ...finalAppliedResume, appliedAt: observedAt,
          }, { actor: actor.id, eventKey });
          if (archivedResume) result.submission.applied_resume = archivedResume;
        };
        const saveAnswers = async () => {
          if (!answers?.length) return null;
          let safeUrl = '';
          try {
            const parsed = new URL(
              safeJobUrl || request.headers.get('origin') || 'https://unknown.invalid'
            );
            parsed.search = '';
            parsed.hash = '';
            safeUrl = parsed.toString();
          } catch {
            safeUrl = 'https://unknown.invalid';
          }
          const { data: saved, error: snapshotError } = await db.rpc(
            'save_application_answer_snapshot',
            {
              p_actor: actor.id,
              p_intent: result.intent_id ?? null,
              p_submission: result.submission.id,
              p_candidate: candidateId,
              p_attempt: receiptAttempt,
              p_event_key: eventKey,
              p_portal: portalSource,
              p_url: safeUrl,
              p_profile_version: candidateVersion,
              p_answers: answers,
              p_observed_at: observedAt,
            }
          );
          checkDb(snapshotError);
          return saved;
        };
        const [archiveResult, snapshotResult] = await Promise.allSettled([archiveResume(), saveAnswers()]);
        if (archiveResult.status === 'rejected') throw archiveResult.reason;
        if (snapshotResult.status === 'rejected') throw snapshotResult.reason;
        const snapshot = snapshotResult.value;

        // 6. ENFORCE EVENT IDEMPOTENCY:
        // Return 200 with { duplicate: true, code: 'IDEMPOTENT_SUBMISSION_EXISTS' } when event_key was already processed
        if (result.code === 'IDEMPOTENT_SUBMISSION_EXISTS' || result.replayed) {
          return {
            success: true,
            duplicate: true,
            code: 'IDEMPOTENT_SUBMISSION_EXISTS',
            message: 'Submission already processed for this event key.',
            submission: result.submission,
            isDuplicate: true,
            replayed: true,
            snapshot,
          };
        }

        return {
          success: true,
          submission: result.submission,
          duplicate: Boolean(result.duplicate),
          isDuplicate: Boolean(result.duplicate),
          replayed: Boolean(result.replayed),
          snapshot,
        };
      } catch (innerErr: any) {
        console.error('[SUBMISSION INNER ERROR]', innerErr);
        throw innerErr;
      }
    });
  } catch (outerErr: any) {
    console.error('[SUBMISSION OUTER ERROR]', outerErr);
    return Response.json({ error: outerErr?.message || 'Internal server error' }, { status: 500 });
  }
}
