import { z } from 'zod';
import { cors, extensionProfile, extensionRoute } from '@/lib/capture/server';
import { CaptureError, checkDb, database } from '@/lib/db/admin';
import { downloadExtensionDocument, extensionDocumentAccess } from '@/lib/resumes/extension-documents';
import { compareResumeToJob } from '@/lib/resumes/job-match';
import { readResume, ResumeReadError } from '@/lib/resumes/validation';

export const runtime = 'nodejs';
export const maxDuration = 60;

const jobDescriptionSchema = z.string().trim().min(30).max(60_000);
const inputSchema = z.union([
  z.object({ documentId: z.uuid(), jobDescription: jobDescriptionSchema }).strict(),
  z.object({ candidateId: z.uuid(), jobDescription: jobDescriptionSchema }).strict(),
]);

async function readLegacyDocument(candidateId: string, ownerId: string) {
  const { data, error } = await database().from('candidates').select('resume_url, full_name')
    .eq('id', candidateId).eq('user_id', ownerId).maybeSingle();
  checkDb(error);
  const document = data?.resume_url?.match(/^data:(application\/pdf|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document);base64,([A-Za-z0-9+/=]+)$/i);
  if (!document) throw new CaptureError('No uploaded resume file is available for comparison.', 404);
  const extension = document[1].toLowerCase() === 'application/pdf' ? 'pdf' : 'docx';
  const filename = (data?.full_name || 'Candidate').replace(/[^a-zA-Z0-9]/g, '_') + '_Resume.' + extension;
  return { filename, bytes: Buffer.from(document[2], 'base64') };
}

export async function OPTIONS(request: Request) {
  return cors(request, new Response(null, { status: 204 }));
}

export async function POST(request: Request) {
  const response = await extensionRoute(request, async () => {
    const profile = await extensionProfile(request);
    if (Number(request.headers.get('content-length')) > 250_000) throw new CaptureError('Job description is too large.', 413);
    const body = await request.text();
    if (body.length > 250_000) throw new CaptureError('Job description is too large.', 413);
    const input = inputSchema.parse(JSON.parse(body));
    const { filename, bytes } = 'documentId' in input
      ? await downloadExtensionDocument(input.documentId, await extensionDocumentAccess(profile.id))
      : await readLegacyDocument(input.candidateId, profile.id);
    try {
      const resume = await readResume(bytes, filename);
      if (!/[\p{L}\p{N}]/u.test(resume.text)) {
        throw new CaptureError('This resume has no readable text. Choose a text-based PDF or DOCX.', 422);
      }
      return { filename, ...compareResumeToJob(resume.text, input.jobDescription) };
    } catch (error) {
      if (error instanceof ResumeReadError) throw new CaptureError(error.message, 422);
      throw error;
    }
  });
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
