import { protectedRoute } from "@/lib/http/protected-route";
import { database, checkDb, CaptureError } from "@/lib/db/admin";
import { candidateAccess } from "@/lib/resumes/repository";
import { buildRtrMetadataTag, parseRtrMetadata, stripRtrMetadata } from "@/lib/rtr-metadata";
import { z } from "zod";

const updateRtrSchema = z.object({
  rtr_status: z.enum(["received", "signed", "expired", "rejected"]).optional(),
  rtr_type: z.enum(["vendor_rtr", "client_rtr", "direct_rtr"]).optional(),
  rtr_date: z.string().optional(),
  expiration_date: z.string().nullable().optional(),
  company_name: z.string().nullable().optional(),
  job_title: z.string().nullable().optional(),
  vendor_name: z.string().nullable().optional(),
  vendor_contact_name: z.string().nullable().optional(),
  vendor_contact_email: z.string().nullable().optional(),
  vendor_contact_phone: z.string().nullable().optional(),
  hourly_rate: z.string().nullable().optional(),
  daily_rate: z.string().nullable().optional(),
  monthly_rate: z.string().nullable().optional(),
  annual_rate: z.string().nullable().optional(),
  currency: z.string().optional(),
  notes: z.string().nullable().optional(),
});

function sanitizeRtrId(id: string): string {
  const clean = id.trim();
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(clean)) {
    throw new CaptureError("Invalid RTR identifier.", 400);
  }
  return clean;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  return protectedRoute(request, async (profile) => {
    const rawId = (await context.params).id;
    const id = sanitizeRtrId(rawId);
    const db = database();

    // 1. Check rtr_documents table
    try {
      const { data, error } = await db
        .from("rtr_documents")
        .select("*, candidate:candidates(id, full_name, email, phone)")
        .eq("id", id)
        .maybeSingle();

      if (!error && data) {
        if (data.candidate_id) {
          await candidateAccess(profile, data.candidate_id);
        }
        return { document: data };
      }
    } catch (err: unknown) {
      if (err instanceof CaptureError) throw err;
      // Fallback to submissions
    }

    // 2. Check submissions table
    const cleanId = id.replace(/^sub-/, "");
    let sub: Record<string, any> | null = null;
    if (/^\d+$/.test(cleanId) || /^[0-9a-f-]{36}$/i.test(cleanId)) {
      const { data } = await db
        .from("job_submissions")
        .select("id, candidate_id, company_name, job_title, vendor_company, vendor_contact_name, vendor_contact_email, vendor_contact_phone, submitted_rate, notes, submission_date, rtr_document, candidate:candidates(id, full_name, email, phone)")
        .eq("id", cleanId)
        .maybeSingle();
      sub = data;
    }

    const metadataTag = parseRtrMetadata(sub?.notes as string | null);
    const parsedRtr: Record<string, unknown> | null =
      metadataTag || (sub?.rtr_document ? (sub.rtr_document as Record<string, unknown>) : null);

    if (parsedRtr || sub) {
      if (sub?.candidate_id) {
        await candidateAccess(profile, sub.candidate_id);
      }
      const rtrRef = parsedRtr || {};
      return {
        document: {
          id: (rtrRef.id as string) || `sub-${sub?.id || id}`,
          submission_id: sub?.id || null,
          candidate_id: sub?.candidate_id || rtrRef.candidate_id || null,
          candidate: sub?.candidate || null,
          candidate_name: (rtrRef.candidate_name as string) || sub?.candidate?.full_name || null,
          filename: (rtrRef.filename as string) || "RTR_Document.pdf",
          mime_type: (rtrRef.mime_type as string) || "application/pdf",
          base64: (rtrRef.base64 as string) || null,
          rtr_type: (rtrRef.rtr_type as string) || "vendor_rtr",
          rtr_status: (rtrRef.rtr_status as string) || "received",
          rtr_date: (rtrRef.rtr_date as string) || sub?.submission_date,
          expiration_date: (rtrRef.expiration_date as string) || null,
          company_name: (rtrRef.company_name as string) || sub?.company_name,
          job_title: (rtrRef.job_title as string) || sub?.job_title,
          vendor_name: (rtrRef.vendor_name as string) || sub?.vendor_company,
          vendor_contact_name: (rtrRef.vendor_contact_name as string) || sub?.vendor_contact_name,
          vendor_contact_email: (rtrRef.vendor_contact_email as string) || sub?.vendor_contact_email,
          vendor_contact_phone: (rtrRef.vendor_contact_phone as string) || sub?.vendor_contact_phone,
          hourly_rate: (rtrRef.hourly_rate as string) || (sub?.submitted_rate ? String(sub.submitted_rate) : null),
          currency: (rtrRef.currency as string) || "USD",
          created_at: (rtrRef.created_at as string) || sub?.submission_date || new Date().toISOString(),
        },
      };
    }

    throw new CaptureError("RTR document not found.", 404);
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  return protectedRoute(request, async (profile) => {
    const rawId = (await context.params).id;
    const id = sanitizeRtrId(rawId);
    const body = updateRtrSchema.parse(await request.json());
    const db = database();

    // Verify ownership of the document
    let targetCandidateId: string | null = null;
    let targetSubId: string | null = null;

    const { data: existingDoc } = await db
      .from("rtr_documents")
      .select("id, candidate_id, submission_id")
      .eq("id", id)
      .maybeSingle();

    if (existingDoc?.candidate_id) {
      targetCandidateId = existingDoc.candidate_id;
      targetSubId = existingDoc.submission_id;
    } else {
      const cleanSubId = id.replace(/^sub-/, "");
      if (/^\d+$/.test(cleanSubId) || /^[0-9a-f-]{36}$/i.test(cleanSubId)) {
        const { data: sub } = await db
          .from("job_submissions")
          .select("id, candidate_id")
          .eq("id", cleanSubId)
          .maybeSingle();
        if (sub?.candidate_id) {
          targetCandidateId = sub.candidate_id;
          targetSubId = sub.id;
        }
      }
    }

    if (!targetCandidateId) {
      throw new CaptureError("RTR document not found.", 404);
    }

    await candidateAccess(profile, targetCandidateId);

    let updated = false;

    // Try updating rtr_documents table
    try {
      const { error } = await db
        .from("rtr_documents")
        .update(body)
        .eq("id", id);
      if (!error) updated = true;
    } catch {
      // Table fallback
    }

    // Also update submission notes / metadata if linked
    const subTargetId = targetSubId || id.replace(/^sub-/, "");
    if (/^\d+$/.test(subTargetId) || /^[0-9a-f-]{36}$/i.test(subTargetId)) {
      try {
        const { data: sub } = await db
          .from("job_submissions")
          .select("id, notes")
          .eq("id", subTargetId)
          .maybeSingle();

        if (sub) {
          const rtrMeta: Record<string, unknown> = parseRtrMetadata(sub.notes as string | null) || {};
          const merged = { ...rtrMeta, ...body };
          const rtrTag = buildRtrMetadataTag(merged);
          const cleanNotes = stripRtrMetadata(sub.notes as string | null);
          const updatedNotes = cleanNotes ? `${cleanNotes}\n\n${rtrTag}` : rtrTag;

          await db
            .from("job_submissions")
            .update({
              notes: updatedNotes,
              vendor_company: body.vendor_name || undefined,
              submitted_rate: body.hourly_rate ? `$${body.hourly_rate}/hr` : undefined,
            })
            .eq("id", sub.id);
          updated = true;
        }
      } catch (err) {
        console.warn("Could not patch submission notes metadata:", err);
      }
    }

    if (!updated) {
      throw new CaptureError("Could not update RTR document. Record may not exist.", 404);
    }

    return { success: true, message: "RTR document updated successfully." };
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  return protectedRoute(request, async (profile) => {
    const rawId = (await context.params).id;
    const id = sanitizeRtrId(rawId);
    const db = database();

    // Verify ownership of the document
    let targetCandidateId: string | null = null;
    const { data: existingDoc } = await db
      .from("rtr_documents")
      .select("id, candidate_id")
      .eq("id", id)
      .maybeSingle();

    if (existingDoc?.candidate_id) {
      targetCandidateId = existingDoc.candidate_id;
    } else {
      const cleanSubId = id.replace(/^sub-/, "");
      if (/^\d+$/.test(cleanSubId) || /^[0-9a-f-]{36}$/i.test(cleanSubId)) {
        const { data: sub } = await db
          .from("job_submissions")
          .select("id, candidate_id")
          .eq("id", cleanSubId)
          .maybeSingle();
        if (sub?.candidate_id) {
          targetCandidateId = sub.candidate_id;
        }
      }
    }

    if (!targetCandidateId) {
      throw new CaptureError("RTR document not found.", 404);
    }

    await candidateAccess(profile, targetCandidateId);

    try {
      await db.from("rtr_documents").delete().eq("id", id);
    } catch {
      // Ignore
    }

    try {
      const cleanSubId = id.replace(/^sub-/, "");
      if (/^\d+$/.test(cleanSubId) || /^[0-9a-f-]{36}$/i.test(cleanSubId)) {
        const { data: sub } = await db.from("job_submissions").select("id, notes").eq("id", cleanSubId).maybeSingle();
        if (sub?.notes) {
          const cleanNotes = stripRtrMetadata(sub.notes as string | null);
          await db.from("job_submissions").update({ notes: cleanNotes || null }).eq("id", cleanSubId);
        }
      }
    } catch {
      // Ignore
    }

    return { success: true, message: "RTR document removed." };
  });
}
