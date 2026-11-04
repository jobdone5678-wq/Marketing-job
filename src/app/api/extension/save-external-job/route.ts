import { extensionRoute, extensionProfile, cors } from '@/lib/capture/server';
import { database, checkDb, CaptureError } from '@/lib/db/admin';
import { applicationUrlKey } from '@/lib/jobs/application-state';
import { z } from 'zod';
import crypto from 'node:crypto';

export async function OPTIONS(request: Request) {
  return cors(request, new Response(null, { status: 204 }));
}

const saveExternalJobSchema = z.object({
  title: z.string().trim().min(1).max(200),
  company: z.string().trim().min(1).max(200),
  jobUrl: z.string().url().max(2000),
  location: z.string().max(200).optional().nullable(),
  department: z.string().max(100).optional().nullable(),
  description: z.string().min(10),
  descriptionHtml: z.string().optional().nullable(),
  employmentType: z.string().max(50).optional().nullable(),
  portalSource: z.string().max(100).optional().nullable(),
  compensation: z.unknown().optional(),
  arrangements: z.unknown().optional(),
  externalId: z.string().max(200).optional().nullable(),
});

export async function POST(request: Request) {
  return extensionRoute(request, async () => {
    await extensionProfile(request);
    const body = saveExternalJobSchema.parse(await request.json());

    const safeJobUrl = applicationUrlKey(body.jobUrl) || body.jobUrl;
    const v_emp_type = ['contract', 'permanent', 'temporary', 'part_time', 'internship', 'unknown'].includes(body.employmentType || '')
      ? body.employmentType!
      : 'unknown';
    const contentHash = crypto.createHash('md5').update(body.description || body.title + body.company).digest('hex');
    const externalId = body.externalId || 'ext_' + crypto.createHash('md5').update(safeJobUrl || body.company + body.title).digest('hex');

    // 1. Check if job already exists by URL
    const { data: existingJobByUrl, error: urlError } = await database()
      .from('jobs')
      .select('id, title, company, description, is_external')
      .ilike('application_url', safeJobUrl)
      .maybeSingle();
    checkDb(urlError);

    if (existingJobByUrl) {
      // Update with fresher details if needed
      await database().from('jobs').update({
        title: body.title,
        company: body.company,
        description: body.description.length > (existingJobByUrl.description?.length || 0) ? body.description : undefined,
        description_html: body.descriptionHtml || undefined,
        location: body.location || undefined,
        department: body.department || undefined,
        last_seen_at: new Date().toISOString(),
        is_external: true,
        portal_source: body.portalSource || 'Outside Job',
      }).eq('id', existingJobByUrl.id);

      return { success: true, jobId: existingJobByUrl.id, updated: true };
    }

    // 2. Check by company and title
    const { data: existingJobByName, error: nameError } = await database()
      .from('jobs')
      .select('id, title, company, description')
      .ilike('company', body.company)
      .ilike('title', body.title)
      .maybeSingle();
    checkDb(nameError);

    if (existingJobByName) {
      await database().from('jobs').update({
        application_url: safeJobUrl,
        description: body.description.length > (existingJobByName.description?.length || 0) ? body.description : undefined,
        description_html: body.descriptionHtml || undefined,
        location: body.location || undefined,
        last_seen_at: new Date().toISOString(),
      }).eq('id', existingJobByName.id);

      return { success: true, jobId: existingJobByName.id, updated: true };
    }

    // 3. Insert newly discovered outside job into public.jobs exactly like portal jobs
    const { data: newJob, error: insertError } = await database().from('jobs').insert({
      source_id: null,
      external_id: externalId,
      title: body.title,
      company: body.company,
      source_url: safeJobUrl,
      application_url: safeJobUrl,
      location: body.location || null,
      department: body.department || null,
      description: body.description,
      description_html: body.descriptionHtml || '',
      employment_type: v_emp_type,
      compensation: body.compensation ?? null,
      arrangements: body.arrangements ?? null,
      content_hash: contentHash,
      is_external: true,
      portal_source: body.portalSource || 'Outside Job',
      state: 'active',
    }).select('id').single();

    checkDb(insertError);
    if (!newJob) throw new CaptureError('Failed to save external job.', 500);

    return { success: true, jobId: newJob.id, created: true };
  });
}
