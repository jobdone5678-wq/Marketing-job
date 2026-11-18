import { protectedRoute } from '@/lib/http/protected-route';
import { candidateAccess } from '@/lib/resumes/repository';
import { resumeUploadForm, uploadResume } from '@/lib/resumes/upload';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  return protectedRoute(request, async (profile) => {
    const form = await resumeUploadForm(request);
    const candidateId = String(form.get('candidateId') || '');
    const candidate = candidateId ? await candidateAccess(profile, candidateId) : null;
    return uploadResume(profile.id, form.get('resume'), candidate);
  });
}
