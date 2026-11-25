export function cors(
  request: Request,
  response: Response,
  { methods = 'GET, POST, OPTIONS, DELETE', credentials = true } = {}
) {
  const origin = request.headers.get('origin');
  if (!origin) return response;

  const allowedExtensionIds = process.env.ALLOWED_EXTENSION_IDS
    ? process.env.ALLOWED_EXTENSION_IDS.split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : null;

  let isAllowed = false;
  if (origin.startsWith('chrome-extension://')) {
    const extId = origin.replace('chrome-extension://', '').replace(/\/.*$/, '');
    if (allowedExtensionIds && allowedExtensionIds.length > 0) {
      isAllowed = allowedExtensionIds.includes(extId);
    } else {
      // Validate well-formed 32-character Chrome extension ID
      isAllowed = /^[a-p]{32}$/i.test(extId);
    }
  } else {
    try {
      const u = new URL(origin);
      if (
        (u.protocol === 'http:' || u.protocol === 'https:') &&
        (u.hostname === 'localhost' || u.hostname === '127.0.0.1')
      ) {
        isAllowed = true;
      } else if (
        u.protocol === 'https:' &&
        (u.hostname === 'nextkinhr.com' ||
          u.hostname.endsWith('.nextkinhr.com') ||
          u.hostname.endsWith('.vercel.app'))
      ) {
        isAllowed = true;
      }
    } catch {}
  }

  if (isAllowed) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Vary', 'Origin');
    response.headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    response.headers.set('Access-Control-Allow-Methods', methods);
    if (credentials) response.headers.set('Access-Control-Allow-Credentials', 'true');
  }
  return response;
}
