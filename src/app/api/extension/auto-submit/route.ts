import { extensionRoute, extensionActor, cors } from '@/lib/capture/server';
import { database, checkDb, CaptureError } from '@/lib/db/admin';
import { z } from 'zod';

export async function OPTIONS(request: Request) {
  return cors(request, new Response(null, { status: 204 }));
}

const autoSubmitSchema = z.object({
  candidateId: z.string().uuid(),
  companyName: z.string().min(1).max(200),
  jobTitle: z.string().min(1).max(200),
  jobUrl: z.string().url().max(2000).optional().nullable(),
  portalSource: z.string().max(100).optional().nullable(),
  jobLocation: z.string().max(200).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  evidence: z.string().max(1000).optional().nullable(),
});

export async function POST(request: Request) {
  return extensionRoute(request, async () => {
    const actorId = await extensionActor(request);
    const body = autoSubmitSchema.parse(await request.json());

    // Verify candidate exists
    const { data: candidate, error: cErr } = await database()
      .from('candidates')
      .select('id, full_name')
      .eq('id', body.candidateId)
      .maybeSingle();
    checkDb(cErr);
    if (!candidate) throw new CaptureError('Selected candidate not found.', 404);

    // Check for recent duplicate (same candidate and same company within 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    const { data: recentSubmissions, error: sErr } = await database()
      .from('job_submissions')
      .select('id, submission_date, company_name, job_title')
      .eq('candidate_id', body.candidateId)
      .ilike('company_name', body.companyName.trim())
      .gte('submission_date', thirtyDaysAgo);
    checkDb(sErr);

    const isDuplicate = Boolean(recentSubmissions && recentSubmissions.length > 0);

    // Insert new submission record
    const today = new Date().toISOString().split('T')[0];
    const { data: submission, error: insErr } = await database()
      .from('job_submissions')
      .insert({
        candidate_id: body.candidateId,
        recruiter_id: actorId,
        company_name: body.companyName.trim(),
        job_title: body.jobTitle.trim(),
        job_url: body.jobUrl || null,
        portal_source: body.portalSource || 'Browser Extension',
        job_location: body.jobLocation || null,
        status: 'Applied',
        capture_status: 'submitted',
        duplicate_flag: isDuplicate,
        submission_date: today,
        notes: body.notes || (body.evidence ? `Auto-captured via extension: ${body.evidence}` : 'Auto-captured via browser extension'),
      })
      .select('*')
      .single();
    checkDb(insErr);

    return {
      success: true,
      submission,
      isDuplicate,
      candidateName: candidate.full_name,
    };
  });
}
