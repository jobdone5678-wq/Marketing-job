import { parseResumeFile } from '@/lib/profile/resume-parser';
import { ResumeReadError } from '@/lib/resumes/validation';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const formData = await request.formData().catch(() => null);
    if (!formData) {
      return Response.json({ success: false, error: 'Multipart form data is required.' }, { status: 400 });
    }

    const file = formData.get('resume') || formData.get('file');
    if (!file || !(file instanceof File)) {
      return Response.json(
        { success: false, error: 'Please attach a valid PDF or DOCX resume file.' },
        { status: 400 }
      );
    }

    if (file.size > 15 * 1024 * 1024) {
      return Response.json(
        { success: false, error: 'File size must be 15 MB or less.' },
        { status: 413 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await parseResumeFile(buffer, file.name, file.size);

    return Response.json({
      success: true,
      profile: result.profile,
      rawText: result.rawText,
    });
  } catch (error: any) {
    console.error('[API /api/resumes/parse Error]:', error);
    const msg = error instanceof ResumeReadError
      ? error.message
      : error?.message || 'Failed to parse resume.';
    return Response.json({ success: false, error: msg }, { status: 422 });
  }
}
