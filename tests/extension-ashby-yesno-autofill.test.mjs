import test from 'node:test';
import assert from 'node:assert/strict';
import playwright from '@playwright/test';
import path from 'node:path';
const {chromium} = playwright;

// The modular content-script group as it ships in manifest.json.
const assets = ['adapters/ats-adapters.js', 'adapters/generic.js', 'adapters/greenhouse.js', 'adapters/lever.js', 'adapters/ashby.js', 'adapters/workday.js', 'core/form-discovery.js', 'core/field-mapping.js', 'core/field-writer.js'];

// Real Ashby application markup: yes/no questions are buttons (aria-pressed) backed by a hidden
// input, and the acknowledgements are controlled checkboxes.
const ashbyForm = `<!doctype html><html><body><form>
  <div class="_fieldEntry_1e3gg_28 ashby-application-form-field-entry" data-field-path="_systemfield_name">
    <label class="ashby-application-form-question-title" for="_systemfield_name">Legal Name</label>
    <input id="_systemfield_name" name="_systemfield_name" type="text" placeholder="Type here...">
  </div>
  <div class="_fieldEntry_1e3gg_28 ashby-application-form-field-entry" data-field-path="_systemfield_location">
    <label class="ashby-application-form-question-title" for="_systemfield_location">Where are you currently located?</label>
    <div class="_inputContainer_d7ago_28"><input class="ashby-application-form-input-autocomplete" placeholder="Start typing..." aria-autocomplete="list" aria-expanded="false" aria-haspopup="listbox" role="combobox" value=""></div>
  </div>
  <div class="_fieldEntry_1e3gg_28 ashby-application-form-field-entry" data-field-path="auth">
    <label class="ashby-application-form-question-title" for="auth">Are you authorized to work in the country where the job is located?</label>
    <div class="_container_1svni_28 ashby-application-form-input-yesno">
      <button class="ashby-application-form-input-yesno-option" aria-pressed="false" data-option="yes">Yes</button>
      <button class="ashby-application-form-input-yesno-option" aria-pressed="false" data-option="no">No</button>
      <input type="checkbox" class="_input_1svni_78" tabindex="-1" name="auth" style="display:none">
    </div>
  </div>
  <div class="_fieldEntry_1e3gg_28 ashby-application-form-field-entry" data-field-path="sponsor">
    <label class="ashby-application-form-question-title" for="sponsor">Will you now or in the future require sponsorship for employment visa status in this country?</label>
    <div class="_description_1e3gg_48"><p>We may provide immigration and sponsorship support to new employees based on their unique circumstances.</p></div>
    <div class="_container_1svni_28 ashby-application-form-input-yesno">
      <button class="ashby-application-form-input-yesno-option" aria-pressed="false" data-option="yes">Yes</button>
      <button class="ashby-application-form-input-yesno-option" aria-pressed="false" data-option="no">No</button>
      <input type="checkbox" class="_input_1svni_78" tabindex="-1" name="sponsor" style="display:none">
    </div>
  </div>
  <div class="_fieldEntry_1e3gg_28 ashby-application-form-field-entry" data-field-path="start">
    <label class="ashby-application-form-question-title" for="start">When can you start a new role?</label>
    <div class="react-datepicker-wrapper"><div class="react-datepicker__input-container"><input type="text" placeholder="Pick date..." value=""></div></div>
  </div>
  <div class="_fieldEntry_1e3gg_28 ashby-application-form-input-checkbox-group">
    <label class="ashby-application-form-question-title" for="arb">Applicant Arbitration Agreement Acknowledgement</label>
    <label for="arb-box"><input type="checkbox" id="arb-box">I acknowledge that I have opened, read, and understood the Arbitration Agreement</label>
  </div>
</form></body></html>`;

const candidate = {
  id: 'cand-1', full_name: 'Bhargav Reddy', first_name: 'Bhargav', last_name: 'Reddy',
  email: 'bhargav.reddy.sample@example.com', phone: '5125550187', current_city: 'Austin', current_state: 'TX'
};

