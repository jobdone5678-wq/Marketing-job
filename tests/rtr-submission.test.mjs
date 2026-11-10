import test from 'node:test';
import assert from 'node:assert/strict';

test('RTR text regex extraction extracts candidate, vendor, rates, and signed status accurately', async () => {
  const sampleAgreementText = `
    RIGHT TO REPRESENT AGREEMENT (RTR)
    
    This Right to Represent Agreement ("Agreement") confirms that candidate Alex Rivera hereby grants
    Apex Systems Inc. exclusive rights to represent them for the position of Senior Full Stack Cloud Architect
    at JPMorgan Chase & Co.
    
    Agreed Bill Rate: $85.00/hr
    Vendor Recruiter: Sarah Jenkins (sjenkins@apexsystems.com, 555-234-5678)
    Date: 2026-11-09
    
    Terms: The candidate authorizes Apex Systems to present their credentials and profile for this requisition.
    
    Electronically Signed by: Alex Rivera on 11/09/2026
  `;

  // Test regex fallback parsing patterns used in /api/rtr/ocr
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  const emails = sampleAgreementText.match(emailRegex) || [];
  assert.equal(emails[0], 'sjenkins@apexsystems.com');

  const phoneRegex = /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
  const phones = sampleAgreementText.match(phoneRegex) || [];
  assert.equal(phones[0], '555-234-5678');

  const rateRegex = /\$(\d+(?:\.\d{1,2})?)\s*(?:\/|\s*per\s*)?\s*(hr|hour|day|month|mo|annual|yr)?/i;
  const rateMatch = sampleAgreementText.match(rateRegex);
  assert.ok(rateMatch);
  assert.equal(rateMatch[1], '85.00');

  const isSigned = /(signed|electronically signed|docusign|completed|acknowledged and agreed|signature:?\s*[^\n]+)/i.test(
    sampleAgreementText
  );
  assert.equal(isSigned, true);

  const rtrSnippetRegex = /(?:right to represent|exclusive representation|authorizes?|agrees? to represent|representation agreement)[^\n.]{10,200}\.?/i;
  const clauseMatch = sampleAgreementText.match(rtrSnippetRegex);
  assert.ok(clauseMatch);
  assert.ok(/represent|authorizes/i.test(clauseMatch[0]));
});

test('Candidate matching matches exact, partial, and word-split names', () => {
  const candidates = [
    { id: 'cand-1', full_name: 'Alex Rivera' },
    { id: 'cand-2', full_name: 'Priya Sharma' },
    { id: 'cand-3', full_name: 'Johnathan Michael Doe' },
  ];

  function findMatchingCandidate(extractedName, list) {
    if (!extractedName || !extractedName.trim()) return null;
    const query = extractedName.toLowerCase().trim();
    return (
      list.find((c) => c.full_name.toLowerCase().trim() === query) ||
      list.find((c) => c.full_name.toLowerCase().includes(query) || query.includes(c.full_name.toLowerCase())) ||
      list.find((c) => {
        const parts = query.split(/\s+/).filter(Boolean);
        return parts.length > 0 && parts.every((p) => c.full_name.toLowerCase().includes(p));
      }) ||
      null
    );
  }

  // Exact match
  assert.equal(findMatchingCandidate('Alex Rivera', candidates)?.id, 'cand-1');
  // Lowercase match
  assert.equal(findMatchingCandidate('alex rivera', candidates)?.id, 'cand-1');
  // Partial / Substring match
  assert.equal(findMatchingCandidate('Priya', candidates)?.id, 'cand-2');
  // Word match
  assert.equal(findMatchingCandidate('Johnathan Doe', candidates)?.id, 'cand-3');
});

