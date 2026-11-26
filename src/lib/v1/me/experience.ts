import {
  resolveV1UserId,
  v1ErrorResponse,
  DomainValidationError,
  type RouteDbOptions,
} from '@/lib/v1/auth';
import {
  listExperienceBank,
  createEmployment,
  addAtom,
  confirmEvidenceAtom,
  deleteAtom,
  deleteEmployment,
  mergeAtoms,
} from '@/lib/candidate/experience';


export async function GET(request: Request, options?: RouteDbOptions) {
  try {
    const userId = await resolveV1UserId(request, options?.db);
    if (!userId) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const tailorableOnly = url.searchParams.get('tailorableOnly') === 'true';

    const data = await listExperienceBank(userId, {
      tailorableOnly,
      db: options?.db,
    });

    return Response.json({ ok: true, ...data });
  } catch (error) {
    return v1ErrorResponse(error);
  }
}

export async function POST(request: Request, options?: RouteDbOptions) {
  try {
    const userId = await resolveV1UserId(request, options?.db);
    if (!userId) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return Response.json({ ok: false, error: 'Invalid JSON request body.' }, { status: 400 });
    }

    if (body.type === 'atom' || 'employment_id' in body || 'claim' in body) {
      const result = await addAtom(userId, body, 'manual', options?.db);
      return Response.json({ ok: true, ...result }, { status: result.deduplicated ? 200 : 201 });
    }

    const employment = await createEmployment(userId, body, options?.db);
    return Response.json({ ok: true, employment }, { status: 201 });
  } catch (error) {
    return v1ErrorResponse(error);
  }
}

export async function PATCH(request: Request, options?: RouteDbOptions) {
  try {
    const userId = await resolveV1UserId(request, options?.db);
    if (!userId) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    let body: { action?: string; type?: 'employment' | 'atom'; id?: string; ids?: string[] };
    try {
      body = (await request.json()) as {
        action?: string;
        type?: 'employment' | 'atom';
        id?: string;
        ids?: string[];
      };
    } catch {
      return Response.json({ ok: false, error: 'Invalid JSON request body.' }, { status: 400 });
    }

    if (body.action === 'merge') {
      const ids = body.ids || [];
      if (ids.length !== 2) {
        throw new DomainValidationError('experience: merge needs exactly two different atom ids');
      }
      const atom = await mergeAtoms(userId, ids[0], ids[1], options?.db);
      return Response.json({ ok: true, atom });
    }

    if (!body.id) {
      throw new DomainValidationError('id is required.');
    }

    if (body.action === 'confirm') {
      const atom = await confirmEvidenceAtom(userId, body.id, options?.db);
      return Response.json({ ok: true, atom });
    }

    if (body.action === 'delete') {
      if (body.type === 'employment') {
        await deleteEmployment(userId, body.id, options?.db);
      } else {
        await deleteAtom(userId, body.id, options?.db);
      }
      return Response.json({ ok: true, deleted: true, id: body.id });
    }

    throw new DomainValidationError('action must be "confirm", "merge", or "delete".');
  } catch (error) {
    return v1ErrorResponse(error);
  }
}
