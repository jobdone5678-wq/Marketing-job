import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

test('autofilled fields update framework state and submit without required field errors', async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());

  const page = await browser.newPage();
  await page.route('https://jobs.ashbyhq.com/**', route => route.fulfill({
    contentType: 'text/html',
    body: `<!DOCTYPE html>
    <html>
    <head><title>Senior Engineer - Ashby</title></head>
    <body>
      <h1>Senior Engineer</h1>
      <form id="application_form">
        <label for="first_name">First Name *</label>
        <input id="first_name" name="first_name" required>
        <span class="err" id="err-first"></span>

        <label for="last_name">Last Name *</label>
        <input id="last_name" name="last_name" required>
        <span class="err" id="err-last"></span>

        <label for="email">Email *</label>
        <input id="email" name="email" type="email" required>
        <span class="err" id="err-email"></span>

        <label for="phone">Phone *</label>
        <input id="phone" name="phone" type="tel" required>
        <span class="err" id="err-phone"></span>

        <fieldset id="auth-group">
          <legend>Are you legally authorized to work in the United States? *</legend>
          <label><input type="radio" name="auth" value="Yes" required> Yes</label>
          <label><input type="radio" name="auth" value="No" required> No</label>
          <span class="err" id="err-auth"></span>
        </fieldset>

        <button type="submit" id="submit-btn">Submit application</button>
      </form>
      <div id="confirmation" style="display:none">
        <h2>Thank you for applying</h2>
        <p>Your application was submitted</p>
      </div>
      <script>
        const form = document.getElementById('application_form');
        // Simulate reactive/framework input tracking (e.g. React/Ashby Hook Form)
        const formState = { first_name: '', last_name: '', email: '', phone: '', auth: '' };

        form.querySelector('#first_name').addEventListener('input', e => { formState.first_name = e.target.value; });
        form.querySelector('#last_name').addEventListener('input', e => { formState.last_name = e.target.value; });
        form.querySelector('#email').addEventListener('input', e => { formState.email = e.target.value; });
        form.querySelector('#phone').addEventListener('input', e => { formState.phone = e.target.value; });
        form.querySelectorAll('input[name="auth"]').forEach(r => r.addEventListener('change', e => { if (r.checked) formState.auth = r.value; }));

        form.onsubmit = e => {
          e.preventDefault();
          let valid = true;
          // If framework state is empty even though input.value has text, simulate framework validation error
          if (!formState.first_name.trim()) {
            document.getElementById('err-first').textContent = 'First name is required';
            document.getElementById('first_name').setAttribute('aria-invalid', 'true');
            valid = false;
          } else {
            document.getElementById('err-first').textContent = '';
            document.getElementById('first_name').removeAttribute('aria-invalid');
          }

          if (!formState.last_name.trim()) {
            document.getElementById('err-last').textContent = 'Last name is required';
            document.getElementById('last_name').setAttribute('aria-invalid', 'true');
            valid = false;
          } else {
            document.getElementById('err-last').textContent = '';
            document.getElementById('last_name').removeAttribute('aria-invalid');
          }

          if (!formState.email.trim()) {
            document.getElementById('err-email').textContent = 'Email is required';
            document.getElementById('email').setAttribute('aria-invalid', 'true');
            valid = false;
          } else {
            document.getElementById('err-email').textContent = '';
            document.getElementById('email').removeAttribute('aria-invalid');
          }

          if (!formState.phone.trim()) {
            document.getElementById('err-phone').textContent = 'Phone is required';
            document.getElementById('phone').setAttribute('aria-invalid', 'true');
            valid = false;
          } else {
            document.getElementById('err-phone').textContent = '';
            document.getElementById('phone').removeAttribute('aria-invalid');
          }

          if (!formState.auth) {
            document.getElementById('err-auth').textContent = 'Authorization status is required';
            valid = false;
          } else {
            document.getElementById('err-auth').textContent = '';
          }

          if (valid) {
            form.style.display = 'none';
            document.getElementById('confirmation').style.display = 'block';
          }
        };
      </script>
    </body>
    </html>`
  }));

  await page.goto('https://jobs.ashbyhq.com/test-org/role-123/application');
  await page.evaluate(() => {
    window.chrome = {
      runtime: {
        sendMessage: async message => {
          if (message.type === 'get_candidates') {
            return {
              role: 'client',
              ownCandidateId: 'cand-1',
              candidates: [{
                id: 'cand-1',
                full_name: 'Bhargav Ram',
                email: 'bramireddy24@gmail.com',
                phone: '7032731818',
                authorized_in_usa: true,
                need_sponsorship_now: false,
                need_sponsorship_future: false
              }]
            };
          }
          if (message.type === 'get_context') return { linked: false };
          return {};
        }
      }
    };
  });

  // Load extension content script
  const contentJs = await readFile(path.resolve('browser-extension/content.js'), 'utf8');
  await page.addScriptTag({ content: contentJs });
  await page.locator('#mp-copilot-root').waitFor();

  // Wait for autofill to populate fields
  await page.waitForFunction(() => document.querySelector('#email').value === 'bramireddy24@gmail.com');
  assert.equal(await page.inputValue('#first_name'), 'Bhargav');
  assert.equal(await page.inputValue('#last_name'), 'Ram');
  assert.equal(await page.inputValue('#email'), 'bramireddy24@gmail.com');
  assert.equal(await page.inputValue('#phone'), '7032731818');
  assert.equal(await page.isChecked('input[name="auth"][value="Yes"]'), true);

  // Click submit button
  await page.click('#submit-btn');

  // Verify no validation errors were produced on the filled fields
  assert.equal(await page.locator('#err-first').textContent(), '');
  assert.equal(await page.locator('#err-last').textContent(), '');
  assert.equal(await page.locator('#err-email').textContent(), '');
  assert.equal(await page.locator('#err-phone').textContent(), '');
  assert.equal(await page.locator('#err-auth').textContent(), '');

  // Verify form submitted successfully
  await page.waitForFunction(() => document.getElementById('confirmation').style.display === 'block');
  assert.equal(await page.locator('#confirmation h2').textContent(), 'Thank you for applying');
});
