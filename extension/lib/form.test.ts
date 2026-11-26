import { describe, it, expect, beforeEach } from 'vitest';
import { extractForm, extractUploads, fillByLabel } from './form';
import { revealField } from './revealField';
import { planLabelFills, fillsForFrame, looksLikeApplication, scopeToApplication } from './fillPlan';
import { labeledInput, must, reset, formWith } from './test-utils';

describe('extractForm', () => {
  beforeEach(reset);

  it('indexes fillable fields with their label, type and required flag', () => {
    labeledInput('fn', 'First Name', { type: 'text', name: 'first', required: '' });
    labeledInput('em', 'Email Address', { type: 'email', name: 'email' });

    const fields = extractForm(document);

    expect(fields).toHaveLength(2);
    expect(fields[0]).toMatchObject({ index: 0, type: 'text', label: 'First Name', name: 'first', required: true });
    expect(fields[1]).toMatchObject({ index: 1, type: 'email', label: 'Email Address', required: false });
  });

  it('treats aria-required as required, which is how ATS forms mark it', () => {
    labeledInput('a', 'Employer', { type: 'text', 'aria-required': 'true' });
    labeledInput('b', 'Nickname', { type: 'text' });

    expect(extractForm(document).map((f) => [f.label, f.required])).toEqual([
      ['Employer', true],
      ['Nickname', false],
    ]);
  });

  it('skips hidden, submit and disabled controls', () => {
    labeledInput('a', 'Keep', { type: 'text' });
    labeledInput('b', 'Hidden', { type: 'hidden' });
    labeledInput('c', 'Submit', { type: 'submit' });
    labeledInput('d', 'Disabled', { type: 'text', disabled: '' });

    const fields = extractForm(document);
    expect(fields.map((f) => f.label)).toEqual(['Keep']);
  });

  it('skips controls the user cannot see', () => {
    labeledInput('a', 'Keep', { type: 'text' });
    // A real Greenhouse form carries one of these: a hidden recaptcha textarea.
    const recaptcha = document.createElement('textarea');
    recaptcha.setAttribute('name', 'g-recaptcha-response');
    recaptcha.style.display = 'none';
    // …and controls buried in a collapsed section.
    const collapsed = document.createElement('div');
    collapsed.style.display = 'none';
    const buried = document.createElement('input');
    buried.setAttribute('aria-label', 'Buried');
    collapsed.append(buried);
    document.body.append(recaptcha, collapsed);

    expect(extractForm(document).map((f) => f.label)).toEqual(['Keep']);
  });

  it('captures select options', () => {
    const label = document.createElement('label');
    label.setAttribute('for', 'country');
    label.textContent = 'Country';
    const select = document.createElement('select');
    select.id = 'country';
    for (const c of ['United States', 'Canada']) {
      const opt = document.createElement('option');
      opt.textContent = c;
      select.append(opt);
    }
    document.body.append(label, select);

    const [field] = extractForm(document);
    expect(field).toMatchObject({ tag: 'select', label: 'Country', options: ['United States', 'Canada'] });
  });
});

describe('extractUploads', () => {
  beforeEach(reset);

  it('reports a resume upload with the form that owns it', () => {
    formWith('alerts', ['Email']);
    formWith('application', ['First Name'], true);

    expect(extractUploads(document)).toEqual([{ form: 1 }]);
  });

  it('reports an upload standing outside any form, as Ashby renders it', () => {
    const file = document.createElement('input');
    file.type = 'file';
    document.body.append(file);

    expect(extractUploads(document)).toEqual([{ form: -1 }]);
  });

  it('ignores an upload the user cannot see', () => {
    const file = document.createElement('input');
    file.type = 'file';
    file.hidden = true;
    document.body.append(file);

    expect(extractUploads(document)).toEqual([]);
  });
});

describe('looksLikeApplication', () => {
  // Measured across Greenhouse (board, embed, and site-with-iframe), Lever and
  // Ashby: every open application offered a resume upload, and every page that
  // was not showing one offered none — including Roku's job-alert signup, which
  // is otherwise indistinguishable from a small application (5 fields, 3 of them
  // required).
  it('recognises a form offering a resume upload', () => {
    expect(looksLikeApplication([{ form: 0 }])).toBe(true);
  });

  it('rejects a page whose only visible form asks for nothing to upload', () => {
    expect(looksLikeApplication([])).toBe(false);
  });
});

