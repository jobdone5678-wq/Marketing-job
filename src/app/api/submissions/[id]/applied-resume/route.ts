import { protectedRoute } from '@/lib/http/protected-route';
import { database, checkDb, CaptureError } from '@/lib/db/admin';
import { candidateAccess } from '@/lib/resumes/repository';
import type { AppliedResumeSnapshot } from '@/types/database';
import { z } from 'zod';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return protectedRoute(request, 'candidate_or_staff', async profile => {
    const id = z.uuid().parse((await context.params).id);
    const db = database();
    const { data: submission, error } = await db
      .from('job_submissions')
      .select('id, candidate_id, company_name, job_title, applied_resume')
      .eq('id', id)
      .maybeSingle();
    checkDb(error);
    if (!submission) throw new CaptureError('Submission not found.', 404);

    await candidateAccess(profile, submission.candidate_id);

    const applied: AppliedResumeSnapshot | null = submission.applied_resume as AppliedResumeSnapshot | null;

    if (!applied) {
      throw new CaptureError('No applied resume is available for this submission.', 404);
    }

    const url = new URL(request.url);
    const wantsDownload = url.searchParams.get('download') === '1';

    if (wantsDownload) {
      if (!applied.base64) throw new CaptureError('Original applied resume bytes were not recorded. The saved text remains available in the preview.', 404);
      const fileBuffer = Buffer.from(applied.base64, 'base64');
      const mimeType = applied.mimeType || 'application/octet-stream';
      const filename = applied.filename || 'applied-resume.docx';

      const encodedFilename = encodeURIComponent(filename);
      return new Response(new Uint8Array(fileBuffer), {
        status: 200,
        headers: {
          'Content-Type': mimeType,
          'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`,
          'Content-Length': String(fileBuffer.byteLength),
          'Cache-Control': 'private, no-cache',
        },
      });
    }

    return {
      success: true,
      submissionId: id,
      appliedResume: applied,
    };
  });
}
