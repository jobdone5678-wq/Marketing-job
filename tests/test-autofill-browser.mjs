import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const candidateData = {
  id: 'cand-bhargav',
  full_name: 'Bhargav Reddy',
  first_name: 'Bhargav',
  last_name: 'Reddy',
  email: 'bhargavreddy.m@gmail.com',
  phone: '+91 9876543210',
  linkedin_url: 'https://linkedin.com/in/bhargavreddy',
  current_city: 'Coimbatore',
  primary_skills: 'Python, TypeScript, React, Full Stack',
  confirmed_facts: {
    phone: '+91 9876543210',
    raw_text: 'Bhargav Reddy Full Stack Engineer Python TypeScript React Node.js PostgreSQL'
  }
};

const outsideEngineCode = fs.readFileSync('jobright_extension/outside-job-engine.js', 'utf8');

test('Autofill verification: Keka application portal', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(async () => { await browser.close(); });
  const page = await browser.newPage();

  await page.route('https://foxsense.keka.com/careers/applyjob/**', route => {
    route.fulfill({
      contentType: 'text/html',
      body: `<!DOCTYPE html>
<html>
<head><title>Senior Software Developer (Full Stack) - Python - Foxsense Innovations</title></head>
<body>
  <div class="header"><h1>Senior Software Developer (Full Stack) - Python</h1><div class="company-name">Foxsense Innovations</div></div>
  <form id="keka-apply-form">
    <input id="firstName" name="firstName" type="text" placeholder="First Name" />
    <input id="lastName" name="lastName" type="text" placeholder="Last Name" />
    <input id="email" name="email" type="email" placeholder="Email" />
    <input id="mobilePhone" name="mobilePhone" type="tel" placeholder="Mobile Phone" />
    <input id="linkedinUrl" name="linkedinUrl" type="url" placeholder="LinkedIn URL" />
    <button type="submit" id="submit-btn">Submit Application</button>
  </form>
</body>
</html>`
    });
  });

  await page.goto('https://foxsense.keka.com/careers/applyjob/128660?source=linkedin');

  await page.evaluate((cand) => {
    window.chrome = {
      storage: {
        local: {
          get: (keys, cb) => {
            const result = { nextkin_active_candidate: cand, uploadedCandidate: cand, nextkin_candidate_data: cand };
            if (typeof keys === 'function') return keys(result);
            if (cb) cb(result);
            return Promise.resolve(result);
          },
          set: (obj, cb) => { if (cb) cb(); return Promise.resolve(); }
        },
        onChanged: { addListener: () => {}, removeListener: () => {} }
      },
      runtime: { sendMessage: (msg, cb) => { if (cb) cb({ success: true }); } }
    };
  }, candidateData);

  await page.evaluate(outsideEngineCode);

  await page.evaluate(() => {
    window.postMessage({ type: 'NEXTKIN_TRIGGER_AUTOFILL' }, '*');
    document.dispatchEvent(new CustomEvent('NextkinTriggerAutofill'));
  });

  await page.waitForTimeout(400);

  assert.equal(await page.inputValue('#firstName'), 'Bhargav');
  assert.equal(await page.inputValue('#lastName'), 'Reddy');
  assert.equal(await page.inputValue('#email'), 'bhargavreddy.m@gmail.com');
  assert.equal(await page.inputValue('#mobilePhone'), '9876543210');
  assert.equal(await page.inputValue('#linkedinUrl'), 'https://linkedin.com/in/bhargavreddy');
});

