import { resolveV1UserId, v1ErrorResponse, DomainValidationError, type RouteDbOptions } from '@/lib/v1/auth';
import { excludeCompanyFromProfile } from '@/lib/identity/userprofile';

export const runtime = 'nodejs';

export async function POST(request: Request, options?: RouteDbOptions) {
  try {
    const userId = await resolveV1UserId(request, options?.db);
    if (!userId) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    let body: { company_slug?: string };
    try {
      body = (await request.json()) as { company_slug?: string };
    } catch {
      return Response.json({ ok: false, error: 'Invalid JSON request body.' }, { status: 400 });
    }

    if (!body?.company_slug) {
      throw new DomainValidationError('company_slug must be 1-100 characters.');
    }

    const profile = await excludeCompanyFromProfile(userId, body.company_slug, options?.db);
    return Response.json({ ok: true, profile });
  } catch (error) {
    return v1ErrorResponse(error);
  }
}
