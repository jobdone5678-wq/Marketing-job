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
  getReusableAnswers: vi.fn().mockResolvedValue([]),
  requestAutofillPlan: vi.fn(),
  requestAutofillChoice: vi.fn(),
  generateAutofillAnswer: vi.fn(),
  saveBankAnswer: vi.fn(),
}));
vi.mock('./analytics', () => ({ track: vi.fn() }));

import { runAutofill, type FillPanel } from './formFill';
import { isAutofillProse } from './autofillSafety';
import { getAutofillSessionProfile, getAutofillSettings, getReusableAnswers, requestAutofillPlan, requestAutofillChoice, generateAutofillAnswer } from './freehire';

const field = (index: number, label: string, extra: Record<string, unknown> = {}) => ({
  index, form: 0, frame: 0, tag: 'input', type: 'text', label, value: '', ...extra,
});

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

  it('fills a confirmed banked start date before loading AI settings', async () => {
    vi.mocked(getAutofillSettings).mockClear();
    vi.mocked(getAutofillSessionProfile).mockResolvedValueOnce({
      data: {} as Awaited<ReturnType<typeof getAutofillSessionProfile>>['data'],
      meta: { candidateId: 'candidate' },
    });
    vi.mocked(getReusableAnswers).mockResolvedValueOnce([
      { topic: 'start_date', question: 'When can you start?', answer: '2027-02-01', provenance: 'candidate' },
    ]);
    const label = 'What is your earliest start date?';
    let written = '';
    sendMessage.mockImplementation(async (message) => {
      if (message.kind === 'GET_FRAMED_FORM') {
        return { kind: 'FRAMED_FORM', fields: [field(0, label, { value: written })], uploads: [{ frame: 0, form: 0 }] };
      }
      if (message.kind === 'FILL_BY_LABEL') {
        written = message.fills[0].value;
        return { kind: 'FILL_OUTCOMES', outcomes: [{ label, status: 'filled' }] };
      }
    });
    const panel: FillPanel = {
      notice: vi.fn(), offerOverride: vi.fn(), known: vi.fn(), refused: vi.fn(), refreshPlan: async () => {},
      walk: { filling: vi.fn(), stopped: () => false, wrote: vi.fn(), answered: vi.fn() },
    };
    vi.useFakeTimers();
    try {
      const pending = runAutofill('t', panel, new AbortController().signal);
      await vi.runAllTimersAsync();
      await pending;
    } finally {
      vi.useRealTimers();
    }
    expect(written).toBe('2027-02-01');
    expect(getAutofillSettings).not.toHaveBeenCalled();
  });

  it('fills optional demographic groups, intended country, age, and behavioral prose questions', async () => {
    expect(isAutofillProse('Describe a mistake you made in recent years and how did you change your approach afterward?')).toBe(true);
    expect(isAutofillProse('How did you handle a conflict and how did you change your approach afterward?')).toBe(true);
    expect(isAutofillProse('How many years of experience?')).toBe(false);

    vi.mocked(getAutofillSessionProfile).mockResolvedValueOnce({
      meta: { candidateId: 'cand-1' },
      data: {
        full_name: 'Ilya S',
        first_name: 'Ilya',
        last_name: 'S',
        email: 'i@x.io',
        phone: '',
        location: '',
        country: 'United States',
        intended_work_country: 'United States',
        linkedin: '',
        github: '',
        portfolio: '',
        authorized_countries: 'US',
        visa_sponsorship_needed: '',
        desired_salary: '',
        notice_period: '',
        willing_to_relocate: '',
        age_18_or_older: '',
      },
    });
    vi.mocked(getAutofillSettings).mockResolvedValueOnce({ mode: 'server', configVersion: 1 });
    vi.mocked(requestAutofillPlan).mockResolvedValue({ ok: true, executableFills: [] });
    vi.mocked(requestAutofillChoice).mockResolvedValue({ ok: true, choice: null });
    vi.mocked(generateAutofillAnswer).mockResolvedValueOnce({ ok: true, answer: 'I learned to verify early.' });

    const pageFields = [
      field(0, 'First name', { required: true }),
      field(1, 'Email', { required: true }),
      field(2, 'Describe a mistake you made in recent years and how did you change your approach afterward?', { tag: 'textarea', required: true }),
      field(3, 'Which country do you intend to work from?', { combo: true, required: false }),
      field(4, 'What is your current age?', { tag: 'select', type: 'select', options: ['18-24', '25–39 years old', '40-55'], required: false }),
      field(5, 'What is your gender identity?', { combo: true, required: false }),
      field(6, 'Race / Ethnicity', { type: 'checkbox', multiple: true, options: ['Asian or Asian American', 'Black or African American', 'Hispanic or Latine', 'White', 'I prefer not to answer'], required: false }),
      field(7, 'Do you identify as any of the following?', { type: 'checkbox', multiple: true, options: ['Person with disability', 'Neurodivergent', 'Veteran', 'Parent', 'None of the above'], required: false }),
      field(8, 'He/him', { type: 'checkbox', required: false }),
    ];

    const filled: Record<string, string> = {};
    let searchedCountry = false;
    sendMessage.mockImplementation(async (m: { kind: string; fills?: Array<{ label: string; value: string }>; step?: { action: string; label: string; value: string } }) => {
      if (m.kind === 'GET_FRAMED_FORM') {
        return {
          kind: 'FRAMED_FORM',
          fields: pageFields.map((f) => Object.assign({}, f, { value: filled[f.label] ?? '' })),
          uploads: [{ frame: 0, form: 0 }],
        };
      }
      if (m.kind === 'FILL_BY_LABEL') {
        for (const f of m.fills ?? []) filled[f.label] = f.value;
        return { kind: 'FILL_OUTCOMES', outcomes: (m.fills ?? []).map((f) => ({ label: f.label, status: 'filled' })) };
      }
      if (m.kind === 'COMBOBOX_STEP' && m.step) {
        const { action, label, value } = m.step;
        if (action === 'open') return { kind: 'COMBOBOX_REPLY', reply: { status: 'opened' } };
        if (action === 'query' && label.includes('country')) {
          searchedCountry = value === 'United States';
          return { kind: 'COMBOBOX_REPLY', reply: { status: 'queried' } };
        }
        if (action === 'options') {
          return {
            kind: 'COMBOBOX_REPLY',
            reply: {
              status: 'open',
              options: label.includes('country')
                ? searchedCountry ? ['US'] : ['Germany', 'Canada']
                : ['Man', 'Woman', 'Prefer not to say'],
            },
          };
        }
        if (action === 'select') {
          filled[label] = value;
          return { kind: 'COMBOBOX_REPLY', reply: { status: 'selected' } };
        }
        if (action === 'verify') return { kind: 'COMBOBOX_REPLY', reply: { status: 'verified' } };
      }
      return { kind: 'FILL_OUTCOMES', outcomes: [] };
    });

    const panel = {
      notice: vi.fn(),
      offerOverride: vi.fn(),
      walk: { filling: vi.fn(), stopped: () => false, wrote: vi.fn(), answered: vi.fn() },
      refreshPlan: async () => {},
      known: vi.fn(),
      refused: vi.fn(),
    } as FillPanel;

    vi.useFakeTimers();
    const p = runAutofill('t', panel, new AbortController().signal, {
      enabled: true,
      answers: {
        ageRange: ['25-34'],
        gender: ['Male'],
        pronouns: ['He/Him'],
        raceEthnicity: ['Asian'],
        disability: ['Yes'],
        veteran: ['No'],
        parentalStatus: ['Yes'],
      },
    });
    await vi.runAllTimersAsync();
    await p;
    vi.useRealTimers();

    expect(filled).toEqual({
      'First name': 'Ilya',
      'Email': 'i@x.io',
      'Describe a mistake you made in recent years and how did you change your approach afterward?': 'I learned to verify early.',
      'Which country do you intend to work from?': 'US',
      'What is your current age?': '25–39 years old',
      'He/him': 'true',
      'What is your gender identity?': 'Man',
      'Race / Ethnicity': 'Asian or Asian American',
      'Do you identify as any of the following?': 'Person with disability, Parent',
    });
  });
});
