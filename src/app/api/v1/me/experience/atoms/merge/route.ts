import { resolveV1UserId, v1ErrorResponse, DomainValidationError, type RouteDbOptions } from '@/lib/v1/auth';
import { mergeAtoms } from '@/lib/candidate/experience';

export const runtime = 'nodejs';

export async function POST(request: Request, options?: RouteDbOptions) {
  try {
    const userId = await resolveV1UserId(request, options?.db);
    if (!userId) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
    const body = (await request.json().catch(() => null)) as { ids?: string[] } | null;
    if (!body || !Array.isArray(body.ids) || body.ids.length !== 2) {
      throw new DomainValidationError('experience: merge needs exactly two different atom ids');
    }
    const kept = await mergeAtoms(userId, body.ids[0], body.ids[1], options?.db);
    return Response.json({ ok: true, data: kept });
  } catch (error) {
    return v1ErrorResponse(error);
  }
}
