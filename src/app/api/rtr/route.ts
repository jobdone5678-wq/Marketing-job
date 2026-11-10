import { protectedRoute } from "@/lib/http/protected-route";
import { database, CaptureError } from "@/lib/db/admin";
import { candidateAccess } from "@/lib/resumes/repository";
import { ownedCandidates, ensureOwnedCandidate } from "@/lib/auth/candidate-ownership";
import { recruitingRoles } from "@/lib/auth/profile-access";
import { buildRtrMetadataTag, parseRtrMetadata, stripRtrMetadata } from "@/lib/rtr-metadata";
import { toIsoDate, todayIsoDate } from "@/lib/rtr-dates";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 60;

// The agreement file travels as multipart form data, so the request body stays the size of the
// original document instead of a base64 blob that is a third larger.
export const MAX_RTR_DOCUMENT_BYTES = 4 * 1024 * 1024;

// Database codes that mean "this table or column does not exist yet". They are recoverable by
// falling back to the notes column, so they must not fail the whole request.
const MISSING_SCHEMA_CODES = new Set(["42P01", "42703", "PGRST202", "PGRST204", "PGRST205"]);

const isoDate = z
  .string()
  .nullable()
  .optional()
  .transform((value) => toIsoDate(value));

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
  rtr_date: z.string().default(() => todayIsoDate()).transform((value) => toIsoDate(value) ?? todayIsoDate()),
  expiration_date: isoDate,
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

type RtrPayload = z.infer<typeof createRtrSchema>;

interface UploadedDocument {
  filename: string;
  mimeType: string;
  base64: string;
}

function isMissingSchemaError(error: { code?: string } | null | undefined): boolean {
  return Boolean(error && MISSING_SCHEMA_CODES.has(error.code || ""));
}

function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(-160);
  return cleaned || "RTR_Document.pdf";
}

async function readRtrRequest(
  request: Request
): Promise<{ meta: unknown; document: UploadedDocument | null }> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return { meta: await request.json(), document: null };
  }

  const form = await request.formData();
  const rawMeta = form.get("payload");
  let meta: unknown = {};
  if (typeof rawMeta === "string" && rawMeta.trim()) {
    try {
      meta = JSON.parse(rawMeta);
    } catch {
      throw new CaptureError("Invalid request. Check required fields and try again.", 400);
    }
  }

  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return { meta, document: null };
  if (file.size > MAX_RTR_DOCUMENT_BYTES) {
    throw new CaptureError(
      "The RTR document must be 4 MB or smaller. Upload a compressed copy and try again.",
      413
    );
  }

  const raw = Buffer.from(await file.arrayBuffer());
  return {
    meta,
    document: {
      filename: sanitizeFilename(file.name),
      mimeType: file.type || "application/octet-stream",
      base64: raw.toString("base64"),
    },
  };
}

