import { z } from 'zod';
import { cors, extensionProfile, extensionRoute } from '@/lib/capture/server';
import { allowedCaptureUrl } from '@/lib/capture/validation';
import { CaptureError, checkDb, database } from '@/lib/db/admin';

export async function OPTIONS(request: Request) {
  return cors(request, new Response(null, { status: 204 }));
}

export async function POST(request: Request) {
  return extensionRoute(request, async () => {
    const actor = await extensionProfile(request);
    const { url } = z.object({ url: z.url({ protocol: /^https$/ }).max(2000) }).parse(await request.json());
    const db = database();
    let intentId: string | null = null;

    for (let offset = 0; ; offset += 200) {
      const { data, error } = await db.from('application_intents')
        .select('id,job:jobs(application_url)')
        .eq('owner_id', actor.id)
        .order('id')
        .range(offset, offset + 199);
      checkDb(error);
      for (const row of data || []) {
        const job = Array.isArray(row.job) ? row.job[0] : row.job;
        if (!job?.application_url || !allowedCaptureUrl(url, job.application_url)) continue;
        if (intentId) throw new CaptureError('Several drafts match this posting. Open it from Public Jobs to select the tracking link.', 409);
        intentId = row.id;
      }
      if (!data || data.length < 200) return { intentId };
    }
  });
}
