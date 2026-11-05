type RateLimitOptions = {
  windowMs: number;
  max: number;
};

const trackers = new Map<string, { count: number; resetAt: number }>();

// Periodic cleanup of expired entries
if (typeof setInterval !== 'undefined') {
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, value] of trackers.entries()) {
      if (value.resetAt <= now) {
        trackers.delete(key);
      }
    }
  }, 60000);
  timer.unref?.();
}

export function checkRateLimit(
  identifier: string,
  options: RateLimitOptions = { windowMs: 60000, max: 30 }
): { allowed: boolean; remaining: number; resetInMs: number } {
  const now = Date.now();
  const entry = trackers.get(identifier);

  if (!entry || entry.resetAt <= now) {
    trackers.set(identifier, { count: 1, resetAt: now + options.windowMs });
    return { allowed: true, remaining: options.max - 1, resetInMs: options.windowMs };
  }

  if (entry.count >= options.max) {
    return { allowed: false, remaining: 0, resetInMs: Math.max(0, entry.resetAt - now) };
  }

  entry.count += 1;
  return { allowed: true, remaining: options.max - entry.count, resetInMs: Math.max(0, entry.resetAt - now) };
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return request.headers.get('x-real-ip') || '127.0.0.1';
}