test('Autofill verification: Greenhouse application portal', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(async () => { await browser.close(); });
  const page = await browser.newPage();

  await page.route('https://boards.greenhouse.io/**', route => {
    route.fulfill({
      contentType: 'text/html',
      body: `<!DOCTYPE html>
<html>
<head><title>Full Stack Engineer at Stripe</title></head>
<body>
  <div id="app_body">
    <h1 class="app-title">Full Stack Engineer</h1>
    <span class="company-name">Stripe</span>
    <form id="application_form">
      <input id="first_name" name="first_name" type="text" autocomplete="given-name" />
      <input id="last_name" name="last_name" type="text" autocomplete="family-name" />
      <input id="email" name="email" type="email" autocomplete="email" />
      <input id="phone" name="phone" type="tel" autocomplete="tel" />
      <input id="job_application_answers_attributes_0_text_value" name="job_application[answers_attributes][0][text_value]" type="text" placeholder="LinkedIn Profile" />
      <button type="submit" id="submit_app">Submit Application</button>
    </form>
  </div>
</body>
</html>`
    });
  });

  await page.goto('https://boards.greenhouse.io/stripe/jobs/123456');

  await page.evaluate((cand) => {
    window.chrome = {
      storage: {
        local: {
          get: (keys, cb) => {
            const result = { nextkin_active_candidate: cand, uploadedCandidate: cand, nextkin_candidate_data: cand };
            if (typeof keys === 'function') return keys(result);
            if (cb) cb(result);
            return Promise.resolve(result);
          },
          set: (obj, cb) => { if (cb) cb(); return Promise.resolve(); }
        },
        onChanged: { addListener: () => {}, removeListener: () => {} }
      },
      runtime: { sendMessage: (msg, cb) => { if (cb) cb({ success: true }); } }
    };
  }, candidateData);

  await page.evaluate(outsideEngineCode);

  await page.evaluate(() => {
    window.postMessage({ type: 'NEXTKIN_TRIGGER_AUTOFILL' }, '*');
    document.dispatchEvent(new CustomEvent('NextkinTriggerAutofill'));
  });

  await page.waitForTimeout(400);

  assert.equal(await page.inputValue('#first_name'), 'Bhargav');
  assert.equal(await page.inputValue('#last_name'), 'Reddy');
  assert.equal(await page.inputValue('#email'), 'bhargavreddy.m@gmail.com');
  assert.equal(await page.inputValue('#phone'), '9876543210');
  assert.equal(await page.inputValue('#job_application_answers_attributes_0_text_value'), 'https://linkedin.com/in/bhargavreddy');
});

test('Autofill verification: Ashby application portal', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(async () => { await browser.close(); });
  const page = await browser.newPage();

  await page.route('https://jobs.ashbyhq.com/**', route => {
    route.fulfill({
      contentType: 'text/html',
      body: `<!DOCTYPE html>
<html>
<head><title>Senior Engineer at Retool</title></head>
<body>
  <div id="application">
    <h1 class="ashby-job-posting-heading">Senior Engineer</h1>
    <form id="ashby-form">
      <input name="name" placeholder="Full Name" type="text" />
      <input name="email" placeholder="Email Address" type="email" />
      <input name="phoneNumber" placeholder="Phone Number" type="tel" />
      <input name="urls.LinkedIn" placeholder="LinkedIn Profile" type="text" />
      <button type="submit" id="submit-btn">Submit Application</button>
    </form>
  </div>
</body>
</html>`
    });
  });

  await page.goto('https://jobs.ashbyhq.com/retool/987654/application');

  await page.evaluate((cand) => {
    window.chrome = {
      storage: {
        local: {
          get: (keys, cb) => {
            const result = { nextkin_active_candidate: cand, uploadedCandidate: cand, nextkin_candidate_data: cand };
            if (typeof keys === 'function') return keys(result);
            if (cb) cb(result);
            return Promise.resolve(result);
          },
          set: (obj, cb) => { if (cb) cb(); return Promise.resolve(); }
        },
        onChanged: { addListener: () => {}, removeListener: () => {} }
      },
      runtime: { sendMessage: (msg, cb) => { if (cb) cb({ success: true }); } }
    };
  }, candidateData);

  await page.evaluate(outsideEngineCode);

  await page.evaluate(() => {
    window.postMessage({ type: 'NEXTKIN_TRIGGER_AUTOFILL' }, '*');
    document.dispatchEvent(new CustomEvent('NextkinTriggerAutofill'));
  });

  await page.waitForTimeout(400);

  assert.equal(await page.inputValue('input[name="name"]'), 'Bhargav Reddy');
  assert.equal(await page.inputValue('input[name="email"]'), 'bhargavreddy.m@gmail.com');
  assert.equal(await page.inputValue('input[name="phoneNumber"]'), '9876543210');
  assert.equal(await page.inputValue('input[name="urls.LinkedIn"]'), 'https://linkedin.com/in/bhargavreddy');
});

