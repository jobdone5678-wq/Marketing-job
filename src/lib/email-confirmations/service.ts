import 'server-only';
import { parseImportedReceipt } from './mime';
import { analyzeReceipt } from './domain';
import type { ReceivedEmail, ReceiptAnalysis } from './types';
import { adminClient, CaptureError, checkDb } from './server';
import { readAllRows } from './pagination';

export async function importEmailReceipt(ownerId: string, raw: Buffer) {
  let message: ReceivedEmail;
  try { message = await parseImportedReceipt(raw); }
  catch { throw new CaptureError('Upload a readable .eml receipt smaller than 2 MiB.'); }
  return ingestEmailReceipt(ownerId, null, `manual:${message.messageId}`, message);
}

export async function ingestEmailReceipt(ownerId: string, connectionId: string | null, messageKey: string, message: ReceivedEmail, lease?:string) {
  const db = adminClient();
  const { data: already, error: lookupError } = await db.from('email_receipts').select('id,disposition').eq('owner_id', ownerId).eq('message_key', messageKey).maybeSingle();
  checkDb(lookupError);
  if (already) return { id: already.id as string, disposition: already.disposition as string, duplicate: true };
  const [candidates, applications] = await Promise.all([
    readAllRows(async (from,to) => { const {data,error}=await db.from('candidates').select('id,full_name,email').order('id').range(from,to); checkDb(error);return data || []; }),
    readAllRows(async (from,to) => { const {data,error}=await db.from('job_submissions').select('id,candidate_id,company_name,job_title,status,submission_date').order('id').range(from,to);checkDb(error);return data || []; }),
  ]);
  const analysis = analyzeReceipt(message, candidates || [], applications || []);
  if (analysis.disposition === 'ignored') return { id: null, disposition: 'ignored', duplicate: false };
  const payload = { owner_id: ownerId, connection_id: connectionId, message_key: messageKey,
    source: message.source, sender: message.from.slice(0, 500), recipients: message.to, subject: message.subject.slice(0, 500),
    received_at: message.receivedAt, body_text: message.text.slice(0, 50000), disposition: 'needs_review',
    extracted_company: analysis.company, extracted_job_title: analysis.jobTitle, candidate_id: analysis.candidateId,
    submission_id: analysis.submissionId, review_reason: analysis.reason };
  if(connectionId) {
    if(!lease) throw new CaptureError('An active mailbox lease is required.',409);
    const {data,error}=await db.rpc('ingest_mailbox_receipt',{p_owner:ownerId,p_connection:connectionId,p_lease:lease,p_key:messageKey,
      p_payload:payload,p_confirm:analysis.disposition==='auto_confirm'});
    checkDb(error);
    const result=(data as {id:string;disposition:string;duplicate:boolean}[]|null)?.[0];
    if(!result) throw new CaptureError('Receipt could not be saved.',500);
    return result;
  }
  const { data: saved, error } = await db.from('email_receipts').insert(payload).select('id').single();
  if (error?.code === '23505') {
    const { data: existing, error: existingError } = await db.from('email_receipts').select('id,disposition').eq('owner_id',ownerId).eq('message_key',messageKey).single();
    checkDb(existingError);
    return { id: existing?.id as string, disposition: existing?.disposition as string, duplicate: true };
  }
  checkDb(error);
  if (!saved) throw new CaptureError('Receipt could not be saved.', 500);
  if (analysis.disposition === 'auto_confirm') {
    try { await confirmReceipt(ownerId, saved.id, analysis, false); }
    catch {
      // A concurrent ambiguous match must remain visible and retryable, not disappear from the sync.
      const { error: reviewError } = await db.from('email_receipts').update({ review_reason: 'Automatic linking could not complete. Review and select the application.' }).eq('id',saved.id).eq('owner_id',ownerId);
      checkDb(reviewError);
      return { id: saved.id as string, disposition: 'needs_review', duplicate: false };
    }
  }
  return { id: saved.id as string, disposition: analysis.disposition === 'auto_confirm' ? 'confirmed' : 'needs_review', duplicate: false };
}

export async function confirmReceipt(ownerId: string, receiptId: string, details: Pick<ReceiptAnalysis,'candidateId'|'company'|'jobTitle'|'submissionId'>, manual = true) {
  const { data, error } = await adminClient().rpc('confirm_email_receipt', { p_owner: ownerId, p_receipt: receiptId,
    p_candidate: details.candidateId, p_company: details.company, p_title: details.jobTitle, p_submission: details.submissionId, p_manual: manual });
  if (error) {
    if (error.message.includes('Multiple applications') || error.message.includes('does not match')) throw new CaptureError('Select the matching existing application before confirming.', 409);
    checkDb(error);
  }
  return data as string;
}
