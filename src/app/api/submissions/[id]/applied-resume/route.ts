import { protectedRoute } from '@/lib/http/protected-route';
import { database, checkDb, CaptureError } from '@/lib/db/admin';
import { candidateAccess } from '@/lib/resumes/repository';
import { resumeDocx } from '@/lib/tailored-resumes/docx';
import type { AppliedResumeSnapshot, Candidate } from '@/types/database';
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

    let applied: AppliedResumeSnapshot | null = submission.applied_resume as AppliedResumeSnapshot | null;

    // Fallback if applied_resume was not recorded at submission time
    if (!applied || (!applied.base64 && !applied.markdown)) {
      // 1. Check if an application resume version exists
      const { data: tailored } = await db
        .from('application_resume_versions')
        .select('id, result, created_at')
        .eq('candidate_id', submission.candidate_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (tailored?.result) {
        let base64 = null;
        try {
          if (tailored.result.markdown) {
            base64 = Buffer.from(resumeDocx(tailored.result.markdown)).toString('base64');
          }
        } catch {}
        applied = {
          filename: tailored.result.filename || 'Tailored_Resume.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          base64,
          markdown: tailored.result.markdown || null,
          isTailored: true,
          matchScore: tailored.result.matchScore ?? null,
          appliedAt: tailored.created_at || new Date().toISOString(),
          resumeId: tailored.id,
        };
      } else {
        // 2. Check candidate confirmed document
        const { data: docs } = await db
          .from('candidate_documents')
          .select('id, filename, object_path')
          .eq('candidate_id', submission.candidate_id)
          .eq('status', 'confirmed')
          .order('created_at', { ascending: false })
          .limit(1);
        const doc = docs?.[0];
        if (doc?.object_path) {
          try {
            const { data: download } = await db.storage.from('candidate-resumes').download(doc.object_path);
            if (download) {
              const buffer = Buffer.from(await download.arrayBuffer());
              applied = {
                filename: doc.filename,
                mimeType: doc.filename.endsWith('.docx')
                  ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                  : 'application/pdf',
                base64: buffer.toString('base64'),
                isTailored: false,
                appliedAt: new Date().toISOString(),
              };
            }
          } catch {}
        }
      }
    }

    if (!applied) {
      throw new CaptureError('No applied resume is available for this submission.', 404);
    }

    const url = new URL(request.url);
    const wantsDownload = url.searchParams.get('download') === '1';

    if (wantsDownload) {
      let fileBuffer: Buffer | null = null;
      let mimeType = applied.mimeType || 'application/octet-stream';
      let filename = applied.filename || 'applied-resume.docx';

      if (applied.base64) {
        fileBuffer = Buffer.from(applied.base64, 'base64');
      } else if (applied.markdown) {
        try {
          fileBuffer = Buffer.from(resumeDocx(applied.markdown));
          mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
          if (!filename.endsWith('.docx')) filename += '.docx';
        } catch {
          fileBuffer = Buffer.from(applied.markdown, 'utf-8');
          mimeType = 'text/markdown; charset=utf-8';
          if (!filename.endsWith('.md')) filename += '.md';
        }
      }

      if (!fileBuffer) {
        throw new CaptureError('Could not prepare the resume file for download.', 500);
      }

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
