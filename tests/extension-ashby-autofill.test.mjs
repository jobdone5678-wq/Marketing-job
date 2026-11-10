import test from 'node:test';
import assert from 'node:assert/strict';
import playwright from '@playwright/test';
import path from 'node:path';
const {chromium} = playwright;

// Mirror the manifest's modular content-script group so the last-loaded adapters/ashby.js
// (which shadows the registry adapter) is the one exercised here.
const assets = ['adapters/ats-adapters.js', 'adapters/generic.js', 'adapters/greenhouse.js', 'adapters/lever.js', 'adapters/ashby.js', 'adapters/workday.js', 'form-discovery.js', 'field-mapping.js', 'field-writer.js'];

// Real Ashby application markup: a single "Name" label bound to name="_systemfield_name".
const ashbyForm = `<!doctype html><html><body><form>
  <div class="field"><label for="name">Name</label><input id="name" name="_systemfield_name" type="text" autocomplete="name"></div>
  <div class="field"><label for="email">Email</label><input id="email" name="_systemfield_email" type="email" autocomplete="email"></div>
  <div class="field"><label for="phone">Phone</label><input id="phone" name="_systemfield_phone" type="tel" autocomplete="tel"></div>
  <div class="field"><label for="linkedin">LinkedIn</label><input id="linkedin" name="urls[LinkedIn]" type="text"></div>
  <div class="field"><label for="referral">Who referred you to this job?</label><input id="referral" name="referral" type="text"></div>
  <div class="field"><label for="salary">What are your salary expectations?</label><input id="salary" name="salary" type="text"></div>
</form></body></html>`;

test('Ashby system fields autofill from the parsed candidate (regression: TDZ crash + Name mapping)', async () => {
  const browser = await chromium.launch({headless: true});
  try {
    const page = await browser.newPage();
    await page.route('https://jobs.ashbyhq.com/**', route => route.fulfill({contentType: 'text/html', body: ashbyForm}));
    await page.goto('https://jobs.ashbyhq.com/openai/fixture/application');
    for (const asset of assets) await page.addScriptTag({path: path.resolve('jobright_extension', asset)});
    const result = await page.evaluate(async () => {
      const candidate = {id: 'cand-1', full_name: 'Bhargav Reddy', first_name: 'Bhargav', last_name: 'Reddy', email: 'bhargav.reddy.sample@example.com', phone: '5551234567', linkedin_url: 'https://linkedin.com/in/bhargav-reddy', current_city: 'Austin', current_state: 'TX'};
      const fields = NextkinForms.discoverFields(document);
      let threw = null, plans = [];
      try { plans = NextkinFieldMapping.planFill(fields, candidate); } catch (e) { threw = String(e); }
      const receipts = await NextkinFieldWriter.applyFill(plans, {sessionId: 'ashby', isCurrent: () => true});
      return {
        threw,
        adapter: fields[0]?.adapter,
        name: document.querySelector('#name').value,
        email: document.querySelector('#email').value,
        phone: document.querySelector('#phone').value,
        linkedin: document.querySelector('#linkedin').value,
        referral: document.querySelector('#referral').value,
        referralStatus: plans.find(p => p.field.element === document.querySelector('#referral'))?.status,
        written: receipts.length
      };
    });
    assert.equal(result.threw, null, 'planFill must not throw (temporal-dead-zone regression)');
    assert.equal(result.adapter, 'ashby');
    assert.equal(result.name, 'Bhargav Reddy', 'the single Ashby Name field must fill');
    assert.equal(result.email, 'bhargav.reddy.sample@example.com');
    assert.equal(result.phone, '5551234567');
    assert.equal(result.linkedin, 'https://linkedin.com/in/bhargav-reddy');
    assert.equal(result.referral, '', 'referral question must not be auto-answered');
    assert.equal(result.referralStatus, 'manual');
    assert.ok(result.written >= 4, 'at least name/email/phone/linkedin are written');
  } finally { await browser.close(); }
});

test('uploaded-resume storage shape resolves the real candidate without fabricating an email', async () => {
  const browser = await chromium.launch({headless: true});
  try {
    const page = await browser.newPage();
    await page.route('https://jobs.ashbyhq.com/**', route => route.fulfill({contentType: 'text/html', body: '<form><input name="_systemfield_email" type="email"></form>'}));
    await page.goto('https://jobs.ashbyhq.com/openai/fixture/application');
    await page.evaluate(() => {
      window.chrome = {
        storage: {local: {get: async () => ({uploaded_resume: {filename: 'BHARGAV_REDDY_G2i_Inc_Full_Stack_Developer.docx', text: 'Bhargav Reddy\nbhargav.reddy.sample@example.com', candidate: {id: 'cand-upl', full_name: 'Bhargav Reddy', email: 'bhargav.reddy.sample@example.com', phone: '', source_text: 'Bhargav Reddy\nbhargav.reddy.sample@example.com'}}})}},
        runtime: {sendMessage: () => {}}
      };
    });
    await page.addScriptTag({path: path.resolve('jobright_extension', 'outside-job-engine.js')});
    const candidate = await page.evaluate(async () => {
      const cand = await window.loadActiveCandidate();
      return {email: cand?.email || '', name: cand?.full_name || ''};
    });
    assert.equal(candidate.email, 'bhargav.reddy.sample@example.com', 'must use the parsed email, never a fabricated Gmail');
    assert.equal(candidate.name, 'Bhargav Reddy');
  } finally { await browser.close(); }
});