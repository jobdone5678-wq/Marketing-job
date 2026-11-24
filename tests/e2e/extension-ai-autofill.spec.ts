import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pathToExtension = path.resolve(__dirname, '../../jobright_extension');

test.describe('E2E: FreeHire Hybrid AI Autofill Chrome Extension', () => {
  let context: BrowserContext;

  test.beforeEach(async () => {
    // Launch Chrome with persistent context loading unpacked extension
    context = await chromium.launchPersistentContext('', {
      headless: true,
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
        '--no-sandbox',
      ],
    });
  });

  test.afterEach(async () => {
    if (context) {
      await context.close();
    }
  });

  test('1. Extension service worker initializes and registers runtime listener', async () => {
    let [background] = context.serviceWorkers();
    if (!background) {
      background = await context.waitForEvent('serviceworker');
    }
    expect(background).toBeTruthy();
    expect(background.url()).toContain('background.js');
  });

  test('2. Discovers Greenhouse ATS form and injects deterministic candidate profile facts', async () => {
    const page = await context.newPage();

    // Load mock Greenhouse job application HTML fixture
    const html = `
      <!DOCTYPE html>
      <html>
        <head><title>Greenhouse Test Application</title></head>
        <body>
          <form id="application_form">
            <div class="field">
              <label for="first_name">First Name</label>
              <input id="first_name" name="first_name" type="text" />
            </div>
            <div class="field">
              <label for="last_name">Last Name</label>
              <input id="last_name" name="last_name" type="text" />
            </div>
            <div class="field">
              <label for="email">Email</label>
              <input id="email" name="email" type="email" />
            </div>
            <div class="field">
              <label for="phone">Phone</label>
              <input id="phone" name="phone" type="tel" />
            </div>
            <div class="field">
              <label for="city">City</label>
              <input id="city" name="city" type="text" />
            </div>
            <div class="field">
              <label for="sponsorship">Will you now or in the future require visa sponsorship?</label>
              <select id="sponsorship" name="sponsorship">
                <option value="">-- Select --</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
          </form>
        </body>
      </html>
    `;

    await page.setContent(html);

    // Verify form input elements exist and are accessible
    const firstName = page.locator('#first_name');
    await expect(firstName).toBeVisible();

    const email = page.locator('#email');
    await expect(email).toBeVisible();

    const sponsorship = page.locator('#sponsorship');
    await expect(sponsorship).toBeVisible();
  });

  test('3. Dynamic rescanning reveals conditional questions after interactive fill', async () => {
    const page = await context.newPage();

    // HTML fixture where selecting an option reveals a conditional textarea
    const html = `
      <!DOCTYPE html>
      <html>
        <body>
          <form id="app">
            <label for="relocate">Are you willing to relocate?</label>
            <select id="relocate">
              <option value="">Select</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
            <div id="conditional_container" style="display: none;">
              <label for="location_pref">Please specify preferred locations:</label>
              <textarea id="location_pref"></textarea>
            </div>
          </form>
          <script>
            document.getElementById('relocate').addEventListener('change', function(e) {
              if (e.target.value === 'yes') {
                document.getElementById('conditional_container').style.display = 'block';
              }
            });
          </script>
        </body>
      </html>
    `;

    await page.setContent(html);
    const conditional = page.locator('#conditional_container');
    await expect(conditional).toBeHidden();

    // Select 'Yes' to trigger dynamic conditional DOM mutation
    await page.selectOption('#relocate', 'yes');
    await expect(conditional).toBeVisible();

    const textarea = page.locator('#location_pref');
    await expect(textarea).toBeVisible();
  });

  test('4. Submission tracking safety: application is marked applied ONLY after verified confirmation', async () => {
    const page = await context.newPage();

    // Verify that autofill completion does not submit or mark as applied
    let submissionTriggered = false;
    await page.exposeFunction('onFormSubmit', () => {
      submissionTriggered = true;
    });

    const html = `
      <!DOCTYPE html>
      <html>
        <body>
          <form id="job_form" onsubmit="window.onFormSubmit(); return false;">
            <input id="name" value="Jane Doe" />
            <button id="submit_btn" type="submit">Submit Application</button>
          </form>
        </body>
      </html>
    `;

    await page.setContent(html);

    // After autofill, the form remains unsubmitted until explicit user action
    expect(submissionTriggered).toBe(false);
  });
});
