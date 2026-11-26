import { isPrivateAutofillField } from './autofillSafety';
import { easyApplySent } from './easyApply';
import { extractJobPosting } from './scraper';
import type { FormField } from './protocol';

export interface ApplicationPage {
  url: string;
  jobUrl?: string;
  jobTitle?: string;
  companyName?: string;
  jobLocation?: string;
  employmentType?: string;
  department?: string;
  evidence?: string;
  isJobPosting?: boolean;
}

export interface ApplicationAnswer {
  key: string;
  label: string;
  value: string;
}

export interface ApplicationReceipt {
  candidateId: string;
  eventKey: string;
  companyName: string;
  jobTitle: string;
  jobUrl: string;
  jobLocation?: string;
  employmentType?: string;
  department?: string;
  confirmationUrl?: string;
  answers: ApplicationAnswer[];
  manualAttestation: boolean;
  evidence: string;
}

const postingParams = new Set(['gh_jid', 'jobid', 'job_id', 'jk', 'requisition', 'req_id', 'id']);
const receiptPath =
  /\/(?:application\/(?:confirmation|received|complete|thank[-_]?you)|confirmation|thank[-_]?you(?:[-_]for[-_]applying)?|thanks|applied|application[-_](?:submitted|success|received|complete)|submission[-_]success|success|submitted)\/?$/i;
const receiptText =
  /^(?:thank(?: you|s) for (?:applying|your application|submitting your application)|(?:we have|we've|we) (?:successfully )?received your application|(?:your )?(?:job )?application (?:has been |was |is )?(?:successfully )?(?:submitted|received|sent|confirmed)|(?:you have |you've |you )?successfully applied)(?=$|[.!,:]|\s+(?:to|for|at|with|and|by|on|in|we|successfully)\b)/i;
const uncertainText =
  /\b(?:if|once|after|when|before|unless)\b.{0,45}\b(?:application|submit|receive)|\b(?:not (?:been )?(?:submitted|received|sent)|unable to submit|submission failed|not successful)\b/i;

const cleanText = (value: string | null | undefined) =>
  value?.replace(/\s+/g, ' ').trim().slice(0, 200) || '';
const linkedinHost = (host: string) => /(^|\.)linkedin\.com$/i.test(host);
const leverHost = (host: string) => /^jobs(?:\.eu)?\.lever\.co$/i.test(host);
const eligibleAnswer =
  /name|email|phone|mobile|address|city|state|zip|postal|country|location|linkedin|portfolio|website|github|skill|experience|employ|education|school|university|degree|qualif|company|title|role|position|salary|compensation|rate|availab|notice|start|relocat|sponsor|authori|work.?permit|cover.?letter|message|hear|referr|interest|project|summary/i;

