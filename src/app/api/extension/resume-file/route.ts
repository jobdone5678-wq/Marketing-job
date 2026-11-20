import { extensionRoute, extensionProfile, cors } from '@/lib/capture/server';
import { database, checkDb, CaptureError } from '@/lib/db/admin';
import { z } from 'zod';
import type { Candidate } from '@/types/database';

export async function OPTIONS(request: Request) {
  return cors(request, new Response(null, { status: 204 }));
}

export async function GET(request: Request) {
  const response = await extensionRoute(request, async () => {
    const profile = await extensionProfile(request);
    const params = new URL(request.url).searchParams;
    const candidateId = params.get('candidateId');
    if (!candidateId) throw new CaptureError('candidateId is required', 400);
    z.uuid().parse(candidateId);

    const db = database();
    // 1. Verify candidate exists & fetch complete profile details
    const { data: candidateData, error: cErr } = await db
      .from('candidates')
      .select('*')
      .eq('id', candidateId)
      .eq('user_id', profile.id)
      .maybeSingle();
    checkDb(cErr);
    if (!candidateData) throw new CaptureError('Candidate not found', 404);

    const candidate = candidateData as Candidate;
    const confirmed = (candidate.confirmed_facts || {}) as Record<string, any>;

    // 2. The resume document uploaded in the dashboard. A confirmed document is
    //    preferred, but a document the candidate uploaded and has not confirmed
    //    yet is still their resume and must not force a second upload in the
    //    extension. Documents the account uploaded are included even before they
    //    are linked to a profile.
    const { data: linked, error: linkedError } = await db
      .from('candidate_documents')
      .select('id, filename, object_path, content_hash, status, created_at')
      .eq('candidate_id', candidateId)
      .in('status', ['confirmed', 'review'])
      .order('created_at', { ascending: false })
      .limit(5);
    checkDb(linkedError);

    const { data: owned, error: ownedError } = await db
      .from('candidate_documents')
      .select('id, filename, object_path, content_hash, status, created_at')
      .eq('owner_id', profile.id)
      .is('candidate_id', null)
      .in('status', ['confirmed', 'review'])
      .order('created_at', { ascending: false })
      .limit(5);
    checkDb(ownedError);

    const documents = [...(linked || []), ...(owned || [])].sort((a, b) => {
      const rank = (row: { status: string }) => (row.status === 'confirmed' ? 0 : 1);
      return (
        rank(a) - rank(b) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    });

    const doc = documents[0];
    if (doc?.object_path) {
      const { data: download, error: downloadError } = await db.storage
        .from('candidate-resumes')
        .download(doc.object_path);

      if (!downloadError && download) {
        const buffer = Buffer.from(await download.arrayBuffer());
        const base64 = buffer.toString('base64');
        const mimeType = /\.docx$/i.test(doc.filename)
          ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : 'application/pdf';
        return {
          filename: doc.filename,
          mimeType,
          base64,
          candidateName: candidate.full_name,
          source: 'upload',
        };
      }
    }

    // 3. Fallback: check resume_url
    if (candidate.resume_url) {
      if (candidate.resume_url.startsWith('data:')) {
        const matches = candidate.resume_url.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          const extension =
            matches[1].toLowerCase() ===
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
              ? 'docx'
              : 'pdf';
          return {
            filename: `${(candidate.full_name || 'Candidate').replace(/[^a-zA-Z0-9]/g, '_')}_Resume.${extension}`,
            mimeType: matches[1] || 'application/pdf',
            base64: matches[2],
            candidateName: candidate.full_name,
            source: 'upload',
          };
        }
      }
    }

    if (doc?.object_path) {
      throw new CaptureError('The uploaded resume could not be downloaded.', 502);
    }
    throw new CaptureError('No uploaded resume found for candidate.', 404);
  });
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
