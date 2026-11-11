import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import path from 'node:path';

// The autofill engine as it ships in the manifest: the portal adapters and the shared engine.
const assets = [
  'adapters/ats-adapters.js', 'adapters/generic.js', 'adapters/greenhouse.js', 'adapters/lever.js',
  'adapters/ashby.js', 'adapters/workday.js',
  'core/form-discovery.js', 'core/field-mapping.js', 'core/field-writer.js'
];

const candidate = {
  id: 'cand-portal-001',
  provenance_status: 'confirmed',
  full_name: 'Bhargav Reddy',
  first_name: 'Bhargav',
  last_name: 'Reddy',
  email: 'bhargav.reddy@example.test',
  phone: '+91 9876543210',
  current_city: 'Austin',
  current_state: 'Texas',
  country: 'United States',
  linkedin_url: 'https://linkedin.com/in/bhargavreddy',
  authorized_in_usa: true,
  need_sponsorship_now: false,
  need_sponsorship_future: false,
  confirmed_facts: {}
};

// Every portal answers the same questions with its own markup: free text, a checkbox that a
// profile fact backs, a legal acknowledgement, a dropdown, a yes/no group and a search dropdown.
const portals = [
  {
    name: 'Ashby',
    host: 'jobs.ashbyhq.com',
    url: 'https://jobs.ashbyhq.com/retool/portal/application',
    pick: {
      name: '#_systemfield_name', email: '#_systemfield_email', phone: '#_systemfield_phone',
      linkedin: '#linkedin', state: '#state', authorization: '#authorized', terms: '#arb-box'
    },
    html: `<!doctype html><html><body><form>
      <div class="ashby-application-form-field-entry" data-field-path="_systemfield_name">
        <label class="ashby-application-form-question-title" for="_systemfield_name">Name</label>
        <input id="_systemfield_name" name="_systemfield_name" type="text" placeholder="Type here...">
      </div>
      <div class="ashby-application-form-field-entry" data-field-path="_systemfield_email">
        <label class="ashby-application-form-question-title" for="_systemfield_email">Email</label>
        <input id="_systemfield_email" name="_systemfield_email" type="email" placeholder="Type here...">
      </div>
      <div class="ashby-application-form-field-entry" data-field-path="_systemfield_phone">
        <label class="ashby-application-form-question-title" for="_systemfield_phone">Phone</label>
        <input id="_systemfield_phone" name="_systemfield_phone" type="tel" placeholder="Type here...">
      </div>
      <div class="ashby-application-form-field-entry" data-field-path="urls[LinkedIn]">
        <label class="ashby-application-form-question-title" for="linkedin">LinkedIn</label>
        <input id="linkedin" name="urls[LinkedIn]" type="text" placeholder="Type here...">
      </div>
      <div class="ashby-application-form-field-entry" data-field-path="state">
        <label class="ashby-application-form-question-title" for="state">State</label>
        <select id="state" name="state"><option value="">Select</option><option value="CA">California</option><option value="NY">New York</option><option value="TX">Texas</option></select>
      </div>
      <div class="ashby-application-form-field-entry" data-field-path="authorized">
        <label class="ashby-application-form-question-title" for="authorized">Are you authorized to work in the United States?</label>
        <input id="authorized" name="authorized" type="checkbox">
      </div>
      <div class="ashby-application-form-field-entry" data-field-path="arb">
        <label class="ashby-application-form-question-title" for="arb">Applicant Arbitration Agreement Acknowledgement</label>
        <label for="arb-box"><input type="checkbox" id="arb-box">I acknowledge that I have opened, read, and understood the Arbitration Agreement</label>
      </div>
    </form></body></html>`
  },
  {
    name: 'Greenhouse',
    host: 'boards.greenhouse.io',
    url: 'https://boards.greenhouse.io/stripe/jobs/123456',
    pick: {
      first: '#first_name', last: '#last_name', email: '#email', phone: '#phone',
      state: '#state', authorization: '#auth', terms: '#terms'
    },
    html: `<!doctype html><html><body><div id="app_body"><form id="application_form">
      <label for="first_name">First Name</label><input id="first_name" name="first_name" type="text" autocomplete="given-name">
      <label for="last_name">Last Name</label><input id="last_name" name="last_name" type="text" autocomplete="family-name">
      <label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email">
      <label for="phone">Phone</label><input id="phone" name="phone" type="tel" autocomplete="tel">
      <label for="state">State</label><select id="state" name="state"><option value="">Select</option><option value="CA">California</option><option value="NY">New York</option><option value="TX">Texas</option></select>
      <label for="auth">Are you legally authorized to work in the United States?</label><input id="auth" name="job_application[authorized]" type="checkbox">
      <label for="terms">I agree to the terms and data privacy policy</label><input id="terms" name="job_application[terms]" type="checkbox">
    </form></div></body></html>`
  },
  {
    name: 'Lever',
    host: 'jobs.lever.co',
    url: 'https://jobs.lever.co/figma/portal-apply',
    pick: {
      name: '#name', email: '#email', phone: '#phone', linkedin: '#linkedin',
      state: '#state', authorization: '#auth', terms: '#terms'
    },
    html: `<!doctype html><html><body><form><ul class="application-form">
      <li class="application-question"><label class="application-label" for="name">Full name</label>
        <input id="name" name="name" type="text" autocomplete="name"></li>
      <li class="application-question"><label class="application-label" for="email">Email</label>
        <input id="email" name="email" type="email" autocomplete="email"></li>
      <li class="application-question"><label class="application-label" for="phone">Phone</label>
        <input id="phone" name="phone" type="tel" autocomplete="tel"></li>
      <li class="application-question"><label class="application-label" for="linkedin">LinkedIn profile</label>
        <input id="linkedin" name="urls[LinkedIn]" type="text"></li>
      <li class="application-question"><label class="application-label" for="state">State</label>
        <select id="state" name="state"><option value="">Select</option><option value="CA">California</option><option value="NY">New York</option><option value="TX">Texas</option></select></li>
      <li class="application-question"><label class="application-label" for="auth">Are you legally authorized to work in the United States?</label>
        <input id="auth" name="auth" type="checkbox"></li>
      <li class="application-question"><label class="application-label" for="terms">I agree to the terms and data privacy policy</label>
        <input id="terms" name="terms" type="checkbox"></li>
    </ul></form></body></html>`
  },
  {
    name: 'Workday',
    host: 'wd5.myworkdayjobs.com',
    url: 'https://wd5.myworkdayjobs.com/nvidia/portal/job/1234/apply',
    pick: {
      first: '#firstName', last: '#lastName', email: '#email', phone: '#phone',
      state: '#state', authorization: '#auth', terms: '#terms'
    },
    html: `<!doctype html><html><body><form>
      <div class="workday-field-container" data-automation-id="formField-legalNameSection_firstName">
        <label for="firstName">Legal First Name</label>
        <input id="firstName" data-automation-id="legalNameSection_firstName" name="legalNameSection_firstName" type="text" autocomplete="given-name"></div>
      <div class="workday-field-container" data-automation-id="formField-legalNameSection_lastName">
        <label for="lastName">Legal Last Name</label>
        <input id="lastName" data-automation-id="legalNameSection_lastName" name="legalNameSection_lastName" type="text" autocomplete="family-name"></div>
      <div class="workday-field-container" data-automation-id="formField-email">
        <label for="email">Email Address</label>
        <input id="email" data-automation-id="email" name="email" type="email" autocomplete="email"></div>
      <div class="workday-field-container" data-automation-id="formField-phone">
        <label for="phone">Phone Number</label>
        <input id="phone" data-automation-id="phone-number" name="phone-number" type="tel" autocomplete="tel"></div>
      <div class="workday-field-container" data-automation-id="formField-state">
        <label for="state">State</label>
        <select id="state" data-automation-id="addressSection_countryRegion" name="countryRegion"><option value="">Select</option><option value="CA">California</option><option value="NY">New York</option><option value="TX">Texas</option></select></div>
      <div class="workday-field-container" data-automation-id="formField-authorization">
        <label for="auth">Are you legally authorized to work in the United States?</label>
        <input id="auth" data-automation-id="question-authorization" name="workAuthorization" type="checkbox"></div>
      <div class="workday-field-container" data-automation-id="formField-terms">
        <label for="terms">I agree to the terms and data privacy policy</label>
        <input id="terms" data-automation-id="agreement" name="agreement" type="checkbox"></div>
    </form></body></html>`
  },
  {
    name: 'Keka / Foxsense',
    host: 'foxsense.keka.com',
    url: 'https://foxsense.keka.com/careers/applyjob/128660',
    pick: {
      first: '#firstName', last: '#lastName', email: '#email', phone: '#mobilePhone',
      state: '#state', authorization: '#auth', terms: '#terms'
    },
    html: `<!doctype html><html><body><form id="keka-apply-form">
      <div class="form-group"><label for="firstName">First Name</label><input id="firstName" name="firstName" type="text"></div>
      <div class="form-group"><label for="lastName">Last Name</label><input id="lastName" name="lastName" type="text"></div>
      <div class="form-group"><label for="email">Email</label><input id="email" name="email" type="email"></div>
      <div class="form-group"><label for="mobilePhone">Mobile Phone</label><input id="mobilePhone" name="mobilePhone" type="tel"></div>
      <div class="form-group"><label for="state">State</label><select id="state" name="state"><option value="">Select</option><option value="CA">California</option><option value="NY">New York</option><option value="TX">Texas</option></select></div>
      <div class="form-group"><label for="auth">Are you legally authorized to work in the United States?</label><input id="auth" name="auth" type="checkbox"></div>
      <div class="form-group"><label for="terms">I agree to the terms and data privacy policy</label><input id="terms" name="terms" type="checkbox"></div>
    </form></body></html>`
  },
  {
    name: 'Custom career site',
    host: 'careers.example.test',
    url: 'https://careers.example.test/jobs/senior-engineer',
    pick: {
      name: '#full-name', email: '#email', phone: '#phone',
      state: '#state', terms: '#terms'
    },
    html: `<!doctype html><html><body><form>
      <label for="full-name">Full Name</label><input id="full-name" name="full_name" type="text">
      <label for="email">Email Address</label><input id="email" name="email" type="email">
      <label for="phone">Phone Number</label><input id="phone" name="phone" type="tel">
      <label for="state">State</label><select id="state" name="state"><option value="">Select a state</option><option value="CA">California</option><option value="NY">New York</option><option value="TX">Texas</option></select>
      <fieldset><legend>Are you legally authorized to work in the United States?</legend>
        <label><input type="radio" name="authorization" value="Yes">Yes</label>
        <label><input type="radio" name="authorization" value="No">No</label></fieldset>
      <div role="checkbox" id="aria-auth" aria-checked="false" tabindex="0">I am authorized to work in the United States</div>
      <label for="terms">I agree to the terms and data privacy policy</label><input id="terms" name="terms" type="checkbox">
    </form></body></html>`
  }
];

