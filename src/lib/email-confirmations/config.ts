import 'server-only';
import { CaptureError } from './server';

export function emailConfig() {
  const appUrl=process.env.APP_URL;
  const clientId=process.env.GOOGLE_MAIL_CLIENT_ID;
  const clientSecret=process.env.GOOGLE_MAIL_CLIENT_SECRET;
  const encryptionKey=process.env.EMAIL_TOKEN_ENCRYPTION_KEY;
  if (!appUrl || !clientId || !clientSecret || !encryptionKey || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new CaptureError('Gmail is not configured. Set the server environment variables in the email capture setup guide.',503);
  }
  const url=new URL(appUrl);
  if (url.username || url.password || !['https:','http:'].includes(url.protocol) || (url.protocol==='http:' && !['localhost','127.0.0.1'].includes(url.hostname))) {
    throw new CaptureError('APP_URL must be an HTTPS URL, or localhost during development.',503);
  }
  if(Buffer.from(encryptionKey,'base64').length!==32) throw new CaptureError('Email token encryption is not configured correctly.',503);
  return { appOrigin:url.origin,clientId,clientSecret,encryptionKey,redirectUri:`${url.origin}/api/email-connections/gmail/callback` };
}
export function gmailConfigured() { try { emailConfig(); return true; } catch { return false; } }
