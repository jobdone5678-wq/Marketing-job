import 'server-only';
import { CaptureError } from './server';

function readConfiguration() {
  const value = (name: string) => process.env[name]?.trim() || '';
  const appUrl = value('APP_URL') || value('VERCEL_PROJECT_PRODUCTION_URL') || value('VERCEL_URL');
  const clientId = value('GOOGLE_MAIL_CLIENT_ID');
  const clientSecret = value('GOOGLE_MAIL_CLIENT_SECRET');
  const encryptionKey = value('EMAIL_TOKEN_ENCRYPTION_KEY');
  const serviceKey = value('SUPABASE_SERVICE_ROLE_KEY');
  const missing = Object.entries({ APP_URL: appUrl, GOOGLE_MAIL_CLIENT_ID: clientId, GOOGLE_MAIL_CLIENT_SECRET: clientSecret,
    EMAIL_TOKEN_ENCRYPTION_KEY: encryptionKey, SUPABASE_SERVICE_ROLE_KEY: serviceKey })
    .filter(([, configured]) => !configured).map(([name]) => name);
  const invalid: string[] = [];
  let appOrigin: string | null = null;
  if (appUrl) {
    try {
      const url = new URL(appUrl.includes('://') ? appUrl : `https://${appUrl}`);
      if (url.username || url.password || !['https:', 'http:'].includes(url.protocol) ||
        (url.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error();
      appOrigin = url.origin;
    } catch {
      invalid.push('APP_URL must be a valid HTTPS URL (HTTP is allowed only for localhost).');
    }
  }
  if (encryptionKey && (!/^[A-Za-z0-9+/]{43}=$/.test(encryptionKey) || Buffer.from(encryptionKey, 'base64').length !== 32)) {
    invalid.push('EMAIL_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
  }
  return { missing, invalid, appOrigin, clientId, clientSecret, encryptionKey };
}

/** Safe to expose to administrators: never includes credentials or unvalidated URL input. */
export function gmailConfiguration() {
  const { missing, invalid, appOrigin } = readConfiguration();
  return { configured: missing.length === 0 && invalid.length === 0, missing, invalid,
    appOrigin, redirectUri: appOrigin ? `${appOrigin}/api/email-connections/gmail/callback` : null };
}

export function emailConfig() {
  const { missing, invalid, appOrigin, clientId, clientSecret, encryptionKey } = readConfiguration();
  if (missing.length || invalid.length || !appOrigin) {
    throw new CaptureError('Gmail is not configured. Ask your administrator to check email capture setup on this deployment.', 503);
  }
  return { appOrigin, clientId, clientSecret, encryptionKey, redirectUri: `${appOrigin}/api/email-connections/gmail/callback` };
}
export function gmailConfigured() { return gmailConfiguration().configured; }
