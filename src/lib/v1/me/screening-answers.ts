import { resolveV1UserId, v1ErrorResponse, type RouteDbOptions } from '@/lib/v1/auth';
import {
  getScreeningAnswers,
  upsertMergedScreeningAnswers,
  deleteScreeningAnswers,
} from '@/lib/ingest/screeninganswers';


export async function GET(request: Request, options?: RouteDbOptions) {
  try {
    const userId = await resolveV1UserId(request, options?.db);
    if (!userId) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const screening_answers = await getScreeningAnswers(userId, options?.db);
    return Response.json({ ok: true, screening_answers });
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

    const screening_answers = await upsertMergedScreeningAnswers(userId, body, options?.db);
    return Response.json({ ok: true, screening_answers });
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

    const deleted = await deleteScreeningAnswers(userId, options?.db);
    return Response.json({ ok: true, deleted });
  } catch (error) {
    return v1ErrorResponse(error);
  }
}
