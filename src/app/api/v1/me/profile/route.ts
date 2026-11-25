import {
  resolveV1UserId,
  v1ErrorResponse,
  getDbClient,
  type RouteDbOptions,
} from '@/lib/v1/auth';
import {
  getDerivedLocationFromUser,
  getUserProfile,
  upsertUserProfile,
  deleteUserProfile,
} from '@/lib/identity/userprofile';
import {
  applyOwnedBody,
  toContactFreeProfessionalView,
  type CandidateOwned,
  type ResumeProfessional,
} from '@/lib/candidate/resumeextract';
import { buildSeedHistoryFromBank } from '@/lib/candidate/experience';

export const runtime = 'nodejs';

async function getContactFreeCV(
  userId: string,
  db?: any
): Promise<ResumeProfessional | null> {
  const client = await getDbClient(db);
  let row: Record<string, any> | null = null;
  if (typeof client.query === 'function') {
    const res = await client.query(
      `SELECT resume_structured, resume_structured_uploaded_at, resume_uploaded_at, candidate_contacts, contacts
       FROM public.profiles WHERE id = $1 LIMIT 1`,
      [userId]
    );
    row = res.rows[0] || null;
  } else {
    const { data, error } = await client
      .from('profiles')
      .select(
        'resume_structured, resume_structured_uploaded_at, resume_uploaded_at, candidate_contacts, contacts'
      )
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    row = data;
  }

  let structured = (row?.resume_structured || {}) as Record<string, any>;
  if (
    row?.resume_uploaded_at &&
    row?.resume_structured_uploaded_at &&
    new Date(row.resume_uploaded_at).getTime() !==
      new Date(row.resume_structured_uploaded_at).getTime()
  ) {
    structured = {};
  }

  const owned = (row?.candidate_contacts || row?.contacts || null) as CandidateOwned | null;
  const composed = owned ? applyOwnedBody(owned, structured as any) : (structured as any);
  const professional = toContactFreeProfessionalView(composed);
  const { experience } = await buildSeedHistoryFromBank(userId, client).catch(() => ({
    experience: [],
  }));

  if (!professional && experience.length === 0) return null;
  return {
    ...(professional || {}),
    experience,
  };
}

export async function GET(request: Request, options?: RouteDbOptions) {
  try {
    const userId = await resolveV1UserId(request, options?.db);
    if (!userId) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const [profile, cv, derived_location] = await Promise.all([
      getUserProfile(userId, options?.db),
      getContactFreeCV(userId, options?.db),
      getDerivedLocationFromUser(userId, options?.db),
    ]);

    return Response.json({
      ok: true,
      profile: profile ? { ...profile, derived_location, cv } : null,
      cv,
      derived_location,
    });
  } catch (error) {
    return v1ErrorResponse(error);
  }
}

export async function PUT(request: Request, options?: RouteDbOptions) {
  try {
    const userId = await resolveV1UserId(request, options?.db);
    if (!userId) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ ok: false, error: 'Invalid JSON request body.' }, { status: 400 });
    }

    const { profile, ignored_fields } = await upsertUserProfile(userId, body, options?.db);
    const [cv, derived_location] = await Promise.all([
      getContactFreeCV(userId, options?.db),
      getDerivedLocationFromUser(userId, options?.db),
    ]);

    return Response.json({
      ok: true,
      profile: { ...profile, derived_location, cv },
      cv,
      derived_location,
      ...(ignored_fields ? { meta: { ignored_fields } } : {}),
    });
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

    const deleted = await deleteUserProfile(userId, options?.db);
    return Response.json({ ok: true, deleted });
  } catch (error) {
    return v1ErrorResponse(error);
  }
}
