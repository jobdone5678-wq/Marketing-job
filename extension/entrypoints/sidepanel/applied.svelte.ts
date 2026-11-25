import { track } from '../../lib/analytics';
import { getToken } from '../../lib/auth';
import {
  getAutofillSessionProfile,
  isFreehireOrigin,
  saveApplicationReceipt,
} from '../../lib/freehire';
import {
  applicationPageUrl,
  collectApplicationAnswers,
  receiptMatchesPosting,
  type ApplicationAnswer,
  type ApplicationPage,
  type ApplicationReceipt,
} from '../../lib/applicationCapture';
import { leftAnApplication } from '../../lib/applyPlan';
import type { FormPlan } from './formPlan.svelte';

export interface CurrentTab {
  id: number | null;
  url: string;
}

export interface AppliedJob {
  jobUrl: string;
  title: string;
  company: string;
  eventKey: string;
}

interface Attempt {
  job: AppliedJob;
  frame: number;
  form: number;
  started: boolean;
  answers: ApplicationAnswer[];
  confirmation?: ApplicationPage;
  autoTried?: boolean;
  recorded?: boolean;
  dismissed?: boolean;
  payload?: ApplicationReceipt;
}

const sameOrigin = (left: string, right: string) =>
  URL.canParse(left) && URL.canParse(right) && new URL(left).origin === new URL(right).origin;

function clearlyIdentifiesJob(url: string) {
  const { pathname, search, hash } = new URL(url);
  return pathname.split('/').filter(Boolean).length >= 2 || !!search || !!hash;
}

function continuesPosting(jobUrl: string, pageUrl: string) {
  if (jobUrl === pageUrl) return true;
  if (!sameOrigin(jobUrl, pageUrl)) return false;
  const job = new URL(jobUrl);
  const current = new URL(pageUrl);
  return (
    !job.search &&
    !job.hash &&
    (current.pathname.startsWith(job.pathname + '/apply/') ||
      current.pathname.startsWith(job.pathname + '/application/'))
  );
}

export class AppliedTracker {
  candidate = $state<AppliedJob | null>(null);
  saving = $state(false);
  #attempts = new Map<number, Attempt>();
  #pending = new Map<number, Attempt>();
  #postings = new Map<number, ApplicationPage>();
  #controller = new AbortController();

  constructor(
    private readonly form: FormPlan,
    private readonly tab: () => CurrentTab,
    private readonly notify: (text: string) => void
  ) {}

  reset() {
    this.#controller.abort();
    this.#controller = new AbortController();
    this.#attempts.clear();
    this.#pending.clear();
    this.#postings.clear();
    this.candidate = null;
    this.saving = false;
  }

  asks(autofilling: boolean): boolean {
    return (
      this.candidate !== null &&
      (!this.form.plan?.items.length ||
        this.form.sent ||
        this.form.applicationPages.some((page) => page.evidence)) &&
      !autofilling
    );
  }

  private showPending(tabId: number) {
    const pending = this.#pending.get(tabId);
    this.candidate = pending && !pending.recorded ? pending.job : null;
  }

