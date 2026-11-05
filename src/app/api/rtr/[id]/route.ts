import { protectedRoute } from "@/lib/http/protected-route";
import { database, checkDb, CaptureError } from "@/lib/db/admin";
import { candidateAccess } from "@/lib/resumes/repository";
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
  return protectedRoute(request, "candidate_or_staff", async (profile) => {
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
    let sub = null;
    if (/^\d+$/.test(cleanId) || /^[0-9a-f-]{36}$/i.test(cleanId)) {
      const { data } = await db
        .from("job_submissions")
        .select("id, candidate_id, company_name, job_title, vendor_company, vendor_contact_name, vendor_contact_email, vendor_contact_phone, submitted_rate, rtr_document, submission_date, candidate:candidates(id, full_name, email, phone)")
        .eq("id", cleanId)
        .maybeSingle();
      sub = data;
    }

    if (sub?.rtr_document) {
      if (sub.candidate_id) {
        await candidateAccess(profile, sub.candidate_id);
      }
      const rtrRef = sub.rtr_document as Record<string, unknown>;
      return {
        document: {
          id: rtrRef.id || `sub-${sub.id}`,
          submission_id: sub.id,
          candidate_id: sub.candidate_id,
          candidate: sub.candidate,
          filename: rtrRef.filename || "RTR_Document.pdf",
          mime_type: rtrRef.mime_type || "application/pdf",
          rtr_type: rtrRef.rtr_type || "vendor_rtr",
          rtr_status: rtrRef.rtr_status || "received",
          rtr_date: rtrRef.rtr_date || sub.submission_date,
          expiration_date: rtrRef.expiration_date || null,
          company_name: sub.company_name,
          job_title: sub.job_title,
          vendor_name: rtrRef.vendor_name || sub.vendor_company,
          vendor_contact_name: sub.vendor_contact_name,
          vendor_contact_email: sub.vendor_contact_email,
          vendor_contact_phone: sub.vendor_contact_phone,
          hourly_rate: rtrRef.hourly_rate || (sub.submitted_rate ? String(sub.submitted_rate) : null),
          currency: rtrRef.currency || "USD",
          created_at: rtrRef.created_at || sub.submission_date,
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
  return protectedRoute(request, "recruiting_staff", async (profile) => {
    const rawId = (await context.params).id;
    const id = sanitizeRtrId(rawId);
    const body = updateRtrSchema.parse(await request.json());
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

    // Also update submission rtr_document if linked
    try {
      const cleanSubId = id.replace(/^sub-/, "");
      if (/^\d+$/.test(cleanSubId) || /^[0-9a-f-]{36}$/i.test(cleanSubId)) {
        const { data: sub } = await db
          .from("job_submissions")
          .select("id, rtr_document")
          .eq("id", cleanSubId)
          .maybeSingle();

        if (sub?.rtr_document) {
          const merged = {
            ...(sub.rtr_document as Record<string, unknown>),
            ...body,
          };
          await db
            .from("job_submissions")
            .update({ rtr_document: merged })
            .eq("id", sub.id);
          updated = true;
        }
      }
    } catch {
      // Ignore
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
  return protectedRoute(request, "recruiting_staff", async (profile) => {
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
        await db
          .from("job_submissions")
          .update({ rtr_document: null })
          .eq("id", cleanSubId);
      }
    } catch {
      // Ignore
    }

    return { success: true, message: "RTR document removed." };
  });
}
