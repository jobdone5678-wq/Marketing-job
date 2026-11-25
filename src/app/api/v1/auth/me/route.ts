import { profileAccess } from '@/lib/auth/profile-access';
import { cors } from '@/lib/capture/server';
import { checkDb, database } from '@/lib/db/admin';
import { resolveV1UserId, v1ErrorResponse } from '@/lib/v1/auth';

export function OPTIONS(request: Request) {
  return cors(request, new Response(null, { status: 204 }));
}

export async function GET(request: Request) {
  let response: Response;
  try {
    const id = await resolveV1UserId(request, undefined, { bearerOnly: true });
    if (!id) {
      response = Response.json({ error: 'Invalid or expired bearer token.' }, { status: 401 });
    } else {
      const { data: profile, error } = await database()
        .from('profiles')
        .select('id,email,role,status')
        .eq('id', id)
        .maybeSingle();
      checkDb(error);
      response =
        profile && profileAccess(profile)
          ? Response.json({ data: { id: profile.id, email: profile.email } })
          : Response.json({ error: 'An active candidate account is required.' }, { status: 403 });
    }
  } catch (error) {
    response = v1ErrorResponse(error);
  }
  response.headers.set('Cache-Control', 'no-store');
  return cors(request, response);
}
