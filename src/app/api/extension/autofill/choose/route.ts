import { cors } from '@/lib/capture/server';
import { extensionResumeActor } from '@/lib/extension-answers/candidate-context';
import { checkRateLimit } from '@/lib/rate-limit';
import {
  executeChoose,
  OrchestratorError,
  type ChooseApiRequest,
} from '@/lib/ai/autofill-orchestrator';
import { redactSensitiveText } from '@/lib/ai/provider-client';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function OPTIONS(request: Request) {
  return cors(request, new Response(null, { status: 204 }));
}

export async function POST(request: Request) {
  try {
    const actor = await extensionResumeActor(request);

    const limit = checkRateLimit(`autofill-choose:${actor.id}`, { windowMs: 60000, max: 60 });
    if (!limit.allowed) {
      return cors(
        request,
        Response.json(
          { ok: false, error: 'Rate limit exceeded. Please wait a moment.', code: 'RATE_LIMITED' },
          { status: 429 }
        )
      );
    }

    let body: ChooseApiRequest;
    try {
      body = (await request.json()) as ChooseApiRequest;
    } catch {
      return cors(
        request,
        Response.json({ ok: false, error: 'Invalid JSON body', code: 'BAD_REQUEST' }, { status: 400 })
      );
    }

    const result = await executeChoose(body, actor.id, {
      signal: request.signal,
      globalDeadlineMs: 50_000,
    });
    return cors(request, Response.json(result, { status: 200 }));
  } catch (err: any) {
    if (err instanceof OrchestratorError) {
      return cors(
        request,
        Response.json(
          { ok: false, error: redactSensitiveText(err.message), code: err.code },
          { status: err.status }
        )
      );
    }
    const status = typeof err?.status === 'number' ? err.status : 500;
    const message = redactSensitiveText(err?.message || 'The autofill choose request could not be completed.');
    const code = typeof err?.code === 'string' ? err.code : undefined;
    return cors(request, Response.json({ ok: false, error: message, ...(code ? { code } : {}) }, { status }));
  }
}
