import 'server-only';
import { CaptureError, checkDb, database } from '@/lib/db/admin';

const availableStatuses = ['queued', 'processing', 'review', 'confirmed'];

export async function extensionDocumentAccess(ownerId: string) {
  const { data: candidates, error } = await database()
    .from('candidates')
    .select('id')
    .or(`user_id.eq.${ownerId},created_by.eq.${ownerId}`);
  checkDb(error);
  const ids = (candidates || []).map((candidate) => candidate.id);
  const unlinked = `and(owner_id.eq.${ownerId},candidate_id.is.null)`;
  return ids.length ? `${unlinked},candidate_id.in.(${ids.join(',')})` : unlinked;
}

export async function downloadExtensionDocument(documentId: string, documentAccess: string) {
  const db = database();
  const { data: document, error } = await db
    .from('candidate_documents')
    .select('filename, object_path')
    .eq('id', documentId)
    .or(documentAccess)
    .in('status', availableStatuses)
    .maybeSingle();
  checkDb(error);
  if (!document) throw new CaptureError('Resume file is no longer available.', 404);
  const { data: file, error: downloadError } = await db.storage
    .from('candidate-resumes')
    .download(document.object_path);
  if (downloadError || !file) throw new CaptureError('Private resume download failed.', 502);
  return { filename: document.filename as string, bytes: Buffer.from(await file.arrayBuffer()) };
}