async function setup(page) {
  await page.route('https://jobs.ashbyhq.com/**', route => route.fulfill({contentType: 'text/html', body: ashbyForm}));
  await page.goto('https://jobs.ashbyhq.com/openai/fixture/application');
  // Ashby toggles aria-pressed and the backing input from a single click handler.
  await page.evaluate(() => {
    document.querySelectorAll('.ashby-application-form-input-yesno').forEach(group => {
      group.querySelectorAll('button[data-option]').forEach(btn => {
        btn.addEventListener('click', () => {
          group.querySelectorAll('button[data-option]').forEach(b => b.setAttribute('aria-pressed', 'false'));
          btn.setAttribute('aria-pressed', 'true');
          group.querySelector('input[type=checkbox]').checked = btn.getAttribute('data-option') === 'yes';
        });
      });
    });
  });
  for (const asset of assets) await page.addScriptTag({path: path.resolve('jobright_extension', asset)});
}

test('Ashby yes/no questions are answered by clicking the real button', async () => {
  const browser = await chromium.launch({headless: true});
  try {
    const page = await browser.newPage();
    await setup(page);
    const res = await page.evaluate(async candidate => {
      const fields = NextkinForms.discoverFields(document);
      const plans = NextkinFieldMapping.planFill(fields, candidate);
      const receipts = await NextkinFieldWriter.applyFill(plans, {sessionId: 'ashby', isCurrent: () => true});
      const pressed = opt => document.querySelector(`button[data-option="${opt}"]`)?.getAttribute('aria-pressed');
      const authPlan = plans.find(p => p.field.kind === 'choice' && /authorized/i.test(p.field.label || ''));
      const sponsorPlan = plans.find(p => p.field.kind === 'choice' && /sponsorship/i.test(p.field.label || ''));
      return {
        authLabel: authPlan?.field.label || '',
        authStatus: authPlan?.status,
        authValue: authPlan?.value,
        sponsorStatus: sponsorPlan?.status,
        sponsorValue: sponsorPlan?.value,
        authPressed: pressed('yes'),
        authOther: document.querySelectorAll('.ashby-application-form-input-yesno')[0].querySelector('button[data-option="no"]').getAttribute('aria-pressed'),
        sponsorPressed: document.querySelectorAll('.ashby-application-form-input-yesno')[1].querySelector('button[data-option="no"]').getAttribute('aria-pressed'),
        choiceReceipts: receipts.filter(r => r.field.kind === 'choice').length
      };
    }, candidate);
    assert.match(res.authLabel, /authorized to work in the country/i, 'the yes/no question keeps its own text');
    assert.equal(res.authStatus, 'supported');
    assert.equal(res.authValue, 'Yes');
    assert.equal(res.sponsorStatus, 'supported');
    assert.equal(res.sponsorValue, 'No');
    assert.equal(res.authPressed, 'true', 'the Yes button is pressed');
    assert.equal(res.authOther, 'false', 'the No button stays unpressed');
    assert.equal(res.sponsorPressed, 'true', 'the No button is pressed for sponsorship');
    assert.equal(res.choiceReceipts, 2, 'both yes/no questions are reported as filled');
  } finally { await browser.close(); }
});

test('the hidden input behind a yes/no question is never reported as a filled field', async () => {
  const browser = await chromium.launch({headless: true});
  try {
    const page = await browser.newPage();
    await setup(page);
    const res = await page.evaluate(async candidate => {
      const fields = NextkinForms.discoverFields(document);
      const plans = NextkinFieldMapping.planFill(fields, candidate);
      const receipts = await NextkinFieldWriter.applyFill(plans, {sessionId: 'ashby', isCurrent: () => true});
      const hidden = [...document.querySelectorAll('.ashby-application-form-input-yesno input[type=checkbox]')];
      return {
        hiddenDiscovered: fields.filter(f => f.element?.tagName === 'INPUT' && f.element.type === 'checkbox').length,
        hiddenReported: receipts.filter(r => r.element?.type === 'checkbox' && r.element.closest('.ashby-application-form-input-yesno')).length,
        hiddenChecked: hidden.map(i => i.checked),
        reportedLabels: receipts.map(r => r.field.label)
      };
    }, candidate);
    assert.equal(res.hiddenDiscovered, 0, 'the hidden backing input is not a discoverable field');
    assert.equal(res.hiddenReported, 0, 'the hidden backing input is never reported as filled');
    assert.deepEqual(res.hiddenChecked, [true, false], 'the visible button drives the backing input');
  } finally { await browser.close(); }
});

