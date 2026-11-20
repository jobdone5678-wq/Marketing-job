import type { CapturedJob, PageSnapshot } from './protocol';

/** How much visible text we keep. Enough for context, small enough to send. */
const MAX_TEXT_LENGTH = 5000;

/**
 * Reads the given document into a PageSnapshot.
 *
 * Pure over its Document argument so it can be tested without a browser.
 */
export function extractSnapshot(doc: Document): PageSnapshot {
  return {
    url: doc.location?.href ?? '',
    title: doc.title,
    headline: extractHeadline(doc),
    text: extractVisibleText(doc),
  };
}

/**
 * Best-effort primary heading of an arbitrary page.
 *
 * Heuristic, in priority order: an explicit og:title (what the site itself
 * calls the page), then the first <h1>, then the document title as a floor.
 * This is the natural seam to make smarter per job board later.
 */
export function extractHeadline(doc: Document): string {
  const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim();
  if (ogTitle) return ogTitle;

  const h1 = doc.querySelector('h1')?.textContent?.trim();
  if (h1) return h1;

  return doc.title.trim();
}

function extractVisibleText(doc: Document): string {
  const body = doc.body;
  if (!body) return '';
  // innerText reflects what the user actually sees; textContent is the
  // fallback for engines (jsdom, older happy-dom) that don't implement it.
  const raw = body.innerText || body.textContent || '';
  return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT_LENGTH);
}

/** How deep `hasJobPostingMarkup` walks a JSON-LD tree. Real markup nests a posting at
 *  most a few levels down (`@graph`, `mainEntity`); the bound only stops a pathological
 *  document from costing more than a glance. */
const MAX_LD_DEPTH = 8;

/**
 * Whether the page declares itself a job posting: a schema.org `JobPosting` in any of
 * its JSON-LD blocks, at the top level, in a list, under `@graph` or nested inside
 * another node. That markup is what search engines' job features read, so an employer's
 * own careers page carries it even where its URL names no ATS we recognise. A block that
 * does not parse is skipped, never fatal. Pure over its Document argument.
 */
export function hasJobPostingMarkup(doc: Document): boolean {
  return jobPostings(doc).next().done === false;
}

function* jobPostings(doc: Document) {
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    let data: unknown;
    try {
      data = JSON.parse(script.textContent ?? '');
    } catch {
      continue;
    }
    yield* findJobPostings(data, 0);
  }
}

function* findJobPostings(node: unknown, depth: number): Generator<Record<string, unknown>> {
  if (depth > MAX_LD_DEPTH || node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) yield* findJobPostings(item, depth + 1);
    return;
  }
  const record = node as Record<string, unknown>;
  const types: unknown[] = Array.isArray(record['@type']) ? record['@type'] : [record['@type']];
  if (types.some(isJobPostingType)) yield record;
  for (const value of Object.values(record)) yield* findJobPostings(value, depth + 1);
}

const descriptionSelector = [
  '[itemprop="description"]', '[data-automation-id="jobPostingDescription"]',
  '[data-testid="job-description"]', '[data-qa="job-description"]',
  '#job-description', '#jobDescriptionText', '#jobDescription', '.job__description',
  '.job-description', '.posting-page .section-wrapper', '.jd-prose',
  '.ashby-job-posting-brief-description', '.ashby-job-posting-description',
].join(', ');

export function cleanJobUrl(value: string): URL | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) return null;
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|ref$|source$|email$|auth|session|candidate[_-]?id$|applicant[_-]?id$|code$|state$|access[_-]?token$|refresh[_-]?token$)/i.test(key) ||
      (key.toLowerCase() === 'token' && !/(^|\.)greenhouse\.io$/.test(url.hostname))) url.searchParams.delete(key);
  }
  return url.href.length <= 2000 ? url : null;
}

/** Capture posting metadata while excluding application forms and their answers. */
export function extractJobPosting(doc: Document): CapturedJob | null {
  const url = cleanJobUrl(doc.location?.href ?? '');
  if (!url) return null;

  const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
  const postings = [...jobPostings(doc)];
  const heading = text(doc.querySelector('h1')?.textContent);
  const matching = postings.filter((item) => text(item.title ?? item.name).toLowerCase() === heading.toLowerCase());
  const posting = postings.length === 1 ? postings[0] : matching.length === 1 ? matching[0] : undefined;
  const markup = text(posting?.description) || doc.querySelector(descriptionSelector)?.innerHTML;
  if (!markup) return null;

  const template = doc.createElement('template');
  template.innerHTML = markup.slice(0, 120_000);
  template.content.querySelectorAll('form, input, select, textarea, script, style, template, [hidden], [contenteditable]').forEach((node) => node.remove());
  template.content.querySelectorAll('br, p, li, h1, h2, h3, h4, div').forEach((node) => node.after('\n'));
  const description = (template.content.textContent ?? '').trim().slice(0, 60_000);
  const title = (text(posting?.title) || text(posting?.name) || heading || doc.title.trim()).slice(0, 200);
  const organization = posting?.hiringOrganization;
  const structuredCompany = typeof organization === 'object' && organization !== null && 'name' in organization
    ? text(organization.name) : text(organization);
  const company = (structuredCompany ||
    text(doc.querySelector('[itemprop="hiringOrganization"] [itemprop="name"], [data-testid="company-name"], .company-name')?.textContent) ||
    text(doc.querySelector('meta[property="og:site_name"]')?.getAttribute('content')) ||
    (url.hostname === 'jobs.ashbyhq.com' ? url.pathname.split('/')[1] : '') || url.hostname).slice(0, 200);
  if (!title || /^(careers?|open positions?|job opportunities|application)$/i.test(title) || description.length < 10) return null;
  return { title, company, description, jobUrl: url.href };
}

/** `JobPosting`, also written as a compact IRI (`schema:JobPosting`) or a full one. */
function isJobPostingType(type: unknown): boolean {
  return typeof type === 'string' && /(^|[/:#])JobPosting$/.test(type.trim());
}
