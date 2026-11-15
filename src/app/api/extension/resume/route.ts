import { cors, extensionProfile, extensionRoute } from '@/lib/capture/server';
import { database, checkDb, CaptureError } from '@/lib/db/admin';
import { resumeUploadForm, uploadResume } from '@/lib/resumes/upload';
import { downloadExtensionDocument, extensionDocumentAccess } from '@/lib/resumes/extension-documents';
import { z } from 'zod';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function OPTIONS(request: Request) {
  return cors(request, new Response(null, { status: 204 }));
}

export async function GET(request: Request) {
  const response = await extensionRoute(request, async () => {
    const profile = await extensionProfile(request);
    const db = database();
    const documentAccess = await extensionDocumentAccess(profile.id);
    const documentId = new URL(request.url).searchParams.get('documentId');
    if (documentId) {
      z.uuid().parse(documentId);
      const { filename, bytes } = await downloadExtensionDocument(documentId, documentAccess);
      return {
        filename,
        mimeType: /\.docx$/i.test(filename)
          ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : 'application/pdf',
        base64: bytes.toString('base64'),
      };
    }

    const { data: documents, error } = await db.from('candidate_documents')
      .select('id, candidate_id, filename, status')
      .or(documentAccess)
      .neq('status', 'deleted')
      .order('created_at', { ascending: false })
      .order('id')
      .limit(30);
    checkDb(error);
    return { documents: documents || [] };
  });
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export async function POST(request: Request) {
  return extensionRoute(request, async () => {
    const profile = await extensionProfile(request);
    const form = await resumeUploadForm(request);
    const candidateId = form.get('candidateId');
    let candidate = null;
    if (candidateId) {
      const { data, error } = await database().from('candidates')
        .select('id, version')
        .eq('id', z.uuid().parse(candidateId))
        .eq('user_id', profile.id)
        .maybeSingle();
      checkDb(error);
      if (!data) throw new CaptureError('Candidate profile not found.', 404);
      candidate = data;
    }
    return uploadResume(profile.id, form.get('resume'), candidate);
  });
}
