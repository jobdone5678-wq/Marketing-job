import { browser } from 'wxt/browser';
import { getSession, NEXTKIN_ORIGIN, NextKinError, trackJob } from './nextkinhr';
import type { CapturedJob, RuntimeMessage } from './protocol';
import { cleanJobUrl } from './scraper';

export interface PendingApplication {
  job: CapturedJob;
  userId: string;
  candidateId?: string;
  eventKey: string;
  expiresAt: number;
  submitted: boolean;
  state: 'watching' | 'synced' | 'failed';
}

const watchTime = 2 * 60 * 60 * 1000;
const applicationLaunchPath = /^\/(?:jobs|dashboard\/outside-jobs)\/[^/]+\/apply\/?$/;
export const applicationKey = (tabId: number) => `application:${tabId}`;

export async function readApplication(tabId: number): Promise<PendingApplication | undefined> {
  const key = applicationKey(tabId);
  const stored = (await browser.storage.session.get(key))[key] as PendingApplication | undefined;
  if (stored?.eventKey && stored.expiresAt > Date.now()) return stored;
  return undefined;
}

async function writeApplication(tabId: number, application: PendingApplication): Promise<void> {
  await browser.storage.session.set({ [applicationKey(tabId)]: application });
}

export async function notifyApplicationSaved(): Promise<void> {
  const tabs = await browser.tabs.query({ url: `${NEXTKIN_ORIGIN}/*` });
  await Promise.allSettled(tabs.flatMap(({ id }) =>
    id === undefined ? [] : [browser.tabs.sendMessage(id, { kind: 'APPLICATION_SAVED' } satisfies RuntimeMessage, { frameId: 0 })]
  ));
}

export async function watchApplication(
  tabId: number,
  job: CapturedJob,
  userId: string,
  candidateId?: string,
): Promise<PendingApplication> {
  const existing = await readApplication(tabId);
  if (
    existing?.userId === userId &&
    (!candidateId || !existing.candidateId || existing.candidateId === candidateId) &&
    existing.job.jobUrl === job.jobUrl
  ) {
    if (candidateId && !existing.candidateId) {
      const updated = { ...existing, candidateId, job };
      await writeApplication(tabId, updated);
      return updated;
    }
    return existing;
  }
  const pending: PendingApplication = {
    job,
    userId,
    candidateId,
    eventKey: crypto.randomUUID(),
    expiresAt: Date.now() + watchTime,
    submitted: false,
    state: 'watching',
  };
  await writeApplication(tabId, pending);
  return pending;
}

function captureJob(job: CapturedJob | undefined, page?: URL): CapturedJob | undefined {
  if (!job || typeof job.title !== 'string' || typeof job.company !== 'string' ||
    typeof job.description !== 'string' || typeof job.jobUrl !== 'string') return undefined;
  const url = cleanJobUrl(job.jobUrl);
  if (!url || url.protocol !== 'https:' || (page && url.href !== cleanJobUrl(page.href)?.href)) return undefined;
  const title = job.title.trim().slice(0, 200);
  const company = job.company.trim().slice(0, 200);
  return title && company ? { jobUrl: url.href, title, company, description: job.description.slice(0, 60000) } : undefined;
}

const postingId = /^(id|job_?id|gh_jid|jr_id|jobreqid|posting_?id|requisition_?id|jk)$/i;

function postingOrigin(url: URL) {
  return url.origin === 'https://job-boards.greenhouse.io' ? 'https://boards.greenhouse.io' : url.origin;
}

function keepPostingParameters(url: URL) {
  const greenhouse = /(^|\.)greenhouse\.io$/i.test(url.hostname);
  for (const key of [...url.searchParams.keys()]) {
    if (!postingId.test(key) && !(greenhouse && /^(for|token)$/i.test(key))) url.searchParams.delete(key);
  }
  url.searchParams.sort();
}

