import { appliedResumeSchema, saveAppliedResume } from './applied-resume';
import 'server-only';
import { createHash } from 'node:crypto';
import { database, checkDb, CaptureError, errorResponse } from '@/lib/db/admin';
import { allowedCaptureUrl, validateObservation } from './validation';
import { validateApplicationAnswers } from './snapshot';
import { applicationUrlKey } from '@/lib/jobs/application-state';
import { z } from 'zod';
export const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex');
export type ExtensionProfile = { id: string; status: string; role: 'candidate' };
export async function extensionProfile(request: Request): Promise<ExtensionProfile> {
  const header = request.headers.get('authorization') || '';
  if (!/^Bearer [A-Za-z0-9_-]{20,128}$/.test(header)) {
    throw new CaptureError('Authentication required. Missing or malformed extension token.', 401);
  }
  const { data, error } = await database()
    .from('extension_credentials')
    .select('owner_id,expires_at,revoked_at')
    .eq('token_hash', tokenHash(header.slice(7)))
    .maybeSingle();
  checkDb(error);
  const credential = data as {
    owner_id: string;
    expires_at: string;
    revoked_at: string | null;
  } | null;
  if (!credential || credential.revoked_at || Date.parse(credential.expires_at) <= Date.now()) {
    throw new CaptureError('Extension session expired or revoked. Please pair again.', 401);
  }
  const { data: profileData, error: profileError } = await database()
    .from('profiles')
    .select('id,status,role')
    .eq('id', credential.owner_id)
    .single();
  checkDb(profileError);
  const profile = profileData as ExtensionProfile | null;
  if (!profile || profile.status !== 'active') {
    throw new CaptureError('Active user profile required to use the extension.', 403);
  }
  if (profile.role !== 'candidate') {
    throw new CaptureError('Unauthorized role for extension access.', 403);
  }
  return profile;
}
export async function extensionActor(request: Request) {
  const profile = await extensionProfile(request);
  return profile.id;
}

