import { extensionRoute, extensionProfile, cors } from '@/lib/capture/server';
import { database, checkDb, CaptureError } from '@/lib/db/admin';
import { applicationUrlKey } from '@/lib/jobs/application-state';
import { outsideJobsCache } from '@/lib/cache';
import { z } from 'zod';
import { createHash } from 'node:crypto';

export async function OPTIONS(request: Request) {
  return cors(request, new Response(null, { status: 204 }));
}

const saveExternalJobSchema = z.object({
  title: z.string().trim().min(1).max(200),
  company: z.string().trim().min(1).max(200),
  jobUrl: z.string().url().max(2000),
  applicationUrl: z.string().url().max(2000).optional(),
  location: z.string().max(200).optional().nullable(),
  department: z.string().max(100).optional().nullable(),
  description: z.string().min(10),
  descriptionHtml: z.string().optional().nullable(),
  employmentType: z.string().max(50).optional().nullable(),
  portalSource: z.string().max(100).optional().nullable(),
  compensation: z.unknown().optional(),
  arrangements: z.unknown().optional(),
  externalId: z.string().max(200).optional().nullable(),
  matchScore: z.number().nullable().optional(),
  matchedSkills: z.array(z.string()).optional(),
  missingSkills: z.array(z.string()).optional(),
  extractedSkills: z.array(z.string()).optional(),
  atsAnalysis: z.unknown().optional(),
});

export async function POST(request: Request) {
  return extensionRoute(request, async () => {
    await extensionProfile(request);
    const body = saveExternalJobSchema.parse(await request.json());

    const safeJobUrl = applicationUrlKey(body.jobUrl) || body.jobUrl;
    const safeApplicationUrl = applicationUrlKey(body.applicationUrl || body.jobUrl) || body.applicationUrl || body.jobUrl;
    const portalSource = body.portalSource || (safeJobUrl ? new URL(safeJobUrl).hostname : 'Outside Job');
    const employmentType = ['contract', 'permanent', 'temporary', 'part_time', 'internship', 'unknown'].includes(body.employmentType || '') ? body.employmentType! : 'unknown';
    const contentHash = createHash('sha256').update(body.description).digest('hex');

    // 1. Check if outside job already exists by URL in outside_jobs table
    const { data: existingByUrl, error: urlError } = await database()
      .from('outside_jobs')
      .select('id, title, company, description, match_score')
      .ilike('job_url', safeJobUrl)
      .maybeSingle();
    checkDb(urlError);

    if (existingByUrl) {
      const updatePayload: Record<string, any> = {
        title: body.title,
        company: body.company,
        description: body.description.length > (existingByUrl.description?.length || 0) ? body.description : undefined,
        description_html: body.descriptionHtml || undefined,
        location: body.location || undefined,
        department: body.department || undefined,
        employment_type: body.employmentType || undefined,
        portal_source: portalSource,
        match_score: body.matchScore ?? existingByUrl.match_score,
        matched_skills: body.matchedSkills?.length ? body.matchedSkills : undefined,
        missing_skills: body.missingSkills?.length ? body.missingSkills : undefined,
        extracted_skills: body.extractedSkills?.length ? body.extractedSkills : undefined,
        ats_analysis: body.atsAnalysis || undefined,
        updated_at: new Date().toISOString(),
      };

      await database().from('outside_jobs').update(updatePayload).eq('id', existingByUrl.id);
      const { error: jobUpdateError } = await database().from('jobs').update({ application_url: safeApplicationUrl, updated_at: new Date().toISOString() }).eq('id', existingByUrl.id);
      checkDb(jobUpdateError);
      return { success: true, jobId: existingByUrl.id, updated: true, table: 'outside_jobs' };
    }

    // 2. Check by company and title in outside_jobs
    const { data: existingByName, error: nameError } = await database()
      .from('outside_jobs')
      .select('id, title, company, description')
      .ilike('company', body.company)
      .ilike('title', body.title)
      .maybeSingle();
    checkDb(nameError);

    if (existingByName) {
      await database().from('outside_jobs').update({
        job_url: safeJobUrl,
        portal_source: portalSource,
        description: body.description.length > (existingByName.description?.length || 0) ? body.description : undefined,
        description_html: body.descriptionHtml || undefined,
        location: body.location || undefined,
        department: body.department || undefined,
        employment_type: body.employmentType || undefined,
        match_score: body.matchScore ?? undefined,
        matched_skills: body.matchedSkills?.length ? body.matchedSkills : undefined,
        missing_skills: body.missingSkills?.length ? body.missingSkills : undefined,
        extracted_skills: body.extractedSkills?.length ? body.extractedSkills : undefined,
        ats_analysis: body.atsAnalysis || undefined,
        updated_at: new Date().toISOString(),
      }).eq('id', existingByName.id);

      const { error: jobUpdateError } = await database().from('jobs').update({ source_url: safeJobUrl, application_url: safeApplicationUrl, updated_at: new Date().toISOString() }).eq('id', existingByName.id);
      checkDb(jobUpdateError);

      return { success: true, jobId: existingByName.id, updated: true, table: 'outside_jobs' };
    }

    // 3. Insert newly discovered outside job into dedicated public.outside_jobs table
    const insertPayload: Record<string, any> = {
      title: body.title,
      company: body.company,
      job_url: safeJobUrl,
      portal_source: portalSource,
      location: body.location || null,
      department: body.department || null,
      employment_type: body.employmentType || 'Full-time',
      description: body.description,
      description_html: body.descriptionHtml || null,
      match_score: body.matchScore ?? null,
      matched_skills: body.matchedSkills || [],
      missing_skills: body.missingSkills || [],
      extracted_skills: body.extractedSkills || [],
      ats_analysis: body.atsAnalysis || null,
      status: 'Discovered',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: newOutsideJob, error: insertError } = await database()
      .from('outside_jobs')
      .insert(insertPayload)
      .select('id')
      .single();

    checkDb(insertError);
    if (!newOutsideJob) throw new CaptureError('Failed to save outside job.', 500);

    // Mirror to public.jobs for unified portal visibility
    const { error: mirrorError } = await database().from('jobs').insert({
        id: newOutsideJob.id,
        source_id: null,
        external_id: body.externalId || `ext_${createHash('sha256').update(safeJobUrl).digest('hex').slice(0, 40)}`,
        title: body.title,
        company: body.company,
        source_url: safeJobUrl,
        application_url: safeApplicationUrl,
        description: body.description,
        description_html: body.descriptionHtml || null,
        location: body.location || null,
        department: body.department || null,
        employment_type: employmentType,
        content_hash: contentHash,
        is_external: true,
        portal_source: portalSource,
        state: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    checkDb(mirrorError);

    // Invalidate outside jobs cache to ensure fresh state
    outsideJobsCache.clear();

    return { success: true, jobId: newOutsideJob.id, created: true, table: 'outside_jobs' };
  });
}
