import { resolveV1UserId, v1ErrorResponse, type RouteDbOptions } from '@/lib/v1/auth';
import { deleteScreeningAnswerBankEntry } from '@/lib/candidate/answerbank';

export const runtime = 'nodejs';

export async function DELETE(
  request: Request,
  context?: { params?: Promise<{ id: string }> } & RouteDbOptions,
  options?: RouteDbOptions
) {
  const db = context?.db ?? options?.db;
  try {
    const userId = await resolveV1UserId(request, db);
    if (!userId) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
    const params = context?.params ? await context.params : undefined;
    const id = params?.id || new URL(request.url).pathname.split('/').pop() || '';
    const deleted = await deleteScreeningAnswerBankEntry(userId, { id }, db);
    return Response.json({ ok: true, deleted });
  } catch (error) {
    return v1ErrorResponse(error);
  }
}