describe('scopeToApplication', () => {
  const fields = [
    { frame: 0, form: 1, label: 'First Name' },
    { frame: 0, form: 1, label: 'Email' },
    { frame: 0, form: 2, label: 'Email' },
  ];

  it('keeps the form the upload sits in, leaving a second form alone', () => {
    // Roku carries both an application and a job-alert signup, each asking for a
    // name and an email; only the application takes a resume.
    expect(scopeToApplication(fields, [{ frame: 0, form: 1 }])).toEqual([
      { frame: 0, form: 1, label: 'First Name' },
      { frame: 0, form: 1, label: 'Email' },
    ]);
  });

  it('scopes to the frame as well, since an ATS iframe carries its own form 0', () => {
    const framed = [
      { frame: 0, form: 0, label: 'Search' },
      { frame: 18, form: 0, label: 'First Name' },
    ];
    expect(scopeToApplication(framed, [{ frame: 18, form: 0 }])).toEqual([{ frame: 18, form: 0, label: 'First Name' }]);
  });

  it('keeps every field when the upload names a group holding none', () => {
    // Rather than fill nothing at all: a page that renders its questions outside
    // the form the upload sits in is unusual, but silence would be worse.
    expect(scopeToApplication(fields, [{ frame: 3, form: 9 }])).toEqual(fields);
  });
});

describe('planLabelFills', () => {
  const values = { firstName: 'Ilya', email: 'ilya@example.com', github: '' };

  it('addresses each recognised question by its own label', () => {
    expect(planLabelFills([{ label: 'First Name' }, { label: 'Email Address' }], values)).toEqual([
      { label: 'First Name', value: 'Ilya' },
      { label: 'Email Address', value: 'ilya@example.com' },
    ]);
  });

  it('leaves a question the profile knows nothing about alone', () => {
    expect(planLabelFills([{ label: 'Why do you want to work here?' }], values)).toEqual([]);
  });

  it('skips a key the profile carries no value for', () => {
    expect(planLabelFills([{ label: 'GitHub' }], values)).toEqual([]);
  });

  it('asks for a repeated label once', () => {
    // A careers page routinely carries two forms — the application and a
    // job-alert signup — each with its own "Email". `fillByLabel` answers the
    // first question carrying the label, so asking twice only doubles the wire.
    expect(planLabelFills([{ label: 'Email' }, { label: 'email ' }], values)).toEqual([
      { label: 'Email', value: 'ilya@example.com' },
    ]);
  });

  it("carries the field's frame and form onto the fill, so it can be scoped later", () => {
    expect(planLabelFills([{ label: 'First Name', frame: 18, form: 0 }], values)).toEqual([
      { label: 'First Name', value: 'Ilya', frame: 18, form: 0 },
    ]);
  });
});

describe('fillsForFrame', () => {
  const fills = [
    { label: 'First Name', value: 'Ilya', frame: 18, form: 0 },
    { label: 'Email', value: 'ilya@example.com', frame: 0, form: 1 },
    { label: 'Referral code', value: 'ABC' },
  ];

  it('keeps only the fills addressed to the frame, plus the frame-agnostic ones', () => {
    expect(fillsForFrame(fills, 18)).toEqual([
      { label: 'First Name', value: 'Ilya', frame: 18, form: 0 },
      { label: 'Referral code', value: 'ABC' },
    ]);
  });

  it('withholds a frame-addressed fill from every other frame', () => {
    expect(fillsForFrame(fills, 7)).toEqual([{ label: 'Referral code', value: 'ABC' }]);
  });
});

