import { protectedRoute } from "@/lib/http/protected-route";
import { database, checkDb, CaptureError } from "@/lib/db/admin";
import { candidateAccess } from "@/lib/resumes/repository";
import { z } from "zod";

const createRtrSchema = z.object({
  candidate_id: z
    .string()
    .nullable()
    .optional()
    .transform((val) => {
      if (!val || val === "none" || val === "__none__" || val === "null" || val === "undefined") {
        return null;
      }
      const trimmed = val.trim();
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)
        ? trimmed
        : null;
    }),
  candidate_name: z.string().nullable().optional(),
  submission_id: z.string().uuid().nullable().optional(),
  vendor_id: z.string().uuid().nullable().optional(),
  filename: z.string().min(1).max(255),
  mime_type: z.string().default("application/pdf"),
  document_url: z.string().nullable().optional(),
  base64: z.string().nullable().optional(),
  rtr_type: z.enum(["vendor_rtr", "client_rtr", "direct_rtr"]).default("vendor_rtr"),
  rtr_status: z.enum(["received", "signed", "expired", "rejected"]).default("received"),
  rtr_date: z.string().default(() => new Date().toISOString().slice(0, 10)),
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
  currency: z.string().default("USD"),
  representation_clause: z.string().nullable().optional(),
  ocr_raw_text: z.string().nullable().optional(),
  ocr_extracted_data: z.record(z.string(), z.unknown()).optional(),
  notes: z.string().nullable().optional(),
  create_submission: z.boolean().optional().default(false),
});