export async function GET(request: Request) {
  return protectedRoute(request, "candidate_or_staff", async (profile) => {
    const url = new URL(request.url);
    const candidateId = url.searchParams.get("candidateId");
    const status = url.searchParams.get("status");
    const search = (url.searchParams.get("search") || "").replace(/[%_,()'"\\:]/g, " ").trim().toLowerCase();

    const db = database();
    const isStaff = recruitingRoles.includes(profile.role);

    let candidateFilter = candidateId;
    let ownedIds: string[] = [];
    if (!isStaff) {
      // A candidate only ever sees the agreements filed against their own record.
      ownedIds = (await ownedCandidates(profile)).map((row) => row.id);
      if (ownedIds.length === 0) return { documents: [], total: 0 };
    } else if (candidateFilter && profile.role !== "super_admin") {
      await candidateAccess(profile, candidateFilter);
    }

    const items: Array<Record<string, unknown>> = [];
    const submissionsById = new Map<string, Record<string, unknown>>();

    // 1. Applications first: they carry the RTR metadata tag and the client / role details.
    let submissions: Array<Record<string, any>> = [];
    try {
      let subQuery = db
        .from("job_submissions")
        .select(
          "id, candidate_id, company_name, job_title, vendor_company, vendor_contact_name, vendor_contact_email, vendor_contact_phone, submitted_rate, notes, submission_date, candidate:candidates(id, full_name, email, phone)"
        )
        .order("submission_date", { ascending: false });

      if (isStaff) {
        if (candidateFilter) subQuery = subQuery.eq("candidate_id", candidateFilter);
      } else {
        subQuery = subQuery.in("candidate_id", ownedIds);
      }

      const { data: subs } = await subQuery;
      if (Array.isArray(subs)) {
        submissions = subs as Array<Record<string, any>>;
        for (const sub of submissions) submissionsById.set(sub.id as string, sub);
      }
    } catch (subErr) {
      console.warn("Submissions read fallback warning:", subErr);
    }

    // 2. Dedicated agreement rows. `base64` is intentionally left out so listing agreements
    //    never downloads the document payloads.
    try {
      let query = db
        .from("rtr_documents")
        .select(
          "id, submission_id, candidate_id, vendor_id, filename, mime_type, document_url, rtr_type, rtr_status, rtr_date, expiration_date, vendor_name, vendor_contact_name, vendor_contact_email, vendor_contact_phone, hourly_rate, daily_rate, monthly_rate, annual_rate, currency, notes, created_at, candidate:candidates(id, full_name, email, phone)"
        )
        .order("rtr_date", { ascending: false });

      if (isStaff) {
        if (candidateFilter) query = query.eq("candidate_id", candidateFilter);
      } else {
        query = query.in("candidate_id", ownedIds);
      }
      if (status && status !== "all") {
        query = query.eq("rtr_status", status);
      }

      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        for (const row of data as Array<Record<string, any>>) {
          const submission = row.submission_id ? submissionsById.get(row.submission_id) : undefined;
          const meta = submission ? parseRtrMetadata(submission.notes as string | null) : null;
          items.push({
            ...row,
            company_name: row.company_name ?? meta?.company_name ?? submission?.company_name ?? null,
            job_title: row.job_title ?? meta?.job_title ?? submission?.job_title ?? null,
            candidate_name: meta?.candidate_name ?? (row.candidate as any)?.full_name ?? null,
          });
        }
      }
    } catch {
      // Table might not exist yet before migration is executed
    }

    // 3. Agreements that only exist as a metadata tag on the application.
    for (const sub of submissions) {
      const rtrRef = parseRtrMetadata(sub.notes as string | null);
      if (!rtrRef) continue;

      const existing = items.find(
        (it) => it.submission_id === sub.id || it.id === rtrRef.id
      );
      if (existing) continue;

      items.push({
        id: rtrRef.id || `sub-${sub.id}`,
        submission_id: sub.id,
        candidate_id: sub.candidate_id,
        candidate: sub.candidate,
        candidate_name: rtrRef.candidate_name || (sub.candidate as any)?.full_name || null,
        filename: rtrRef.filename || "RTR_Document.pdf",
        mime_type: rtrRef.mime_type || "application/pdf",
        document_url: rtrRef.document_url || null,
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
        notes: rtrRef.notes || stripRtrMetadata(sub.notes as string | null) || null,
        created_at: rtrRef.created_at || sub.submission_date || new Date().toISOString(),
      });
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
    const { meta, document } = await readRtrRequest(request);
    const parsed = createRtrSchema.safeParse(meta);
    if (!parsed.success) {
      throw new CaptureError("Invalid request. Check required fields and try again.", 400);
    }
    const body: RtrPayload = parsed.data;
    const db = database();
    const isCandidateUploader = profile.role === "client" || profile.role === "job_seeker";

    // The uploaded file always wins over the form fields for the document identity.
    // The document is always attached to the request, so the agreement file is stored even when
    const recruiterEmail = body.vendor_contact_email?.trim() || "";
    if (recruiterEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(recruiterEmail)) {
      throw new CaptureError("Enter a valid vendor recruiter email address.", 400);
    }

    const filename = document?.filename || body.filename;
    const mimeType = document?.mimeType || body.mime_type;
    const documentBase64 = document?.base64 ?? body.base64 ?? null;
    if (documentBase64 && documentBase64.length > Math.ceil((MAX_RTR_DOCUMENT_BYTES * 4) / 3) + 1024) {
      throw new CaptureError(
        "The RTR document must be 4 MB or smaller. Upload a compressed copy and try again.",
        413
      );
    }

    // Resolve the candidate the agreement belongs to.
    let targetCandidateId: string | null = body.candidate_id;
    let resolvedCandidateName: string | null = body.candidate_name?.trim() || null;

    if (isCandidateUploader) {
      // A candidate always files the agreement against their own record, and that record stays
      // linked to the account so the agreement shows up in their own applications and RTR list.
      const owned = await ensureOwnedCandidate(profile, resolvedCandidateName);
      if (owned) {
        targetCandidateId = owned.id;
        resolvedCandidateName = owned.full_name || resolvedCandidateName;
      }
    } else if (targetCandidateId) {
      await candidateAccess(profile, targetCandidateId);
      const { data: candidate } = await db
        .from("candidates")
        .select("id, full_name")
        .eq("id", targetCandidateId)
        .maybeSingle();
      if (candidate) resolvedCandidateName = candidate.full_name;
    }

    // Staff may file against a candidate that is not linked to an account yet.
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
            notes: `Created via RTR Ingestion (${filename})`,
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
          notes: `Created via RTR Ingestion (${filename})`,
        })
        .select("id, full_name")
        .maybeSingle();

      if (createdCand) {
        targetCandidateId = createdCand.id;
        resolvedCandidateName = createdCand.full_name;
      }
    }

    if (!targetCandidateId) {
      throw new CaptureError("The agreement could not be linked to a candidate record.", 500);
    }

    const companyName = body.company_name?.trim() || "Client";
    const jobTitle = body.job_title?.trim() || "Consultant";
    const agreementDate = body.rtr_date || todayIsoDate();

    // An agreement that was uploaded before for the same candidate, client and role is updated
    // instead of creating a second application row for the very same placement.
    let targetSubmissionId: string | null = body.submission_id || null;
    let reusedSubmission = false;

    if (!targetSubmissionId) {
      const { data: candidates } = await db
        .from("job_submissions")
        .select("id, notes, company_name, job_title")
        .eq("candidate_id", targetCandidateId)
        .eq("company_name", companyName)
        .eq("job_title", jobTitle)
        .limit(10);

      const reusable = (candidates || []).find((row) =>
        parseRtrMetadata(row.notes as string | null)
      );
      if (reusable) {
        targetSubmissionId = reusable.id as string;
        reusedSubmission = true;
      }
    }

    // Keep the same agreement id when the agreement is replaced, so the document row, the
    // metadata tag and the badge always point at the same record.
    let savedId = crypto.randomUUID();
    if (targetSubmissionId) {
      const { data: existingDoc } = await db
        .from("rtr_documents")
        .select("id")
        .eq("submission_id", targetSubmissionId)
        .limit(1)
        .maybeSingle();
      if (existingDoc?.id) savedId = existingDoc.id as string;
    }

    const rtrRef = {
      id: savedId,
      candidate_id: targetCandidateId,
      candidate_name: resolvedCandidateName,
      filename,
      mime_type: mimeType,
      document_url: body.document_url || null,
      vendor_name: body.vendor_name || null,
      vendor_contact_name: body.vendor_contact_name || null,
      vendor_contact_email: recruiterEmail || null,
      vendor_contact_phone: body.vendor_contact_phone || null,
      rtr_type: body.rtr_type,
      rtr_status: body.rtr_status,
      rtr_date: agreementDate,
      expiration_date: body.expiration_date || null,
      company_name: companyName,
      job_title: jobTitle,
      hourly_rate: body.hourly_rate || null,
      daily_rate: body.daily_rate || null,
      monthly_rate: body.monthly_rate || null,
      annual_rate: body.annual_rate || null,
      currency: body.currency,
      representation_clause: body.representation_clause || null,
      notes: body.notes || null,
      created_at: new Date().toISOString(),
    };

    const rtrTag = buildRtrMetadataTag(rtrRef);
    const finalNotes = body.notes
      ? `${body.notes}\n\n${rtrTag}`
      : `RTR Document: ${filename} (${body.rtr_status})\n\n${rtrTag}`;

    const parsedHourlyRate = body.hourly_rate
      ? parseFloat(body.hourly_rate.replace(/[^0-9.]/g, "")) || null
      : null;

    const vendorPatch = {
      vendor_company: body.vendor_name || undefined,
      vendor_contact_name: body.vendor_contact_name || undefined,
      vendor_contact_email: body.vendor_contact_email || undefined,
      vendor_contact_phone: body.vendor_contact_phone || undefined,
      submitted_rate: body.hourly_rate ? `$${body.hourly_rate}/hr` : undefined,
    };

    // 1. Write the agreement onto the application row.
    let submissionId = targetSubmissionId;
    if (submissionId) {
      const { data: existingSub } = await db
        .from("job_submissions")
        .select("id, notes")
        .eq("id", submissionId)
        .maybeSingle();

      if (!existingSub) {
        throw new CaptureError("The application this agreement belongs to no longer exists.", 404);
      }

      const cleanNotes = stripRtrMetadata(existingSub.notes as string | null);
      const updatedNotes = cleanNotes ? `${cleanNotes}\n\n${rtrTag}` : rtrTag;

      let update = await db
        .from("job_submissions")
        .update({ notes: updatedNotes, rtr_document: rtrRef, ...vendorPatch })
        .eq("id", submissionId);

      if (update.error && isMissingSchemaError(update.error)) {
        update = await db
          .from("job_submissions")
          .update({ notes: updatedNotes, ...vendorPatch })
          .eq("id", submissionId);
      }
      if (update.error) {
        throw new CaptureError(
          "The agreement could not be attached to the application. Nothing was saved.",
          500
        );
      }
    } else {
      // 2. Otherwise record the representation as its own application row.
      const rateStr = body.hourly_rate
        ? `$${body.hourly_rate}/hr`
        : body.daily_rate
        ? `$${body.daily_rate}/day`
        : body.annual_rate
        ? `$${body.annual_rate}/yr`
        : null;

      const subStatus = body.rtr_status === "signed" ? "Submitted_to_Client" : "Vendor_Screening";

      const row = {
        candidate_id: targetCandidateId,
        company_name: companyName,
        job_title: jobTitle,
        vendor_company: body.vendor_name?.trim() || null,
        vendor_contact_name: body.vendor_contact_name?.trim() || null,
        vendor_contact_email: body.vendor_contact_email?.trim() || null,
        vendor_contact_phone: body.vendor_contact_phone?.trim() || null,
        submitted_rate: rateStr,
        status: subStatus,
        submission_date: agreementDate,
        notes: finalNotes,
        rtr_document: rtrRef,
        recruiter_id: profile.role === "client" ? null : profile.id,
      };

      let insert = await db.from("job_submissions").insert(row).select("id").single();
      if (insert.error && isMissingSchemaError(insert.error)) {
        const { rtr_document: _ignored, ...safeRow } = row;
        insert = await db.from("job_submissions").insert(safeRow).select("id").single();
      }
      if (insert.error || !insert.data?.id) {
        throw new CaptureError(
          "The application for this agreement could not be saved. Nothing was recorded.",
          500
        );
      }
      submissionId = insert.data.id as string;
    }

    // 3. Store the agreement document itself.
    const warnings: string[] = [];
    if (submissionId) {
      const documentRow = {
        id: savedId,
        candidate_id: targetCandidateId,
        submission_id: submissionId,
        vendor_id: body.vendor_id || null,
        filename,
        mime_type: mimeType,
        document_url: body.document_url || null,
        base64: documentBase64,
        rtr_type: body.rtr_type,
        rtr_status: body.rtr_status,
        rtr_date: agreementDate,
        expiration_date: body.expiration_date || null,
        vendor_name: body.vendor_name || null,
        vendor_contact_name: body.vendor_contact_name || null,
        vendor_contact_email: recruiterEmail || null,
        vendor_contact_phone: body.vendor_contact_phone || null,
        hourly_rate: parsedHourlyRate,
        currency: body.currency,
        notes: body.notes || null,
        uploaded_by: profile.id,
      };

      const { error: firstError } = await db
        .from("rtr_documents")
        .upsert(
          { ...documentRow, company_name: companyName, job_title: jobTitle },
          { onConflict: "id" }
        );
      let documentError = firstError;
      if (documentError && isMissingSchemaError(documentError)) {
        // Older schema without the company_name / job_title columns.
        const retry = await db.from("rtr_documents").upsert(documentRow, { onConflict: "id" });
        documentError = retry.error;
      }

      if (documentError) {
        if (isMissingSchemaError(documentError)) {
          warnings.push(
            "The agreement document was recorded as metadata only. Apply the latest database migrations to store the file itself."
          );
        } else {
          throw new CaptureError(
            "The agreement file could not be stored. Nothing was reported as saved.",
            500
          );
        }
      }
    }

    return {
      success: true,
      id: savedId,
      submission_id: submissionId,
      candidate_id: targetCandidateId,
      submission_created: !reusedSubmission && !body.submission_id,
      submission_reused: reusedSubmission,
      warnings,
      message: "RTR document processed and saved successfully.",
    };
  });
}
