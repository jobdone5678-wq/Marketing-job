import test from 'node:test';
import assert from 'node:assert/strict';
import playwright from '@playwright/test';
import path from 'node:path';
const {chromium} = playwright;

const assets = ['adapters/ats-adapters.js', 'adapters/generic.js', 'adapters/greenhouse.js', 'adapters/lever.js', 'adapters/ashby.js', 'adapters/workday.js', 'form-discovery.js', 'field-mapping.js', 'field-writer.js'];

const form = `<!doctype html><html><body><form>
  <fieldset id="auth"><legend>Are you legally authorized to work in the United States?</legend><div class="btns"><button type="button">Yes</button><button type="button">No</button></div></fieldset>
  <fieldset id="sponsor"><legend>Will you now or in the future require sponsorship for employment visa status?</legend><div class="btns"><button type="button">Yes</button><button type="button">No</button></div></fieldset>
  <label for="hear">How did you hear about this job?</label><select id="hear" name="hear"><option value="">Select</option><option>LinkedIn</option><option>Referral</option><option>Job board</option></select>
  <fieldset id="relocate"><legend>Are you willing to relocate?</legend><label><input type="radio" name="relocate" value="Yes">Yes</label><label><input type="radio" name="relocate" value="No">No</label></fieldset>
  <label for="why">Why do you want to work here?</label><textarea id="why" name="why"></textarea>
  <label><input type="checkbox" id="arb" name="arb">I agree to the Applicant Arbitration Agreement</label>
  <fieldset><legend>Gender</legend><label><input type="radio" name="gender" value="Male">Male</label><label><input type="radio" name="gender" value="Female">Female</label></fieldset>
</form></body></html>`;

async function setup(page) {
  await page.route('https://jobs.ashbyhq.com/**', r => r.fulfill({contentType: 'text/html', body: form}));
  await page.goto('https://jobs.ashbyhq.com/openai/fixture/application');
  await page.evaluate(() => document.querySelectorAll('.btns button').forEach(b => b.addEventListener('click', () => { b.parentElement.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', 'false')); b.setAttribute('aria-pressed', 'true'); })));
  for (const a of assets) await page.addScriptTag({path: path.resolve('jobright_extension', a)});
}

test('choice controls fill deterministically; screening routes to AI; legal/EEOC stay manual', async () => {
  const browser = await chromium.launch({headless: true});
  try {
    const page = await browser.newPage();
    await setup(page);
    const res = await page.evaluate(async () => {
      const cand = {full_name: 'Bhargav Reddy', authorized_in_usa: true, need_sponsorship_now: false, open_to_relocation: true};
      const fields = NextkinForms.discoverFields(document);
      const plans = NextkinFieldMapping.planFill(fields, cand);
      await NextkinFieldWriter.applyFill(plans, {sessionId: 't', isCurrent: () => true});
      const pressed = id => [...document.querySelectorAll('#' + id + ' button')].find(b => b.getAttribute('aria-pressed') === 'true')?.textContent || '';
      return {
        auth: pressed('auth'), sponsor: pressed('sponsor'),
        relocate: [...document.querySelectorAll('input[name=relocate]')].find(r => r.checked)?.value || '',
        arb: document.querySelector('#arb').checked,
        genderChecked: [...document.querySelectorAll('input[name=gender]')].some(r => r.checked),
        hearStatus: plans.find(p => p.field.element === document.querySelector('#hear'))?.status,
        hearOptions: plans.find(p => p.field.element === document.querySelector('#hear'))?.options,
        whyStatus: plans.find(p => p.field.element === document.querySelector('#why'))?.status
      };
    });
    assert.equal(res.auth, 'Yes', 'work-authorization yes/no button group selects Yes');
    assert.equal(res.sponsor, 'No', 'sponsorship yes/no button group selects No');
    assert.equal(res.relocate, 'Yes', 'relocation radio selects Yes from candidate preference');
    assert.equal(res.arb, false, 'arbitration acknowledgement is never auto-checked');
    assert.equal(res.genderChecked, false, 'EEOC gender is never auto-answered');
    assert.equal(res.hearStatus, 'ai', 'ambiguous dropdown routes to AI');
    assert.deepEqual(res.hearOptions, ['LinkedIn', 'Referral', 'Job board']);
    assert.equal(res.whyStatus, 'ai', 'free-text screening question routes to AI');
  } finally { await browser.close(); }
});

test('AI-resolved answers write into a dropdown and a screening textarea', async () => {
  const browser = await chromium.launch({headless: true});
  try {
    const page = await browser.newPage();
    await setup(page);
    const res = await page.evaluate(async () => {
      const cand = {full_name: 'Bhargav Reddy', skills: ['React', 'Node.js']};
      const fields = NextkinForms.discoverFields(document);
      const plans = NextkinFieldMapping.planFill(fields, cand);
      // Simulate the engine's AI resolution step (secure proxy returns an option / prose).
      for (const p of plans) {
        if (p.status !== 'ai') continue;
        p.value = (p.options && p.options.length) ? 'LinkedIn' : 'I am excited to bring my React and Node.js experience to this role.';
        p.status = 'supported'; p.ai = true;
      }
      const receipts = await NextkinFieldWriter.applyFill(plans, {sessionId: 'ai', isCurrent: () => true});
      return {
        hear: document.querySelector('#hear').value,
        why: document.querySelector('#why').value,
        aiReceipts: receipts.filter(r => r.ai).length
      };
    });
    assert.equal(res.hear, 'LinkedIn');
    assert.match(res.why, /React and Node\.js/);
    assert.ok(res.aiReceipts >= 2, 'AI-filled fields are tagged on their receipts');
  } finally { await browser.close(); }
});