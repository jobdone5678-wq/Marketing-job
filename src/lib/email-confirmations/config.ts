import 'server-only';
import { CaptureError } from './server';

export function emailConfig() {
  let appUrl = process.env.APP_URL;
  if (!appUrl && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    appUrl = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  } else if (!appUrl && process.env.VERCEL_URL) {
    appUrl = `https://${process.env.VERCEL_URL}`;
  }
  if (appUrl && !appUrl.startsWith('http://') && !appUrl.startsWith('https://')) {
    appUrl = `https://${appUrl}`;
  }

  const clientId = process.env.GOOGLE_MAIL_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_MAIL_CLIENT_SECRET;
  const encryptionKey = process.env.EMAIL_TOKEN_ENCRYPTION_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const missing: string[] = [];
  if (!appUrl) missing.push('APP_URL');
  if (!clientId) missing.push('GOOGLE_MAIL_CLIENT_ID');
  if (!clientSecret) missing.push('GOOGLE_MAIL_CLIENT_SECRET');
  if (!encryptionKey) missing.push('EMAIL_TOKEN_ENCRYPTION_KEY');
  if (!serviceKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');

  if (missing.length > 0) {
    console.warn(`[emailConfig] Gmail capture disabled: missing environment variables [${missing.join(', ')}]`);
    throw new CaptureError(`Gmail is not configured. Missing environment variables: ${missing.join(', ')}`, 503);
  }

  const url = new URL(appUrl!);
  if (url.username || url.password || !['https:', 'http:'].includes(url.protocol) || (url.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(url.hostname))) {
    throw new CaptureError('APP_URL must be an HTTPS URL, or localhost during development.', 503);
  }
  if (Buffer.from(encryptionKey!, 'base64').length !== 32) throw new CaptureError('Email token encryption is not configured correctly.', 503);
  return { appOrigin: url.origin, clientId: clientId!, clientSecret: clientSecret!, encryptionKey: encryptionKey!, redirectUri: `${url.origin}/api/email-connections/gmail/callback` };
}
export function gmailConfigured() { try { emailConfig(); return true; } catch { return false; } }
