import { resolveV1UserId, v1ErrorResponse, type RouteDbOptions } from '@/lib/v1/auth';
import { unexcludeCompanyFromProfile } from '@/lib/identity/userprofile';

export const runtime = 'nodejs';

export async function DELETE(
  request: Request,
  context?: { params?: Promise<{ company_slug: string }> } & RouteDbOptions,
  options?: RouteDbOptions
) {
  const db = context?.db ?? options?.db;
  try {
    const userId = await resolveV1UserId(request, db);
    if (!userId) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const params = context?.params ? await context.params : { company_slug: '' };
    const slug =
      params.company_slug ||
      decodeURIComponent(new URL(request.url).pathname.split('/').pop() || '');

    const profile = await unexcludeCompanyFromProfile(userId, slug, db);
    return Response.json({ ok: true, profile });
  } catch (error) {
    return v1ErrorResponse(error);
  }
}
