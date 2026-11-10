import type { ApplicationIdentity, CandidateIdentity, CaptureStatus, ReceivedEmail, ReceiptAnalysis } from './types';

const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();
const normalizeEmail = (value: string) => (value.match(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || '').toLowerCase();

function unquotedText(value: string): string {
  return value.split(/\r?\n/).filter((line) => !line.trimStart().startsWith('>'))
    .join('\n').split(/\n(?:On .+wrote:|[- ]*Original Message[- ]*|[- ]*Forwarded message[- ]*)/i)[0];
}

function labeled(text: string, labels: string): string | null {
  const value = text.match(new RegExp(`^(?:${labels})\\s*:\\s*([^\\n]{1,160})$`, 'im'))?.[1]?.trim();
  return value || null;
}

export function analyzeReceipt(email: ReceivedEmail, candidates: CandidateIdentity[], applications: ApplicationIdentity[]): ReceiptAnalysis {
  const text = unquotedText(email.text.slice(0, 50_000));
  const content = `${email.subject}\n${text}`;
  const base: ReceiptAnalysis = { disposition: 'needs_review', candidateId: null, submissionId: null, company: null, jobTitle: null, reason: '' };
  if (email.direction === 'sent' || !/(?:thank(?:s| you) for (?:applying|your application)|(?:we (?:have )?)received your application|your application (?:has been|was|is) (?:received|submitted)|application received|application confirmation)/i.test(content)) {
    return { ...base, disposition: 'ignored', reason: 'Not an application receipt.' };
  }
  let company = labeled(text, 'company|organization|employer');
  let jobTitle = labeled(text, 'job title|position|role|position title');
  const template = content.match(/thank you for applying (?:for|to) (?:the )?([^\n.!]{2,150}?) (?:position |role )?at ([^\n.!]{2,100})/i);
  if (template) { jobTitle ||= template[1].trim(); company ||= template[2].trim(); }
  const recipients = new Set(email.to.map(normalizeEmail).filter(Boolean));
  const explicitAddress = labeled(text, 'candidate email|applicant email');
  const explicitEmail = explicitAddress ? normalizeEmail(explicitAddress) : null;
  const identities = candidates.filter((candidate) => candidate.email && (explicitEmail !== null
    ? normalizeEmail(candidate.email) === explicitEmail : recipients.has(normalizeEmail(candidate.email))));
  const conflictingRecipient = explicitEmail !== null && candidates.some(candidate => candidate.email
    && recipients.has(normalizeEmail(candidate.email)) && normalizeEmail(candidate.email) !== explicitEmail);
  const candidateId = identities.length === 1 && !conflictingRecipient ? identities[0].id : null;
  const matching = candidateId ? applications.filter((application) => {
    if (application.candidate_id !== candidateId) return false;
    const normalizedContent = ` ${normalize(content)} `;
    return (company ? normalize(application.company_name) === normalize(company) : normalizedContent.includes(` ${normalize(application.company_name)} `))
      && (jobTitle ? normalize(application.job_title) === normalize(jobTitle) : normalizedContent.includes(` ${normalize(application.job_title)} `));
  }) : [];
  if (matching.length === 1) { company ||= matching[0].company_name; jobTitle ||= matching[0].job_title; }
  const result = { ...base, candidateId, submissionId: matching.length === 1 ? matching[0].id : null, company, jobTitle };
  if (!candidateId) return { ...result, reason: identities.length > 1 ? 'Several candidates share this address. Select the correct candidate.' : 'The email does not uniquely identify a candidate. Select one for review.' };
  if (!company || !jobTitle) return { ...result, reason: 'Company or job title is missing. Review the receipt before saving.' };
  if (matching.length > 1) return { ...result, reason: 'Several applications match. Select the correct application.' };
  if (/(?:\binterview\b|\boffer\b|not submitted|unable to (?:submit|process)|application (?:failed|rejected)|unfortunately|unsuccessful|(?:proceed|move|moving|went|go) (?:forward )?with (?:other|another)|not (?:selected|moving forward|proceeding)|position (?:has been|is) filled|no longer (?:consider|pursu))/i.test(content)) return { ...result, reason: 'Later-stage or unsuccessful application evidence requires review.' };
  if (email.source === 'manual_import' || /^(?:fw|fwd):/i.test(email.subject.trim())) return { ...result, reason: 'Imported or forwarded evidence needs recruiter review.' };
  if (!email.senderAuthenticated || !email.senderAllowed) return { ...result, reason: 'Sender is not authenticated and approved for automatic confirmation.' };
  return { ...result, disposition: 'auto_confirm', reason: 'Authenticated approved sender, exact candidate address and application details matched.' };
}

export function advanceCaptureStatus(current: CaptureStatus, observed: CaptureStatus): CaptureStatus {
  if (current === 'confirmed') return current;
  if (observed === 'confirmed') return observed;
  if (current === 'submitted') return current;
  if (observed === 'failed' || current === 'failed') return observed;
  const rank: Record<CaptureStatus, number> = { started: 0, in_progress: 1, submit_attempted: 2, submitted: 3, confirmed: 4, failed: -1 };
  return rank[observed] >= rank[current] ? observed : current;
}
