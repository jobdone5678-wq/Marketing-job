import * as http from 'node:http';
import * as https from 'node:https';
import { Readable } from 'node:stream';
import type { SafeAgentResult } from './ssrf-guard.ts';
import { ProviderError } from './provider-client';

/**
 * Checks whether the response content type or body content represents an HTML error page.
 */
export function isHtmlResponse(contentType: string, bodyText: string): boolean {
  if (contentType.includes('text/html')) {
    return true;
  }
  const trimmed = bodyText.trimStart().toLowerCase();
  if (trimmed.startsWith('<!doctype html') || trimmed.startsWith('<html')) {
    return true;
  }
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[') && trimmed.includes('<html')) {
    return true;
  }
  return false;
}

/**
 * Writes standard fetch body payload to a Node.js ClientRequest.
 */
async function writeRequestBody(req: http.ClientRequest, body: any): Promise<void> {
  if (body == null) {
    req.end();
    return;
  }
  if (typeof body === 'string') {
    req.write(body);
    req.end();
    return;
  }
  if (Buffer.isBuffer(body)) {
    req.write(body);
    req.end();
    return;
  }
  if (body instanceof Uint8Array) {
    req.write(Buffer.from(body.buffer, body.byteOffset, body.byteLength));
    req.end();
    return;
  }
  if (body instanceof ArrayBuffer) {
    req.write(Buffer.from(body));
    req.end();
    return;
  }
  if (body instanceof URLSearchParams) {
    req.write(body.toString());
    req.end();
    return;
  }
  if (typeof (body as any).pipe === 'function') {
    body.pipe(req);
    return;
  }
  if (typeof (body as any).getReader === 'function') {
    const reader = (body as any).getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        req.write(Buffer.isBuffer(value) ? value : Buffer.from(value));
      }
    }
    req.end();
    return;
  }
  if (typeof (body as any).arrayBuffer === 'function') {
    const arrayBuf = await (body as any).arrayBuffer();
    req.write(Buffer.from(arrayBuf));
    req.end();
    return;
  }
  req.write(String(body));
  req.end();
}

/**
 * Creates an SSRF-safe custom fetch dispatcher for Vercel AI SDK and backend HTTP operations.
 *
 * Requirements:
 * 1. Does NOT assign a standard Node.js HTTP/HTTPS agent directly as an Undici dispatcher
 *    (preventing TypeError: Expected instance of Dispatcher).
 * 2. If requestFn is provided (e.g. test mocks), calls it passing { ...init, agent: safeAgentResult.agent }.
 * 3. If requestFn is NOT provided (real network calls):
 *    - Adapts safeAgentResult.agent into a standard Fetch Response using Node http.request / https.request.
 *    - Connects strictly to safeAgentResult.targetIp, preserving DNS rebinding immunity.
 *    - Preserves TLS SNI hostname verification.
 *    - Enforces redirect: 'error' (throws ProviderError 308 REDIRECT_BLOCKED).
 *    - Supports init.signal for cancellation (499 ABORTED) and timeouts (504 TIMEOUT).
 * 4. HTML responses preserve upstream rate-limit and outage statuses.
 */
