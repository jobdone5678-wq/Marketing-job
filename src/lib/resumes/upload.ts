import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { database, checkDb, CaptureError } from '@/lib/db/admin';
import { hasPdfHeader } from './validation';

type UploadCandidate = { id: string; version?: number | null };

export async function resumeUploadForm(request: Request) {
  if (Number(request.headers.get('content-length') || 0) > 11 * 1024 * 1024) {
    throw new CaptureError('Resume must be at most 10 MiB.', 413);
  }
  const form = await request.formData().catch(() => {
    throw new CaptureError('Upload a PDF or DOCX as a form attachment.');
  });
  if (form.get('consent') !== 'true') {
    throw new CaptureError('Confirm your consent to resume processing.');
  }
  return form;
}

export async function uploadResume(ownerId: string, file: FormDataEntryValue | null, candidate: UploadCandidate | null) {
  if (!(file instanceof File) || !file.size || file.size > 10 * 1024 * 1024) {
    throw new CaptureError('Upload a PDF or DOCX of at most 10 MiB.');
  }
  const filename = file.name.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(-160);
  const raw = Buffer.from(await file.arrayBuffer());
  const pdf = /\.pdf$/i.test(filename) && hasPdfHeader(raw);
  const docx = /\.docx$/i.test(filename) && raw.subarray(0, 4).toString('hex') === '504b0304';
  if (!pdf && !docx) throw new CaptureError('Upload a valid PDF or DOCX.');

  const documentId = randomUUID();
  const path = `${ownerId}/${documentId}/${filename}`;
  const db = database();
  const { error: uploadError } = await db.storage.from('candidate-resumes').upload(path, raw, {
    contentType: pdf ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    upsert: false,
  });
  if (uploadError) throw new CaptureError('Private resume upload failed. Check storage setup and retry.', 503);

  try {
    const { data: taskId, error } = await db.rpc('register_resume', {
      p_actor: ownerId,
      p_document: documentId,
      p_candidate: candidate?.id ?? null,
      p_expected: candidate?.version ?? null,
      p_path: path,
      p_filename: filename,
      p_hash: createHash('sha256').update(raw).digest('hex'),
    });
    checkDb(error);
    return { documentId, taskId };
  } catch (error) {
    await db.storage.from('candidate-resumes').remove([path]);
    throw error;
  }
}
