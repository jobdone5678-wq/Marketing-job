import { extensionRoute, extensionProfile, cors } from '@/lib/capture/server';
import { database, checkDb, CaptureError } from '@/lib/db/admin';
import { validateApplicationAnswers } from '@/lib/capture/snapshot';
import {validateObservation} from '@/lib/capture/validation';
import { z } from 'zod';

export async function OPTIONS(request: Request) { return cors(request, new Response(null, { status: 204 })); }

const autoSubmitSchema = z.object({
  candidateId: z.uuid(), eventKey: z.uuid(), attempt: z.number().int().min(1).max(1000),
  companyName: z.string().trim().min(1).max(200), jobTitle: z.string().trim().min(1).max(200),
  jobUrl: z.string().url().max(2000).optional().nullable(), portalSource: z.string().max(100).optional().nullable(),
  jobLocation: z.string().max(200).optional().nullable(), notes: z.string().max(1000).optional().nullable(),
  evidence: z.string().max(1000).optional().nullable(), answers: z.unknown().optional(), profileVersion: z.number().int().positive().optional().nullable(),
  manualAttestation:z.boolean().default(false),
});

export async function POST(request: Request) {
  return extensionRoute(request, async () => {
    const actor = await extensionProfile(request);
    const body = autoSubmitSchema.parse(await request.json());
    if(!body.manualAttestation&&!validateObservation('submitted',body.evidence||''))throw new CaptureError('Application success was not observed. Review this application manually.',422);
    const answers = body.manualAttestation||body.answers === undefined ? null : validateApplicationAnswers(body.answers);
    const {data:candidate,error:candidateError}=await database().from('candidates').select('id,version').eq('id',body.candidateId).maybeSingle();checkDb(candidateError);if(!candidate)throw new CaptureError('Selected candidate not found.',404);
    let safeJobUrl:string|null=null;try{if(body.jobUrl){const parsed=new URL(body.jobUrl);parsed.search='';parsed.hash='';safeJobUrl=parsed.toString();}}catch{}
    const { data, error } = await database().rpc('record_extension_submission', {
      p_actor: actor.id, p_candidate: body.candidateId, p_event_key: body.eventKey, p_attempt: body.attempt,
      p_fields: { companyName: body.companyName, jobTitle: body.jobTitle, jobUrl: safeJobUrl,
        portalSource: body.portalSource || 'Browser Extension', jobLocation: body.jobLocation || null,
        notes: body.manualAttestation?'Manual attestation: '+(body.notes||body.evidence||'Applicant reports submission'):body.notes || body.evidence || 'Application submission observed by browser extension' },
    });
    if (error?.message.includes('Candidate access denied')) throw new CaptureError('Candidate is not assigned to this account.', 404);
    checkDb(error);
    const result = data as { submission: { id: string; candidate_id: string; duplicate_flag: boolean }; duplicate: boolean };
    let snapshot = null;
    if (answers) {
      let safeUrl = '';
      try { const parsed = new URL(safeJobUrl || request.headers.get('origin') || 'https://unknown.invalid'); parsed.search = ''; parsed.hash = ''; safeUrl = parsed.toString(); } catch { safeUrl = 'https://unknown.invalid'; }
      const { data: saved, error: snapshotError } = await database().rpc('save_application_answer_snapshot', {
        p_actor: actor.id, p_intent: null, p_submission: result.submission.id, p_candidate: body.candidateId,
        p_attempt: body.attempt, p_event_key: body.eventKey, p_portal: body.portalSource || new URL(safeUrl).hostname,
        p_url: safeUrl, p_profile_version: candidate.version ?? null, p_answers: answers, p_observed_at: new Date().toISOString(),
      });
      checkDb(snapshotError); snapshot = saved;
    }
    return { success: true, submission: result.submission, isDuplicate: result.duplicate, replayed: Boolean((data as { replayed?: boolean }).replayed), snapshot };
  });
}
