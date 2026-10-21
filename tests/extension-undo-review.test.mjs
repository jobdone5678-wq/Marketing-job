import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';

let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

const candidate = {
  id: 'cand-review-001',
  full_name: 'Robin Taylor',
  email: 'robin@example.test',
  phone: '5550299',
  current_city: 'Seattle',
  current_state: 'WA',
  total_experience_years: 5,
  primary_skills: 'Node.js, PostgreSQL',
  provenance_status: 'confirmed'
};

const candidateContextCode = await readFile(new URL('../browser-extension/candidate-context.js', import.meta.url), 'utf8');
const jobContextCode = await readFile(new URL('../browser-extension/job-context.js', import.meta.url), 'utf8');
const fillSessionCode = await readFile(new URL('../browser-extension/fill-session.js', import.meta.url), 'utf8');
const content = await readFile(new URL('../browser-extension/content.js', import.meta.url), 'utf8');

async function injectExtensionScripts(page) {
  await page.addScriptTag({ content: candidateContextCode });
  await page.addScriptTag({ content: jobContextCode });
  await page.addScriptTag({ content: fillSessionCode });
  await page.addScriptTag({ content });
}

test('Autofill creates a FillSession, tracks receipts, and allows full undo', async t => {
  const page = await browser.newPage();
  t.after(() => page.close());

  await page.route('https://job-boards.greenhouse.io/**', route => route.fulfill({
    contentType: 'text/html',
    body: `
      <h1>Backend Engineer</h1>
      <form id="application_form">
        <label for="first">First Name</label><input id="first" name="first_name">
        <label for="email">Email</label><input id="email" name="email">
        <label for="phone">Phone</label><input id="phone" name="phone">
        <button type="submit">Submit</button>
      </form>
    `
  }));

  await page.goto('https://job-boards.greenhouse.io/acme/jobs/555');

  await page.evaluate(({ candidate }) => {
    window.chrome = {
      storage: {
        local: {
          get: async () => ({ candidates: [candidate], origin: 'https://portal.example.test', token: 'token' }),
          set: async () => {}
        }
      },
      runtime: {
        sendMessage: async (m) => {
          if (m.type === 'get_candidates') return { candidates: [candidate], role: 'client', ownCandidateId: candidate.id };
          if (m.type === 'get_context') return { linked: true, candidateId: candidate.id };
          return { success: true };
        }
      }
    };
  }, { candidate });

  await injectExtensionScripts(page);
  await page.locator('#mp-copilot-root').waitFor();

  // Wait for autofill
  await page.waitForFunction(() => document.querySelector('#email').value === 'robin@example.test', null, { timeout: 3000 });
  assert.equal(await page.inputValue('#email'), 'robin@example.test');
  assert.equal(await page.inputValue('#first'), 'Robin');

  // Trigger undo
  await page.evaluate(() => {
    if (typeof window.undoAutofill === 'function') {
      window.undoAutofill();
    }
  });

  // Verify inputs were reverted to blank
  await page.waitForFunction(() => document.querySelector('#email').value === '', null, { timeout: 2000 });
  assert.equal(await page.inputValue('#email'), '');
  assert.equal(await page.inputValue('#first'), '');
});

test('AI screening answers show a review step before inserting into DOM', async t => {
  const page = await browser.newPage();
  t.after(() => page.close());

  await page.route('https://job-boards.greenhouse.io/**', route => route.fulfill({
    contentType: 'text/html',
    body: `
      <h1>Backend Engineer</h1>
      <form id="application_form">
        <label for="why_us">Why do you want to join our engineering team?</label>
        <textarea id="why_us" name="why_us"></textarea>
      </form>
    `
  }));

  await page.goto('https://job-boards.greenhouse.io/acme/jobs/555');

  await page.evaluate(({ candidate }) => {
    window.chrome = {
      storage: {
        local: {
          get: async () => ({ candidates: [candidate], origin: 'https://portal.example.test', token: 'token' }),
          set: async () => {}
        }
      },
      runtime: {
        sendMessage: async (m) => {
          if (m.type === 'get_candidates') return { candidates: [candidate], role: 'client', ownCandidateId: candidate.id };
          if (m.type === 'get_context') return { linked: true, candidateId: candidate.id };
          if (m.type === 'get_ai_answers') {
            return {
              success: true,
              answers: { why_us: 'I want to build reliable distributed services with your team.' }
            };
          }
          return { success: true };
        }
      }
    };
  }, { candidate });

  await injectExtensionScripts(page);
  await page.locator('#mp-copilot-root').waitFor();

  // Trigger AI questions (with review required)
  await page.evaluate(async (candidate) => {
    if (typeof window.triggerAIScreeningQuestions === 'function') {
      await window.triggerAIScreeningQuestions(candidate, { requireReview: true });
    }
  }, candidate);

  // Form input should NOT be modified yet because review is pending!
  assert.equal(await page.inputValue('#why_us'), '');

  // Accept reviewed answers
  await page.evaluate(() => {
    if (typeof window.acceptScreeningReview === 'function') {
      window.acceptScreeningReview();
    }
  });

  // Now form input should be filled!
  await page.waitForFunction(() => document.querySelector('#why_us').value.length > 0, null, { timeout: 2000 });
  assert.equal(await page.inputValue('#why_us'), 'I want to build reliable distributed services with your team.');
});
