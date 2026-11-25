import {
  resolveV1UserId,
  v1ErrorResponse,
  getDbClient,
  DomainValidationError,
  type RouteDbOptions,
} from '@/lib/v1/auth';
import {
  EXTRACT_STATUS_OK,
  applyOwnedBody,
  extractStructuredResume,
  getUserContacts,
  type CandidateOwned,
  type ResumeStructured,
} from '@/lib/candidate/resumeextract';
import {
  syncDerivedLocationFromResume,
  type DerivedLocation,
} from '@/lib/identity/userprofile';
import {
  buildSeedHistoryFromBank,
  importResumeToExperienceBank,
} from '@/lib/candidate/experience';
import { readResume, MAX_RESUME_BYTES } from '@/lib/resumes/validation';

export const runtime = 'nodejs';
export const maxDuration = 60;

async function persistResumeState(
  userId: string,
  params: {
    resume_object_key: string;
    resume_uploaded_at: string;
    contacts: CandidateOwned;
    resume_structured: ResumeStructured;
    derived_location: DerivedLocation;
  },
  db?: any
) {
  const client = await getDbClient(db);
  if (typeof client.query === 'function') {
    await client.query(
      `UPDATE public.profiles
       SET resume_object_key = $2,
           resume_uploaded_at = $3,
           resume_ats_analysis = NULL,
           candidate_contacts = COALESCE(NULLIF(candidate_contacts, '{}'::jsonb), $4::jsonb),
           contacts = COALESCE(NULLIF(contacts, '{}'::jsonb), $4::jsonb),
           resume_structured = $5::jsonb,
           resume_structured_model = 'deterministic-local',
           resume_structured_uploaded_at = $3,
           resume_extract_status = $6,
           resume_extract_detail = NULL,
           resume_extract_for = $3,
           full_name = COALESCE(NULLIF($7, ''), full_name),
           phone = COALESCE(NULLIF($8, ''), phone),
           updated_at = now()
       WHERE id = $1`,
      [
        userId,
        params.resume_object_key,
        params.resume_uploaded_at,
        JSON.stringify(params.contacts),
        JSON.stringify(params.resume_structured),
        EXTRACT_STATUS_OK,
        params.contacts.full_name ?? '',
        params.contacts.phone ?? '',
      ]
    );
  } else {
    const existingContacts = await getUserContacts(userId, client).catch(() => null);
    const hasExisting = Boolean(
      existingContacts &&
        (existingContacts.full_name || existingContacts.email || existingContacts.phone)
    );
    const nextOwned = hasExisting ? existingContacts : params.contacts;

    const { error } = await client
      .from('profiles')
      .update({
        resume_object_key: params.resume_object_key,
        resume_uploaded_at: params.resume_uploaded_at,
        resume_ats_analysis: null,
        candidate_contacts: nextOwned,
        contacts: nextOwned,
        resume_structured: params.resume_structured,
        resume_structured_model: 'deterministic-local',
        resume_structured_uploaded_at: params.resume_uploaded_at,
        resume_extract_status: EXTRACT_STATUS_OK,
        resume_extract_detail: null,
        resume_extract_for: params.resume_uploaded_at,
        full_name: params.contacts.full_name || undefined,
        phone: params.contacts.phone || undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);
    if (error) throw error;
  }

  await syncDerivedLocationFromResume(userId, params.derived_location, client);
}

export async function GET(request: Request, options?: RouteDbOptions) {
  try {
    const userId = await resolveV1UserId(request, options?.db);
    if (!userId) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const client = await getDbClient(options?.db);
    let row: Record<string, any> | null = null;

    if (typeof client.query === 'function') {
      const res = await client.query(
        `SELECT resume_object_key, resume_uploaded_at, resume_structured,
                resume_structured_model, resume_structured_uploaded_at,
                resume_extract_status, resume_extract_detail, resume_extract_for,
                candidate_contacts, contacts
         FROM public.profiles WHERE id = $1 LIMIT 1`,
        [userId]
      );
      row = res.rows[0] || null;
    } else {
      const { data, error } = await client
        .from('profiles')
        .select(
          'resume_object_key, resume_uploaded_at, resume_structured, resume_structured_model, resume_structured_uploaded_at, resume_extract_status, resume_extract_detail, resume_extract_for, candidate_contacts, contacts'
        )
        .eq('id', userId)
        .maybeSingle();
      if (error) throw error;
      row = data;
    }

    let download_url: string | null = null;
    if (row?.resume_object_key && client.storage?.from) {
      const { data: signed } = await client.storage
        .from('resumes')
        .createSignedUrl(row.resume_object_key, 300);
      download_url = signed?.signedUrl ?? null;
    }

    const contacts = await getUserContacts(userId, client);
    const parseStatus = row?.resume_extract_status ?? null;
    const structurePending =
      Boolean(row?.resume_object_key) &&
      (parseStatus === 'pending' || parseStatus === 'failed');

    let structured: ResumeStructured | null = (row?.resume_structured || null) as ResumeStructured | null;
    if (structured) {
      structured = applyOwnedBody(contacts, structured);
      const bankHistory = await buildSeedHistoryFromBank(userId, client).catch(() => null);
      if (bankHistory && (bankHistory.experience.length > 0 || bankHistory.projects.length > 0)) {
        structured.experience = bankHistory.experience;
        structured.projects = bankHistory.projects;
      }
    }

    return Response.json({
      ok: true,
      enabled: true,
      present: Boolean(row?.resume_object_key),
      uploaded_at: row?.resume_uploaded_at ?? null,
      structure_pending: structurePending,
      parse_status: parseStatus ?? undefined,
      parse_detail: row?.resume_extract_detail ?? undefined,
      resume_object_key: row?.resume_object_key ?? null,
      resume_uploaded_at: row?.resume_uploaded_at ?? null,
      resume_structured: structured,
      structured,
      contacts,
      download_url,
    });
  } catch (error) {
    return v1ErrorResponse(error);
  }
}

async function handleResumeUpload(request: Request, options?: RouteDbOptions) {
  const userId = await resolveV1UserId(request, options?.db);
  if (!userId) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const contentType = request.headers.get('content-type') || '';
  const objectKey = `resumes/${userId}`;
  const uploadedAt = new Date().toISOString();
  const client = await getDbClient(options?.db);

  let rawText = '';
  let fileBuffer: Buffer | null = null;
  let mimeType = 'text/plain';

  if (/multipart\/form-data/i.test(contentType)) {
    const formData = await request.formData().catch(() => null);
    if (!formData) {
      throw new DomainValidationError('Invalid multipart form upload.');
    }
    const file = formData.get('resume') || formData.get('file');
    if (!(file instanceof File) || file.size === 0 || file.size > MAX_RESUME_BYTES) {
      throw new DomainValidationError('Attach a valid PDF, DOCX, or TXT resume up to 10 MiB.');
    }
    fileBuffer = Buffer.from(await file.arrayBuffer());
    if (/\.txt$/i.test(file.name)) {
      rawText = fileBuffer.toString('utf-8');
      mimeType = 'text/plain';
    } else {
      const parsed = await readResume(fileBuffer, file.name);
      rawText = parsed.text;
      mimeType = parsed.mime;
    }
  } else {
    let body: { raw_text?: string; text?: string; filename?: string } | null = null;
    try {
      body = (await request.json()) as { raw_text?: string; text?: string; filename?: string };
    } catch {
      throw new DomainValidationError('Multipart resume file or JSON { raw_text } is required.');
    }
    rawText = String(body?.raw_text ?? body?.text ?? '').trim();
    if (rawText.length < 20) {
      throw new DomainValidationError('raw_text must contain at least 20 characters.');
    }
    fileBuffer = Buffer.from(rawText, 'utf-8');
    mimeType = 'text/plain';
  }

  if (!rawText.trim()) {
    throw new DomainValidationError('Resume contains no readable text.', 422);
  }

  if (fileBuffer && client.storage?.from) {
    const { error: uploadErr } = await client.storage
      .from('resumes')
      .upload(objectKey, fileBuffer, { contentType: mimeType, upsert: true });
    if (uploadErr) {
      throw new DomainValidationError('Failed to upload resume to object storage.', 503);
    }
  }

  const extracted = extractStructuredResume(rawText);
  await persistResumeState(
    userId,
    {
      resume_object_key: objectKey,
      resume_uploaded_at: uploadedAt,
      contacts: extracted.contacts,
      resume_structured: extracted.resume_structured,
      derived_location: extracted.derived_location,
    },
    client
  );

  const experienceImport = await importResumeToExperienceBank(
    userId,
    extracted.resume_structured,
    client,
    uploadedAt
  );

  return Response.json({
    ok: true,
    enabled: true,
    present: true,
    uploaded_at: uploadedAt,
    resume_object_key: objectKey,
    resume_uploaded_at: uploadedAt,
    contacts: extracted.contacts,
    resume_structured: extracted.resume_structured,
    structured: extracted.resume_structured,
    derived_location: extracted.derived_location,
    experience_import: experienceImport,
  });
}

export async function POST(request: Request, options?: RouteDbOptions) {
  try {
    return await handleResumeUpload(request, options);
  } catch (error) {
    return v1ErrorResponse(error);
  }
}

export async function PUT(request: Request, options?: RouteDbOptions) {
  try {
    return await handleResumeUpload(request, options);
  } catch (error) {
    return v1ErrorResponse(error);
  }
}

export async function DELETE(request: Request, options?: RouteDbOptions) {
  try {
    const userId = await resolveV1UserId(request, options?.db);
    if (!userId) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const client = await getDbClient(options?.db);
    const objectKey = `resumes/${userId}`;
    if (client.storage?.from) {
      await client.storage.from('resumes').remove([objectKey]).catch(() => {});
    }

    // Mirrors ClearUserResume (users_resume.sql): clears extract & geography, keeps candidate_contacts
    if (typeof client.query === 'function') {
      await client.query(
        `UPDATE public.profiles
         SET resume_object_key = NULL,
             resume_uploaded_at = NULL,
             resume_ats_analysis = NULL,
             resume_structured = NULL,
             resume_structured_model = NULL,
             resume_structured_uploaded_at = NULL,
             resume_countries = NULL,
             resume_regions = NULL,
             resume_cities = NULL,
             resume_extract_status = NULL,
             resume_extract_detail = NULL,
             resume_extract_for = NULL,
             updated_at = now()
         WHERE id = $1`,
        [userId]
      );
    } else {
      const { error } = await client
        .from('profiles')
        .update({
          resume_object_key: null,
          resume_uploaded_at: null,
          resume_ats_analysis: null,
          resume_structured: null,
          resume_structured_model: null,
          resume_structured_uploaded_at: null,
          resume_countries: null,
          resume_regions: null,
          resume_cities: null,
          resume_extract_status: null,
          resume_extract_detail: null,
          resume_extract_for: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);
      if (error) throw error;
    }

    return Response.json({ ok: true, deleted: true });
  } catch (error) {
    return v1ErrorResponse(error);
  }
}
