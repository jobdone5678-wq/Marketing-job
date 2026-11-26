import { resolveV1UserId, v1ErrorResponse, type RouteDbOptions } from '@/lib/v1/auth';
import { getUserContacts, saveUserContacts } from '@/lib/candidate/resumeextract';


export async function GET(request: Request, options?: RouteDbOptions) {
  try {
    const userId = await resolveV1UserId(request, options?.db);
    if (!userId) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const contacts = await getUserContacts(userId, options?.db);
    return Response.json({ ok: true, contacts });
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

    const contacts = await saveUserContacts(userId, body, options?.db);
    return Response.json({ ok: true, contacts });
  } catch (error) {
    return v1ErrorResponse(error);
  }
}