function postingKey(value: string) {
  const url = new URL(value);
  url.pathname = url.pathname.replace(/\/(?:application|apply)\/?$/i, '').replace(/\/$/, '');
  const pathId = url.pathname.split('/').at(-1);
  keepPostingParameters(url);
  for (const [key, id] of url.searchParams) {
    if (postingId.test(key) && pathId && /\d/.test(pathId) && pathId === id &&
      url.searchParams.getAll(key).every(item => item === id)) url.searchParams.delete(key);
  }
  return postingOrigin(url) + url.pathname + url.search;
}

function receiptUrl(page: URL, jobUrl: string): string | undefined {
  const url = cleanJobUrl(page.href);
  if (!url || url.protocol !== 'https:') return undefined;
  if (url.pathname !== new URL(jobUrl).pathname) {
    keepPostingParameters(url);
  }
  return url.href;
}

async function deliverReceipt(
  pending: PendingApplication,
  token: string,
  candidateId: string | undefined,
  confirmation: { url: string; evidence: string },
) {
  for (const delay of [0, 750, 2000]) {
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    try {
      await trackJob(pending.job, token, candidateId, pending.eventKey, confirmation);
      return;
    } catch (error) {
      const permanent = error instanceof NextKinError && error.status < 500 && error.status !== 429;
      if (permanent || delay === 2000) throw error;
    }
  }
}

export function monitorApplications(): void {
  const active = new Map<number, Promise<unknown>>();
  browser.tabs.onRemoved.addListener((tabId) => {
    const clear = () => browser.storage.session.remove(applicationKey(tabId));
    void (active.get(tabId) ?? Promise.resolve()).then(clear, clear);
  });
  browser.runtime.onMessage.addListener((message: RuntimeMessage, sender) => {
    const tabId = sender.tab?.id;
    const rawPage = sender.url ?? sender.tab?.url;
    if (
      tabId === undefined ||
      !rawPage ||
      !message ||
      (message.kind !== 'APPLICATION_WATCH' && message.kind !== 'APPLICATION_SUBMIT' && message.kind !== 'APPLICATION_CONFIRMED')
    ) return undefined;

    const page = new URL(rawPage);
    const previous = active.get(tabId) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(async () => {
      if (message.kind === 'APPLICATION_WATCH') {
        if (sender.frameId !== 0 || page.origin !== NEXTKIN_ORIGIN || !applicationLaunchPath.test(page.pathname)) return undefined;
        const job = captureJob(message.job);
        const session = job && await getSession();
        if (!job || !session || (page.pathname.startsWith('/dashboard/') && message.actorId !== session.userId)) return undefined;
        await watchApplication(tabId, job, session.userId);
        return { watching: true };
      }

      let pending = await readApplication(tabId);
      if (message.kind === 'APPLICATION_SUBMIT') {
        const job = captureJob(message.job, page);
        const session = await getSession();
        if (!session) return undefined;
        if (job && (!pending || pending.userId !== session.userId ||
          postingKey(pending.job.jobUrl) !== postingKey(job.jobUrl))) {
          pending = await watchApplication(tabId, job, session.userId);
        }
        if (pending && pending.userId === session.userId && postingOrigin(new URL(pending.job.jobUrl)) === postingOrigin(page) &&
          postingKey(page.href) === postingKey(pending.job.jobUrl) && pending.state !== 'synced' && !pending.submitted) {
          await writeApplication(tabId, { ...pending, submitted: true });
        }
        return undefined;
      }
      if (!pending?.submitted || postingOrigin(page) !== postingOrigin(new URL(pending.job.jobUrl))) return false;
      if (pending.state === 'synced') return true;
      const session = await getSession();
      const url = receiptUrl(page, pending.job.jobUrl);
      if (!url || session?.userId !== pending.userId) return false;
      try {
        await deliverReceipt(pending, session.token, pending.candidateId, { url, evidence: message.evidence });
        await writeApplication(tabId, { ...pending, state: 'synced' });
      } catch {
        await writeApplication(tabId, { ...pending, state: 'failed' });
        return true;
      }
      await notifyApplicationSaved().catch(() => {});
      return true;
    });
    active.set(tabId, next);
    return next.finally(() => {
      if (active.get(tabId) === next) active.delete(tabId);
    });
  });
}