test('legal acknowledgement checkboxes are left for the candidate and are not claimed as filled', async () => {
  const browser = await chromium.launch({headless: true});
  try {
    const page = await browser.newPage();
    await setup(page);
    const res = await page.evaluate(async candidate => {
      const fields = NextkinForms.discoverFields(document);
      const plans = NextkinFieldMapping.planFill(fields, candidate);
      const receipts = await NextkinFieldWriter.applyFill(plans, {sessionId: 'ashby', isCurrent: () => true});
      const ack = plans.find(p => p.field.kind === 'checkbox');
      return {
        ackStatus: ack?.status,
        ackReason: ack?.reason || '',
        ackChecked: document.querySelector('#arb-box').checked,
        ackReceipts: receipts.filter(r => r.field.kind === 'checkbox').length
      };
    }, candidate);
    assert.equal(res.ackStatus, 'manual');
    assert.match(res.ackReason, /acknowledgement/i);
    assert.equal(res.ackChecked, false, 'the acknowledgement is never auto-checked');
    assert.equal(res.ackReceipts, 0, 'it is never reported as filled');
  } finally { await browser.close(); }
});

test('the location question and the start date are routed by their question text', async () => {
  const browser = await chromium.launch({headless: true});
  try {
    const page = await browser.newPage();
    await setup(page);
    const res = await page.evaluate(async candidate => {
      const fields = NextkinForms.discoverFields(document);
      const plans = NextkinFieldMapping.planFill(fields, candidate);
      const location = plans.find(p => p.field.kind === 'combobox');
      const date = plans.find(p => p.field.element?.getAttribute('placeholder') === 'Pick date...');
      return {
        locationLabel: location?.field.label || '',
        locationStatus: location?.status,
        locationValue: location?.value || '',
        dateLabel: date?.field.label || '',
        dateStatus: date?.status
      };
    }, candidate);
    assert.match(res.locationLabel, /where are you currently located/i, 'the question text replaces the placeholder');
    assert.equal(res.locationStatus, 'supported');
    assert.equal(res.locationValue, 'Austin');
    assert.match(res.dateLabel, /when can you start a new role/i);
    assert.equal(res.dateStatus, 'manual', 'a date picker is never filled with prose');
  } finally { await browser.close(); }
});

test('every reported fill is actually visible in the form', async () => {
  const browser = await chromium.launch({headless: true});
  try {
    const page = await browser.newPage();
    await setup(page);
    const res = await page.evaluate(async candidate => {
      const fields = NextkinForms.discoverFields(document);
      const plans = NextkinFieldMapping.planFill(fields, candidate);
      const receipts = await NextkinFieldWriter.applyFill(plans, {sessionId: 'ashby', isCurrent: () => true});
      const reads = receipt => {
        const f = receipt.field;
        if (f.kind === 'choice') {
          const hit = f.options.find(o => o.element.getAttribute('aria-pressed') === 'true');
          return hit ? hit.label : '';
        }
        if (f.kind === 'checkbox') return f.element.checked ? 'checked' : '';
        return f.element.value || '';
      };
      return {
        reported: receipts.map(r => ({label: r.field.label, kind: r.field.kind, shown: reads(r)})),
        // What the candidate can actually see in the form.
        visibleValues: Array.from(document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]), textarea'))
          .map(i => (i.value || '').trim()).filter(Boolean),
        pressedQuestions: Array.from(document.querySelectorAll('button[data-option][aria-pressed="true"]')).length,
        checkedBoxes: Array.from(document.querySelectorAll('input[type=checkbox]')).filter(i => i.checked && i.getClientRects().length).length
      };
    }, candidate);
    for (const entry of res.reported) {
      assert.ok(entry.shown, `reported field "${entry.label}" is empty in the form`);
    }
    const choiceReports = res.reported.filter(e => e.kind === 'choice').length;
    assert.equal(choiceReports, res.pressedQuestions, 'only the pressed yes/no answers count as fills');
    assert.equal(res.checkedBoxes, 0, 'no visible checkbox is left checked behind the candidate\'s back');
  } finally { await browser.close(); }
});