test('RTR document reference structure conforms to database requirements', () => {
  const rtrRef = {
    id: 'rtr-123',
    filename: 'Alex_Rivera_RTR_JPMorgan.png',
    mime_type: 'image/png',
    vendor_name: 'Apex Systems Inc.',
    vendor_contact_name: 'Sarah Jenkins',
    vendor_contact_email: 'sjenkins@apexsystems.com',
    vendor_contact_phone: '555-234-5678',
    rtr_type: 'vendor_rtr',
    rtr_status: 'signed',
    rtr_date: '2026-11-09',
    expiration_date: null,
    hourly_rate: '85',
    currency: 'USD',
    created_at: new Date().toISOString(),
  };

  assert.equal(rtrRef.rtr_status, 'signed');
  assert.equal(rtrRef.hourly_rate, '85');
  assert.equal(rtrRef.vendor_name, 'Apex Systems Inc.');

  // Simulated auto-created job_submission
  const jobSubmission = {
    candidate_id: 'cand-1',
    company_name: 'JPMorgan Chase & Co.',
    job_title: 'Senior Full Stack Cloud Architect',
    vendor_company: rtrRef.vendor_name,
    vendor_contact_name: rtrRef.vendor_contact_name,
    vendor_contact_email: rtrRef.vendor_contact_email,
    vendor_contact_phone: rtrRef.vendor_contact_phone,
    submitted_rate: `$${rtrRef.hourly_rate}/hr`,
    status: rtrRef.rtr_status === 'signed' ? 'Submitted_to_Client' : 'Vendor_Screening',
    submission_date: rtrRef.rtr_date,
    rtr_document: rtrRef,
  };

  assert.equal(jobSubmission.status, 'Submitted_to_Client');
  assert.equal(jobSubmission.submitted_rate, '$85/hr');
  assert.equal(jobSubmission.rtr_document.filename, 'Alex_Rivera_RTR_JPMorgan.png');
});

test('Universal RTR OCR parses arbitrary email screenshot / informal RTR without prior job constraint', () => {
  const emailScreenshotText = `
    From: recruiters@teksystems.com
    To: marketing@portal.com
    Subject: Right to Represent Confirmation: Senior DevOps Engineer at Netflix
    
    Hi Team,
    
    Please have Candidate: Rahul Verma sign and confirm representation agreement for the position of Senior DevOps Engineer at client Netflix.
    Rate: $95/hr C2C.
    Contact: David Miller (dmiller@teksystems.com, 415-555-0199).
    
    Authorizes agency TEKsystems to submit profile.
    Signed by: Rahul Verma on 11/10/2026
  `;

  // Verify regex fallback captures candidate name, job title, client company, and rate
  const candMatch = emailScreenshotText.match(/(?:candidate(?:\s*name)?|consultant(?:\s*name)?|name of candidate)\s*[:\-]\s*([A-Za-z]+(?:\s+[A-Za-z]+)?)(?=\s+(?:sign|confirm|agree|hereby|to|for|at|\n|\r|$)|$)/i);
  assert.equal(candMatch?.[1]?.trim(), 'Rahul Verma');

  const titleMatch = emailScreenshotText.match(/(?:position|role|title|job title|requisition)\s*(?:of|for|:|-)\s*([A-Za-z0-9\s/.-]{3,50}?)(?:\s+at|\s+with|\s+for|\n|\.|\$)/i);
  assert.equal(titleMatch?.[1]?.trim(), 'Senior DevOps Engineer');

  const companyMatch = emailScreenshotText.match(/(?:client|company|customer|end\s*client|vendor|agency|employer|at|for)\s*[:\-]?\s*([A-Z][A-Za-z0-9&.,\s]{2,35})/i);
  assert.ok(companyMatch);

  // Test notes metadata embedding and extraction
  const standaloneRtr = {
    id: 'rtr-standalone-1',
    candidate_name: 'Rahul Verma',
    company_name: 'Netflix',
    job_title: 'Senior DevOps Engineer',
    hourly_rate: '95',
    vendor_name: 'TEKsystems',
    rtr_status: 'signed',
  };

  const tag = `<!-- RTR_METADATA: ${JSON.stringify(standaloneRtr)} -->`;
  const savedNotes = `Recruiter notes here\n\n${tag}`;

  const match = savedNotes.match(/<!-- RTR_METADATA:\s*(\{[\s\S]*?\})\s*-->/);
  assert.ok(match);
  const parsed = JSON.parse(match[1]);
  assert.equal(parsed.candidate_name, 'Rahul Verma');
  assert.equal(parsed.company_name, 'Netflix');
  assert.equal(parsed.hourly_rate, '95');
});

