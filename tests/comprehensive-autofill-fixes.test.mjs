import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import fs from 'fs';

const candidate = {
  id: 'cand-comprehensive-1',
  full_name: 'Jordan Miller',
  first_name: 'Jordan',
  last_name: 'Miller',
  email: 'jordan.miller@example.com',
  phone: '4155552671',
  current_city: 'Austin',
  current_state: 'Texas',
  country: 'United States',
  current_company: 'Acme Technologies',
  current_job_title: 'Full Stack Engineer',
  skills: ['TypeScript', 'React', 'Node.js', 'PostgreSQL'],
  authorized_in_usa: true,
  need_sponsorship_now: false,
  need_sponsorship_future: false,
  total_experience_years: 5
};

const outsideEngineCode = fs.readFileSync('jobright_extension/outside-job-engine.js', 'utf8');

test('comprehensive verification: checkboxes, dropdowns, and AI-only bio/screening fields', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());

  const context = await browser.newContext();
  const page = await context.newPage();

  // Route mock background message responses
  await page.addInitScript(({ cand }) => {
    window.chrome = {
      storage: {
        local: {
          get: async (keys) => {
            return {
              uploaded_resume: { parsed_candidate: cand },
              uploadedCandidate: cand,
              nextkin_active_candidate: cand,
              candidates: [cand]
            };
          },
          set: async () => {}
        }
      },
      runtime: {
        id: 'test-ext-id',
        onMessage: {
          addListener: () => {}
        },
        sendMessage: (msg, reply) => {
          if (msg && msg.type === 'generate_ai_field_answer') {
            // Verify that prompt and candidate are supplied
            setTimeout(() => {
              if (reply) {
                reply({
                  ok: true,
                  answer: 'As a Full Stack Engineer with 5 years of experience in TypeScript and React, I build resilient web applications that drive real impact.'
                });
              }
            }, 100);
            return true;
          }
          if (reply) reply({ ok: true });
        }
      }
    };
  }, { cand: candidate });

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Careers at TestCorp - Senior Full Stack Engineer</title>
      </head>
      <body>
        <div class="application-form">
          <h2>Apply for Senior Full Stack Engineer</h2>

          <!-- 1. Text Inputs -->
          <label for="name">Full Name</label>
          <input type="text" id="name" name="name" />

          <label for="email">Email</label>
          <input type="email" id="email" name="email" />

          <!-- 2. Dropdown with State Abbreviation Mapping (Candidate is Texas, option is TX) -->
          <label for="state">State</label>
          <select id="state" name="state">
            <option value="">Select a state</option>
            <option value="CA">California</option>
            <option value="NY">New York</option>
            <option value="TX">Texas</option>
          </select>

          <!-- 3. Standard HTML Checkboxes (Terms / Consent / Authorization) -->
          <label>
            <input type="checkbox" id="terms-agree" name="terms_consent" />
            I agree to the terms and data privacy policy
          </label>

          <label>
            <input type="checkbox" id="work-auth" name="authorized" />
            I am legally authorized to work in the United States
          </label>

          <!-- 4. Custom ARIA Checkbox backed by a profile fact -->
          <div role="checkbox" id="aria-work-auth" aria-checked="false" tabindex="0" class="custom-chk">
            I am legally authorized to work in the United States
          </div>

          <!-- 5. Custom Combobox Dropdown -->
          <label for="location-combo">Location</label>
          <input role="combobox" id="location-combo" aria-controls="location-options" placeholder="Search location" />
          <div id="location-options" role="listbox" style="display:none;">
            <div role="option" id="opt-austin">Austin, Texas</div>
            <div role="option" id="opt-sf">San Francisco, California</div>
          </div>

          <!-- 6. Bio / Screening Textarea (Must fill using AI only) -->
          <label for="bio-textarea">Professional Summary / Bio</label>
          <textarea id="bio-textarea" name="bio" rows="4"></textarea>

          <!-- 7. 1-Click Autofill Button -->
          <button id="mp-autofill-btn" class="auto-fill-button">⚡ 1-Click Autofill</button>
        </div>

        <script>
          // Setup combobox open on click
          const combo = document.getElementById('location-combo');
          const listbox = document.getElementById('location-options');
          combo.addEventListener('click', () => { listbox.style.display = 'block'; });
          combo.addEventListener('focus', () => { listbox.style.display = 'block'; });

          document.getElementById('opt-austin').addEventListener('click', () => {
            combo.value = 'Austin, Texas';
            listbox.style.display = 'none';
          });
          
          // Setup ARIA checkbox toggle
          const ariaChk = document.getElementById('aria-consent');
          ariaChk.addEventListener('click', () => {
            const current = ariaChk.getAttribute('aria-checked') === 'true';
            ariaChk.setAttribute('aria-checked', String(!current));
          });
        </script>
      </body>
    </html>
  `;

  await page.route('https://careers.testcorp.com/jobs/senior-engineer', route => {
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: htmlContent
    });
  });

  await page.goto('https://careers.testcorp.com/jobs/senior-engineer');

  // Inject outside-job-engine
  await page.evaluate(outsideEngineCode);

  // Click the Auto Fill button
  await page.click('#mp-autofill-btn');

  // Wait for AI generation & filling to complete
  await page.waitForFunction(() => {
    const bio = document.querySelector('#bio-textarea').value;
    return bio && bio.includes('Full Stack Engineer') && bio.includes('TypeScript and React');
  }, null, { timeout: 6000 });

  // Verification 1: Basic text fields filled
  const nameVal = await page.inputValue('#name');
  assert.equal(nameVal, 'Jordan Miller', 'Full Name filled accurately');

  const emailVal = await page.inputValue('#email');
  assert.equal(emailVal, 'jordan.miller@example.com', 'Email filled accurately');

  // Verification 2: Dropdowns - State Abbreviation Mapping
  const stateVal = await page.inputValue('#state');
  assert.equal(stateVal, 'TX', 'State dropdown selected TX option for Texas');

  // Verification 3: Checkboxes - a legal acknowledgement stays with the candidate
  const termsChecked = await page.isChecked('#terms-agree');
  assert.equal(termsChecked, false, 'Terms and privacy consent are never ticked for the candidate');

  const authChecked = await page.isChecked('#work-auth');
  assert.equal(authChecked, true, 'Work authorization checkbox checked');

  // Verification 4: Custom ARIA Checkbox
  const ariaChecked = await page.getAttribute('#aria-work-auth', 'aria-checked');
  assert.equal(ariaChecked, 'true', 'Custom ARIA checkbox checked');

  // Verification 5: Combobox Dropdown
  const comboVal = await page.inputValue('#location-combo');
  assert.equal(comboVal, 'Austin, Texas', 'Combobox matched and selected Austin, Texas option');

  // Verification 6: Bio Textarea (Filled using AI only, NOT static defaultBio)
  const bioVal = await page.inputValue('#bio-textarea');
  assert.ok(bioVal.includes('As a Full Stack Engineer with 5 years of experience in TypeScript and React'), 'Bio filled using AI generated response');
  assert.ok(!bioVal.includes('Dedicated professional with extensive experience in software development and engineering best practices'), 'Bio did not leak static defaultBio template');
});

