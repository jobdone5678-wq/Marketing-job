const receiptEndpoint = 'https://www.nextkinhr.com/api/webhooks/application-submitted';
const maxBodyBytes = 2 * 1024 * 1024;
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
};

async function readReceipt(request) {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBodyBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function handleApplicationReceipt(request, forward = fetch) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  const fail = (error, status) => Response.json({ error }, { status, headers });
  if (request.method !== 'POST') return fail('Method not allowed.', 405);
  const authorization = request.headers.get('authorization') ?? '';
  // The portal authenticates this opaque pairing token, verifies candidate ownership,
  // and performs the atomic write before acknowledging the receipt.
  if (!/^Bearer [A-Za-z0-9_-]{20,128}$/.test(authorization)) {
    return fail('A paired extension credential is required.', 401);
  }
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) {
    return fail('Expected a JSON application receipt.', 415);
  }
  if (Number(request.headers.get('content-length')) > maxBodyBytes) {
    return fail('Application receipt is too large.', 413);
  }

  try {
    const body = await readReceipt(request);
    if (!body) return fail('Application receipt is too large.', 413);
    if (!body.byteLength) return fail('Expected a JSON application receipt.', 400);
    const result = await forward(receiptEndpoint, {
      method: 'POST',
      headers: { Authorization: authorization, 'Content-Type': 'application/json' },
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    });
    if (!result.headers.get('content-type')?.includes('application/json')) {
      return fail('Application receipt service is unavailable.', 502);
    }
    return new Response(result.body, {
      status: result.status,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  } catch {
    return fail('Application receipt service is unavailable.', 502);
  }
}

if (typeof Deno !== 'undefined') Deno.serve((request) => handleApplicationReceipt(request));
