import {
  resolveV1UserId,
  v1ErrorResponse,
  DomainValidationError,
  type RouteDbOptions,
} from '@/lib/v1/auth';
import {
  AUTHOR_CANDIDATE,
  listScreeningAnswerBank,
  upsertScreeningAnswerBankEntry,
  confirmScreeningAnswerBankEntry,
  deleteScreeningAnswerBankEntry,
} from '@/lib/candidate/answerbank';
import { cors } from '@/lib/http/cors';

export const runtime = 'nodejs';

const corsOptions = { methods: 'GET, POST, PUT, PATCH, DELETE, OPTIONS', credentials: false };

export function OPTIONS(request: Request) {
  return cors(request, new Response(null, { status: 204 }), corsOptions);
}

function resolveAnswerBankUser(request: Request, options?: RouteDbOptions) {
  const origin = request.headers.get('origin');
  const crossOrigin = origin !== null && origin !== new URL(request.url).origin;
  const bearerOnly = crossOrigin || request.headers.has('authorization');
  return resolveV1UserId(request, options?.db, { bearerOnly });
}

async function respond(request: Request, work: () => Promise<Response>) {
  const response = await work().catch(v1ErrorResponse);
  response.headers.set('Cache-Control', 'no-store');
  return cors(request, response, corsOptions);
}

export async function GET(request: Request, options?: RouteDbOptions) {
  return respond(request, async () => {
    const userId = await resolveAnswerBankUser(request, options);
    if (!userId) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const sendableOnly = url.searchParams.get('sendableOnly') === 'true';
    const entries = await listScreeningAnswerBank(userId, { sendableOnly, db: options?.db });
    return Response.json({ ok: true, entries });
  });
}

async function handleUpsert(request: Request, options?: RouteDbOptions) {
  const userId = await resolveAnswerBankUser(request, options);
  if (!userId) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON request body.' }, { status: 400 });
  }

  // Provenance is always derived from the authenticated candidate endpoint, never trusted from body
  const entry = await upsertScreeningAnswerBankEntry(userId, body, options?.db, AUTHOR_CANDIDATE);
  return Response.json({ ok: true, entry });
}

export async function POST(request: Request, options?: RouteDbOptions) {
  return respond(request, () => handleUpsert(request, options));
}

export async function PUT(request: Request, options?: RouteDbOptions) {
  return respond(request, () => handleUpsert(request, options));
}

export async function PATCH(request: Request, options?: RouteDbOptions) {
  return respond(request, async () => {
    const userId = await resolveAnswerBankUser(request, options);
    if (!userId) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    let body: { id?: string };
    try {
      body = (await request.json()) as { id?: string };
    } catch {
      return Response.json({ ok: false, error: 'Invalid JSON request body.' }, { status: 400 });
    }
    if (!body.id) {
      throw new DomainValidationError('id is required.');
    }

    const entry = await confirmScreeningAnswerBankEntry(userId, body.id, options?.db);
    return Response.json({ ok: true, entry });
  });
}

export async function DELETE(request: Request, options?: RouteDbOptions) {
  return respond(request, async () => {
    const userId = await resolveAnswerBankUser(request, options);
    if (!userId) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const id = url.searchParams.get('id') ?? undefined;
    const topic = url.searchParams.get('topic') ?? undefined;
    const deleted = await deleteScreeningAnswerBankEntry(userId, { id, topic }, options?.db);
    return Response.json({ ok: true, deleted });
  });
}
