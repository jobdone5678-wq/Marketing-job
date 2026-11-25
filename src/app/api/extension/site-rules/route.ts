import { cors, extensionProfile, extensionRoute } from '@/lib/capture/server';
import { CaptureError } from '@/lib/db/admin';

export function OPTIONS(request: Request) {
  return cors(request, new Response(null, { status: 204 }));
}

export async function GET(request: Request) {
  const response = await extensionRoute(request, async () => {
    await extensionProfile(request);
    const configured = process.env.EXTENSION_SITE_RULES;
    if (!configured) return { schemaVersion: 1, globalMode: 'active', sites: {} };
    try {
      const rules = JSON.parse(configured);
      if (rules?.schemaVersion !== 1 || !rules.sites || typeof rules.sites !== 'object' || Array.isArray(rules.sites)) {
        throw new Error('Invalid schema');
      }
      return rules;
    } catch {
      throw new CaptureError('Extension site rules are unavailable.', 503);
    }
  });
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
