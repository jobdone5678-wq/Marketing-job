import test from 'node:test';
import assert from 'node:assert/strict';

// These tests catch unsafe promotions from outreach/ambiguous mail to a confirmed application.
const load = () => import('../src/lib/email-confirmations/domain.ts');
const candidate = { id: 'candidate-1', full_name: 'Alex Example', email: 'alex@example.test' };
const receipt = {
  messageId: 'receipt-1', from: 'careers@acme.test', to: ['alex@example.test'],
  subject: 'Application received', text: 'Thank you for applying.\nCompany: Acme\nJob Title: Contract Data Engineer',
  receivedAt: '2026-10-08T10:00:00.000Z', source: 'connected_mailbox',
  senderAuthenticated: true, senderAllowed: true,
};

test('receipt with exact candidate and explicit job facts can create a confirmed record', async () => {
  const { analyzeReceipt } = await load();
  const result = analyzeReceipt(receipt, [candidate], []);
  assert.equal(result.disposition, 'auto_confirm');
  assert.equal(result.candidateId, 'candidate-1');
  assert.equal(result.company, 'Acme');
  assert.equal(result.jobTitle, 'Contract Data Engineer');
});

test('a sent vendor pitch is not an application receipt', async () => {
  const { analyzeReceipt } = await load();
  const result = analyzeReceipt({ ...receipt, direction: 'sent', text: 'Please find attached the candidate application. Company: Acme' }, [candidate], []);
  assert.equal(result.disposition, 'ignored');
});

test('an interview invitation does not become an initial application confirmation', async () => {
  const { analyzeReceipt } = await load();
  assert.equal(analyzeReceipt({ ...receipt, subject: 'Interview invitation', text: 'Please choose an interview slot.' }, [candidate], []).disposition, 'ignored');
});

test('missing job facts require review rather than fabricated company or title', async () => {
  const { analyzeReceipt } = await load();
  const result = analyzeReceipt({ ...receipt, text: 'We have received your application.' }, [candidate], []);
  assert.equal(result.disposition, 'needs_review');
  assert.equal(result.company, null);
  assert.equal(result.jobTitle, null);
});

test('a recruiter mailbox address alone cannot identify the candidate', async () => {
  const { analyzeReceipt } = await load();
  assert.equal(analyzeReceipt({ ...receipt, to: ['recruiter@example.test'] }, [candidate], []).disposition, 'needs_review');
});

test('an explicit applicant address conflicting with the recipient requires review', async () => {
  const { analyzeReceipt } = await load();
  const result=analyzeReceipt({...receipt,text:receipt.text+'\nApplicant email: somebody-else@example.test'},[candidate],[]);
  assert.equal(result.disposition,'needs_review');assert.equal(result.candidateId,null);
});

test('interview and rejection followups cannot create initial confirmations',async()=>{
  const {analyzeReceipt}=await load();
  for(const followup of ['Please choose an interview slot.','We have decided to proceed with other candidates.']) {
    const result=analyzeReceipt({...receipt,text:'Thank you for applying for the Engineer position at Acme.\n'+followup},[candidate],[]);
    assert.notEqual(result.disposition,'auto_confirm');
  }
});

test('unapproved or unauthenticated senders cannot auto-confirm', async () => {
  const { analyzeReceipt } = await load();
  assert.equal(analyzeReceipt({ ...receipt, senderAllowed: false }, [candidate], []).disposition, 'needs_review');
  assert.equal(analyzeReceipt({ ...receipt, senderAuthenticated: false }, [candidate], []).disposition, 'needs_review');
});

test('two candidates sharing an address require review', async () => {
  const { analyzeReceipt } = await load();
  assert.equal(analyzeReceipt(receipt, [candidate, { ...candidate, id: 'candidate-2' }], []).disposition, 'needs_review');
});

test('user-imported or forwarded evidence cannot auto-confirm itself', async () => {
  const { analyzeReceipt } = await load();
  assert.equal(analyzeReceipt({ ...receipt, source: 'manual_import' }, [candidate], []).disposition, 'needs_review');
  assert.equal(analyzeReceipt({ ...receipt, subject: 'Fwd: Application received' }, [candidate], []).disposition, 'needs_review');
});

test('a receipt matches a unique existing application without downgrading its pipeline status', async () => {
  const { analyzeReceipt } = await load();
  const result = analyzeReceipt(receipt, [candidate], [{ id: 'submission-1', candidate_id: candidate.id, company_name: 'Acme', job_title: 'Contract Data Engineer', status: 'Interview_Scheduled' }]);
  assert.equal(result.submissionId, 'submission-1');
  assert.equal(result.disposition, 'auto_confirm');
});

test('repeated identical job applications are ambiguous without a receipt link', async () => {
  const { analyzeReceipt } = await load();
  const sub = { candidate_id: candidate.id, company_name: 'Acme', job_title: 'Contract Data Engineer' };
  assert.equal(analyzeReceipt(receipt, [candidate], [{ ...sub, id: 'one' }, { ...sub, id: 'two' }]).disposition, 'needs_review');
});

test('company and role text in quoted outreach does not confirm an application', async () => {
  const { analyzeReceipt } = await load();
  assert.equal(analyzeReceipt({ ...receipt, subject: 'Re: Candidate introduction', text: 'Thanks for the profile.\n> Thank you for applying.\n> Company: Acme\n> Job Title: Contract Data Engineer' }, [candidate], []).disposition, 'ignored');
});

test('contradictory rejection evidence cannot be auto-confirmed', async () => {
  const { analyzeReceipt } = await load();
  assert.equal(analyzeReceipt({ ...receipt, text: receipt.text + '\nYour application was not submitted.' }, [candidate], []).disposition, 'needs_review');
});

test('late submit errors cannot downgrade a confirmed application', async () => {
  const { advanceCaptureStatus } = await load();
  assert.equal(advanceCaptureStatus('confirmed', 'failed'), 'confirmed');
  assert.equal(advanceCaptureStatus('submitted', 'submit_attempted'), 'submitted');
  assert.equal(advanceCaptureStatus('started', 'confirmed'), 'confirmed');
  assert.equal(advanceCaptureStatus('failed', 'in_progress'), 'in_progress');
});

test('common receipt subject captures the role and company without generic defaults', async () => {
  const { analyzeReceipt } = await load();
  const result = analyzeReceipt({ ...receipt, subject: 'Thank you for applying to Contract Analyst at Acme', text: 'We have received your application.' }, [candidate], []);
  assert.equal(result.company, 'Acme');
  assert.equal(result.jobTitle, 'Contract Analyst');
});

test('token encryption detects tampering and incorrect keys', async () => {
  const { encryptToken, decryptToken } = await import('../src/lib/email-confirmations/crypto.ts');
  const key = Buffer.alloc(32, 7).toString('base64');
  const encrypted = encryptToken('synthetic-refresh-token', key);
  assert.ok(!encrypted.includes('synthetic-refresh-token'));
  assert.equal(decryptToken(encrypted, key), 'synthetic-refresh-token');
  assert.throws(() => decryptToken(encrypted, Buffer.alloc(32, 8).toString('base64')));
  assert.throws(() => decryptToken(encrypted.slice(0, -4) + 'AAAA', key));
  assert.throws(() => encryptToken('x', 'not-a-valid-key'));
});
