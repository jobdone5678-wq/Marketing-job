import { createHash } from 'node:crypto';
import { z } from 'zod';
import { cors, extensionProfile, extensionRoute } from '@/lib/capture/server';
import { CaptureError, checkDb, database } from '@/lib/db/admin';
import { sanitizeJobHtml } from '@/lib/html-sanitizer';
import { analyzeCandidateFit } from '@/lib/jobs/skills-extractor';
import { applicationUrlKey } from '@/lib/jobs/application-state';
import type { Candidate } from '@/types/database';

export async function OPTIONS(request: Request) {
  return cors(request, new Response(null, { status: 204 }));
}

export async function GET(request: Request) {
  return extensionRoute(request, async () => {
    await extensionProfile(request);
    return { portalCaptures: true };
  });
}

const webUrl = z
  .url({ protocol: /^https?$/ })
  .max(2000)
  .refine((value) => {
    const url = new URL(value);
    return !url.username && !url.password;
  });
const shortText = (length: number) => z.string().trim().max(length).nullish();
const captureSchema = z.object({
  title: z.string().trim().min(1).max(200),
  company: z.string().trim().min(1).max(200),
  jobUrl: webUrl,
  applicationUrl: webUrl.nullish(),
  location: shortText(200),
  department: shortText(100),
  description: z.string().trim().min(10).max(60_000),
  descriptionHtml: shortText(120_000),
  employmentType: shortText(100),
  portalSource: shortText(100),
  compensation: z.union([z.string().max(500), z.record(z.string(), z.unknown())]).nullish(),
  arrangements: z.union([z.string().max(100), z.array(z.string().max(100)).max(20)]).nullish(),
  externalId: shortText(200),
  postedAt: shortText(50),
  closesAt: shortText(50),
  matchSource: z.literal('resume').optional(),
  matchScore: z.number().int().min(0).max(100).nullish(),
  matchedSkills: z.array(z.string().max(200)).max(200).optional(),
  missingSkills: z.array(z.string().max(200)).max(200).optional(),
  extractedSkills: z.array(z.string().max(200)).max(200).optional(),
  candidateId: z.string().uuid().nullish(),
});

function cleanUrl(value: string) {
  const url = new URL(value);
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    const tracking = /^(utm_|ref$|source$|fbclid$|gclid$|trk$|trackingId$)/i.test(key);
    const personal =
      /^(?:candidate[_-]?id|applicant[_-]?id|email|auth|authorization|code|session[_-]?id|access[_-]?token|refresh[_-]?token|auth[_-]?token)$/i.test(
        key
      );
    const genericToken =
      key.toLowerCase() === 'token' && !/(^|\.)greenhouse\.io$/.test(url.hostname);
    if (tracking || personal || genericToken) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString();
}

function dateValue(value: string | null | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value) && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : null;
}

