import type { PageSnapshot } from './protocol';

/** How much visible text we keep. Enough for context, small enough to send. */
const MAX_TEXT_LENGTH = 5000;

/**
 * Reads the given document into a PageSnapshot.
 *
 * Pure over its Document argument so it can be tested without a browser.
 */
export function extractSnapshot(doc: Document): PageSnapshot {
  const jobPosting = extractJobPosting(doc, true);
  return {
    url: doc.location?.href ?? '',
    title: doc.title,
    headline: extractHeadline(doc),
    text: extractVisibleText(doc),
    ...(jobPosting ? { jobPosting } : {}),
  };
}

const boundedText = (value: unknown, max: number) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : undefined;

export function extractJobPosting(doc: Document, includeDescription = false): PageSnapshot['jobPosting'] {
  const posting = findJobPostingMarkup(doc);
  if (!posting) return;
  const org = posting.hiringOrganization;
  let description: string | undefined;
  if (includeDescription && typeof posting.description === 'string') {
    const template = doc.createElement('template');
    template.innerHTML = posting.description.slice(0, 20000);
    template.content.querySelectorAll('script, style').forEach((node) => node.remove());
    description = boundedText(template.content.textContent, MAX_TEXT_LENGTH);
  }
  return {
    title: boundedText(posting.title, 300),
    company: boundedText(org && typeof org === 'object' && 'name' in org ? org.name : org, 300),
    description,
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
  return findJobPostingMarkup(doc) !== undefined;
}

function findJobPostingMarkup(doc: Document): Record<string, unknown> | undefined {
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    let data: unknown;
    try {
      data = JSON.parse(script.textContent ?? '');
    } catch {
      continue;
    }
    const posting = findPosting(data, 0);
    if (posting) return posting;
  }
  return undefined;
}

function findPosting(node: unknown, depth: number): Record<string, unknown> | undefined {
  if (depth > MAX_LD_DEPTH || node === null || typeof node !== 'object') return undefined;
  const record = node as Record<string, unknown>;
  const types: unknown[] = Array.isArray(record['@type']) ? record['@type'] : [record['@type']];
  if (types.some(isJobPostingType)) return record;
  for (const value of Object.values(record)) {
    const child = findPosting(value, depth + 1);
    if (child) return child;
  }
  return undefined;
}

/** `JobPosting`, also written as a compact IRI (`schema:JobPosting`) or a full one. */
function isJobPostingType(type: unknown): boolean {
  return typeof type === 'string' && /(^|[/:#])JobPosting$/.test(type.trim());
}
