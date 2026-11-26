import { resolveV1UserId, v1ErrorResponse, type RouteDbOptions } from '@/lib/v1/auth';
import { deleteEmployment, updateEmployment } from '@/lib/candidate/experience';


function extractId(request: Request, params?: { id?: string }): string {
  return params?.id || new URL(request.url).pathname.split('/').pop() || '';
}

export async function PUT(
  request: Request,
  context?: { params?: Promise<{ id: string }> } & RouteDbOptions,
  options?: RouteDbOptions
) {
  const db = context?.db ?? options?.db;
  try {
    const userId = await resolveV1UserId(request, db);
    if (!userId) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const params = context?.params ? await context.params : undefined;
    const id = extractId(request, params);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return Response.json({ ok: false, error: 'Invalid JSON request body.' }, { status: 400 });
    }
    const updated = await updateEmployment(userId, id, body, db);
    return Response.json({ ok: true, data: updated });
  } catch (error) {
    return v1ErrorResponse(error);
  }
}

export async function DELETE(
  request: Request,
  context?: { params?: Promise<{ id: string }> } & RouteDbOptions,
  options?: RouteDbOptions
) {
  const db = context?.db ?? options?.db;
  try {
    const userId = await resolveV1UserId(request, db);
    if (!userId) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const params = context?.params ? await context.params : undefined;
    const id = extractId(request, params);
    await deleteEmployment(userId, id, db);
    return new Response(null, { status: 204 });
  } catch (error) {
    return v1ErrorResponse(error);
  }
}
