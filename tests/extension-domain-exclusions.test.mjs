import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';

let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

const candidate = {
  id: 'cand-1',
  full_name: 'Alex Example',
  email: 'alex@example.test',
  phone: '5550100',
  current_city: 'Austin',
  current_state: 'Texas',
  authorized_in_usa: true
};

const contentScript = await readFile(new URL('../browser-extension/content.js', import.meta.url), 'utf8');

test('extension never injects or autofills on chatgpt.com or other excluded AI sites', async t => {
  const page = await browser.newPage();
  t.after(() => page.close());

  await page.route('https://chatgpt.com/**', route => route.fulfill({
    contentType: 'text/html',
    body: `
      <html>
        <body>
          <div id="__next">
            <main>
              <textarea id="prompt-textarea" placeholder="Message ChatGPT..."></textarea>
              <input type="search" placeholder="Search chats" value="">
              <input id="email" type="email" placeholder="Your email">
            </main>
          </div>
        </body>
      </html>
    `
  }));

  await page.goto('https://chatgpt.com/');

  await page.evaluate(({ candidate }) => {
    window.chrome = {
      runtime: {
        sendMessage: async message => {
          if (message.type === 'get_candidates') {
            return { candidates: [candidate], role: 'recruiter', ownCandidateId: candidate.id };
          }
          return { linked: false };
        }
      }
    };
  }, { candidate });

  await page.addScriptTag({ content: contentScript });
  await page.waitForTimeout(500);

  // Widget should NEVER be injected on ChatGPT
  const copilotRoot = await page.$('#mp-copilot-root');
  assert.equal(copilotRoot, null, 'Floating widget must not be injected on chatgpt.com');

  // Input fields must NEVER be autofilled on ChatGPT
  assert.equal(await page.inputValue('#prompt-textarea'), '', 'ChatGPT prompt textarea must remain untouched');
  assert.equal(await page.inputValue('#email'), '', 'Email input on ChatGPT must not be autofilled');
});

test('extension never injects or touches inputs on the recruiter portal itself (localhost/portal)', async t => {
  const page = await browser.newPage();
  t.after(() => page.close());

  await page.route('http://localhost:3000/**', route => route.fulfill({
    contentType: 'text/html',
    body: `
      <html>
        <body>
          <div id="workspace-content" class="portal-workspace">
            <header>
              <input id="portal-search" type="search" placeholder="Search candidates...">
            </header>
            <main>
              <form id="candidate-filter-form">
                <input id="name" name="name" placeholder="Candidate name">
                <input id="email" name="email" placeholder="Email address">
              </form>
            </main>
          </div>
        </body>
      </html>
    `
  }));

  await page.goto('http://localhost:3000/dashboard/candidates');

  await page.evaluate(({ candidate }) => {
    window.chrome = {
      runtime: {
        sendMessage: async message => {
          if (message.type === 'get_candidates') {
            return { candidates: [candidate], role: 'recruiter', ownCandidateId: candidate.id };
          }
          return { linked: false };
        }
      }
    };
  }, { candidate });

  await page.addScriptTag({ content: contentScript });
  await page.waitForTimeout(500);

  // Widget should NEVER be injected on the portal
  const copilotRoot = await page.$('#mp-copilot-root');
  assert.equal(copilotRoot, null, 'Floating widget must not be injected on portal (localhost:3000)');

  // Portal form fields must NOT be autofilled
  assert.equal(await page.inputValue('#name'), '', 'Portal name search/filter must remain blank');
  assert.equal(await page.inputValue('#email'), '', 'Portal email search/filter must remain blank');
});

test('extension functions properly on genuine job application page and skips non-job prompt inputs', async t => {
  const page = await browser.newPage();
  t.after(() => page.close());

  await page.route('https://jobs.ashbyhq.com/**', route => route.fulfill({
    contentType: 'text/html',
    body: `
      <html>
        <body>
          <h1>Software Engineer</h1>
          <form id="application-form" data-testid="application-form">
            <label for="first">First Name</label><input id="first">
            <label for="last">Last Name</label><input id="last">
            <label for="email">Email</label><input id="email" type="email">
            <!-- Intercom / chat embed or search input inside page -->
            <textarea id="prompt-textarea" placeholder="Ask AI assistant about this job"></textarea>
            <input type="search" id="site-search" placeholder="Search career site">
          </form>
        </body>
      </html>
    `
  }));

  await page.goto('https://jobs.ashbyhq.com/company/software-engineer/application');

  await page.evaluate(({ candidate }) => {
    window.chrome = {
      runtime: {
        sendMessage: async message => {
          if (message.type === 'get_candidates') {
            return { candidates: [candidate], role: 'client', ownCandidateId: candidate.id };
          }
          return { linked: false };
        }
      }
    };
  }, { candidate });

  await page.addScriptTag({ content: contentScript });
  await page.locator('#mp-copilot-root').waitFor({ timeout: 3000 });

  // Widget should be injected on genuine job application
  const copilotRoot = await page.$('#mp-copilot-root');
  assert.ok(copilotRoot !== null, 'Floating widget must be injected on job application page');

  // Candidate fields should be autofilled
  await page.waitForFunction(() => document.querySelector('#email').value === 'alex@example.test', null, { timeout: 3000 });
  assert.equal(await page.inputValue('#first'), 'Alex');
  assert.equal(await page.inputValue('#last'), 'Example');

  // Non-job inputs like prompt-textarea and search must remain blank
  assert.equal(await page.inputValue('#prompt-textarea'), '', 'Prompt textarea must not be autofilled');
  assert.equal(await page.inputValue('#site-search'), '', 'Site search input must not be autofilled');
});