export async function POST(request: Request) {
  return extensionRoute(request, async () => {
    const profile = await extensionProfile(request);
    if (Number(request.headers.get('content-length') || 0) > 1024 * 1024) {
      throw new CaptureError('The captured job exceeds the size limit.', 413);
    }
    const raw = await request.text();
    if (raw.length > 1024 * 1024)
      throw new CaptureError('The captured job exceeds the size limit.', 413);
    const body = captureSchema.parse(JSON.parse(raw));
    const url = new URL(body.jobUrl);
    const jobUrl = applicationUrlKey(body.jobUrl) || cleanUrl(body.jobUrl);
    const applicationUrl = body.applicationUrl ? cleanUrl(body.applicationUrl) : null;
    const capturedAt = new Date().toISOString();
    const details = {
      title: body.title,
      company: body.company,
      job_url: jobUrl,
      application_url: applicationUrl,
      external_id: body.externalId || null,
      portal_source: body.portalSource || url.hostname,
      location: body.location || null,
      department: body.department || null,
      employment_type: body.employmentType || null,
      description: body.description,
      description_html: sanitizeJobHtml(body.descriptionHtml) || null,
      compensation: body.compensation ?? null,
      arrangements: body.arrangements ?? null,
      posted_at: dateValue(body.postedAt),
      closes_at: dateValue(body.closesAt),
      content_hash: createHash('sha256').update(body.description).digest('hex'),
    };

    const db = database();
    const candidateQuery = db
      .from('candidates')
      .select(
        'id, full_name, primary_skills, secondary_skills, current_job_title, highest_qualification, confirmed_facts, authorized_in_usa, open_to_relocation, preferred_locations, total_experience_years'
      )
      .eq('user_id', profile.id);
    if (body.candidateId) candidateQuery.eq('id', body.candidateId);
    const { data: candidate, error: candidateError } = await candidateQuery
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    checkDb(candidateError);
    if (body.candidateId && !candidate) throw new CaptureError('Candidate profile not found.', 404);
    const hasEvidence =
      candidate &&
      [
        candidate.primary_skills,
        candidate.secondary_skills,
        candidate.current_job_title,
        candidate.highest_qualification,
        ...Object.values(candidate.confirmed_facts || {}),
      ].some((value) => typeof value === 'string' && value.trim());
    const fit =
      !body.matchSource && hasEvidence
        ? analyzeCandidateFit(candidate as Candidate, details.description, details.title)
        : null;
    const match =
      body.matchSource === 'resume'
        ? body.matchScore == null
          ? null
          : {
              score: body.matchScore,
              matched: body.matchedSkills ?? [],
              missing: body.missingSkills ?? [],
            }
        : fit && (fit.matchedSkills.length || fit.missingSkills.length || fit.requirements.length)
          ? {
              score: fit.matchScore,
              matched: fit.matchedSkills.map((skill) => skill.skill),
              missing: fit.missingSkills,
            }
          : null;

    const portalJobPath = /^\/(?:dashboard\/jobs|jobs\/info)\/([^/]+)\/?$/;
    const isPortal =
      /(^|\.)(nextkinhr\.com|jobright-internal\.com)$/.test(url.hostname) ||
      (['localhost', '127.0.0.1'].includes(url.hostname) && portalJobPath.test(url.pathname));
    if (isPortal) {
      const id = url.pathname.match(portalJobPath)?.[1];
      if (!z.uuid().safeParse(id).success)
        throw new CaptureError('Open a NextKinHR job detail page.', 400);
      const { data: job, error: jobError } = await db
        .from('jobs')
        .select('id')
        .eq('id', id)
        .maybeSingle();
      checkDb(jobError);
      if (!job) throw new CaptureError('Portal job not found.', 404);
      const { error } = await db.from('portal_job_captures').upsert(
        {
          owner_id: profile.id,
          job_id: job.id,
          details: { ...details, match },
          captured_at: capturedAt,
        },
        { onConflict: 'owner_id,job_id' }
      );
      checkDb(error);
      return { success: true, jobId: job.id, table: 'portal_job_captures', match };
    }

    const metadata = {
      ...details,
      match_score: match?.score ?? null,
      matched_skills: match?.matched ?? [],
      missing_skills: match?.missing ?? [],
      extracted_skills: body.extractedSkills ?? (match ? [...match.matched, ...match.missing] : []),
      updated_at: capturedAt,
    };
    // Autofill saves posting details. Confirmation owns the applied status and date.
    const { data: inserted, error: insertError } = await db
      .from('outside_jobs')
      .upsert(
        {
          ...metadata,
          capture_owner_id: profile.id,
          candidate_id: candidate?.id || null,
          status: 'Discovered',
          applied_at: null,
        },
        { onConflict: 'capture_owner_id,job_url', ignoreDuplicates: true }
      )
      .select('id')
      .maybeSingle();
    checkDb(insertError);
    let job = inserted;
    if (!job) {
      const { data: existing, error: updateError } = await db
        .from('outside_jobs')
        .update(metadata)
        .eq('capture_owner_id', profile.id)
        .eq('job_url', jobUrl)
        .select('id')
        .single();
      checkDb(updateError);
      job = existing;
    }
    if (!job) throw new CaptureError('Failed to save outside job.', 500);
    return { success: true, jobId: job.id, table: 'outside_jobs', match };
  });
}