async function fill(page, portal) {
  for (const asset of assets) await page.addScriptTag({ path: path.resolve('jobright_extension', asset) });
  return page.evaluate(async ({ candidate, pick }) => {
    const fields = NextkinForms.discoverFields(document);
    const plans = NextkinFieldMapping.planFill(fields, candidate);
    const receipts = await NextkinFieldWriter.applyFill(plans, { sessionId: 'portal', isCurrent: () => true });
    const read = selector => {
      if (!selector) return null;
      const el = document.querySelector(selector);
      if (!el) return null;
      if (el.type === 'checkbox' || el.type === 'radio') return el.checked;
      return el.value;
    };
    return {
      adapter: fields[0]?.adapter || '',
      written: receipts.length,
      first: read(pick.first),
      last: read(pick.last),
      name: read(pick.name),
      email: read(pick.email),
      phone: read(pick.phone),
      linkedin: read(pick.linkedin),
      state: read(pick.state),
      authorization: read(pick.authorization),
      ariaAuthorization: document.querySelector('#aria-auth')?.getAttribute('aria-checked') || '',
      radioAuthorization: document.querySelector('input[name="authorization"][value="Yes"]')?.checked ?? null,
      terms: read(pick.terms),
      plans: plans.map(p => ({ kind: p.field.kind, status: p.status, label: String(p.field.label || '').slice(0, 40) }))
    };
  }, { candidate, pick: portal.pick });
}