describe('extractForm combo flag', () => {
  beforeEach(reset);

  it('flags custom-widget comboboxes and leaves plain controls alone', () => {
    labeledInput('plain', 'City', { type: 'text' });
    labeledInput('rs', 'Country', { type: 'text', role: 'combobox', 'aria-autocomplete': 'list' });

    const fields = extractForm(document);

    expect(fields.map((f) => [f.label, f.combo])).toEqual([
      ['City', false],
      ['Country', true],
    ]);
  });

  it("reports a native select's chosen option as its text, not its code", () => {
    // The option's value attribute is the ATS's internal id; the text is the answer.
    const select = document.createElement('select');
    select.setAttribute('aria-label', 'Veteran status');
    const choices: [string, string][] = [
      ['', 'Select...'],
      ['4417', 'I am not a veteran'],
    ];
    for (const [value, text] of choices) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = text;
      select.append(option);
    }
    document.body.append(select);
    expect(must(extractForm(document)[0]).value).toBe('');

    select.value = '4417';
    expect(must(extractForm(document)[0]).value).toBe('I am not a veteran');
  });

  it('reports a lone checkbox as Yes when ticked and empty when not', () => {
    // Its value attribute is "on" either way, so reading that made an unticked
    // consent box look answered.
    const box = labeledInput('arb', 'Agreement to Arbitrate', { type: 'checkbox' });
    expect(must(extractForm(document)[0]).value).toBe('');

    (box as HTMLInputElement).checked = true;
    expect(must(extractForm(document)[0]).value).toBe('Yes');
  });

  it('does not flag a native select as a custom widget', () => {
    const select = document.createElement('select');
    select.setAttribute('aria-label', 'Country');
    document.body.append(select);

    expect(must(extractForm(document)[0]).combo).toBe(false);
  });

  it("carries a widget's options when it exposes them without being opened", () => {
    const combo = labeledInput('wa', 'Work authorization', {
      type: 'text',
      role: 'combobox',
      'aria-controls': 'wa-listbox',
    });
    const listbox = document.createElement('div');
    listbox.id = 'wa-listbox';
    listbox.setAttribute('role', 'listbox');
    for (const text of ['Yes', 'No']) {
      const option = document.createElement('div');
      option.setAttribute('role', 'option');
      option.textContent = text;
      listbox.append(option);
    }
    document.body.append(listbox);

    const [field] = extractForm(document);
    expect(field).toMatchObject({ label: 'Work authorization', combo: true, options: ['Yes', 'No'] });
    expect(combo.value).toBe('');
  });

  it('reports no options for a widget that only renders them once opened', () => {
    // A react-select while closed: its listbox does not exist yet, so
    // aria-controls is absent. The agent must reach for combobox.open.
    labeledInput('co', 'Country', { type: 'text', role: 'combobox', 'aria-autocomplete': 'list' });

    const field = must(extractForm(document)[0]);
    expect(field.combo).toBe(true);
    expect(field.options).toBeUndefined();
  });

  it('reports the value a widget displays, since its input stays empty after a commit', () => {
    // A react-select keeps the chosen answer in its own markup, never in the
    // input. Reading the input alone made every answered dropdown look unanswered
    // — the checklist never ticked it and the answers could not be offered for saving.
    const control = document.createElement('div');
    const chosen = document.createElement('div');
    chosen.className = 'css-1dimb5e-singleValue';
    chosen.textContent = 'No';
    const label = document.createElement('label');
    label.setAttribute('for', 'iv');
    label.textContent = 'Have you interviewed with us before?';
    const input = document.createElement('input');
    input.id = 'iv';
    input.setAttribute('role', 'combobox');
    control.append(chosen, input);
    document.body.append(label, control);

    expect(must(extractForm(document)[0])).toMatchObject({ combo: true, value: 'No' });
  });

  it('reports no value for a widget showing its placeholder', () => {
    const control = document.createElement('div');
    const placeholder = document.createElement('div');
    placeholder.className = 'css-1jqq78o-placeholder';
    placeholder.textContent = 'Select...';
    const input = document.createElement('input');
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-label', 'Gender');
    control.append(placeholder, input);
    document.body.append(control);

    expect(must(extractForm(document)[0]).value).toBe('');
  });

  it("does not lift a neighbouring widget's options onto a closed one", () => {
    // Two widgets, one open. A page-wide [role=option] sweep would hand the
    // open widget's countries to the closed sponsorship question.
    labeledInput('sp', 'Do you require sponsorship', { type: 'text', role: 'combobox' });
    labeledInput('ct', 'Country', { type: 'text', role: 'combobox', 'aria-controls': 'ct-listbox' });
    const listbox = document.createElement('div');
    listbox.id = 'ct-listbox';
    listbox.setAttribute('role', 'listbox');
    const option = document.createElement('div');
    option.setAttribute('role', 'option');
    option.textContent = 'Germany';
    listbox.append(option);
    document.body.append(listbox);

    const fields = extractForm(document);
    expect(must(fields[0]).options).toBeUndefined();
    expect(must(fields[1]).options).toEqual(['Germany']);
  });
});