  tabChanged(tabId: number | null) {
    this.candidate = tabId === null ? null : (this.#pending.get(tabId)?.job ?? null);
  }

  private mergeAnswers(attempt: Attempt, updates: ApplicationAnswer[]) {
    const byKey = new Map(attempt.answers.map((answer) => [answer.key, answer]));
    for (const answer of updates) {
      if (answer.value) byKey.set(answer.key, answer);
      else byKey.delete(answer.key);
    }
    attempt.answers = [...byKey.values()].slice(0, 100);
  }

  noteSubmitting(
    tabId: number,
    frame: number,
    form: number,
    page: ApplicationPage,
    answers: ApplicationAnswer[]
  ) {
    const attempt = this.#attempts.get(tabId);
    if (
      this.tab().id !== tabId ||
      !attempt ||
      attempt.recorded ||
      attempt.dismissed ||
      attempt.payload ||
      attempt.frame !== frame ||
      attempt.form !== form ||
      !page.jobUrl ||
      !continuesPosting(attempt.job.jobUrl, page.jobUrl)
    )
      return;
    attempt.started = true;
    this.mergeAnswers(attempt, answers);
  }

  note() {
    const tab = this.tab();
    const pages = this.form.applicationPages;
    if (
      tab.id === null ||
      !applicationPageUrl(tab.url) ||
      isFreehireOrigin(tab.url) ||
      !pages.length
    )
      return;
    const id = tab.id;
    const top = pages.find((page) => page.frame === 0);
    const previousPosting = this.#postings.get(id);
    if (
      top?.jobUrl &&
      top.jobTitle &&
      top.companyName &&
      !top.evidence &&
      top.isJobPosting &&
      clearlyIdentifiesJob(top.jobUrl)
    ) {
      this.#postings.set(id, top);
    }
    let attempt = this.#attempts.get(id);
    let receipt = pages.find(
      (page) =>
        page.evidence &&
        page.url &&
        (attempt ? receiptMatchesPosting(page, attempt.job.jobUrl) : page.frame === 0)
    );
    if (
      !receipt &&
      attempt?.recorded &&
      top?.evidence &&
      top.jobUrl &&
      clearlyIdentifiesJob(top.jobUrl)
    ) {
      receipt = top;
      attempt = undefined;
    }
    if (receipt) {
      if (!attempt) {
        const jobUrl = receipt.jobUrl;
        if (!jobUrl || !clearlyIdentifiesJob(jobUrl)) return;
        const known = previousPosting?.jobUrl === jobUrl ? previousPosting : undefined;
        attempt = this.createAttempt(
          jobUrl,
          {
            ...receipt,
            jobTitle: known?.jobTitle || receipt.jobTitle,
            companyName: known?.companyName || receipt.companyName,
          },
          receipt.frame,
          -1
        );
        this.#attempts.set(id, attempt);
      }
      if (attempt.recorded || attempt.dismissed) return;
      attempt.confirmation = receipt;
      this.#pending.set(id, attempt);
      if (
        attempt.job.title &&
        attempt.job.company &&
        !this.saving &&
        !attempt.autoTried &&
        receipt.url.startsWith('https:')
      ) {
        attempt.autoTried = true;
        void this.save(id, attempt, false);
      } else if (!this.saving) {
        this.showPending(id);
      }
      return;
    }

    const upload = this.form.uploads[0];
    const first =
      upload ??
      this.form.formFields.find((field) => field.frame === attempt?.frame) ??
      this.form.formFields[0];
    const page = pages.find((item) => item.frame === first?.frame) ?? top;
    const jobUrl = page?.jobUrl ?? top?.jobUrl;
    const continuing = !!(
      attempt &&
      jobUrl &&
      !attempt.dismissed &&
      continuesPosting(attempt.job.jobUrl, jobUrl)
    );
    const canTrack = !!(
      first &&
      page &&
      (upload ||
        this.form.easyApply ||
        this.form.formFilled ||
        continuing ||
        (page.isJobPosting && page.jobTitle && page.companyName))
    );
    if (canTrack && first && page && jobUrl) {
      if (!continuing) {
        if (attempt?.started && !attempt.recorded && !attempt.dismissed)
          this.#pending.set(id, attempt);
        const known = previousPosting?.jobUrl === jobUrl ? previousPosting : undefined;
        attempt = this.createAttempt(
          jobUrl,
          {
            ...page,
            jobTitle: known?.jobTitle || top?.jobTitle || page.jobTitle,
            companyName: known?.companyName || top?.companyName || page.companyName,
          },
          first.frame,
          first.form
        );
        this.#attempts.set(id, attempt);
      }
      if (attempt && !attempt.recorded && !attempt.dismissed && !attempt.payload) {
        attempt.frame = first.frame;
        attempt.form = first.form;
        attempt.started ||=
          this.form.formFilled || (!this.form.easyApply && leftAnApplication(this.form.plan));
        this.mergeAnswers(
          attempt,
          collectApplicationAnswers(
            this.form.formFields.filter(
              ({ frame, form }) => frame === first.frame && form === first.form
            ),
            true
          )
        );
      }
      return;
    }
    // A wizard can keep recognizable application fields while swapping its controls.
    if (this.form.plan?.items.length || this.form.easyApply) return;
    if (attempt?.started && !attempt.recorded && !attempt.dismissed) this.#pending.set(id, attempt);
    this.showPending(id);
  }

  private createAttempt(
    jobUrl: string,
    page: ApplicationPage,
    frame: number,
    form: number
  ): Attempt {
    return {
      job: {
        jobUrl,
        title: page.jobTitle ?? '',
        company: page.companyName ?? '',
        eventKey: crypto.randomUUID(),
      },
      frame,
      form,
      answers: [],
      started: false,
    };
  }

  dismiss() {
    const id = this.tab().id;
    if (id === null || this.saving) return;
    const pending = this.#pending.get(id);
    this.#pending.delete(id);
    if (pending) pending.dismissed = true;
    this.candidate = null;
  }

  confirm(title: string, company: string) {
    const id = this.tab().id;
    if (id === null) return;
    const attempt = this.#pending.get(id);
    if (!attempt || this.candidate?.eventKey !== attempt.job.eventKey) return;
    void this.save(id, attempt, true, title, company);
  }

  private async save(
    id: number,
    attempt: Attempt,
    manual: boolean,
    title = attempt.job.title,
    company = attempt.job.company
  ) {
    if (this.saving || attempt.recorded || !title.trim() || !company.trim()) return;
    const { signal } = this.#controller;
    this.saving = true;
    try {
      const token = await getToken();
      if (signal.aborted) return;
      if (!token) throw new Error('Sign in to save this application.');
      if (!attempt.payload) {
        const { meta } = await getAutofillSessionProfile(token, signal);
        if (signal.aborted) return;
        if (!meta?.candidateId)
          throw new Error('Save a confirmed candidate profile in the portal first.');
        const confirmation = attempt.confirmation?.url ?? attempt.job.jobUrl;
        attempt.payload = {
          candidateId: meta.candidateId,
          eventKey: attempt.job.eventKey,
          jobTitle: title.trim().slice(0, 200),
          companyName: company.trim().slice(0, 200),
          jobUrl: attempt.job.jobUrl,
          confirmationUrl: confirmation.startsWith('https:') ? confirmation : undefined,
          answers: attempt.answers,
          manualAttestation: manual,
          evidence: manual
            ? 'Candidate confirmed submission in the NextKinHR side panel.'
            : (attempt.confirmation?.evidence ?? ''),
        };
      }
      const { duplicate } = await saveApplicationReceipt(attempt.payload, token, signal);
      if (signal.aborted) return;
      attempt.recorded = true;
      if (this.#pending.get(id) === attempt) this.#pending.delete(id);
      if (this.tab().id !== id) return;
      this.showPending(id);
      track('mark_applied', {
        source: attempt.payload.manualAttestation ? 'left_form' : 'ats_confirmation',
      });
      this.notify(
        duplicate
          ? `Already marked as applied — ${attempt.payload.jobTitle}.`
          : `✓ Marked as applied — ${attempt.payload.jobTitle} is in your Applied list.`
      );
    } catch (error) {
      if (signal.aborted) return;
      const message = error instanceof Error ? error.message : 'Could not save this application.';
      if (attempt.payload && !attempt.payload.manualAttestation && /\(HTTP 422\)$/.test(message)) {
        // The server rejected the observation before writing. The same event can be attested manually.
        attempt.payload = undefined;
      }
      this.#pending.set(id, attempt);
      if (this.tab().id === id) {
        this.showPending(id);
        this.notify(`Could not mark as applied: ${message}`);
      }
    } finally {
      if (!signal.aborted) this.saving = false;
    }
  }
}