test('Autofill verification: Lever application portal', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(async () => { await browser.close(); });
  const page = await browser.newPage();

  const fixtureHtml = fs.readFileSync('tests/fixtures/mock-job-pages/lever.html', 'utf8');
  await page.route('https://jobs.lever.co/**', route => {
    route.fulfill({
      contentType: 'text/html',
      body: fixtureHtml
    });
  });

  await page.goto('https://jobs.lever.co/figma/abcdef-1234/apply');

  await page.evaluate((cand) => {
    window.chrome = {
      storage: {
        local: {
          get: (keys, cb) => {
            const result = { nextkin_active_candidate: cand, uploadedCandidate: cand, nextkin_candidate_data: cand };
            if (typeof keys === 'function') return keys(result);
            if (cb) cb(result);
            return Promise.resolve(result);
          },
          set: (obj, cb) => { if (cb) cb(); return Promise.resolve(); }
        },
        onChanged: { addListener: () => {}, removeListener: () => {} }
      },
      runtime: { sendMessage: (msg, cb) => { if (cb) cb({ success: true }); } }
    };
  }, candidateData);

  await page.evaluate(outsideEngineCode);

  await page.evaluate(() => {
    window.postMessage({ type: 'NEXTKIN_TRIGGER_AUTOFILL' }, '*');
    document.dispatchEvent(new CustomEvent('NextkinTriggerAutofill'));
  });

  await page.waitForTimeout(400);

  assert.equal(await page.inputValue('input[name="name"]'), 'Bhargav Reddy');
  assert.equal(await page.inputValue('input[name="email"]'), 'bhargavreddy.m@gmail.com');
  assert.equal(await page.inputValue('input[name="phone"]'), '9876543210');
  assert.equal(await page.inputValue('input[name="urls[LinkedIn]"]'), 'https://linkedin.com/in/bhargavreddy');
});

test('Autofill verification: Workday application portal', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(async () => { await browser.close(); });
  const page = await browser.newPage();

  const fixtureHtml = fs.readFileSync('tests/fixtures/mock-job-pages/workday.html', 'utf8');
  await page.route('https://wd5.myworkdayjobs.com/**', route => {
    route.fulfill({
      contentType: 'text/html',
      body: fixtureHtml
    });
  });

  await page.goto('https://wd5.myworkdayjobs.com/nvidia/job/1234/apply');

  await page.evaluate((cand) => {
    window.chrome = {
      storage: {
        local: {
          get: (keys, cb) => {
            const result = { nextkin_active_candidate: cand, uploadedCandidate: cand, nextkin_candidate_data: cand };
            if (typeof keys === 'function') return keys(result);
            if (cb) cb(result);
            return Promise.resolve(result);
          },
          set: (obj, cb) => { if (cb) cb(); return Promise.resolve(); }
        },
        onChanged: { addListener: () => {}, removeListener: () => {} }
      },
      runtime: { sendMessage: (msg, cb) => { if (cb) cb({ success: true }); } }
    };
  }, candidateData);

  await page.evaluate(outsideEngineCode);

  await page.evaluate(() => {
    window.postMessage({ type: 'NEXTKIN_TRIGGER_AUTOFILL' }, '*');
    document.dispatchEvent(new CustomEvent('NextkinTriggerAutofill'));
  });

  await page.waitForTimeout(400);

  assert.equal(await page.inputValue('input[data-automation-id="legalNameSection_firstName"]'), 'Bhargav');
  assert.equal(await page.inputValue('input[data-automation-id="legalNameSection_lastName"]'), 'Reddy');
  assert.equal(await page.inputValue('input[data-automation-id="email"]'), 'bhargavreddy.m@gmail.com');
  assert.equal(await page.inputValue('input[data-automation-id="phone-number"]'), '9876543210');
  assert.equal(await page.inputValue('input[data-automation-id="linkedin-question"]'), 'https://linkedin.com/in/bhargavreddy');
});

