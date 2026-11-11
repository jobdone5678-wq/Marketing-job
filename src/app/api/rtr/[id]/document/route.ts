import { protectedRoute } from "@/lib/http/protected-route";
import { database, CaptureError } from "@/lib/db/admin";
import { candidateAccess } from "@/lib/resumes/repository";
import { parseRtrMetadata } from "@/lib/rtr-metadata";

function sanitizeRtrId(id: string): string {
  const clean = id.trim();
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(clean)) {
    throw new CaptureError("Invalid RTR identifier.", 400);
  }
  return clean;
}

/**
 * Returns the stored agreement file so the badge can open it. The document bytes are never part
 * of the list responses, they are only fetched on demand.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  return protectedRoute(request, async (profile) => {
    const id = sanitizeRtrId((await context.params).id);
    const db = database();

    const { data: doc } = await db
      .from("rtr_documents")
      .select("id, candidate_id, submission_id, filename, mime_type, document_url, base64")
      .eq("id", id)
      .maybeSingle();

    if (doc) {
      if (doc.candidate_id) await candidateAccess(profile, doc.candidate_id);
      return {
        id: doc.id,
        filename: doc.filename,
        mime_type: doc.mime_type,
        url: doc.document_url || null,
        base64: doc.base64 || null,
      };
    }

    // Fall back to the metadata tag when the dedicated row is missing.
    const cleanId = id.replace(/^sub-/, "");
    if (/^\d+$/.test(cleanId) || /^[0-9a-f-]{36}$/i.test(cleanId)) {
      const { data: sub } = await db
        .from("job_submissions")
        .select("id, candidate_id, notes")
        .eq("id", cleanId)
        .maybeSingle();
      const meta = parseRtrMetadata(sub?.notes as string | null);
      if (sub && meta) {
        if (sub.candidate_id) await candidateAccess(profile, sub.candidate_id);
        return {
          id,
          filename: (meta.filename as string) || "RTR_Document.pdf",
          mime_type: (meta.mime_type as string) || "application/pdf",
          url: (meta.document_url as string) || null,
          base64: (meta.base64 as string) || null,
        };
      }
    }

    throw new CaptureError("No document is stored for this agreement.", 404);
  });
}
