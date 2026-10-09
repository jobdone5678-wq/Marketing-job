import test from 'node:test';
import assert from 'node:assert/strict';
const load=()=>import('../src/lib/email-confirmations/mime.ts');
const raw=Buffer.from('From: careers@acme.test\r\nTo: alex@example.test\r\nSubject: Application received\r\nDate: Thu, 8 Oct 2026 10:00:00 +0000\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nThank you for applying.\r\nCompany: Acme\r\nJob Title: Contract Engineer\r\n');
test('a real MIME receipt decodes into user-imported review evidence',async()=>{
  const {parseImportedReceipt}=await load();const mail=await parseImportedReceipt(raw);
  assert.equal(mail.source,'manual_import');assert.equal(mail.subject,'Application received');assert.deepEqual(mail.to,['alex@example.test']);
  assert.ok(mail.text.includes('Contract Engineer'));assert.equal(mail.receivedAt,'2026-10-08T10:00:00.000Z');
});
test('oversized and unreadable emails are rejected before receipt ingestion',async()=>{
  const {parseImportedReceipt}=await load();
  await assert.rejects(parseImportedReceipt(Buffer.alloc(2*1024*1024+1)),/2 MiB/);
  await assert.rejects(parseImportedReceipt(Buffer.from('Subject: Receipt\r\n\r\n')),/readable/);
});
