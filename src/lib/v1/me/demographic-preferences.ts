import {
  getDemographicPreferences,
  upsertDemographicPreferences,
  deleteDemographicPreferences,
} from '@/lib/candidate/demographic-preferences-store';
import { cors } from '@/lib/http/cors';
import { resolveV1UserId, v1ErrorResponse, type RouteDbOptions } from '@/lib/v1/auth';


const corsOptions = { methods: 'GET, PUT, DELETE, OPTIONS', credentials: false };

export function OPTIONS(request: Request) {
  return cors(request, new Response(null, { status: 204 }), corsOptions);
}

function resolveDemographicUser(request: Request, options?: RouteDbOptions) {
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
    const userId = await resolveDemographicUser(request, options);
    if (!userId) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const demographic_preferences = await getDemographicPreferences(userId, options?.db);
    return Response.json({ ok: true, demographic_preferences });
  });
}

export async function PUT(request: Request, options?: RouteDbOptions) {
  return respond(request, async () => {
    const userId = await resolveDemographicUser(request, options);
    if (!userId) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ ok: false, error: 'Invalid JSON request body.' }, { status: 400 });
    }

    const demographic_preferences = await upsertDemographicPreferences(userId, body, options?.db);
    return Response.json({ ok: true, demographic_preferences });
  });
}

export async function DELETE(request: Request, options?: RouteDbOptions) {
  return respond(request, async () => {
    const userId = await resolveDemographicUser(request, options);
    if (!userId) {
      return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const deleted = await deleteDemographicPreferences(userId, options?.db);
    return Response.json({ ok: true, deleted });
  });
}