for (const portal of portals) {
  test(`autofill fills text, checkbox and dropdown on the ${portal.name} application form`, async t => {
    const browser = await chromium.launch({ headless: true });
    t.after(() => browser.close());
    const page = await browser.newPage();
    await page.route(`https://${portal.host}/**`, route => route.fulfill({ contentType: 'text/html', body: portal.html }));
    await page.goto(portal.url);

    const result = await fill(page, portal);

    // The portal adapter recognises its own markup.
    assert.ok(result.adapter, 'a portal adapter is chosen');

    // Free text answers the profile facts.
    assert.equal(result.email, 'bhargav.reddy@example.test', 'email is filled');
    assert.equal(result.phone, '9876543210', 'phone is filled');
    if (result.first !== null) {
      assert.equal(result.first, 'Bhargav', 'first name is filled');
      assert.equal(result.last, 'Reddy', 'last name is filled');
    }
    if (result.name !== null) {
      assert.equal(result.name, 'Bhargav Reddy', 'name is filled');
    }
    if (result.linkedin !== null) {
      assert.equal(result.linkedin, 'https://linkedin.com/in/bhargavreddy', 'linkedin is filled');
    }

    // A dropdown answers with the option that carries the fact.
    assert.equal(result.state, 'TX', 'the state dropdown picks Texas');

    // A checkbox that a profile fact backs is answered.
    if (portal.name === 'Custom career site') {
      assert.equal(result.radioAuthorization, true, 'the yes/no group answers the work authorization');
      assert.equal(result.ariaAuthorization, 'true', 'the custom ARIA checkbox answers the work authorization');
    } else {
      assert.equal(result.authorization, true, 'the work authorization checkbox is answered');
    }

    // A legal acknowledgement is never ticked for the candidate.
    assert.equal(result.terms, false, 'the legal acknowledgement is left for the candidate');
  });
}

