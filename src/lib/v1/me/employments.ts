import { resolveV1UserId, v1ErrorResponse, type RouteDbOptions } from '@/lib/v1/auth';
import { createEmployment } from '@/lib/candidate/experience';


export async function POST(request: Request, options?: RouteDbOptions) {
  try {
    const userId = await resolveV1UserId(request, options?.db);
    if (!userId) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return Response.json({ ok: false, error: 'Invalid JSON request body.' }, { status: 400 });
    }
    const employment = await createEmployment(userId, body, options?.db);
    return Response.json({ ok: true, data: employment }, { status: 201 });
  } catch (error) {
    return v1ErrorResponse(error);
  }
}
