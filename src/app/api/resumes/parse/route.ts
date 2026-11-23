import { parseResumeFile } from '@/lib/profile/resume-parser';
import { MAX_RESUME_BYTES, ResumeReadError } from '@/lib/resumes/validation';
import { protectedRoute } from '@/lib/http/protected-route';
import { checkRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 60;

const maxRequestBytes = MAX_RESUME_BYTES + 256 * 1024;
const oversized = () =>
  Response.json({ success: false, error: 'Resume must be at most 10 MiB.' }, { status: 413 });

export async function POST(request: Request) {
  return protectedRoute(request, async (profile) => {
    const contentType = request.headers.get('content-type') || '';
    if (!request.body || !/^multipart\/form-data(?:;|$)/i.test(contentType)) {
      return Response.json({ success: false, error: 'Multipart form data is required.' }, { status: 400 });
    }
    const length = request.headers.get('content-length');
    if (length && /^\d+$/.test(length) && Number(length) > maxRequestBytes) return oversized();
    const rate = checkRateLimit(`resume-parse:${profile.id}`, { windowMs: 60_000, max: 10 });
    if (!rate.allowed) {
      return Response.json(
        { success: false, error: 'Too many resume uploads. Please try again shortly.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rate.resetInMs / 1000)) } }
      );
    }

    const reader = request.body.getReader();
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxRequestBytes) {
          await reader.cancel().catch(() => {});
          return oversized();
        }
        chunks.push(new Uint8Array(value));
      }
    } catch {
      return Response.json({ success: false, error: 'Could not read the upload.' }, { status: 400 });
    } finally {
      reader.releaseLock();
    }

    const formData = await new Response(new Blob(chunks), {
      headers: { 'Content-Type': contentType },
    }).formData().catch(() => null);
    if (!formData) {
      return Response.json({ success: false, error: 'Invalid multipart upload.' }, { status: 400 });
    }
    const file = formData.get('resume') || formData.get('file');
    if (!(file instanceof File)) {
      return Response.json(
        { success: false, error: 'Please attach a valid PDF or DOCX resume file.' },
        { status: 400 }
      );
    }
    if (file.size > MAX_RESUME_BYTES) return oversized();
    try {
      const result = await parseResumeFile(Buffer.from(await file.arrayBuffer()), file.name, file.size);
      return Response.json({ success: true, profile: result.profile, rawText: result.rawText });
    } catch (error) {
      const message = error instanceof ResumeReadError ? error.message : 'Failed to parse resume.';
      return Response.json({ success: false, error: message }, { status: 422 });
    }
  });
}