export async function recordObservation(actor: string, body: unknown, manual = false) {
  const input = z
    .object({
      intentId: z.uuid(),
      eventKey: z.uuid(),
      status: z.enum(['in_progress', 'submit_attempted', 'submitted', 'confirmed', 'failed']),
      attempt: z.number().int().min(1).max(1000),
      evidence: z.string().min(1).max(1000),
      url: z.string().url().max(2000),
      applicationUrl: z.url({ protocol: /^https$/ }).max(2000).optional(),
      observedAt: z.string().datetime(),
      answers: z.unknown().optional(),
      appliedResume: appliedResumeSchema.optional().nullable(),
    })
    .parse(body);
  const parsedUrl = new URL(input.url);
  parsedUrl.search = '';
  parsedUrl.hash = '';
  const safeUrl = parsedUrl.toString();
  const { data: intent, error } = await database()
    .from('application_intents')
    .select('*,job:jobs(application_url),candidate:candidates(version)')
    .eq('id', input.intentId)
    .eq('owner_id', actor)
    .maybeSingle();
  checkDb(error);
  if (!intent) throw new CaptureError('Intent not found.', 404);
  if (
    !manual &&
    (!allowedCaptureUrl(input.url, intent.job.application_url, input.status, input.evidence) ||
      !validateObservation(input.status, input.evidence))
  )
    throw new CaptureError(
      'Unsupported site or insufficient application evidence. Review manually.',
      422
    );

  const dbStatus = input.status === 'confirmed' ? 'submitted' : input.status;
  const submitted = dbStatus === 'submitted';
  const validatedAnswers = !submitted && input.answers !== undefined
    ? validateApplicationAnswers(input.answers)
    : undefined;
  const applicationUrl = input.applicationUrl && allowedCaptureUrl(input.applicationUrl, intent.job.application_url)
    ? input.applicationUrl : undefined;
  const postingKeys = [...new Set([intent.job.application_url, applicationUrl].map(applicationUrlKey).filter(Boolean))];
  const { data: receipt, error: save } = await database().rpc('record_application_observation', {
    p_actor: actor,
    p_intent: input.intentId,
    p_key: input.eventKey,
    p_status: dbStatus,
    p_attempt: input.attempt,
    p_source: manual ? 'recruiter_attestation' : 'extension_observation',
    p_evidence: input.evidence,
    p_url: safeUrl,
    p_observed: input.observedAt,
    p_postings: postingKeys,
  });
  checkDb(save);
  if (typeof receipt?.status !== 'string') throw new Error('Observation RPC returned no application status.');
  const data = receipt.status;

  const applied = data === 'submitted' || data === 'confirmed';
  const archiveResume = async () => {
    if (input.appliedResume && submitted && applied) {
      await saveAppliedResume(intent.submission_id, intent.candidate_id, {
        ...input.appliedResume, appliedAt: receipt.observed_at,
      }, { actor, eventKey: input.eventKey });
    }
  };
  const saveAnswers = async () => {
    if (
      input.answers !== undefined && (!submitted || applied) &&
      ['submit_attempted', 'submitted', 'confirmed'].includes(input.status)
    ) {
      const answers = submitted ? validateApplicationAnswers(input.answers) : validatedAnswers;
      const { data: stored, error: snapshotError } = await database().rpc(
        'save_application_answer_snapshot',
        {
          p_actor: actor,
          p_intent: input.intentId,
          p_submission: intent.submission_id,
          p_candidate: intent.candidate_id,
          p_attempt: receipt.attempt,
          p_event_key: input.eventKey,
          p_portal: parsedUrl.hostname,
          p_url: safeUrl,
          p_profile_version: intent.candidate?.version ?? null,
          p_answers: answers,
          p_observed_at: receipt.observed_at,
        }
      );
      checkDb(snapshotError);
      return stored;
    }
    return null;
  };
  const [archiveResult, snapshotResult] = await Promise.allSettled([archiveResume(), saveAnswers()]);
  if (archiveResult.status === 'rejected') throw archiveResult.reason;
  if (snapshotResult.status === 'rejected') throw snapshotResult.reason;
  const snapshot = snapshotResult.value;
  return { status: input.status === 'confirmed' && applied ? 'confirmed' : data, snapshot };
}
export async function extensionRoute(request: Request, work: () => Promise<unknown>) {
  try {
    return cors(request, Response.json(await work()));
  } catch (e) {
    if (e instanceof z.ZodError || e instanceof SyntaxError)
      return cors(request, Response.json({ error: 'Invalid capture request.' }, { status: 400 }));
    return cors(request, errorResponse(e));
  }
}
export function cors(request: Request, response: Response) {
  const origin = request.headers.get('origin');
  if (!origin) return response;

  const allowedExtensionIds = process.env.ALLOWED_EXTENSION_IDS
    ? process.env.ALLOWED_EXTENSION_IDS.split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : null;

  let isAllowed = false;
  if (origin.startsWith('chrome-extension://')) {
    const extId = origin.replace('chrome-extension://', '').replace(/\/.*$/, '');
    if (allowedExtensionIds && allowedExtensionIds.length > 0) {
      isAllowed = allowedExtensionIds.includes(extId);
    } else {
      // Validate well-formed 32-character Chrome extension ID
      isAllowed = /^[a-p]{32}$/i.test(extId);
    }
  } else {
    try {
      const u = new URL(origin);
      if (
        (u.protocol === 'http:' || u.protocol === 'https:') &&
        (u.hostname === 'localhost' || u.hostname === '127.0.0.1')
      ) {
        isAllowed = true;
      } else if (
        u.protocol === 'https:' &&
        (u.hostname === 'nextkinhr.com' || u.hostname.endsWith('.nextkinhr.com'))
      ) {
        isAllowed = true;
      }
    } catch {}
  }

  if (isAllowed) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Vary', 'Origin');
    response.headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
    response.headers.set('Access-Control-Allow-Credentials', 'true');
  }
  return response;
}