describe('revealField', () => {
  beforeEach(reset);

  /** A form whose control carries an inline style of its own, so a reveal that
   *  fails to restore it is visible. */
  function labelled(label: string, style = 'color: rebeccapurple') {
    const form = document.createElement('form');
    const el = document.createElement('input');
    el.type = 'text';
    el.id = 'reveal-target';
    el.setAttribute('style', style);
    const lab = document.createElement('label');
    lab.setAttribute('for', el.id);
    lab.textContent = label;
    form.append(lab, el);
    document.body.append(form);
    return el;
  }

  it('scrolls the question it names into view', () => {
    const el = labelled('Email');
    let scrolled: ScrollIntoViewOptions | undefined;
    el.scrollIntoView = (opts?: boolean | ScrollIntoViewOptions) => {
      scrolled = opts as ScrollIntoViewOptions;
    };

    expect(revealField(document, { label: 'Email' })).toBe(true);
    expect(scrolled?.block).toBe('center');
  });

  it('reports a label the page does not carry, and touches nothing', () => {
    labelled('Email');

    expect(revealField(document, { label: 'Favourite colour' })).toBe(false);
  });

  // The outline is written onto a page freehire does not own, so it has to leave
  // the element exactly as it found it — including an inline style of its own.
  it('restores the inline style it borrowed', async () => {
    const el = labelled('Email', 'color: rebeccapurple');
    el.scrollIntoView = () => {};

    revealField(document, { label: 'Email', outlineMs: 5 });
    expect(el.getAttribute('style')).not.toBe('color: rebeccapurple');

    await new Promise((r) => setTimeout(r, 20));
    expect(el.getAttribute('style')).toBe('color: rebeccapurple');
  });

  it('focuses the control only when asked', () => {
    const el = labelled('Email');
    el.scrollIntoView = () => {};

    revealField(document, { label: 'Email' });
    expect(document.activeElement).not.toBe(el);

    revealField(document, { label: 'Email', focus: true });
    expect(document.activeElement).toBe(el);
  });
});

describe('revealField, revealed twice', () => {
  beforeEach(reset);

  // Two reveals of the same control inside the outline's lifetime: without a
  // per-control record of what was borrowed, the second call saves the FIRST
  // call's outline as the original and restores it for good.
  it('still gives the page its own style back', async () => {
    const form = document.createElement('form');
    const el = document.createElement('input');
    el.type = 'text';
    el.id = 'twice';
    el.setAttribute('style', 'color: rebeccapurple');
    const lab = document.createElement('label');
    lab.setAttribute('for', el.id);
    lab.textContent = 'Email';
    form.append(lab, el);
    document.body.append(form);
    el.scrollIntoView = () => {};

    revealField(document, { label: 'Email', outlineMs: 30 });
    revealField(document, { label: 'Email', outlineMs: 30 });

    await new Promise((r) => setTimeout(r, 80));
    expect(el.getAttribute('style')).toBe('color: rebeccapurple');
  });
});