test('a resume file name never becomes the name that is typed into the form', async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route('https://jobs.lever.co/**', route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html><body><form><ul class="application-form">
      <li class="application-question"><label class="application-label" for="name">Full name</label>
        <input id="name" name="name" type="text"></li>
    </ul></form></body></html>`
  }));
  await page.goto('https://jobs.lever.co/palantir/fixture/apply');
  for (const asset of assets) await page.addScriptTag({ path: path.resolve('jobright_extension', asset) });
  const result = await page.evaluate(async candidate => {
    const fields = NextkinForms.discoverFields(document);
    const plans = NextkinFieldMapping.planFill(fields, candidate);
    await NextkinFieldWriter.applyFill(plans, { sessionId: 'portal', isCurrent: () => true });
    return { name: document.querySelector('#name').value };
  }, {
    ...candidate,
    full_name: 'BHARGAV_REDDY_G2i_Inc_Full_Stack_Developer_G2i_Talent_Pool_8cc336b0850f.docx'
  });
  assert.equal(result.name, 'Bhargav Reddy', 'the resume file name is cleaned before it is written');
});

test('the fill report counts every field that holds the candidate answer', async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route('https://jobs.lever.co/**', route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html><body><form><ul class="application-form">
      <li class="application-question"><label class="application-label" for="email">Email</label>
        <input id="email" name="email" type="email"></li>
    </ul></form></body></html>`
  }));
  await page.goto('https://jobs.lever.co/palantir/fixture/apply');
  for (const asset of assets) await page.addScriptTag({ path: path.resolve('jobright_extension', asset) });
  await page.addScriptTag({ path: path.resolve('jobright_extension', 'core/outside-job-engine.js') });
  await page.evaluate(candidate => {
    window.chrome = {
      storage: { local: { get: async () => ({ nextkin_active_candidate: candidate, uploadedCandidate: candidate }) } },
      runtime: { sendMessage: async () => ({}) }
    };
  }, candidate);
  // An earlier autofill pass already wrote the answer into the page.
  await page.evaluate(() => { document.querySelector('#email').value = 'bhargav.reddy@example.test'; });

  const report = await page.evaluate(async () => {
    const done = new Promise(resolve => {
      window.addEventListener('message', event => {
        if (event.data && event.data.type === 'NEXTKIN_AUTOFILL_DONE') resolve(event.data);
      });
    });
    window.postMessage({ type: 'NEXTKIN_TRIGGER_AUTOFILL' }, '*');
    return done;
  });

  assert.equal(report.filledCount, 1, 'a field that holds the answer is counted as filled');
  assert.equal(report.filledFields.length, 1);
  assert.ok(report.totalCount >= 1, 'the detected field count is reported');
});

test('a search dropdown picks the place that matches the profile instead of the search text', async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route('https://jobs.ashbyhq.com/**', route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html><body><form>
      <div data-field-path="_systemfield_location"><label for="location">Where are you currently located?</label>
        <input id="location" role="combobox" placeholder="Start typing..." aria-controls="places"></div>
      <div id="places" role="listbox">
        <div role="option">Austin, Texas, United States</div>
        <div role="option">Austin, Minnesota, United States</div>
      </div>
      <script>
        document.querySelectorAll('[role=option]').forEach(option => option.addEventListener('click', () => {
          document.querySelector('#location').value = option.textContent.trim();
        }));
      </script>
    </form></body></html>`
  }));
  await page.goto('https://jobs.ashbyhq.com/retool/portal/application');
  for (const asset of assets) await page.addScriptTag({ path: path.resolve('jobright_extension', asset) });
  const result = await page.evaluate(async candidate => {
    const fields = NextkinForms.discoverFields(document);
    const plans = NextkinFieldMapping.planFill(fields, candidate);
    let clicked = '';
    document.querySelectorAll('[role="option"]').forEach(option => option.addEventListener('click', () => { clicked = option.textContent.trim(); }));
    await NextkinFieldWriter.applyFill(plans, { sessionId: 'portal', isCurrent: () => true });
    return { clicked, value: document.querySelector('#location').value, status: fields[0]?.commitStatus };
  }, candidate);
  assert.equal(result.clicked, 'Austin, Texas, United States', 'the option that matches the state is clicked');
  assert.equal(result.value, 'Austin, Texas, United States', 'the dropdown shows the chosen place');
  assert.equal(result.status, 'filled', 'the commit is reported');
});