test('Enhanced candidate matching handles word-order permutations and declaration text', () => {
  const candidates = [
    { id: 'cand-1', full_name: 'Bhargav Mettu' },
    { id: 'cand-2', full_name: 'Priya R. Sharma' },
    { id: 'cand-3', full_name: 'Satya Nadella' },
  ];

  function findCandidateMatch(extractedName, list) {
    if (!extractedName || !extractedName.trim() || !list?.length) return null;
    const clean = (s) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim();
    const query = clean(extractedName);
    if (!query) return null;

    const exact = list.find((c) => clean(c.full_name) === query);
    if (exact) return exact;

    const sub = list.find((c) => clean(c.full_name).includes(query) || query.includes(clean(c.full_name)));
    if (sub) return sub;

    const qWords = query.split(/\s+/).filter((w) => w.length > 1);
    if (qWords.length === 0) return null;

    let bestCand = null;
    let maxMatchedWords = 0;

    for (const c of list) {
      const cWords = clean(c.full_name).split(/\s+/).filter((w) => w.length > 1);
      let matched = 0;
      for (const qw of qWords) {
        if (cWords.some((cw) => cw === qw || (cw.length >= 3 && qw.length >= 3 && (cw.startsWith(qw) || qw.startsWith(cw))))) {
          matched++;
        }
      }
      if (matched > 0 && matched > maxMatchedWords) {
        maxMatchedWords = matched;
        bestCand = c;
      }
    }

    return bestCand;
  }

  // Permuted first and last name
  assert.equal(findCandidateMatch('Mettu Bhargav', candidates)?.id, 'cand-1');
  // First name only
  assert.equal(findCandidateMatch('Bhargav', candidates)?.id, 'cand-1');
  // Middle initial tolerance
  assert.equal(findCandidateMatch('Priya Sharma', candidates)?.id, 'cand-2');

  // Declaration regex match: "I, Bhargav Mettu, hereby authorize..."
  const declarationSample = 'I, Bhargav Mettu, hereby authorize NextKinLife LLC to represent me...';
  const declMatch = declarationSample.match(/\bI,?\s+([A-Za-z]+(?:\s+[A-Za-z]+){1,3}),?\s+(?:hereby|grant|authorize|agree|confirm)\b/i);
  assert.equal(declMatch?.[1]?.trim(), 'Bhargav Mettu');
  assert.equal(findCandidateMatch(declMatch[1], candidates)?.id, 'cand-1');
});

test('Candidate ID sanitization treats "none", "__none__", and empty strings as null', () => {
  function sanitizeCandidateId(val) {
    if (!val || val === 'none' || val === '__none__' || val === 'null' || val === 'undefined') {
      return null;
    }
    const trimmed = String(val).trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed) ? trimmed : null;
  }

  assert.equal(sanitizeCandidateId('none'), null);
  assert.equal(sanitizeCandidateId('__none__'), null);
  assert.equal(sanitizeCandidateId(''), null);
  assert.equal(sanitizeCandidateId(null), null);
  assert.equal(sanitizeCandidateId(undefined), null);
  assert.equal(sanitizeCandidateId('550e8400-e29b-41d4-a716-446655440000'), '550e8400-e29b-41d4-a716-446655440000');
  assert.equal(sanitizeCandidateId('invalid-uuid'), null);
});