describe('LinkedIn-style radios named after their question', () => {
  const q = 'Will you now or in the future require sponsorship?*';
  const radio = (id: string, option: string) =>
    `<div><div><input id="${id}" type="radio" name="g" aria-label="${q}"><label for="${id}"></label></div><p>${option}</p></div>`;

  it('lists the question once, with the visible option text as options, and reads the * as required', () => {
    document.body.innerHTML = `<fieldset role="radiogroup">${radio('a', 'Yes')}${radio('b', 'No')}</fieldset>`;
    const fields = extractForm(document);
    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({ label: q, options: ['Yes', 'No'], required: true });
  });

  it('does not group radios whose aria-labels name their own options', () => {
    document.body.innerHTML = `<fieldset role="radiogroup">
      <input type="radio" name="g" aria-label="Yes"><input type="radio" name="g" aria-label="No"></fieldset>`;
    expect(extractForm(document).map((f) => f.label)).not.toContain('Yes, No');
    expect(extractForm(document).some((f) => f.label === 'Yes' && f.options?.includes('No'))).toBe(false);
  });
});

describe('control naming', () => {
  it('uses the field ID for discovery and writes when a control has no label or name', () => {
    document.body.innerHTML = '<form><input id="country"><input name="city" id="backup-city"></form>';
    expect(extractForm(document).map(({ label }) => label)).toEqual(['country', 'city']);
    expect(fillByLabel(document, [{ label: 'country', value: 'Canada' }])[0]?.status).toBe('filled');
    expect(document.querySelector<HTMLInputElement>('#country')?.value).toBe('Canada');
  });

  it('commits only the offered demographic choices to a native multi-select and checkbox group', () => {
    document.body.innerHTML = `<form><label>Race or ethnicity <select multiple>
      <option>Asian</option><option>Black or African American</option><option>White</option>
      </select></label><fieldset><legend>What are your pronouns?</legend>
      <label><input type="checkbox" name="she">She/her</label>
      <label><input type="checkbox" name="they">They/them</label></fieldset></form>`;
    const result = fillByLabel(document, [
      { label: 'Race or ethnicity', value: '', choices: ['Asian', 'Black or African American'], onlyEmpty: true },
      { label: 'What are your pronouns?', value: '', choices: ['She/her', 'They/them'], onlyEmpty: true },
    ]);
    expect(result.map(({ status }) => status)).toEqual(['filled', 'filled']);
    expect(extractForm(document).map((field) => field.value)).toEqual(['Asian, Black or African American', 'She/her, They/them']);
    expect(fillByLabel(document, [
      { label: 'Race or ethnicity', value: '', choices: ['White'], onlyEmpty: true },
    ])[0]?.status).toBe('not_fillable');
  });

  it('fills a named fieldset of independently named ARIA and native checkboxes with an Other text field', () => {
    document.body.innerHTML = `<form><fieldset>
      <legend>Which countries are you authorized to work in?</legend>
      <label><input type="checkbox" name="india">India</label>
      <div role="checkbox" aria-checked="false">Canada</div>
      <label>Other <input name="other"></label>
    </fieldset></form>`;
    const otherChoice = must(document.querySelector('[role="checkbox"]') ?? undefined);
    otherChoice.addEventListener('click', () => otherChoice.setAttribute('aria-checked', 'true'));
    const [rawField, rawOther] = extractForm(document);
    const field = must(rawField);
    const other = must(rawOther);
    expect(field.options).toEqual(['India', 'Canada']);
    expect(other.label).toBe('Other');
    expect(fillByLabel(document, [{ label: field.label, value: 'India, Canada' }])[0]?.status).toBe('filled');
    expect(extractForm(document)[0]?.value).toBe('India, Canada');
  });

  it('accepts clear binary answer variants and unique country dialing-code options', () => {
    document.body.innerHTML = `<form>
      <select aria-label="Do you require sponsorship?"><option value="">Select...</option>
        <option>I require sponsorship</option><option>I do not require sponsorship</option></select>
      <select aria-label="Country"><option value="">Select...</option><option>United States (+1)</option></select>
    </form>`;
    expect(fillByLabel(document, [
      { label: 'Do you require sponsorship?', value: 'No' },
      { label: 'Country', value: 'US' },
    ]).map(({ status }) => status)).toEqual(['filled', 'filled']);
    expect(extractForm(document).map(({ value }) => value)).toEqual(['I do not require sponsorship', 'United States (+1)']);
  });

  it('groups independent ATS Yes/No questions beneath their visible headings', () => {
    document.body.innerHTML = `<form>
      <div><div>Do you require sponsorship? *</div><div>
        <label><input type="radio" name="sponsor_yes" value="y">Yes</label>
        <label><input type="radio" name="sponsor_no" value="n">No</label>
      </div></div>
      <div><span>Are you willing to relocate?</span><ul>
        <li><label><input type="radio" name="move">Yes</label></li>
        <li><label><input type="radio" name="move">No</label></li>
      </ul></div>
    </form>`;
    expect(extractForm(document).map(({ label, options }) => ({ label, options }))).toEqual([
      { label: 'Do you require sponsorship? *', options: ['Yes', 'No'] },
      { label: 'Are you willing to relocate?', options: ['Yes', 'No'] },
    ]);
    const target = must(document.querySelector<HTMLInputElement>('input[value="n"]') ?? undefined);
    const clicks: string[] = [];
    target.addEventListener('click', () => clicks.push('No'));
    expect(fillByLabel(document, [{ label: 'Do you require sponsorship? *', value: 'false' }])[0]?.status).toBe('filled');
    expect(clicks).toEqual(['No']);
    expect(extractForm(document).map(({ value }) => value)).toEqual(['No', '']);
  });

  it('fills an ATS checkbox group from offered choices only', () => {
    document.body.innerHTML = `<div><span>Which countries are you authorized to work in?</span>
      <div><label><input type="checkbox" name="countries">India</label>
      <label><input type="checkbox" name="countries">Canada</label></div></div>`;
    const label = 'Which countries are you authorized to work in?';
    expect(fillByLabel(document, [{ label, value: 'India, Canada' }])[0]?.status).toBe('filled');
    expect(extractForm(document)[0]?.value).toBe('India, Canada');
  });

  it('answers work authorization only for the confirmed country named in the question', () => {
    expect(planLabelFills([{ label: 'Are you legally authorized to work in the United States?' }], {}, 'US, CA'))
      .toEqual([{ label: 'Are you legally authorized to work in the United States?', value: 'Yes' }]);
    expect(planLabelFills([
      { label: 'Are you legally authorized to work in Germany?' },
      { label: 'Are you legally authorized to work in the United States without sponsorship?' },
      { label: 'Are you legally authorized to work?' },
    ], {}, 'US, CA')).toEqual([]);
  });

  it('replaces a nonempty dropdown placeholder and preserves a real existing answer', () => {
    document.body.innerHTML = `<select aria-label="Are you willing to relocate?">
      <option value="placeholder" disabled selected>Select...</option>
      <option value="y">Yes</option><option value="n">No</option>
    </select>`;
    const label = 'Are you willing to relocate?';
    expect(extractForm(document)[0]).toMatchObject({ value: '', options: ['Yes', 'No'] });
    expect(fillByLabel(document, [{ label, value: 'true', onlyEmpty: true }])[0]?.status).toBe('filled');
    expect(fillByLabel(document, [{ label, value: 'No', onlyEmpty: true }])[0]?.status).toBe('not_fillable');
    expect(extractForm(document)[0]?.value).toBe('Yes');
  });

  it('excludes location status text from the field label', () => {
    document.body.innerHTML = `<label>Current location *<input role="combobox">
      <span role="status">No location found. Try entering a different location</span></label>`;
    expect(extractForm(document)[0]?.label).toBe('Current location *');
  });

  it('does not count a rejected location search as a committed answer', () => {
    document.body.innerHTML = `<form><label>Current location *<input role="combobox" value="Austin">
      <div>No location found. Try entering a different location</div><span>Loading</span></label>
      <label>Intended work country <select><option>Canada</option></select></label></form>`;
    expect(extractForm(document).map(({ label, value }) => ({ label, value }))).toEqual([
      { label: 'Current location *', value: '' },
      { label: 'Intended work country', value: 'Canada' },
    ]);
  });

  it('finds distinct screening questions above identical response placeholders', () => {
    document.body.innerHTML = `<form>
      <div><h3>Describe a recent project.</h3><small>Give one example.</small><textarea placeholder="Type your response"></textarea></div>
      <div><h3>Why are you interested in this role?</h3><div><textarea aria-label="Type your response"></textarea></div></div>
    </form>`;
    expect(extractForm(document).map(({ label }) => label)).toEqual([
      'Describe a recent project.', 'Why are you interested in this role?',
    ]);
  });

  it('keeps optional ethnicity and pronoun choices in their own questions', () => {
    document.body.innerHTML = `<form>
      <section><h3>Race or ethnicity</h3><div>Select all that apply</div><div>
        <label><input type="checkbox" name="a">Asian or Asian American</label>
        <label><input type="checkbox" name="b">White</label>
        <label>Other <input type="text"></label>
      </div></section>
      <section><h3>Pronouns</h3><div>Select all that apply</div><div>
        <label><input type="checkbox" name="he">He/him</label>
        <label><input type="checkbox" name="she">She/her</label>
      </div></section>
    </form>`;
    expect(extractForm(document).map(({ label, options }) => ({ label, options }))).toEqual([
      { label: 'Race or ethnicity', options: ['Asian or Asian American', 'White'] },
      { label: 'Other', options: undefined },
      { label: 'Pronouns', options: ['He/him', 'She/her'] },
    ]);
  });

  it('reads a wrapped dropdown question separately from its options', () => {
    document.body.innerHTML = `<label>Veteran status *
      <select><option value="">Select...</option><option>I am a veteran</option>
      <option>Decline to self-identify</option></select></label>`;
    expect(extractForm(document)[0]).toMatchObject({
      label: 'Veteran status *',
      options: ['I am a veteran', 'Decline to self-identify'],
    });
  });
  it('prefers the visible label over the placeholder', () => {
    document.body.innerHTML =
      '<div><label>Location (city)*</label><input type="text" placeholder="Enter city or location"></div>';
    expect(extractForm(document)[0]?.label).toBe('Location (city)*');
  });

  it('prefers the visible label over an aria-label that repeats the placeholder', () => {
    document.body.innerHTML =
      '<div><label>Location (city)*</label><input type="text" aria-label="Enter city" placeholder="Enter city"></div>';
    expect(extractForm(document)[0]?.label).toBe('Location (city)*');
  });

  it('extracts helperText via aria-describedby and adjacent subtitle without polluting label', () => {
    document.body.innerHTML = `
      <div>
        <label for="work-loc">Which country do you intend to work from?*</label>
        <p id="work-loc-hint">Please list your city and country.</p>
        <input id="work-loc" role="combobox" aria-describedby="work-loc-hint" aria-expanded="false" />
      </div>`;
    const f = must(extractForm(document)[0]);
    expect(f.label).toBe('Which country do you intend to work from?*');
    expect(f.helperText).toBe('Please list your city and country.');
    expect(f.widgetType).toBe('combobox');
  });

  it('extracts helperText from adjacent subtitle without aria-describedby and skips location rejections', () => {
    document.body.innerHTML = `
      <div>
        <label for="reloc-note">Relocation preferences</label>
        <p>Include cities or regions you would consider.</p>
        <textarea id="reloc-note"></textarea>
      </div>
      <div>
        <label for="city-box">Current location*</label>
        <span id="city-status" role="status">No location found. Try entering a different location</span>
        <input id="city-box" role="combobox" aria-describedby="city-status" />
      </div>`;
    const fields = extractForm(document);
    expect(fields[0]?.helperText).toBe('Include cities or regions you would consider.');
    expect(fields[0]?.widgetType).toBe('textarea');
    expect(fields[1]?.helperText).toBeUndefined();
    expect(fields[1]?.widgetType).toBe('combobox');
  });

  it('discovers combobox buttons lacking type="button" while skipping submit buttons', () => {
    document.body.innerHTML = `
      <form>
        <label for="race">Race</label>
        <button id="race" role="combobox" aria-expanded="false">Select ...</button>
        <button type="submit">Submit application</button>
      </form>`;
    const fields = extractForm(document);
    expect(fields).toHaveLength(1);
    const first = must(fields[0]);
    expect(first.label).toBe('Race');
    expect(first.combo).toBe(true);
    expect(first.widgetType).toBe('combobox');
  });

  it('extracts Ashby-style segmented [Yes] [No] button pairs as boolean_buttons', () => {
    document.body.innerHTML = `
      <div>
        <span>Will you now or in the future require sponsorship for employment visa status to work in this location?*</span>
        <div>
          <button type="button" aria-pressed="false">Yes</button>
          <button type="button" aria-pressed="false">No</button>
        </div>
      </div>`;
    const f = must(extractForm(document)[0]);
    expect(f.label).toContain('require sponsorship');
    expect(f.widgetType).toBe('boolean_buttons');
    expect(f.options).toEqual(['Yes', 'No']);
    expect(f.value).toBe('');
  });

  it('skips segmented [Yes] [No] buttons inside a <form> when type defaults to submit, while keeping type-less buttons outside a <form>', () => {
    document.body.innerHTML = `
      <form>
        <span>Inside form without explicit type?</span>
        <div>
          <button>Yes</button>
          <button>No</button>
        </div>
      </form>
      <div>
        <span>Outside form without explicit type?</span>
        <div>
          <button>Yes</button>
          <button>No</button>
        </div>
      </div>`;
    const fields = extractForm(document);
    expect(fields).toHaveLength(1);
    const first = must(fields[0]);
    expect(first.label).toBe('Outside form without explicit type?');
    expect(first.widgetType).toBe('boolean_buttons');
    expect(first.form).toBe(-1);
  });

  it('reads boolean_buttons selected state from aria-pressed, aria-checked, or data-selected/class fallback', () => {
    document.body.innerHTML = `
      <div>
        <span>Question one?</span>
        <div>
          <button type="button" aria-pressed="true">Yes</button>
          <button type="button" aria-pressed="false">No</button>
        </div>
      </div>
      <div>
        <span>Question two?</span>
        <div>
          <button type="button" aria-checked="false">Yes</button>
          <button type="button" aria-checked="true">No</button>
        </div>
      </div>
      <div>
        <span>Question three?</span>
        <div>
          <button type="button" class="pill active">Yes</button>
          <button type="button" class="pill">No</button>
        </div>
      </div>
      <div>
        <span>Question four?</span>
        <div>
          <button type="button" aria-pressed="false" class="active">Yes</button>
          <button type="button" aria-pressed="false">No</button>
        </div>
      </div>
      <div>
        <span>Question five?</span>
        <div>
          <button type="button" data-selected="false" class="pill active">Yes</button>
          <button type="button" data-active="true" class="pill">No</button>
        </div>
      </div>
      <div>
        <span>Question six?</span>
        <div>
          <button type="button" data-checked="false" class="pill checked">Yes</button>
          <button type="button" data-selected="true">No</button>
        </div>
      </div>`;
    expect(extractForm(document).map((f) => [f.label, f.value, f.widgetType])).toEqual([
      ['Question one?', 'Yes', 'boolean_buttons'],
      ['Question two?', 'No', 'boolean_buttons'],
      ['Question three?', 'Yes', 'boolean_buttons'],
      ['Question four?', '', 'boolean_buttons'],
      ['Question five?', 'No', 'boolean_buttons'],
      ['Question six?', 'No', 'boolean_buttons'],
    ]);
  });

  it('reports accurate widgetType for all supported control kinds', () => {
    document.body.innerHTML = `
      <form>
        <label>Name <input type="text" /></label>
        <label>Bio <textarea></textarea></label>
        <label>Country <select><option>US</option></select></label>
        <fieldset><legend>Relocate?</legend>
          <label><input type="radio" name="reloc" />Yes</label>
          <label><input type="radio" name="reloc" />No</label>
        </fieldset>
        <label><input type="checkbox" /> I agree</label>
        <label>City <input role="combobox" /></label>
      </form>`;
    expect(extractForm(document).map((f) => f.widgetType)).toEqual([
      'text',
      'textarea',
      'select',
      'radio',
      'checkbox',
      'combobox',
    ]);
  });
});