/** Keeps posting identity and drops referral, session and other query data. */
export function applicationPageUrl(value: string, posting = false): string | undefined {
  if (!URL.canParse(value)) return;
  const url = new URL(value);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return;
  if (linkedinHost(url.hostname)) {
    const id =
      url.pathname.match(/\/jobs\/view\/(?:[^/]*-)?(\d+)\/?$/)?.[1] ??
      url.searchParams.get('currentJobId');
    if (id && /^\d+$/.test(id)) return `${url.origin}/jobs/view/${id}`;
  }
  const identifiers = (params: URLSearchParams) =>
    new URLSearchParams(
      [...params]
        .filter(
          ([name, paramValue]) =>
            (postingParams.has(name.toLowerCase()) ||
              (/(^|\.)greenhouse\.io$/i.test(url.hostname) && /^(for|token)$/.test(name))) &&
            /^[\w.-]{1,160}$/.test(paramValue)
        )
        .toSorted(([a], [b]) => a.localeCompare(b))
    );
  const fragment = url.hash.match(/^#!?(\/[\w./%-]+)(?:\?([^#]*))?$/);
  url.hash = '';
  url.search = identifiers(url.searchParams).toString();
  if (fragment) {
    const query = identifiers(new URLSearchParams(fragment[2])).toString();
    url.hash = fragment[1] + (query ? `?${query}` : '');
  }
  if (posting) {
    url.pathname =
      url.pathname
        .replace(receiptPath, '')
        .replace(/\/(?:apply|application)\/?$/i, '')
        .replace(/\/$/, '') || '/';
  }
  return url.href.length <= 2000 ? url.href : undefined;
}

export function observeApplicationPage(doc: Document): ApplicationPage {
  const url = doc.location?.href ?? '';
  const host = doc.location?.hostname ?? '';
  const metadata = extractJobPosting(doc);
  function textOf(selector: string) {
    return cleanText(doc.querySelector(selector)?.textContent);
  }
  const title = cleanText(doc.title);
  const heading = title.match(
    /^(?:job application for |apply for )?(.+?)\s+at\s+(.+?)(?:\s+\|.*)?$/i
  );
  const lever = leverHost(host);
  const atsBoard = (lever || /(^|\.)(?:greenhouse\.io|lever\.co|ashbyhq\.com)$/i.test(host))
    ? doc.location?.pathname.split('/').find(Boolean)?.replace(/[-_]/g, ' ')
    : undefined;
  const displayedTitle = textOf(
    '[itemprop=title], [data-automation-id=jobPostingHeader], .job-title, .jobs-unified-top-card__job-title, .job-details-jobs-unified-top-card__job-title h1, .posting-headline h2, .posting-header h2, main h1, h1'
  );
  const displayedCompany = textOf(
    '[itemprop=hiringOrganization] [itemprop=name], [data-automation-id=companyName], .company-name, .jobs-unified-top-card__company-name, .job-details-jobs-unified-top-card__company-name'
  );
  const jobTitle = cleanText(metadata?.title) || cleanText(heading?.[1]) || displayedTitle || title;
  const companyName =
    cleanText(metadata?.company) ||
    displayedCompany ||
    cleanText(heading?.[2]) ||
    cleanText(atsBoard);
  const evidence = applicationReceiptEvidence(doc);
  return {
    url: applicationPageUrl(url) ?? '',
    jobUrl: applicationPageUrl(url, true),
    jobTitle:
      uncertainText.test(jobTitle) ||
      receiptText.test(jobTitle) ||
      /^(?:thank you|thanks|confirmation|application (?:complete|success)|careers|jobs?|apply)(?:\s*[|–-].*)?$/i.test(
        jobTitle
      )
        ? undefined
        : jobTitle || undefined,
    companyName: companyName || undefined,
    ...(lever && {
      jobLocation: textOf('.posting-categories .location, .posting-categories .sort-by-location') || undefined,
      employmentType: textOf('.posting-categories .commitment, .posting-categories .sort-by-commitment').slice(0, 50) || undefined,
      department: textOf('.posting-categories .department, .posting-categories .team, .posting-categories .sort-by-team').slice(0, 100) || undefined,
    }),
    evidence,
    isJobPosting: !!metadata || !!atsBoard || /^(?:job application for|apply for)\b/i.test(title),
  };
}

export function receiptMatchesPosting(receipt: ApplicationPage, jobUrl: string): boolean {
  if (receipt.jobUrl === jobUrl) return true;
  const current = new URL(receipt.url);
  const job = new URL(jobUrl);
  if (current.origin !== job.origin || !receiptPath.test(current.pathname)) return false;
  const prefix = current.pathname.replace(receiptPath, '');
  return (
    (!prefix || job.pathname.startsWith(prefix + '/')) &&
    [...current.searchParams].every(([key, value]) => job.searchParams.get(key) === value)
  );
}

const proposedVisible = (element: Element) =>
  !element.closest('[hidden], [aria-hidden=true], dialog:not([open]), form') &&
  element.getClientRects().length > 0;

export function applicationReceiptEvidence(doc: Document): string | undefined {
  const host = doc.location?.hostname ?? '';
  if (linkedinHost(host) && easyApplySent(doc))
    return 'Your application was sent';
  const lever = leverHost(host) && /^\/[^/]+\/[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}(?:\/|$)/i.test(doc.location?.pathname ?? '');
  const headings = 'main h1, main h2, h1, [role=heading], [role=alert], [role=status], [role=dialog] h2, dialog[open] h2';
  const signals = doc.querySelectorAll(lever
    ? headings + ', .application-confirmation, .application-submitted, [data-qa="confirmation-page"], .confirmation-section, .lever-confirmation'
    : headings);
  for (const element of signals) {
    const text = cleanText(element.textContent);
    if (!uncertainText.test(text)) {
      const match = text.match(receiptText);
      if (match?.[0] && proposedVisible(element)) return match[0];
    }
  }
  if (lever) {
    for (const element of doc.querySelectorAll('h2, h3, h4, p, strong, div:not(:has(*)), span:not(:has(*))')) {
      const text = cleanText(element.textContent);
      if (/^application submitted[.!]?$/i.test(text) && proposedVisible(element)) return text;
    }
  }
  return undefined;
}

export function collectApplicationAnswers(
  fields: FormField[],
  includeEmpty = false
): ApplicationAnswer[] {
  const answers = new Map<string, ApplicationAnswer>();
  for (const field of fields) {
    if (answers.size >= 100) break;
    if (
      isPrivateAutofillField(field) ||
      /secret|token|credential|payment|credit.?card|bank|routing|tax.?id|medical|health|religion|otp|one.?time.?code/i.test(
        `${field.label} ${field.name}`
      ) ||
      !eligibleAnswer.test(`${field.label} ${field.name}`)
    )
      continue;
    const label = cleanText(field.label);
    const value = field.invalid ? '' : field.value.trim().slice(0, 4000);
    if (!label || (!value && !includeEmpty)) continue;
    const key = (field.name ? `${field.name}:${label}` : label).toLowerCase().trim().slice(0, 160);
    answers.set(key, { key, label, value });
  }
  return [...answers.values()];
}
