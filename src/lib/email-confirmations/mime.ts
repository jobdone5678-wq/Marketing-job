import { createHash } from 'node:crypto';
import { simpleParser } from 'mailparser';
import type { ReceivedEmail } from './types';

export async function parseImportedReceipt(raw: Buffer): Promise<ReceivedEmail> {
  if (raw.length > 2 * 1024 * 1024) throw new Error('Receipt files must be smaller than 2 MiB.');
  const parsed = await simpleParser(raw, { skipHtmlToText: false, skipTextToHtml: true, skipImageLinks: true });
  const text = (parsed.text || '').trim();
  if (!parsed.subject || !text) throw new Error('This .eml file must include a subject and readable message text.');
  const receivedAt = parsed.date && !Number.isNaN(parsed.date.getTime()) && parsed.date.getTime() <= Date.now() + 86400000
    ? parsed.date.toISOString() : new Date().toISOString();
  const to = (Array.isArray(parsed.to) ? parsed.to : parsed.to ? [parsed.to] : [])
    .flatMap((entry) => entry.value.map((address) => address.address || '')).filter(Boolean);
  return { messageId: createHash('sha256').update(raw).digest('hex'), from: parsed.from?.text || 'Unknown sender',
    to, subject: parsed.subject, text: text.slice(0, 50000), receivedAt, source: 'manual_import' };
}