export function createSsrfSafeFetch(
  safeAgentResult: SafeAgentResult,
  requestFn?: typeof fetch,
): typeof fetch {
  return async function ssrfSafeFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const signal: AbortSignal | undefined =
      init?.signal ||
      (typeof input === 'object' && input && 'signal' in input
        ? (input as any).signal
        : undefined);

    // If requestFn is provided (e.g. mock fetch in unit tests)
    if (requestFn) {
      if (signal?.aborted) {
        const isTimeout =
          signal.reason?.name === 'TimeoutError' ||
          (signal.reason && /timeout/i.test(String(signal.reason)));
        if (isTimeout) {
          throw new ProviderError('Request timed out', 504, 'TIMEOUT');
        }
        throw new ProviderError('Request was aborted', 499, 'ABORTED');
      }

      const fetchInit: RequestInit & { agent?: any } = {
        ...init,
        agent: safeAgentResult.agent,
      };

      let res: Response;
      try {
        res = await requestFn(input, fetchInit);
      } catch (err: any) {
        if (err instanceof ProviderError) throw err;
        const isTimeout =
          signal?.reason?.name === 'TimeoutError' ||
          err?.name === 'TimeoutError' ||
          /timeout/i.test(String(err?.message || err));
        if (signal?.aborted || err?.name === 'AbortError' || isTimeout) {
          if (isTimeout) {
            throw new ProviderError('Request timed out', 504, 'TIMEOUT');
          }
          throw new ProviderError('Request was aborted', 499, 'ABORTED');
        }
        throw err;
      }

      // Enforce redirect: 'error'
      if (res.status >= 300 && res.status < 400) {
        throw new ProviderError('Redirects are not permitted', 308, 'REDIRECT_BLOCKED');
      }

      // Check for streaming SSE
      const contentType = (res.headers?.get?.('content-type') || '').toLowerCase();
      if (contentType.includes('text/event-stream') && res.status < 400) {
        return res;
      }

      // Inspect body for HTML error pages
      const bodyText = await res.text();
      if (isHtmlResponse(contentType, bodyText)) {
        throw new ProviderError(
          'Endpoint returned HTML error page instead of JSON',
          res.status === 429 || res.status === 503 ? res.status : 502,
          'HTML_RESPONSE',
          bodyText,
        );
      }

      return new Response(bodyText, {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
      });
    }

    // Real network call via Node http/https adapter
    return new Promise<Response>((resolve, reject) => {
      // 1. Parse URL
      let url: URL;
      try {
        if (typeof input === 'string') {
          url = new URL(input);
        } else if (input instanceof URL) {
          url = input;
        } else if (typeof input === 'object' && input && 'url' in input) {
          url = new URL((input as any).url);
        } else {
          throw new Error('Invalid URL input');
        }
      } catch (e: any) {
        return reject(new ProviderError(`Invalid request URL: ${e?.message || e}`, 400, 'INVALID_URL'));
      }

      // 2. Extract method
      let method = 'GET';
      if (init?.method) {
        method = init.method.toUpperCase();
      } else if (typeof input === 'object' && input && 'method' in input && (input as any).method) {
        method = (input as any).method.toUpperCase();
      }

      // 3. Extract headers
      const headers: Record<string, string> = {};
      if (typeof input === 'object' && input && 'headers' in input && (input as any).headers) {
        try {
          new Headers((input as any).headers).forEach((value, key) => {
            headers[key] = value;
          });
        } catch {}
      }
      if (init?.headers) {
        try {
          new Headers(init.headers).forEach((value, key) => {
            headers[key] = value;
          });
        } catch {}
      }

      if (!headers['Host'] && !headers['host']) {
        headers['Host'] = url.host || safeAgentResult.hostname;
      }

      // 4. Extract body
      let body: any = undefined;
      if (init?.body !== undefined) {
        body = init.body;
      } else if (typeof input === 'object' && input && 'body' in input) {
        body = (input as any).body;
      }

      // 5. Check signal
      if (signal?.aborted) {
        const isTimeout =
          signal.reason?.name === 'TimeoutError' ||
          (signal.reason && /timeout/i.test(String(signal.reason)));
        if (isTimeout) {
          return reject(new ProviderError('Request timed out', 504, 'TIMEOUT'));
        }
        return reject(new ProviderError('Request was aborted', 499, 'ABORTED'));
      }

      // 6. Set Content-Length header if appropriate
      const hasContentLength = Object.keys(headers).some((h) => h.toLowerCase() === 'content-length');
      if (!hasContentLength && body != null) {
        if (typeof body === 'string') {
          headers['Content-Length'] = String(Buffer.byteLength(body, 'utf-8'));
        } else if (Buffer.isBuffer(body)) {
          headers['Content-Length'] = String(body.length);
        } else if (body instanceof Uint8Array || body instanceof ArrayBuffer) {
          headers['Content-Length'] = String(body.byteLength);
        }
      }

      // 7. Choose request module
      const isHttps = url.protocol === 'https:' || safeAgentResult.protocol === 'https:';
      const requestModule = isHttps ? https : http;

      const reqOptions: http.RequestOptions = {
        protocol: isHttps ? 'https:' : 'http:',
        hostname: url.hostname,
        port: url.port ? parseInt(url.port, 10) : (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method,
        headers,
        agent: safeAgentResult.agent,
      };

      let settled = false;
      let req: http.ClientRequest;

      const safeReject = (err: any) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(err);
      };

      const safeResolve = (res: Response) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(res);
      };

      const onAbort = () => {
        const isTimeout =
          signal?.reason?.name === 'TimeoutError' ||
          (signal?.reason && /timeout/i.test(String(signal.reason)));
        if (isTimeout) {
          safeReject(new ProviderError('Request timed out', 504, 'TIMEOUT'));
        } else {
          safeReject(new ProviderError('Request was aborted', 499, 'ABORTED'));
        }
        if (req) {
          try {
            req.destroy();
          } catch {}
        }
      };

      const cleanup = () => {
        if (signal && onAbort) {
          signal.removeEventListener('abort', onAbort);
        }
      };

      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true });
      }

      try {
        req = requestModule.request(reqOptions, (res: http.IncomingMessage) => {
          const statusCode = res.statusCode || 200;

          // Enforce redirect: 'error' (301, 302, 307, 308, etc.)
          if (statusCode >= 300 && statusCode < 400) {
            res.resume();
            return safeReject(
              new ProviderError('Redirects are not permitted', 308, 'REDIRECT_BLOCKED'),
            );
          }

          const responseHeaders = new Headers();
          for (const [key, value] of Object.entries(res.headers)) {
            if (Array.isArray(value)) {
              for (const v of value) {
                responseHeaders.append(key, v);
              }
            } else if (value !== undefined) {
              responseHeaders.set(key, value);
            }
          }

          const contentType = (responseHeaders.get('content-type') || '').toLowerCase();

          // If streaming SSE and success status, wrap stream directly
          if (contentType.includes('text/event-stream') && statusCode < 400) {
            const webStream = Readable.toWeb(res) as any;
            const webResponse = new Response(webStream, {
              status: statusCode,
              statusText: res.statusMessage || '',
              headers: responseHeaders,
            });
            return safeResolve(webResponse);
          }

          // Buffer non-streaming responses
          const chunks: Buffer[] = [];
          res.on('data', (chunk) => {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          });

          res.on('end', () => {
            const responseBuffer = Buffer.concat(chunks);
            const bodyText = responseBuffer.toString('utf-8');

            if (isHtmlResponse(contentType, bodyText)) {
              return safeReject(
                new ProviderError(
                  'Endpoint returned HTML error page instead of JSON',
                  statusCode === 429 || statusCode === 503 ? statusCode : 502,
                  'HTML_RESPONSE',
                  bodyText,
                ),
              );
            }

            const webResponse = new Response(responseBuffer, {
              status: statusCode,
              statusText: res.statusMessage || '',
              headers: responseHeaders,
            });

            safeResolve(webResponse);
          });

          res.on('error', (err) => {
            safeReject(new ProviderError(`Response stream error: ${err.message}`, 500, 'RESPONSE_ERROR'));
          });
        });

        req.on('error', (err: any) => {
          if (signal?.aborted) {
            const isTimeout =
              signal.reason?.name === 'TimeoutError' ||
              (signal.reason && /timeout/i.test(String(signal.reason)));
            if (isTimeout) {
              return safeReject(new ProviderError('Request timed out', 504, 'TIMEOUT'));
            }
            return safeReject(new ProviderError('Request was aborted', 499, 'ABORTED'));
          }
          safeReject(new ProviderError(`Network request failed: ${err.message}`, 500, 'NETWORK_ERROR'));
        });

        // Write body and finish request
        writeRequestBody(req, body).catch((err) => {
          safeReject(new ProviderError(`Failed to write request body: ${err.message}`, 500, 'REQUEST_BODY_ERROR'));
        });
      } catch (err: any) {
        safeReject(new ProviderError(`Failed to initiate request: ${err.message}`, 500, 'REQUEST_INIT_ERROR'));
      }
    });
  };
}
