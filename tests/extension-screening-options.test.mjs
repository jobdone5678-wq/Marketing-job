import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';

let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

const candidate = {
  id: 'cand-screening-001',
  full_name: 'Jordan Smith',
  email: 'jordan@example.test',
  phone: '5550199',
  total_experience_years: 6,
  primary_skills: 'Python, TypeScript, React',
  open_to_relocation: true,
  authorized_in_usa: true,
  provenance_status: 'confirmed'
};

const content = await readFile(new URL('../browser-extension/content.js', import.meta.url), 'utf8');

test('fillAIScreeningQuestions detects and fills textareas, select dropdowns, and radio groups with options', async t => {
  const page = await browser.newPage();
  t.after(() => page.close());

  await page.route('https://job-boards.greenhouse.io/**', route => route.fulfill({
    contentType: 'text/html',
    body: `
      <h1>Senior Software Engineer</h1>
      <form id="application_form">
        <label for="first">First Name</label><input id="first" name="first_name">
        <label for="email">Email</label><input id="email" name="email">

        <div class="screening-section">
          <label for="cover_letter">Describe a challenging technical project you delivered</label>
          <textarea id="cover_letter" name="cover_letter"></textarea>

          <label for="python_exp">How many years of Python experience do you have?</label>
          <select id="python_exp" name="python_exp">
            <option value="">-- Please select --</option>
            <option value="0_1">0-1 years</option>
            <option value="2_4">2-4 years</option>
            <option value="5_plus">5+ years</option>
          </select>

          <fieldset id="relocation_group">
            <legend>Are you open to relocation for this role?</legend>
            <label><input type="radio" name="relocation_pref" value="Yes"> Yes</label>
            <label><input type="radio" name="relocation_pref" value="No"> No</label>
          </fieldset>
        </div>
        <button type="submit">Submit</button>
      </form>
    `
  }));

  await page.goto('https://job-boards.greenhouse.io/acme/jobs/12345');

  // Mock chrome.runtime.sendMessage to verify questions received and return matching answers
  await page.evaluate(({ candidate }) => {
    window.receivedQuestions = [];
    window.chrome = {
      storage: {
        local: {
          get: async (keys) => ({
            candidates: [candidate],
            origin: 'https://portal.example.test',
            token: 'test-token'
          }),
          set: async () => {}
        }
      },
      runtime: {
        sendMessage: async (message) => {
          if (message.type === 'get_candidates') {
            return { candidates: [candidate], role: 'client', ownCandidateId: candidate.id };
          }
          if (message.type === 'get_context') {
            return { linked: true, candidateId: candidate.id };
          }
          if (message.type === 'get_ai_answers') {
            window.receivedQuestions = message.questions;
            return {
              success: true,
              answers: {
                cover_letter: 'I architected a high-throughput event processing pipeline.',
                python_exp: '5+ years',
                relocation_pref: 'Yes'
              }
            };
          }
          return { success: true };
        }
      }
    };
  }, { candidate });

  await page.addScriptTag({ content });
  await page.locator('#mp-copilot-root').waitFor();

  // Trigger AI screening questions
  await page.evaluate(async (candidate) => {
    if (typeof window.triggerAIScreeningQuestions === 'function') {
      await window.triggerAIScreeningQuestions(candidate);
    }
  }, candidate);

  // Verify received questions captured options
  const received = await page.evaluate(() => window.receivedQuestions);
  assert.ok(received.length >= 3, `Expected at least 3 questions, got ${received.length}`);

  const selectQ = received.find(q => q.id === 'python_exp');
  assert.ok(selectQ, 'select question must be detected');
  assert.equal(selectQ.type, 'choice');
  assert.ok(selectQ.options.includes('5+ years'));

  const radioQ = received.find(q => q.id === 'relocation_pref');
  assert.ok(radioQ, 'radio group question must be detected');
  assert.ok(radioQ.options.includes('Yes'));

  assert.equal(await page.inputValue('#cover_letter'), '');
  await page.evaluate(()=>document.querySelector('#mp-copilot-root').shadowRoot.querySelector('#mp-accept-screening-btn')?.click());
  // Verify reviewed inputs were populated
  assert.equal(await page.inputValue('#cover_letter'), 'I architected a high-throughput event processing pipeline.');
  assert.equal(await page.inputValue('#python_exp'), '5_plus');
  assert.equal(await page.isChecked('input[name="relocation_pref"][value="Yes"]'), true);
});
