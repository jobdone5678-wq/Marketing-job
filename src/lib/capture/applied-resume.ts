import { z } from 'zod';
import { createHash } from 'node:crypto';
import { database, checkDb, CaptureError } from '@/lib/db/admin';
import type { AppliedResumeSnapshot } from '@/types/database';

export const appliedResumeSchema = z.preprocess(
  (val: any) => {
    if (val && typeof val === 'object') {
      return {
        ...val,
        filename: val.filename || val.name || 'Resume.pdf',
        mimeType: val.mimeType || val.mime_type || 'application/pdf',
      };
    }
    return val;
  },
  z
    .object({
      filename: z.string().min(1).max(255),
      mimeType: z.string().min(1).max(255),
      base64: z.string().max(14_000_000).optional().nullable(),
      markdown: z.string().max(100000).optional().nullable(),
      isTailored: z.boolean().default(false),
      matchScore: z.number().min(0).max(100).optional().nullable(),
      appliedAt: z.string().optional().nullable(),
      resumeId: z.string().uuid().optional().nullable(),
    })
    .optional()
    .nullable()
);

// Call only after the authenticated observation/submission RPC has checked access.
export function appliedResumeArchivePath(candidateId: string, submissionId: string, hash: string) {
  return `applied/${candidateId}/${submissionId}/${hash}`;
}

export async function saveAppliedResume(
  submissionId: string,
  candidateId: string,
  resume: z.infer<typeof appliedResumeSchema>
) {
  if (!resume) return null;
  const db = database();
  const { base64, ...metadata } = resume;
  const snapshot: AppliedResumeSnapshot = metadata;
  if (base64) {
    const bytes = Buffer.from(base64, 'base64');
    if (!bytes.length || bytes.length > 10 * 1024 * 1024)
      throw new CaptureError('Invalid applied resume file.', 422);
    const hash = createHash('sha256').update(bytes).digest('hex');
    snapshot.mimeType = /\.docx$/i.test(snapshot.filename)
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : 'application/pdf';
    const { error: uploadError } = await db.storage
      .from('candidate-resumes')
      .upload(appliedResumeArchivePath(candidateId, submissionId, hash), bytes, {
        contentType: snapshot.mimeType,
        upsert: true,
      });
    checkDb(uploadError);
    snapshot.archiveHash = hash;
  }
  const { data, error } = await db
    .from('job_submissions')
    .update({ applied_resume: snapshot })
    .eq('id', submissionId)
    .eq('candidate_id', candidateId)
    .select('id')
    .maybeSingle();
  checkDb(error);
  if (!data) throw new CaptureError('Applied resume could not be saved to this application.', 404);
  return snapshot;
}