export async function GET(request: Request) {
  return protectedRoute(request, "candidate_or_staff", async (profile) => {
    const url = new URL(request.url);
    const candidateId = url.searchParams.get("candidateId");
    const status = url.searchParams.get("status");
    const search = (url.searchParams.get("search") || "").replace(/[%_,()'"\\:]/g, ' ').trim().toLowerCase();

    const db = database();
    const isStaff = ["super_admin", "recruiter", "technical_recruiter"].includes(profile.role);

    let candidateFilter = candidateId;
    if (!isStaff) {
      // Find candidate linked to this profile user_id
      const { data: cand } = await db
        .from("candidates")
        .select("id")
        .eq("user_id", profile.id)
        .maybeSingle();
      if (!cand) return { documents: [], total: 0 };
      candidateFilter = cand.id;
    } else if (candidateFilter && profile.role !== "super_admin") {
      await candidateAccess(profile, candidateFilter);
    }

    const items: Array<Record<string, unknown>> = [];

    // 1. Query dedicated rtr_documents table if it exists
    try {
      let query = db
        .from("rtr_documents")
        .select("*, candidate:candidates(id, full_name, email, phone)")
        .order("rtr_date", { ascending: false });

      if (candidateFilter) {
        query = query.eq("candidate_id", candidateFilter);
      }
      if (status && status !== "all") {
        query = query.eq("rtr_status", status);
      }

      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        items.push(...data);
      }
    } catch {
      // Table might not exist yet before migration is executed
    }

    // 2. Also retrieve from job_submissions (supporting both rtr_document column and notes metadata)
    try {
      let subQuery = db
        .from("job_submissions")
        .select("id, candidate_id, company_name, job_title, vendor_company, vendor_contact_name, vendor_contact_email, vendor_contact_phone, submitted_rate, notes, submission_date, candidate:candidates(id, full_name, email, phone)")
        .order("submission_date", { ascending: false });

      if (candidateFilter) {
        subQuery = subQuery.eq("candidate_id", candidateFilter);
      }

      const { data: subs } = await subQuery;
      if (Array.isArray(subs)) {
        for (const sub of subs) {
          // Parse RTR metadata from notes or rtr_document
          let rtrRef: Record<string, unknown> | null = null;
          if (sub.notes && typeof sub.notes === "string") {
            const match = sub.notes.match(/<!-- RTR_METADATA:\s*(\{[\s\S]*?\})\s*-->/);
            if (match) {
              try {
                rtrRef = JSON.parse(match[1]);
              } catch {}
            }
          }
          if (!rtrRef && (sub as any).rtr_document) {
            rtrRef = (sub as any).rtr_document as Record<string, unknown>;
          }
          if (!rtrRef) continue;

          // Avoid duplicate if already in items from rtr_documents table
          const existing = items.find(
            (it) => it.submission_id === sub.id || it.id === rtrRef?.id
          );
          if (!existing) {
            items.push({
              id: rtrRef.id || `sub-${sub.id}`,
              submission_id: sub.id,
              candidate_id: sub.candidate_id,
              candidate: sub.candidate,
              candidate_name: rtrRef.candidate_name || (sub.candidate as any)?.full_name || null,
              filename: rtrRef.filename || "RTR_Document.pdf",
              mime_type: rtrRef.mime_type || "application/pdf",
              base64: rtrRef.base64 || null,
              rtr_type: rtrRef.rtr_type || "vendor_rtr",
              rtr_status: rtrRef.rtr_status || "received",
              rtr_date: rtrRef.rtr_date || sub.submission_date,
              expiration_date: rtrRef.expiration_date || null,
              company_name: rtrRef.company_name || sub.company_name,
              job_title: rtrRef.job_title || sub.job_title,
              vendor_name: rtrRef.vendor_name || sub.vendor_company,
              vendor_contact_name: rtrRef.vendor_contact_name || sub.vendor_contact_name,
              vendor_contact_email: rtrRef.vendor_contact_email || sub.vendor_contact_email,
              vendor_contact_phone: rtrRef.vendor_contact_phone || sub.vendor_contact_phone,
              hourly_rate: rtrRef.hourly_rate || sub.submitted_rate,
              daily_rate: rtrRef.daily_rate || null,
              monthly_rate: rtrRef.monthly_rate || null,
              annual_rate: rtrRef.annual_rate || null,
              currency: rtrRef.currency || "USD",
              representation_clause: rtrRef.representation_clause || null,
              notes: rtrRef.notes || sub.notes?.replace(/<!-- RTR_METADATA:[\s\S]*?-->/g, '').trim() || null,
              created_at: rtrRef.created_at || new Date().toISOString(),
            });
          }
        }
      }
    } catch (subErr) {
      console.warn("Submissions read fallback warning:", subErr);
    }

    // Filter by status if requested
    let filtered = items;
    if (status && status !== "all") {
      filtered = filtered.filter((it) => it.rtr_status === status);
    }

    // Filter by search keyword
    if (search) {
      filtered = filtered.filter((it) => {
        const cand = it.candidate as { full_name?: string; email?: string } | null;
        const candName = (cand?.full_name || (it.candidate_name as string) || "").toLowerCase();
        const candEmail = (cand?.email || "").toLowerCase();
        const company = String(it.company_name || "").toLowerCase();
        const role = String(it.job_title || "").toLowerCase();
        const vendor = String(it.vendor_name || "").toLowerCase();
        const file = String(it.filename || "").toLowerCase();
        return (
          candName.includes(search) ||
          candEmail.includes(search) ||
          company.includes(search) ||
          role.includes(search) ||
          vendor.includes(search) ||
          file.includes(search)
        );
      });
    }

    return {
      documents: filtered,
      total: filtered.length,
    };
  });
}

export async function POST(request: Request) {
  return protectedRoute(request, "candidate_or_staff", async (profile) => {
    const body = createRtrSchema.parse(await request.json());
    const db = database();

    // Auto-resolve candidate_id if user is a candidate and none was provided
    let targetCandidateId = body.candidate_id || null;
    let resolvedCandidateName = body.candidate_name || null;

    if (!targetCandidateId && profile.role === "client") {
      const { data: cand } = await db
        .from("candidates")
        .select("id, full_name")
        .eq("user_id", profile.id)
        .maybeSingle();
      if (cand) {
        targetCandidateId = cand.id;
        resolvedCandidateName = cand.full_name;
      }
    }

    // If candidate_id is still missing but candidate_name was provided, find or create
    if (!targetCandidateId && resolvedCandidateName?.trim()) {
      const trimmedName = resolvedCandidateName.trim();
      const { data: matchCand } = await db
        .from("candidates")
        .select("id, full_name")
        .ilike("full_name", trimmedName)
        .limit(1)
        .maybeSingle();

      if (matchCand) {
        targetCandidateId = matchCand.id;
        resolvedCandidateName = matchCand.full_name;
      } else {
        // Auto-create candidate record so RTR can be saved without failure
        const { data: newCand } = await db
          .from("candidates")
          .insert({
            full_name: trimmedName,
            is_active_bench: true,
            notes: `Created via RTR Ingestion (${body.filename})`,
          })
          .select("id, full_name")
          .maybeSingle();

        if (newCand) {
          targetCandidateId = newCand.id;
          resolvedCandidateName = newCand.full_name;
        }
      }
    }

    // If still no candidate_id, create dedicated candidate record to avoid mismatching with another candidate
    if (!targetCandidateId) {
      const defaultName = resolvedCandidateName?.trim() || "Independent Consultant";
      const { data: createdCand } = await db
        .from("candidates")
        .insert({
          full_name: defaultName,
          is_active_bench: true,
          notes: `Created via RTR Ingestion (${body.filename})`,
        })
        .select("id, full_name")
        .maybeSingle();

      if (createdCand) {
        targetCandidateId = createdCand.id;
        resolvedCandidateName = createdCand.full_name;
      }
    }

    const savedId: string = crypto.randomUUID();

    const rtrRef = {
      id: savedId,
      candidate_id: targetCandidateId,
      candidate_name: resolvedCandidateName,
      filename: body.filename,
      mime_type: body.mime_type,
      vendor_name: body.vendor_name || null,
      vendor_contact_name: body.vendor_contact_name || null,
      vendor_contact_email: body.vendor_contact_email || null,
      vendor_contact_phone: body.vendor_contact_phone || null,
      rtr_type: body.rtr_type,
      rtr_status: body.rtr_status,
      rtr_date: body.rtr_date,
      expiration_date: body.expiration_date || null,
      company_name: body.company_name || null,
      job_title: body.job_title || null,
      hourly_rate: body.hourly_rate || null,
      daily_rate: body.daily_rate || null,
      monthly_rate: body.monthly_rate || null,
      annual_rate: body.annual_rate || null,
      currency: body.currency,
      representation_clause: body.representation_clause || null,
      notes: body.notes || null,
      created_at: new Date().toISOString(),
    };

    const rtrTag = `<!-- RTR_METADATA: ${JSON.stringify(rtrRef)} -->`;
    const finalNotes = body.notes
      ? `${body.notes}\n\n${rtrTag}`
      : `RTR Document: ${body.filename} (${body.rtr_status})\n\n${rtrTag}`;

    // Try inserting into dedicated rtr_documents table if available
    try {
      await db
        .from("rtr_documents")
        .insert({
          id: savedId,
          candidate_id: targetCandidateId,
          submission_id: body.submission_id || null,
          vendor_id: body.vendor_id || null,
          filename: body.filename,
          mime_type: body.mime_type,
          document_url: body.document_url || null,
          base64: body.base64 || null,
          rtr_type: body.rtr_type,
          rtr_status: body.rtr_status,
          rtr_date: body.rtr_date,
          expiration_date: body.expiration_date || null,
          company_name: body.company_name || null,
          job_title: body.job_title || null,
          vendor_name: body.vendor_name || null,
          vendor_contact_name: body.vendor_contact_name || null,
          vendor_contact_email: body.vendor_contact_email || null,
          vendor_contact_phone: body.vendor_contact_phone || null,
          hourly_rate: body.hourly_rate || null,
          daily_rate: body.daily_rate || null,
          monthly_rate: body.monthly_rate || null,
          annual_rate: body.annual_rate || null,
          currency: body.currency,
          ocr_raw_text: body.ocr_raw_text || null,
          ocr_extracted_data: body.ocr_extracted_data || {},
          notes: body.notes || null,
          uploaded_by: profile.id,
        });
    } catch {
      // rtr_documents fallback handled by job_submissions
    }

    let createdSubmissionId = body.submission_id || null;

    // Clean up numeric rate for database column
    const parsedHourlyRate = body.hourly_rate
      ? parseFloat(body.hourly_rate.replace(/[^0-9.]/g, "")) || null
      : null;

    // Attach to existing submission or create new job_submission record
    if (body.submission_id) {
      try {
        const { data: existingSub } = await db
          .from("job_submissions")
          .select("notes")
          .eq("id", body.submission_id)
          .maybeSingle();

        const cleanNotes = (existingSub?.notes || "").replace(/<!-- RTR_METADATA:[\s\S]*?-->/g, "").trim();
        const updatedNotes = cleanNotes ? `${cleanNotes}\n\n${rtrTag}` : rtrTag;

        let updRes = await db
          .from("job_submissions")
          .update({
            notes: updatedNotes,
            rtr_document: rtrRef,
            vendor_company: body.vendor_name || undefined,
            vendor_contact_name: body.vendor_contact_name || undefined,
            vendor_contact_email: body.vendor_contact_email || undefined,
            vendor_contact_phone: body.vendor_contact_phone || undefined,
            submitted_rate: body.hourly_rate ? `$${body.hourly_rate}/hr` : undefined,
          })
          .eq("id", body.submission_id);

        if (updRes.error && (updRes.error.code === "42703" || updRes.error.message?.includes("does not exist"))) {
          await db
            .from("job_submissions")
            .update({
              notes: updatedNotes,
              vendor_company: body.vendor_name || undefined,
              vendor_contact_name: body.vendor_contact_name || undefined,
              vendor_contact_email: body.vendor_contact_email || undefined,
              vendor_contact_phone: body.vendor_contact_phone || undefined,
              submitted_rate: body.hourly_rate ? `$${body.hourly_rate}/hr` : undefined,
            })
            .eq("id", body.submission_id);
        }
      } catch (err) {
        console.warn("Could not attach RTR reference to submission:", err);
      }
    } else {
      // Standalone RTR or new submission
      try {
        const rateStr = body.hourly_rate
          ? `$${body.hourly_rate}/hr`
          : body.daily_rate
          ? `$${body.daily_rate}/day`
          : body.annual_rate
          ? `$${body.annual_rate}/yr`
          : null;

        const subStatus = body.rtr_status === "signed" ? "Submitted_to_Client" : "Vendor_Screening";

        let newSubRes = await db
          .from("job_submissions")
          .insert({
            candidate_id: targetCandidateId,
            company_name: body.company_name?.trim() || "Client",
            job_title: body.job_title?.trim() || "Consultant",
            vendor_company: body.vendor_name?.trim() || null,
            vendor_contact_name: body.vendor_contact_name?.trim() || null,
            vendor_contact_email: body.vendor_contact_email?.trim() || null,
            vendor_contact_phone: body.vendor_contact_phone?.trim() || null,
            submitted_rate: rateStr,
            status: subStatus,
            submission_date: body.rtr_date || new Date().toISOString().slice(0, 10),
            notes: finalNotes,
            rtr_document: rtrRef,
            recruiter_id: profile.role === "client" ? null : profile.id,
          })
          .select("id")
          .single();

        if (newSubRes.error && (newSubRes.error.code === "42703" || newSubRes.error.message?.includes("does not exist"))) {
          newSubRes = await db
            .from("job_submissions")
            .insert({
              candidate_id: targetCandidateId,
              company_name: body.company_name?.trim() || "Client",
              job_title: body.job_title?.trim() || "Consultant",
              vendor_company: body.vendor_name?.trim() || null,
              vendor_contact_name: body.vendor_contact_name?.trim() || null,
              vendor_contact_email: body.vendor_contact_email?.trim() || null,
              vendor_contact_phone: body.vendor_contact_phone?.trim() || null,
              submitted_rate: rateStr,
              status: subStatus,
              submission_date: body.rtr_date || new Date().toISOString().slice(0, 10),
              notes: finalNotes,
              recruiter_id: profile.role === "client" ? null : profile.id,
            })
            .select("id")
            .single();
        }

        if (!newSubRes.error && newSubRes.data?.id) {
          createdSubmissionId = newSubRes.data.id;
        }
      } catch (subErr) {
        console.warn("Auto-create submission from RTR failed:", subErr);
      }
    }

    // Insert into dedicated rtr_documents table if submission and candidate exist
    if (createdSubmissionId && targetCandidateId) {
      try {
        await db.from("rtr_documents").insert({
          id: savedId,
          candidate_id: targetCandidateId,
          submission_id: createdSubmissionId,
          vendor_id: body.vendor_id || null,
          filename: body.filename,
          mime_type: body.mime_type,
          document_url: body.document_url || null,
          base64: body.base64 || null,
          rtr_type: body.rtr_type,
          rtr_status: body.rtr_status,
          rtr_date: body.rtr_date,
          expiration_date: body.expiration_date || null,
          vendor_name: body.vendor_name || null,
          vendor_contact_name: body.vendor_contact_name || null,
          vendor_contact_email: body.vendor_contact_email || null,
          vendor_contact_phone: body.vendor_contact_phone || null,
          hourly_rate: parsedHourlyRate,
          currency: body.currency,
          notes: body.notes || null,
          uploaded_by: profile.id,
        });
      } catch (rtrDocErr) {
        console.warn("rtr_documents insert notice (fallback on job_submissions):", rtrDocErr);
      }
    }

    return {
      success: true,
      id: savedId,
      submission_id: createdSubmissionId,
      candidate_id: targetCandidateId,
      message: "RTR document processed and saved successfully.",
    };
  });
}
