import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendMessage = vi.hoisted(() => vi.fn());
vi.mock('wxt/browser', () => ({ browser: {
  runtime: { sendMessage },
  tabs: { query: async () => [{ id: 1, url: 'https://jobs.example.test/apply' }] },
} }));
vi.mock('./freehire', () => ({
  getAutofillSessionProfile: vi.fn().mockResolvedValue({ data: {
    first_name: 'Ilya', last_name: 'S', email: 'i@x.io',
  } }),
  getAutofillSettings: vi.fn(),
  requestAutofillPlan: vi.fn(),
  requestAutofillChoice: vi.fn(),
  generateAutofillAnswer: vi.fn(),
  saveBankAnswer: vi.fn(),
}));
vi.mock('./analytics', () => ({ track: vi.fn() }));

import { runAutofill, type FillPanel } from './formFill';

const field = (index: number, label: string) => ({ index, form: 0, frame: 0, tag: 'input', label, value: '' });

describe('deterministicAutofill job-alert guard', () => {
  beforeEach(() => {
    sendMessage.mockReset();
    sendMessage.mockImplementation(async (m: { kind: string }) => {
      if (m.kind === 'GET_FRAMED_FORM') {
        return { kind: 'FRAMED_FORM', fields: [field(0, 'First name'), field(1, 'Email')], uploads: [] };
      }
      return { kind: 'FILL_OUTCOMES', outcomes: [{ status: 'filled' }] };
    });
  });

  it('declines a form with no CV upload, and fills it only when forced', async () => {
    const notices: string[] = [];
    const offer = vi.fn();
    const panel = {
      notice: (t: string) => void notices.push(t),
      offerOverride: offer,
      walk: { filling() {}, stopped: () => false, wrote() {}, answered() {} },
      refreshPlan: async () => {},
      known() {},
      refused() {},
    } as FillPanel;

    const signal = new AbortController().signal;
    await runAutofill('t', panel, signal);
    const fillCalls = () => sendMessage.mock.calls.filter(([m]) => m.kind === 'FILL_BY_LABEL');
    expect(fillCalls()).toHaveLength(0);
    expect(notices.some((n) => n.includes("doesn't look like the application form"))).toBe(true);
    const run = offer.mock.calls.find(([f]) => typeof f === 'function')?.[0];
    expect(run).toBeTypeOf('function');

    vi.useFakeTimers();
    const p = run(signal);
    await vi.runAllTimersAsync();
    await p;
    vi.useRealTimers();
    expect(fillCalls().length).toBeGreaterThan(0);
  });
});
