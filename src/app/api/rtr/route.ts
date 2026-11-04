import { protectedRoute } from "@/lib/http/protected-route";
import { database, checkDb, CaptureError } from "@/lib/db/admin";
import { z } from "zod";

const createRtrSchema = z.object({
  candidate_id: z.string().uuid().nullable().optional(),
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
  ocr_raw_text: z.string().nullable().optional(),
  ocr_extracted_data: z.record(z.string(), z.unknown()).optional(),
  notes: z.string().nullable().optional(),
});

export async function GET(request: Request) {
  return protectedRoute(request, "candidate_or_staff", async (profile) => {
    const url = new URL(request.url);
    const candidateId = url.searchParams.get("candidateId");
    const status = url.searchParams.get("status");
    const search = url.searchParams.get("search")?.toLowerCase().trim();

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

    // 2. Also retrieve from job_submissions where rtr_document IS NOT NULL (for seamless back-compat)
    try {
      let subQuery = db
        .from("job_submissions")
        .select("id, candidate_id, company_name, job_title, vendor_company, vendor_contact_name, vendor_contact_email, vendor_contact_phone, submitted_rate, rtr_document, submission_date, candidate:candidates(id, full_name, email, phone)")
        .not("rtr_document", "is", null);

      if (candidateFilter) {
        subQuery = subQuery.eq("candidate_id", candidateFilter);
      }

      const { data: subs } = await subQuery;
      if (Array.isArray(subs)) {
        for (const sub of subs) {
          const rtrRef = sub.rtr_document as Record<string, unknown> | null;
          if (!rtrRef) continue;

          // Avoid duplicate if already in items from rtr_documents table
          const existing = items.find(
            (it) => it.submission_id === sub.id || it.id === rtrRef.id
          );
          if (!existing) {
            items.push({
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
              hourly_rate: rtrRef.hourly_rate || sub.submitted_rate,
              daily_rate: rtrRef.daily_rate || null,
              monthly_rate: rtrRef.monthly_rate || null,
              annual_rate: rtrRef.annual_rate || null,
              currency: rtrRef.currency || "USD",
              notes: rtrRef.notes || null,
              created_at: rtrRef.created_at || new Date().toISOString(),
            });
          }
        }
      }
    } catch {
      // Submissions read fallback
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
        const candName = (cand?.full_name || "").toLowerCase();
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
  return protectedRoute(request, "recruiting_staff", async (profile) => {
    const body = createRtrSchema.parse(await request.json());
    const db = database();

    // Try inserting into dedicated rtr_documents table
    let savedId: string = crypto.randomUUID();
    let savedInTable = false;

    try {
      const { data, error } = await db
        .from("rtr_documents")
        .insert({
          id: savedId,
          candidate_id: body.candidate_id || null,
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
        })
        .select("*")
        .single();

      if (!error && data) {
        savedId = data.id;
        savedInTable = true;
      }
    } catch {
      // Table fallback
    }

    // If submission_id is provided, also attach rtr_document reference to the job_submission
    if (body.submission_id) {
      const rtrRef = {
        id: savedId,
        filename: body.filename,
        mime_type: body.mime_type,
        vendor_name: body.vendor_name || null,
        rtr_type: body.rtr_type,
        rtr_status: body.rtr_status,
        rtr_date: body.rtr_date,
        expiration_date: body.expiration_date || null,
        hourly_rate: body.hourly_rate || null,
        daily_rate: body.daily_rate || null,
        monthly_rate: body.monthly_rate || null,
        annual_rate: body.annual_rate || null,
        currency: body.currency,
        created_at: new Date().toISOString(),
      };

      try {
        await db
          .from("job_submissions")
          .update({ rtr_document: rtrRef })
          .eq("id", body.submission_id);
      } catch (err) {
        console.warn("Could not attach RTR reference to submission:", err);
      }
    }

    return {
      success: true,
      id: savedId,
      message: "RTR document record created successfully.",
    };
  });
}
