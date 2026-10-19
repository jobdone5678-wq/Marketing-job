import { extensionRoute, extensionProfile, cors } from '@/lib/capture/server';
import { database, checkDb, CaptureError } from '@/lib/db/admin';
import { candidateAccess } from '@/lib/resumes/repository';
import { resumeDocx } from '@/lib/tailored-resumes/docx';
import { buildResume, normalizeCandidate, fingerprint, VERSION } from '../../../../../browser-extension/resume-engine.js';
import { z } from 'zod';
import type { UserProfile } from '@/types/database';

const inputSchema = z.object({
  candidateId: z.string().uuid(),
  jobTitle: z.string().trim().min(1).max(500),
  companyName: z.string().trim().min(1).max(500),
  jobDescription: z.string().trim().min(40).max(100000),
  jobUrl: z.string().trim().url().max(4000),
});

function canonicalJobUrl(value: string) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new CaptureError('Provide the actual job page URL using HTTP or HTTPS.', 400);
  }
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  return url.toString();
}

async function actor(request: Request) {
  const profile = await extensionProfile(request);
  if (!['client', 'recruiter', 'super_admin'].includes(profile.role)) {
    throw new CaptureError('Your role cannot generate or access application resumes.', 403);
  }
  return profile as UserProfile;
}

type SavedApplicationResume = {id:string;candidate_id:string;candidate_version:number;job_url:string;scope_key:string;result:Awaited<ReturnType<typeof buildResume>>};

function documentResponse(record: SavedApplicationResume) {
  const result = record.result;
  return {
    ...result,
    success: true,
    savedToPortal: true,
    resumeId: record.id,
    candidateId: record.candidate_id,
    candidateVersion: record.candidate_version,
    jobUrl: record.job_url,
    scopeKey: record.scope_key,
    docxBase64: Buffer.from(resumeDocx(result.markdown)).toString('base64'),
  };
}

export async function OPTIONS(request: Request) {
  return cors(request, new Response(null, { status: 204 }));
}

export async function POST(request: Request) {
  return extensionRoute(request, async () => {
    const profile = await actor(request);
    const parsed = inputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw new CaptureError('Select a candidate and provide the actual job title, company, job page URL and complete job description (at least 40 characters).', 400);
    }
    const input = parsed.data;
    const candidate = await candidateAccess(profile, input.candidateId);
    if (candidate.provenance_status !== 'confirmed') {
      throw new CaptureError('Review and confirm the candidate details in NextKinHR before generating a resume.', 409);
    }
    const job = { ...input, jobUrl: canonicalJobUrl(input.jobUrl) };
    const candidateHash = await fingerprint(normalizeCandidate(candidate));
    const candidateVersion = candidate.version || 1;
    const scopeKey = await fingerprint({ engine:VERSION, candidateId: candidate.id, candidateVersion, candidateHash, job });
    const db = database();
    const { data: existing, error: lookupError } = await db.from('application_resume_versions').select('*')
      .eq('actor_id', profile.id).eq('candidate_id', candidate.id).eq('scope_key', scopeKey).maybeSingle();
    if (lookupError) throw new CaptureError('Unable to load application resume history. Apply the application resume migration and retry.', 503);
    if (existing) return documentResponse(existing);
    let result;
    try {
      result = await buildResume(candidate, job);
      result = { ...result, filename:result.filename.replace(/\.docx$/i, '') + '_' + scopeKey.slice(0, 12) + '.docx' };
    } catch (error) {
      throw new CaptureError(error instanceof Error ? error.message : 'Candidate details or job description are incomplete.', 422);
    }
    // Never save a result against a candidate whose ownership, assignment or facts changed during generation.
    const current = await candidateAccess(profile, candidate.id);
    if (current.provenance_status !== 'confirmed' || (current.version || 1) !== candidateVersion ||
        await fingerprint(normalizeCandidate(current)) !== candidateHash) {
      throw new CaptureError('Candidate details changed. Refresh the selected candidate and generate again.', 409);
    }
    const record = {
      actor_id: profile.id, candidate_id: candidate.id, candidate_version: candidateVersion,
      candidate_hash: candidateHash, scope_key: scopeKey,
      job_title: job.jobTitle, company_name: job.companyName, job_url: job.jobUrl,
      job_description: job.jobDescription, result,
    };
    const { data: saved, error: saveError } = await db.from('application_resume_versions')
      .upsert(record, { onConflict: 'actor_id,candidate_id,scope_key', ignoreDuplicates: false }).select('*').single();
    if (saveError || !saved) {
      throw new CaptureError('Unable to save this application resume. Apply the application resume migration if needed, then retry. No saved version was confirmed.', 503);
    }
    return documentResponse(saved);
  });
}

export async function GET(request: Request) {
  return extensionRoute(request, async () => {
    const profile = await actor(request);
    const params = new URL(request.url).searchParams;
    const candidateId = params.get('candidateId');
    if (!z.string().uuid().safeParse(candidateId).success) throw new CaptureError('Select a valid candidate to view resume history.', 400);
    await candidateAccess(profile, candidateId!);
    const resumeId = params.get('resumeId');
    const query = database().from('application_resume_versions').select('*')
      .eq('actor_id', profile.id).eq('candidate_id', candidateId!);
    if (resumeId) {
      if (!z.string().uuid().safeParse(resumeId).success) throw new CaptureError('Invalid resume identifier.', 400);
      const { data, error } = await query.eq('id', resumeId).maybeSingle();
      checkDb(error);
      if (!data) throw new CaptureError('Application resume not found.', 404);
      return documentResponse(data);
    }
    const pagination = z.object({ offset: z.coerce.number().int().min(0), limit: z.coerce.number().int().min(1).max(100) })
      .safeParse({ offset: params.get('offset') || 0, limit: params.get('limit') || 25 });
    if (!pagination.success) throw new CaptureError('Invalid resume history pagination.', 400);
    const { offset, limit } = pagination.data;
    const { data, error } = await query.order('created_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + limit);
    checkDb(error);
    const rows = data || [];
    return {
      success: true, resumes: rows.slice(0, limit).map(row => ({
        resumeId: row.id, candidateId: row.candidate_id, candidateVersion: row.candidate_version,
        jobTitle: row.job_title, companyName: row.company_name, jobUrl: row.job_url,
        createdAt: row.created_at, filename: row.result.filename, matchScore: row.result.matchScore,
      })), nextOffset: rows.length > limit ? offset + limit : null,
    };
  });
}
