import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CapturedJob, RuntimeMessage } from './protocol';

const mocks = vi.hoisted(() => {
  const storage: Record<string, unknown> = {};
  return {
    storage,
    trackJob: vi.fn(),
    getSession: vi.fn(),
    addListener: vi.fn(),
    sendMessage: vi.fn(),
  };
});

vi.mock('wxt/browser', () => ({
  browser: {
    runtime: { onMessage: { addListener: mocks.addListener } },
    storage: {
      session: {
        get: async (key: string) => ({ [key]: mocks.storage[key] }),
        set: async (patch: Record<string, unknown>) => Object.assign(mocks.storage, patch),
        remove: async (key: string) => delete mocks.storage[key],
      },
    },
    tabs: {
      onRemoved: { addListener: vi.fn() },
      query: async () => [{ id: 8 }],
      sendMessage: mocks.sendMessage,
    },
  },
}));

vi.mock('./nextkinhr', () => ({
  NEXTKIN_ORIGIN: 'https://www.nextkinhr.com',
  getSession: mocks.getSession,
  trackJob: mocks.trackJob,
  NextKinError: class extends Error {},
}));

import { monitorApplications, readApplication } from './applicationSync';

const posting: CapturedJob = {
  jobUrl: 'https://jobs.lever.co/example/job-123',
  title: 'Engineer',
  company: 'Example',
  description: 'A live job description',
};
const receipt: RuntimeMessage = { kind: 'APPLICATION_CONFIRMED', evidence: 'Application submitted' };

type Inbox = (
  message: RuntimeMessage,
  sender: { tab: { id: number }; frameId: number; url: string },
) => Promise<unknown> | undefined;

async function send(message: RuntimeMessage, url: string) {
  const handler = mocks.addListener.mock.lastCall?.[0] as Inbox;
  await handler(message, { frameId: 0, tab: { id: 4 }, url });
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(mocks.storage)) delete mocks.storage[key];
  mocks.getSession.mockResolvedValue({ token: 'paired-session', userId: 'account' });
  mocks.trackJob.mockResolvedValue({ success: true });
  monitorApplications();
});

describe('application sync', () => {
  it('arms a catalog launch and waits for both submit and receipt', async () => {
    await send({ kind: 'APPLICATION_WATCH', job: posting }, 'https://www.nextkinhr.com/jobs/job-123/apply');
    const watch = await readApplication(4);
    expect(watch?.submitted).toBe(false);
    await send(receipt, posting.jobUrl + '/confirmation');
    expect(mocks.trackJob).not.toHaveBeenCalled();
    await send({ kind: 'APPLICATION_SUBMIT' }, posting.jobUrl + '/apply');
    await send(receipt, posting.jobUrl + '/confirmation');
    expect(mocks.trackJob).toHaveBeenCalledWith(
      posting, 'paired-session', undefined, watch?.eventKey,
      { url: posting.jobUrl + '/confirmation', evidence: receipt.evidence },
    );
    expect(mocks.sendMessage).toHaveBeenCalledWith(8, { kind: 'APPLICATION_SAVED' }, { frameId: 0 });
    await send(receipt, posting.jobUrl + '/confirmation');
    expect(mocks.trackJob).toHaveBeenCalledTimes(1);
  });

  it('tracks an external application submitted without autofill', async () => {
    await send({ kind: 'APPLICATION_SUBMIT', job: posting }, posting.jobUrl);
    await send(receipt, 'https://other.example/success');
    expect(mocks.trackJob).not.toHaveBeenCalled();
    await send(receipt, 'https://jobs.lever.co/example/thanks?applicantId=private&jobId=job-123');
    expect(mocks.trackJob).toHaveBeenCalledWith(
      posting, 'paired-session', undefined, expect.any(String),
      { url: 'https://jobs.lever.co/example/thanks?jobId=job-123', evidence: receipt.evidence },
    );
  });

  it('does not arm a catalog posting from a third-party page', async () => {
    await send({ kind: 'APPLICATION_WATCH', job: posting }, 'https://example.test/jobs/job-123/apply');
    expect(await readApplication(4)).toBeUndefined();
  });

  it('requires the paired account to own the Outside Jobs handoff', async () => {
    const url = 'https://www.nextkinhr.com/dashboard/outside-jobs/captured-job/apply';
    await send({ kind: 'APPLICATION_WATCH', job: posting, actorId: 'different-account' }, url);
    expect(await readApplication(4)).toBeUndefined();
    await send({ kind: 'APPLICATION_WATCH', job: posting, actorId: 'account' }, url);
    expect((await readApplication(4))?.job).toEqual(posting);
  });
});
