import {
  resolveV1UserId,
  v1ErrorResponse,
  getDbClient,
  DomainValidationError,
  type RouteDbOptions,
} from '@/lib/v1/auth';

export const runtime = 'nodejs';

const MAX_PHOTO_BYTES = 8 << 20; // 8 MiB matching Freehire handler/photo.go
const ALLOWED_PHOTO_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

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
        `SELECT photo_object_key, photo_uploaded_at FROM public.profiles WHERE id = $1 LIMIT 1`,
        [userId]
      );
      row = res.rows[0] || null;
    } else {
      const { data, error } = await client
        .from('profiles')
        .select('photo_object_key, photo_uploaded_at')
        .eq('id', userId)
        .maybeSingle();
      if (error) throw error;
      row = data;
    }

    let photo_url: string | null = null;
    if (row?.photo_object_key && client.storage?.from) {
      const { data: signed } = await client.storage
        .from('photos')
        .createSignedUrl(row.photo_object_key, 300);
      photo_url = signed?.signedUrl ?? null;
    }

    return Response.json({
      ok: true,
      enabled: true,
      present: Boolean(row?.photo_object_key),
      photo_object_key: row?.photo_object_key ?? null,
      uploaded_at: row?.photo_uploaded_at ?? null,
      photo_uploaded_at: row?.photo_uploaded_at ?? null,
      photo_url,
    });
  } catch (error) {
    return v1ErrorResponse(error);
  }
}

async function handlePhotoUpload(request: Request, options?: RouteDbOptions) {
  const userId = await resolveV1UserId(request, options?.db);
  if (!userId) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    throw new DomainValidationError('Multipart form data with a photo file is required.');
  }
  const file = formData.get('photo') || formData.get('file');
  if (!(file instanceof File) || file.size === 0 || file.size > MAX_PHOTO_BYTES) {
    throw new DomainValidationError('Attach a JPEG, PNG, or WebP headshot up to 8 MiB.');
  }
  if (!ALLOWED_PHOTO_MIMES.has(file.type)) {
    throw new DomainValidationError('the file is not a supported image (JPEG, PNG, or WebP)');
  }

  const objectKey = `photos/${userId}`;
  const uploadedAt = new Date().toISOString();
  const buffer = Buffer.from(await file.arrayBuffer());
  const client = await getDbClient(options?.db);

  if (client.storage?.from) {
    const { error: uploadErr } = await client.storage
      .from('photos')
      .upload(objectKey, buffer, { contentType: file.type, upsert: true });
    if (uploadErr) {
      throw new DomainValidationError('Failed to store headshot photo.', 503);
    }
  }

  if (typeof client.query === 'function') {
    await client.query(
      `UPDATE public.profiles SET photo_object_key = $2, photo_uploaded_at = $3, updated_at = now() WHERE id = $1`,
      [userId, objectKey, uploadedAt]
    );
  } else {
    const { error } = await client
      .from('profiles')
      .update({
        photo_object_key: objectKey,
        photo_uploaded_at: uploadedAt,
        updated_at: uploadedAt,
      })
      .eq('id', userId);
    if (error) throw error;
  }

  return Response.json({
    ok: true,
    enabled: true,
    present: true,
    photo_object_key: objectKey,
    uploaded_at: uploadedAt,
    photo_uploaded_at: uploadedAt,
  });
}

export async function POST(request: Request, options?: RouteDbOptions) {
  try {
    return await handlePhotoUpload(request, options);
  } catch (error) {
    return v1ErrorResponse(error);
  }
}

export async function PUT(request: Request, options?: RouteDbOptions) {
  try {
    return await handlePhotoUpload(request, options);
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
    const objectKey = `photos/${userId}`;
    if (client.storage?.from) {
      await client.storage.from('photos').remove([objectKey]).catch(() => {});
    }

    if (typeof client.query === 'function') {
      await client.query(
        `UPDATE public.profiles SET photo_object_key = NULL, photo_uploaded_at = NULL, updated_at = now() WHERE id = $1`,
        [userId]
      );
    } else {
      const { error } = await client
        .from('profiles')
        .update({
          photo_object_key: null,
          photo_uploaded_at: null,
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
