import { protectedRoute } from '@/lib/http/protected-route';
import { database, checkDb, CaptureError } from '@/lib/db/admin';
import { candidateAccess } from '@/lib/resumes/repository';
import { appliedResumeArchivePath } from '@/lib/capture/applied-resume';
import type { AppliedResumeSnapshot } from '@/types/database';
import { z } from 'zod';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return protectedRoute(request, async (profile) => {
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

    const applied: AppliedResumeSnapshot | null =
      submission.applied_resume as AppliedResumeSnapshot | null;

    if (!applied) {
      throw new CaptureError('No applied resume is available for this submission.', 404);
    }

    const url = new URL(request.url);
    const wantsDownload = url.searchParams.get('download') === '1';

    if (wantsDownload) {
      let bytes = applied.base64 ? new Uint8Array(Buffer.from(applied.base64, 'base64')) : null;
      if (applied.archiveHash && /^[a-f0-9]{64}$/.test(applied.archiveHash)) {
        const { data: file, error: downloadError } = await db.storage
          .from('candidate-resumes')
          .download(appliedResumeArchivePath(submission.candidate_id, id, applied.archiveHash));
        checkDb(downloadError);
        if (file) bytes = new Uint8Array(await file.arrayBuffer());
      }
      if (!bytes)
        throw new CaptureError(
          'Original applied resume bytes were not recorded. The saved text remains available in the preview.',
          404
        );
      const mimeType = applied.mimeType || 'application/octet-stream';
      const filename = applied.filename || 'applied-resume.docx';

      const encodedFilename = encodeURIComponent(filename);
      return new Response(bytes, {
        status: 200,
        headers: {
          'Content-Type': mimeType,
          'Content-Disposition': `attachment; filename="applied-resume"; filename*=UTF-8''${encodedFilename}`,
          'Content-Length': String(bytes.byteLength),
          'X-Content-Type-Options': 'nosniff',
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
