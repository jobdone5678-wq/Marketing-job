import { describe, it, expect, vi, beforeEach } from 'vitest';

const sendMessage = vi.hoisted(() => vi.fn());
vi.mock('wxt/browser', () => ({ browser: {
  runtime: { sendMessage },
  tabs: { query: async () => [{ id: 1, url: 'https://jobs.example.test/apply' }] },
} }));
vi.mock('./freehire', async () => {
  const actual = await vi.importActual<typeof import('./freehire')>('./freehire');
  return {
    ...actual,
    getAutofillSessionProfile: vi.fn().mockResolvedValue({ data: {
      first_name: 'Ilya', last_name: 'S', email: 'i@x.io',
    } }),
    getAutofillSettings: vi.fn(),
    getReusableAnswers: vi.fn().mockResolvedValue([]),
    requestAutofillPlan: vi.fn(),
    requestAutofillChoice: vi.fn(),
    generateAutofillAnswer: vi.fn(),
    saveBankAnswer: vi.fn(),
  };
});
vi.mock('./analytics', () => ({ track: vi.fn() }));

import { runAutofill, type FillPanel } from './formFill';
import { isAutofillProse } from './autofillSafety';
import {
  ExtensionApiError,
  getAutofillSessionProfile,
  getAutofillSettings,
  getReusableAnswers,
  requestAutofillPlan,
  requestAutofillChoice,
  generateAutofillAnswer,
} from './freehire';

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
      return { kind: 'FILL_OUTCOMES', outcomes: [] };
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
    vi.mocked(requestAutofillPlan).mockReset();
    vi.mocked(requestAutofillChoice).mockReset();
    vi.mocked(requestAutofillPlan).mockResolvedValue({
      ok: true,
      executableFills: [
        { fieldId: '0:0:4', label: 'What is your current age?', value: '25–39 years old', grounded: true },
        { fieldId: '0:0:6', label: 'Race / Ethnicity', value: 'Asian or Asian American', grounded: true },
        { fieldId: '0:0:7', label: 'Do you identify as any of the following?', value: 'Person with disability, Parent', grounded: true },
        { fieldId: '0:0:8', label: 'He/him', value: 'true', grounded: true },
      ],
      deferredPlans: [{ fieldId: '0:0:5', label: 'What is your gender identity?' }],
    });
    vi.mocked(requestAutofillChoice).mockResolvedValue({ ok: true, choice: 'Man' });
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
    const p = runAutofill('t', panel, new AbortController().signal);
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

  function makePanel() {
    const notices: string[] = [];
    const panel: FillPanel = {
      notice: (text) => void notices.push(text),
      offerOverride: vi.fn(),
      walk: { filling: vi.fn(), stopped: () => false, wrote: vi.fn(), answered: vi.fn() },
      refreshPlan: async () => {},
      known: vi.fn(),
      refused: vi.fn(),
    };
    return { panel, notices };
  }

  async function runWithTimers(panel: FillPanel) {
    vi.useFakeTimers();
    try {
      const pending = runAutofill('t', panel, new AbortController().signal);
      await vi.runAllTimersAsync();
      await pending;
    } finally {
      vi.useRealTimers();
    }
  }

  it('(a) executes typeahead location combobox and linked boolean_buttons sponsorship in DOM order, skipping when combobox fails to commit, and re-planning on country mismatch', async () => {
    const locLabel = 'Which country do you intend to work from?';
    const sponLabel = 'Will you now or in the future require sponsorship for employment visa status to work in this location?';

    const setupScenario = (opts: { commitMode: 'match' | 'did_not_commit' | 'mismatch_country' }) => {
      vi.mocked(getAutofillSessionProfile).mockResolvedValueOnce({
        meta: { candidateId: 'cand-a' },
        data: {
          full_name: 'Ilya S', first_name: 'Ilya', last_name: 'S', email: 'i@x.io',
          phone: '', location: 'Austin, United States', linkedin: '', github: '', portfolio: '',
          authorized_countries: 'US', visa_sponsorship_needed: 'No',
          desired_salary: '', notice_period: '', willing_to_relocate: '', age_18_or_older: '',
        },
      });
      vi.mocked(getAutofillSettings).mockResolvedValueOnce({ mode: 'server', configVersion: 1 });
      vi.mocked(requestAutofillPlan).mockReset();
      vi.mocked(requestAutofillChoice).mockReset();

      vi.mocked(requestAutofillPlan).mockImplementation(async (input) => {
        if (input.fields.some((f) => f.label === locLabel)) {
          return {
            ok: true,
            deferredPlans: [{ fieldId: '0:0:0', label: locLabel, searchQuery: 'Austin, United States' }],
            executableFills: [
              { fieldId: '0:0:1', label: sponLabel, value: 'No', dependsOnFieldId: '0:0:0', grounded: true },
            ],
          };
        }
        // Re-plan for sponsorship after Canada was committed instead of US
        return {
          ok: true,
          executableFills: [
            { fieldId: '0:0:1', label: sponLabel, value: 'Yes', grounded: true },
          ],
        };
      });
      vi.mocked(requestAutofillChoice).mockResolvedValue({
        ok: true,
        choice: opts.commitMode === 'mismatch_country' ? 'Toronto, Canada' : 'Austin, United States',
      });

      const pageFields = [
        field(0, locLabel, { combo: true, widgetType: 'combobox', helperText: 'Please list your city and country.' }),
        field(1, sponLabel, { type: 'radio', widgetType: 'boolean_buttons', options: ['Yes', 'No'] }),
      ];
      const filled: Record<string, string> = {};
      let queriedValue = '';
      sendMessage.mockImplementation(async (m: {
        kind: string;
        fills?: Array<{ label: string; value: string; onlyEmpty?: boolean }>;
        step?: { action: string; label: string; value: string };
      }) => {
        if (m.kind === 'GET_PAGE_SNAPSHOT') {
          return { kind: 'PAGE_SNAPSHOT', snapshot: { url: 'https://jobs.ashbyhq.com/acme/1', title: 'Backend Engineer', headline: 'Backend Engineer', text: '' } };
        }
        if (m.kind === 'GET_FRAMED_FORM') {
          return {
            kind: 'FRAMED_FORM',
            fields: pageFields.map((f) => Object.assign({}, f, { value: filled[f.label] ?? '' })),
            uploads: [{ frame: 0, form: 0 }],
          };
        }
        if (m.kind === 'FILL_BY_LABEL') {
          for (const f of m.fills ?? []) {
            expect(f.onlyEmpty).toBe(true);
            filled[f.label] = f.value;
          }
          return { kind: 'FILL_OUTCOMES', outcomes: (m.fills ?? []).map((f) => ({ label: f.label, status: 'filled' })) };
        }
        if (m.kind === 'COMBOBOX_STEP' && m.step) {
          const { action, label, value } = m.step;
          if (action === 'open') return { kind: 'COMBOBOX_REPLY', reply: { status: 'opened' } };
          if (action === 'query') {
            queriedValue = value;
            return { kind: 'COMBOBOX_REPLY', reply: { status: 'queried' } };
          }
          if (action === 'options') {
            return {
              kind: 'COMBOBOX_REPLY',
              reply: {
                status: 'open',
                options: queriedValue ? ['Austin, United States', 'Toronto, Canada'] : [],
              },
            };
          }
          if (action === 'select') {
            if (opts.commitMode === 'did_not_commit') {
              return { kind: 'COMBOBOX_REPLY', reply: { status: 'did_not_commit' } };
            }
            filled[label] = value;
            return { kind: 'COMBOBOX_REPLY', reply: { status: 'selected' } };
          }
          if (action === 'verify') {
            return { kind: 'COMBOBOX_REPLY', reply: { status: 'verified', committed: filled[label] } };
          }
          if (action === 'clear') return { kind: 'COMBOBOX_REPLY', reply: { status: 'cleared' } };
        }
        return { kind: 'FILL_OUTCOMES', outcomes: [] };
      });
      return { filled, getQueried: () => queriedValue };
    };

    // 1. Success path
    {
      const { filled, getQueried } = setupScenario({ commitMode: 'match' });
      const { panel } = makePanel();
      await runWithTimers(panel);
      expect(getQueried()).toBe('Austin, United States');
      expect(requestAutofillPlan).toHaveBeenCalledTimes(1);
      expect(vi.mocked(requestAutofillPlan).mock.calls[0]?.[0].fields[0]).toMatchObject({
        label: locLabel,
        helperText: 'Please list your city and country.',
        widgetType: 'combobox',
      });
      expect(requestAutofillChoice).toHaveBeenCalledWith(
        expect.objectContaining({
          question: expect.objectContaining({ label: locLabel, helperText: 'Please list your city and country.' }),
          options: ['Austin, United States', 'Toronto, Canada'],
        }),
        't',
        expect.any(AbortSignal),
      );
      expect(filled).toEqual({
        [locLabel]: 'Austin, United States',
        [sponLabel]: 'No',
      });
    }

    // 2. Failure path: did_not_commit -> dependent boolean_buttons NOT clicked
    {
      const { filled } = setupScenario({ commitMode: 'did_not_commit' });
      const { panel } = makePanel();
      await runWithTimers(panel);
      expect(filled[locLabel]).toBeUndefined();
      expect(filled[sponLabel]).toBeUndefined();
    }

    // 3. Country mismatch path: committed Canada instead of planned US -> re-requests plan with Canada
    {
      const { filled } = setupScenario({ commitMode: 'mismatch_country' });
      const { panel } = makePanel();
      await runWithTimers(panel);
      expect(requestAutofillPlan).toHaveBeenCalledTimes(2);
      expect(vi.mocked(requestAutofillPlan).mock.calls[1]?.[0].context?.previouslyResolved).toEqual({
        [locLabel]: 'Toronto, Canada',
      });
      expect(filled).toEqual({
        [locLabel]: 'Toronto, Canada',
        [sponLabel]: 'Yes',
      });
    }
  });

  it('(b) fills US work-authorization radio grounded to authorized_countries', async () => {
    const label = 'Are you authorized to work in the United States?';
    for (const [authCountries, expected] of [['US', 'Yes'], ['CA', 'No']] as const) {
      vi.mocked(getAutofillSessionProfile).mockResolvedValueOnce({
        meta: { candidateId: 'cand-b' },
        data: {
          full_name: 'Ilya S', first_name: 'Ilya', last_name: 'S', email: 'i@x.io',
          phone: '', location: '', linkedin: '', github: '', portfolio: '',
          authorized_countries: authCountries, visa_sponsorship_needed: '',
          desired_salary: '', notice_period: '', willing_to_relocate: '', age_18_or_older: '',
        },
      });
      vi.mocked(getAutofillSettings).mockReset();
      vi.mocked(requestAutofillPlan).mockReset();
      vi.mocked(getAutofillSettings).mockResolvedValueOnce({ mode: 'server', configVersion: 1 });
      vi.mocked(requestAutofillPlan).mockResolvedValueOnce({
        ok: true,
        executableFills: [{ fieldId: '0:0:0', label, value: expected, grounded: true }],
      });

      const filled: Record<string, string> = {};
      sendMessage.mockImplementation(async (m: { kind: string; fills?: Array<{ label: string; value: string }> }) => {
        if (m.kind === 'GET_FRAMED_FORM') {
          return {
            kind: 'FRAMED_FORM',
            fields: [field(0, label, { type: 'radio', widgetType: 'radio', options: ['Yes', 'No'], value: filled[label] ?? '' })],
            uploads: [{ frame: 0, form: 0 }],
          };
        }
        if (m.kind === 'FILL_BY_LABEL') {
          for (const f of m.fills ?? []) filled[f.label] = f.value;
          return { kind: 'FILL_OUTCOMES', outcomes: (m.fills ?? []).map((f) => ({ label: f.label, status: 'filled' })) };
        }
        return { kind: 'PAGE_SNAPSHOT', snapshot: { url: 'https://boards.greenhouse.io/acme/jobs/1', title: 'Engineer', headline: 'Engineer', text: '' } };
      });

      const { panel } = makePanel();
      await runWithTimers(panel);
      expect(filled[label]).toBe(expected);
    }
  });

  it('(c) passes bundled communities checkbox_group to Phase B, splits comma-containing choices longest-first when enabled, and leaves unchecked when disabled', async () => {
    const label = 'Which of the following communities do you belong to?';
    const options = ['Asian, South Asian', 'Black or African American', 'Veteran', 'None of the above'];

    for (const enabled of [true, false]) {
      vi.mocked(getAutofillSessionProfile).mockResolvedValueOnce({
        meta: { candidateId: 'cand-c' },
        data: {
          full_name: 'Ilya S', first_name: 'Ilya', last_name: 'S', email: 'i@x.io',
          phone: '', location: '', linkedin: '', github: '', portfolio: '',
          authorized_countries: 'US', visa_sponsorship_needed: '',
          desired_salary: '', notice_period: '', willing_to_relocate: '', age_18_or_older: '',
        },
      });
      vi.mocked(getAutofillSettings).mockResolvedValueOnce({ mode: 'server', configVersion: 1 });
      vi.mocked(requestAutofillPlan).mockReset();
      vi.mocked(requestAutofillPlan).mockResolvedValueOnce({
        ok: true,
        executableFills: enabled
          ? [{ fieldId: '0:0:0', label, value: 'Asian, South Asian, Veteran', grounded: true }]
          : [],
      });

      const sentFills: Array<{ label: string; value: string; choices?: string[] }> = [];
      const filled: Record<string, string> = {};
      sendMessage.mockImplementation(async (m: { kind: string; fills?: Array<{ label: string; value: string; choices?: string[] }> }) => {
        if (m.kind === 'GET_FRAMED_FORM') {
          return {
            kind: 'FRAMED_FORM',
            fields: [field(0, label, { type: 'checkbox', multiple: true, widgetType: 'checkbox_group', options, value: filled[label] ?? '' })],
            uploads: [{ frame: 0, form: 0 }],
          };
        }
        if (m.kind === 'FILL_BY_LABEL') {
          for (const f of m.fills ?? []) {
            sentFills.push(f);
            filled[f.label] = f.value;
          }
          return { kind: 'FILL_OUTCOMES', outcomes: (m.fills ?? []).map((f) => ({ label: f.label, status: 'filled' })) };
        }
        return { kind: 'PAGE_SNAPSHOT', snapshot: { url: 'https://jobs.ashbyhq.com/acme/1', title: 'Engineer', headline: 'Engineer', text: '' } };
      });

      const { panel } = makePanel();
      await runWithTimers(panel);
      expect(requestAutofillPlan).toHaveBeenCalledTimes(1);
      expect(vi.mocked(requestAutofillPlan).mock.calls[0]?.[0].fields[0]?.label).toBe(label);

      if (enabled) {
        expect(sentFills[0]?.choices).toEqual(['Asian, South Asian', 'Veteran']);
        expect(filled[label]).toBe('Asian, South Asian, Veteran');
      } else {
        expect(sentFills).toHaveLength(0);
        expect(filled[label]).toBeUndefined();
      }
    }
  });

  it('(d) resolves standalone Race custom combobox via requestAutofillChoice when enabled and skips when disabled', async () => {
    const label = 'Race';
    for (const enabled of [true, false]) {
      vi.mocked(getAutofillSessionProfile).mockResolvedValueOnce({
        meta: { candidateId: 'cand-d' },
        data: {
          full_name: 'Ilya S', first_name: 'Ilya', last_name: 'S', email: 'i@x.io',
          phone: '', location: '', linkedin: '', github: '', portfolio: '',
          authorized_countries: 'US', visa_sponsorship_needed: '',
          desired_salary: '', notice_period: '', willing_to_relocate: '', age_18_or_older: '',
        },
      });
      vi.mocked(getAutofillSettings).mockResolvedValueOnce({ mode: 'server', configVersion: 1 });
      vi.mocked(requestAutofillPlan).mockReset();
      vi.mocked(requestAutofillChoice).mockReset();
      vi.mocked(requestAutofillPlan).mockResolvedValueOnce({
        ok: true,
        executableFills: [],
        deferredPlans: enabled ? [{ fieldId: '0:0:0', label }] : [],
      });
      vi.mocked(requestAutofillChoice).mockResolvedValueOnce({
        ok: true,
        choice: enabled ? 'Asian' : null,
      });

      const filled: Record<string, string> = {};
      sendMessage.mockImplementation(async (m: { kind: string; step?: { action: string; label: string; value: string } }) => {
        if (m.kind === 'GET_FRAMED_FORM') {
          return {
            kind: 'FRAMED_FORM',
            fields: [field(0, label, { combo: true, widgetType: 'combobox', value: filled[label] ?? '' })],
            uploads: [{ frame: 0, form: 0 }],
          };
        }
        if (m.kind === 'COMBOBOX_STEP' && m.step) {
          if (m.step.action === 'open') return { kind: 'COMBOBOX_REPLY', reply: { status: 'opened' } };
          if (m.step.action === 'options') return { kind: 'COMBOBOX_REPLY', reply: { status: 'open', options: ['Asian', 'White', 'Decline to self-identify'] } };
          if (m.step.action === 'select') {
            filled[m.step.label] = m.step.value;
            return { kind: 'COMBOBOX_REPLY', reply: { status: 'selected' } };
          }
          if (m.step.action === 'verify') return { kind: 'COMBOBOX_REPLY', reply: { status: 'verified', committed: filled[m.step.label] } };
        }
        return { kind: 'PAGE_SNAPSHOT', snapshot: { url: 'https://jobs.lever.co/acme/1', title: 'Engineer', headline: 'Engineer', text: '' } };
      });

      const { panel } = makePanel();
      await runWithTimers(panel);
      if (enabled) {
        expect(requestAutofillChoice).toHaveBeenCalledTimes(1);
        expect(filled[label]).toBe('Asian');
      } else {
        expect(requestAutofillChoice).not.toHaveBeenCalled();
        expect(filled[label]).toBeUndefined();
      }
    }
  });

  it('rescans dynamically revealed conditional fields across bounded passes without overwriting pre-filled answers', async () => {
    vi.mocked(getAutofillSessionProfile).mockResolvedValueOnce({
      meta: { candidateId: 'cand-dyn' },
      data: {
        full_name: 'Ilya S', first_name: 'Ilya', last_name: 'S', email: 'i@x.io',
        phone: '', location: '', linkedin: '', github: '', portfolio: '',
        authorized_countries: 'US', visa_sponsorship_needed: '',
        desired_salary: '', notice_period: '', willing_to_relocate: '', age_18_or_older: '',
      },
    });
    vi.mocked(getAutofillSettings).mockResolvedValueOnce({ mode: 'server', configVersion: 1 });
    vi.mocked(requestAutofillPlan).mockReset();
    vi.mocked(requestAutofillChoice).mockReset();

    const filled: Record<string, string> = {
      'Referral source': 'Employee typed manually',
    };
    vi.mocked(requestAutofillPlan).mockImplementation(async (input) => {
      if (input.fields.some((f) => f.label === 'Work location')) {
        return {
          ok: true,
          deferredPlans: [{ fieldId: '0:0:0', label: 'Work location', searchQuery: 'United States' }],
          executableFills: [
            // Attempted overwrite of user-entered field must be ignored
            { fieldId: '0:0:1', label: 'Referral source', value: 'Job board', grounded: true },
          ],
        };
      }
      if (input.fields.some((f) => f.label === 'US visa status')) {
        return {
          ok: true,
          executableFills: [{ fieldId: '0:0:2', label: 'US visa status', value: 'Citizen / PR', grounded: true }],
        };
      }
      return { ok: true, executableFills: [] };
    });
    vi.mocked(requestAutofillChoice).mockResolvedValueOnce({ ok: true, choice: 'United States' });

    sendMessage.mockImplementation(async (m: {
      kind: string;
      fills?: Array<{ label: string; value: string; onlyEmpty?: boolean }>;
      step?: { action: string; label: string; value: string };
    }) => {
      if (m.kind === 'GET_FRAMED_FORM') {
        const dynamicFields = [
          field(0, 'Work location', { combo: true, widgetType: 'combobox', value: filled['Work location'] ?? '' }),
          field(1, 'Referral source', { value: filled['Referral source'] ?? '' }),
        ];
        if (filled['Work location'] === 'United States') {
          dynamicFields.push(
            field(2, 'US visa status', { tag: 'select', type: 'select', widgetType: 'select', options: ['H-1B', 'Citizen / PR'], value: filled['US visa status'] ?? '' }),
          );
        }
        return { kind: 'FRAMED_FORM', fields: dynamicFields, uploads: [{ frame: 0, form: 0 }] };
      }
      if (m.kind === 'FILL_BY_LABEL') {
        for (const f of m.fills ?? []) {
          if (f.onlyEmpty && filled[f.label]) continue;
          filled[f.label] = f.value;
        }
        return { kind: 'FILL_OUTCOMES', outcomes: (m.fills ?? []).map((f) => ({ label: f.label, status: 'filled' })) };
      }
      if (m.kind === 'COMBOBOX_STEP' && m.step) {
        if (m.step.action === 'open') return { kind: 'COMBOBOX_REPLY', reply: { status: 'opened' } };
        if (m.step.action === 'options') return { kind: 'COMBOBOX_REPLY', reply: { status: 'open', options: ['United States', 'Canada'] } };
        if (m.step.action === 'select') {
          filled[m.step.label] = m.step.value;
          return { kind: 'COMBOBOX_REPLY', reply: { status: 'selected' } };
        }
        if (m.step.action === 'verify') return { kind: 'COMBOBOX_REPLY', reply: { status: 'verified', committed: filled[m.step.label] } };
      }
      return { kind: 'PAGE_SNAPSHOT', snapshot: { url: 'https://myworkdayjobs.com/acme/1', title: 'Engineer', headline: 'Engineer', text: '' } };
    });

    const { panel } = makePanel();
    await runWithTimers(panel);

    expect(filled['Work location']).toBe('United States');
    expect(filled['Referral source']).toBe('Employee typed manually');
    expect(filled['US visa status']).toBe('Citizen / PR');
    expect(requestAutofillPlan).toHaveBeenCalledTimes(2);
    expect(vi.mocked(requestAutofillPlan).mock.calls[1]?.[0].context?.previouslyResolved?.['Work location']).toBe('United States');
  });

  it('isolates batch HTTP 504 timeouts so Batch 2 and remaining comboboxes still execute and fill', async () => {
    vi.mocked(getAutofillSessionProfile).mockResolvedValueOnce({
      meta: { candidateId: 'cand-504' },
      data: {
        full_name: 'Ilya S', first_name: 'Ilya', last_name: 'S', email: 'i@x.io',
        phone: '', location: '', linkedin: '', github: '', portfolio: '',
        authorized_countries: 'US', visa_sponsorship_needed: '',
        desired_salary: '', notice_period: '', willing_to_relocate: '', age_18_or_older: '',
      },
    });
    vi.mocked(getAutofillSettings).mockResolvedValueOnce({ mode: 'server', configVersion: 1 });
    vi.mocked(requestAutofillPlan).mockReset();
    vi.mocked(requestAutofillChoice).mockReset();

    // 6 fields => Batch 1 has 5 fields (Q1..Q5 including combo Q3), Batch 2 has 1 field (Q6)
    let planCall = 0;
    vi.mocked(requestAutofillPlan).mockImplementation(async (input) => {
      planCall++;
      if (planCall === 1) {
        expect(input.fields).toHaveLength(5);
        throw new ExtensionApiError('/api/extension/autofill/plan', 504, '{"error":"Gateway Timeout"}');
      }
      return {
        ok: true,
        executableFills: [{ fieldId: '0:0:5', label: 'Question 6', value: 'Answer 6', grounded: true }],
      };
    });
    vi.mocked(requestAutofillChoice).mockResolvedValueOnce({ ok: true, choice: 'Remote' });

    const pageFields = [
      field(0, 'Question 1'),
      field(1, 'Question 2'),
      field(2, 'Work arrangement', { combo: true, widgetType: 'combobox' }),
      field(3, 'Question 4'),
      field(4, 'Question 5'),
      field(5, 'Question 6'),
    ];
    const filled: Record<string, string> = {};
    sendMessage.mockImplementation(async (m: {
      kind: string;
      fills?: Array<{ label: string; value: string }>;
      step?: { action: string; label: string; value: string };
    }) => {
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
        if (m.step.action === 'open') return { kind: 'COMBOBOX_REPLY', reply: { status: 'opened' } };
        if (m.step.action === 'options') return { kind: 'COMBOBOX_REPLY', reply: { status: 'open', options: ['Remote', 'Hybrid'] } };
        if (m.step.action === 'select') {
          filled[m.step.label] = m.step.value;
          return { kind: 'COMBOBOX_REPLY', reply: { status: 'selected' } };
        }
        if (m.step.action === 'verify') return { kind: 'COMBOBOX_REPLY', reply: { status: 'verified', committed: filled[m.step.label] } };
      }
      return { kind: 'PAGE_SNAPSHOT', snapshot: { url: 'https://jobs.example.test/apply', title: 'Engineer', headline: 'Engineer', text: '' } };
    });

    const { panel, notices } = makePanel();
    await runWithTimers(panel);

    expect(notices.some((n) => n.includes('AI planning timed out (HTTP 504)'))).toBe(true);
    expect(filled['Work arrangement']).toBe('Remote');
    expect(filled['Question 6']).toBe('Answer 6');
  });

  it('gates cross-batch location-linked sponsorship even when Batch 2 omits dependsOnFieldId', async () => {
    const locLabel = 'Which country do you intend to work from?';
    const sponLabel = 'Will you now or in the future require sponsorship?';
    vi.mocked(getAutofillSessionProfile).mockResolvedValueOnce({
      meta: { candidateId: 'cand-cross' },
      data: {
        full_name: 'Ilya S', first_name: 'Ilya', last_name: 'S', email: 'i@x.io',
        phone: '', location: 'Austin, United States', linkedin: '', github: '', portfolio: '',
        authorized_countries: 'US', visa_sponsorship_needed: 'No',
        desired_salary: '', notice_period: '', willing_to_relocate: '', age_18_or_older: '',
      },
    });
    vi.mocked(getAutofillSettings).mockReset();
    vi.mocked(getAutofillSettings).mockResolvedValueOnce({ mode: 'server', configVersion: 1 });
    vi.mocked(requestAutofillPlan).mockReset();
    vi.mocked(requestAutofillChoice).mockReset();

    // Batch 1 (5 fields): locLabel at index 0 + Q1..Q4
    // Batch 2 (1 field): sponLabel at index 5 WITHOUT dependsOnFieldId
    let planCall = 0;
    vi.mocked(requestAutofillPlan).mockImplementation(async () => {
      planCall++;
      if (planCall === 1) {
        return {
          ok: true,
          deferredPlans: [{ fieldId: '0:0:0', label: locLabel, searchQuery: 'Austin, United States' }],
          executableFills: [
            { fieldId: '0:0:1', label: 'Question 1', value: 'A1', grounded: true },
          ],
        };
      }
      return {
        ok: true,
        executableFills: [
          // Intentionally omit dependsOnFieldId
          { fieldId: '0:0:5', label: sponLabel, value: 'No', grounded: true },
        ],
      };
    });
    vi.mocked(requestAutofillChoice).mockResolvedValueOnce({ ok: true, choice: 'Austin, United States' });

    const pageFields = [
      field(0, locLabel, { combo: true, widgetType: 'combobox' }),
      field(1, 'Question 1'),
      field(2, 'Question 2'),
      field(3, 'Question 3'),
      field(4, 'Question 4'),
      field(5, sponLabel, { type: 'radio', widgetType: 'boolean_buttons', options: ['Yes', 'No'] }),
    ];
    const filled: Record<string, string> = {};
    sendMessage.mockImplementation(async (m: {
      kind: string;
      fills?: Array<{ label: string; value: string }>;
      step?: { action: string; label: string; value: string };
    }) => {
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
        if (m.step.action === 'open') return { kind: 'COMBOBOX_REPLY', reply: { status: 'opened' } };
        if (m.step.action === 'options') return { kind: 'COMBOBOX_REPLY', reply: { status: 'open', options: ['Austin, United States'] } };
        if (m.step.action === 'select') return { kind: 'COMBOBOX_REPLY', reply: { status: 'did_not_commit' } };
      }
      return { kind: 'PAGE_SNAPSHOT', snapshot: { url: 'https://jobs.ashbyhq.com/acme/1', title: 'Backend Engineer', headline: 'Backend Engineer', text: '' } };
    });

    const { panel } = makePanel();
    await runWithTimers(panel);

    expect(filled['Question 1']).toBe('A1');
    expect(filled[locLabel]).toBeUndefined();
    expect(filled[sponLabel]).toBeUndefined();
  });

  it('defers Answer Bank sponsorship entry when an unfilled location combobox precedes it in DOM order', async () => {
    const locLabel = 'Which country do you intend to work from?';
    const sponLabel = 'Will you now or in the future require sponsorship?';
    vi.mocked(getAutofillSessionProfile).mockResolvedValueOnce({
      meta: { candidateId: 'cand-bank-defer' },
      data: {
        full_name: 'Ilya S', first_name: 'Ilya', last_name: 'S', email: 'i@x.io',
        phone: '', location: 'Toronto, Canada', linkedin: '', github: '', portfolio: '',
        authorized_countries: 'US', visa_sponsorship_needed: '',
        desired_salary: '', notice_period: '', willing_to_relocate: '', age_18_or_older: '',
      },
    });
    vi.mocked(getReusableAnswers).mockResolvedValueOnce([
      { topic: 'visa_sponsorship', question: sponLabel, answer: 'No', provenance: 'candidate' },
    ]);
    vi.mocked(getAutofillSettings).mockReset();
    vi.mocked(getAutofillSettings).mockResolvedValueOnce({ mode: 'server', configVersion: 1 });
    vi.mocked(requestAutofillPlan).mockReset();
    vi.mocked(requestAutofillChoice).mockReset();

    vi.mocked(requestAutofillPlan).mockResolvedValueOnce({
      ok: true,
      deferredPlans: [{ fieldId: '0:0:0', label: locLabel, searchQuery: 'Toronto, Canada' }],
      executableFills: [
        { fieldId: '0:0:1', label: sponLabel, value: 'Yes', dependsOnFieldId: '0:0:0', grounded: true },
      ],
    });
    vi.mocked(requestAutofillChoice).mockResolvedValueOnce({ ok: true, choice: 'Toronto, Canada' });

    const pageFields = [
      field(0, locLabel, { combo: true, widgetType: 'combobox' }),
      field(1, sponLabel, { type: 'radio', widgetType: 'boolean_buttons', options: ['Yes', 'No'] }),
    ];
    const events: string[] = [];
    const filled: Record<string, string> = {};
    sendMessage.mockImplementation(async (m: {
      kind: string;
      fills?: Array<{ label: string; value: string }>;
      step?: { action: string; label: string; value: string };
    }) => {
      if (m.kind === 'GET_FRAMED_FORM') {
        return {
          kind: 'FRAMED_FORM',
          fields: pageFields.map((f) => Object.assign({}, f, { value: filled[f.label] ?? '' })),
          uploads: [{ frame: 0, form: 0 }],
        };
      }
      if (m.kind === 'FILL_BY_LABEL') {
        for (const f of m.fills ?? []) {
          events.push(`fill:${f.label}:${f.value}`);
          filled[f.label] = f.value;
        }
        return { kind: 'FILL_OUTCOMES', outcomes: (m.fills ?? []).map((f) => ({ label: f.label, status: 'filled' })) };
      }
      if (m.kind === 'COMBOBOX_STEP' && m.step) {
        if (m.step.action === 'open') return { kind: 'COMBOBOX_REPLY', reply: { status: 'opened' } };
        if (m.step.action === 'options') return { kind: 'COMBOBOX_REPLY', reply: { status: 'open', options: ['Toronto, Canada', 'Austin, United States'] } };
        if (m.step.action === 'select') {
          events.push(`select:${m.step.label}:${m.step.value}`);
          filled[m.step.label] = m.step.value;
          return { kind: 'COMBOBOX_REPLY', reply: { status: 'selected' } };
        }
        if (m.step.action === 'verify') return { kind: 'COMBOBOX_REPLY', reply: { status: 'verified', committed: filled[m.step.label] } };
      }
      return { kind: 'PAGE_SNAPSHOT', snapshot: { url: 'https://jobs.ashbyhq.com/acme/1', title: 'Engineer', headline: 'Engineer', text: '' } };
    });

    const { panel } = makePanel();
    await runWithTimers(panel);

    expect(events).toEqual([
      `select:${locLabel}:Toronto, Canada`,
      `fill:${sponLabel}:Yes`,
    ]);
    expect(filled).toEqual({
      [locLabel]: 'Toronto, Canada',
      [sponLabel]: 'Yes',
    });
  });

  it('aborts remaining Phase B batches immediately when requestAutofillChoice throws PlanRefused or 401', async () => {
    const { PlanRefused } = await import('./planRefused');
    for (const mode of ['plan_refused', '401'] as const) {
      vi.mocked(getAutofillSessionProfile).mockResolvedValueOnce({
        meta: { candidateId: 'cand-abort' },
        data: {
          full_name: 'Ilya S', first_name: 'Ilya', last_name: 'S', email: 'i@x.io',
          phone: '', location: '', linkedin: '', github: '', portfolio: '',
          authorized_countries: 'US', visa_sponsorship_needed: '',
          desired_salary: '', notice_period: '', willing_to_relocate: '', age_18_or_older: '',
        },
      });
      vi.mocked(getAutofillSettings).mockReset();
      vi.mocked(getAutofillSettings).mockResolvedValueOnce({ mode: 'server', configVersion: 1 });
      vi.mocked(requestAutofillPlan).mockReset();
      vi.mocked(requestAutofillChoice).mockReset();

      vi.mocked(requestAutofillPlan).mockResolvedValue({
        ok: true,
        deferredPlans: [{ fieldId: '0:0:0', label: 'Combo 1' }],
        executableFills: [{ fieldId: '0:0:5', label: 'Question 6', value: 'Answer 6', grounded: true }],
      });
      vi.mocked(requestAutofillChoice).mockRejectedValueOnce(
        mode === 'plan_refused'
          ? new PlanRefused('Upgrade required', null)
          : new ExtensionApiError('/api/extension/autofill/choose', 401, '{"error":"Unauthorized"}'),
      );

      const pageFields = [
        field(0, 'Combo 1', { combo: true, widgetType: 'combobox' }),
        field(1, 'Question 2'),
        field(2, 'Question 3'),
        field(3, 'Question 4'),
        field(4, 'Question 5'),
        field(5, 'Question 6'),
      ];
      const filled: Record<string, string> = {};
      sendMessage.mockImplementation(async (m: {
        kind: string;
        fills?: Array<{ label: string; value: string }>;
        step?: { action: string };
      }) => {
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
          if (m.step.action === 'open') return { kind: 'COMBOBOX_REPLY', reply: { status: 'opened' } };
          if (m.step.action === 'options') return { kind: 'COMBOBOX_REPLY', reply: { status: 'open', options: ['Opt A', 'Opt B'] } };
        }
        return { kind: 'PAGE_SNAPSHOT', snapshot: { url: 'https://jobs.example.test/apply', title: 'Engineer', headline: 'Engineer', text: '' } };
      });

      const refused = vi.fn();
      const { panel, notices } = makePanel();
      panel.refused = refused;
      await runWithTimers(panel);

      // Batch 2 must NOT be planned after Batch 1's combobox threw PlanRefused / 401
      expect(requestAutofillPlan).toHaveBeenCalledTimes(1);
      expect(filled['Question 6']).toBeUndefined();
      if (mode === 'plan_refused') {
        expect(refused).toHaveBeenCalledTimes(1);
      } else {
        expect(notices.some((n) => n.includes('HTTP 401'))).toBe(true);
      }
    }
  });

  it('marks omitted upstream location combobox as failed so later batches skip location-linked sponsorship', async () => {
    const locLabel = 'Which country do you intend to work from?';
    const sponLabel = 'Will you now or in the future require sponsorship?';
    vi.mocked(getAutofillSessionProfile).mockResolvedValueOnce({
      meta: { candidateId: 'cand-omit-loc' },
      data: {
        full_name: 'Ilya S', first_name: 'Ilya', last_name: 'S', email: 'i@x.io',
        phone: '', location: '', linkedin: '', github: '', portfolio: '',
        authorized_countries: 'US', visa_sponsorship_needed: 'No',
        desired_salary: '', notice_period: '', willing_to_relocate: '', age_18_or_older: '',
      },
    });
    vi.mocked(getAutofillSettings).mockReset();
    vi.mocked(getAutofillSettings).mockResolvedValueOnce({ mode: 'server', configVersion: 1 });
    vi.mocked(requestAutofillPlan).mockReset();
    vi.mocked(requestAutofillChoice).mockReset();

    // Batch 1 (5 fields): locLabel at index 0 is omitted from deferredPlans (explicit empty array)
    // Batch 2 (1 field): sponLabel at index 5 without dependsOnFieldId
    let planCall = 0;
    vi.mocked(requestAutofillPlan).mockImplementation(async () => {
      planCall++;
      if (planCall === 1) {
        return {
          ok: true,
          deferredPlans: [],
          executableFills: [{ fieldId: '0:0:1', label: 'Question 1', value: 'A1', grounded: true }],
        };
      }
      return {
        ok: true,
        executableFills: [{ fieldId: '0:0:5', label: sponLabel, value: 'No', grounded: true }],
      };
    });

    const pageFields = [
      field(0, locLabel, { combo: true, widgetType: 'combobox' }),
      field(1, 'Question 1'),
      field(2, 'Question 2'),
      field(3, 'Question 3'),
      field(4, 'Question 4'),
      field(5, sponLabel, { type: 'radio', widgetType: 'boolean_buttons', options: ['Yes', 'No'] }),
    ];
    const filled: Record<string, string> = {};
    sendMessage.mockImplementation(async (m: {
      kind: string;
      fills?: Array<{ label: string; value: string }>;
    }) => {
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
      return { kind: 'PAGE_SNAPSHOT', snapshot: { url: 'https://jobs.ashbyhq.com/acme/1', title: 'Backend Engineer', headline: 'Backend Engineer', text: '' } };
    });

    const { panel } = makePanel();
    await runWithTimers(panel);

    expect(requestAutofillChoice).not.toHaveBeenCalled();
    expect(filled['Question 1']).toBe('A1');
    expect(filled[locLabel]).toBeUndefined();
    expect(filled[sponLabel]).toBeUndefined();
  });

  it('skips location-linked sponsorship combobox in the same failed 504 batch after earlier location combobox fails', async () => {
    const locLabel = 'Which country do you intend to work from?';
    const sponLabel = 'Will you now or in the future require sponsorship?';
    vi.mocked(getAutofillSessionProfile).mockResolvedValueOnce({
      meta: { candidateId: 'cand-504-loc' },
      data: {
        full_name: 'Ilya S', first_name: 'Ilya', last_name: 'S', email: 'i@x.io',
        phone: '', location: '', linkedin: '', github: '', portfolio: '',
        authorized_countries: 'US', visa_sponsorship_needed: 'No',
        desired_salary: '', notice_period: '', willing_to_relocate: '', age_18_or_older: '',
      },
    });
    vi.mocked(getAutofillSettings).mockReset();
    vi.mocked(getAutofillSettings).mockResolvedValueOnce({ mode: 'server', configVersion: 1 });
    vi.mocked(requestAutofillPlan).mockReset();
    vi.mocked(requestAutofillChoice).mockReset();

    vi.mocked(requestAutofillPlan).mockRejectedValueOnce(
      new ExtensionApiError('/api/extension/autofill/plan', 504, '{"error":"Gateway Timeout"}'),
    );
    vi.mocked(requestAutofillChoice).mockResolvedValue({ ok: true, choice: null });

    const pageFields = [
      field(0, locLabel, { combo: true, widgetType: 'combobox' }),
      field(1, sponLabel, { combo: true, widgetType: 'combobox' }),
    ];
    const filled: Record<string, string> = {};
    sendMessage.mockImplementation(async (m: {
      kind: string;
      step?: { action: string; label: string; value: string };
    }) => {
      if (m.kind === 'GET_FRAMED_FORM') {
        return {
          kind: 'FRAMED_FORM',
          fields: pageFields.map((f) => Object.assign({}, f, { value: filled[f.label] ?? '' })),
          uploads: [{ frame: 0, form: 0 }],
        };
      }
      if (m.kind === 'COMBOBOX_STEP' && m.step) {
        if (m.step.action === 'open') return { kind: 'COMBOBOX_REPLY', reply: { status: 'opened' } };
        if (m.step.action === 'options') return { kind: 'COMBOBOX_REPLY', reply: { status: 'open', options: ['United States', 'Canada'] } };
      }
      return { kind: 'PAGE_SNAPSHOT', snapshot: { url: 'https://jobs.ashbyhq.com/acme/1', title: 'Backend Engineer', headline: 'Backend Engineer', text: '' } };
    });

    const { panel } = makePanel();
    await runWithTimers(panel);

    expect(requestAutofillChoice).toHaveBeenCalledTimes(1);
    expect(vi.mocked(requestAutofillChoice).mock.calls[0]?.[0].question.label).toBe(locLabel);
    expect(filled[locLabel]).toBeUndefined();
    expect(filled[sponLabel]).toBeUndefined();
  });
});
