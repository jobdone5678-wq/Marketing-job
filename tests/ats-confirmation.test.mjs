import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const confirmationScript = readFileSync(new URL('../jobright_extension/application-confirmation.js', import.meta.url), 'utf8');

function createSandbox({
  url = 'https://boards.greenhouse.io/acme/jobs/12345/apply',
  title = 'Job Application',
  domElements = [],
  activeSubmit = false,
  errorBanner = false,
  errorText = 'Submission failed: an error occurred while submitting your application'
} = {}) {
  const messages = [];
  let scheduledCallback = null;
  const location = new URL(url);

  class MockElement {
    constructor(tagName = 'DIV', attrs = {}, text = '') {
      this.tagName = tagName.toUpperCase();
      this.attrs = { ...attrs };
      this.innerText = text;
      this.textContent = text;
      this.parentElement = null;
      this.children = [];
      this.disabled = !!attrs.disabled;
    }
    getAttribute(name) { return this.attrs[name.toLowerCase()] ?? null; }
    setAttribute(name, val) { this.attrs[name.toLowerCase()] = String(val); }
    hasAttribute(name) { return name.toLowerCase() in this.attrs; }
    getClientRects() { return [{ width: 100, height: 20 }]; }
    closest(selector) {
      if (!selector) return null;
      let curr = this;
      while (curr) {
        if (curr.matches && curr.matches(selector)) return curr;
        curr = curr.parentElement;
      }
      return null;
    }
    matches(selector) {
      if (!selector) return false;
      const parts = selector.split(',').map(s => s.trim().toLowerCase());
      for (const part of parts) {
        if (part === this.tagName.toLowerCase()) return true;
        if (part.startsWith('.') && (this.getAttribute('class') || '').toLowerCase().split(/\s+/).includes(part.slice(1))) return true;
        if (part.startsWith('#') && (this.getAttribute('id') || '').toLowerCase() === part.slice(1)) return true;
        const attrMatch = part.match(/\[([a-z0-9_-]+)(?:([*^$]?=)(?:"|')?([^"'\]]+)(?:"|')?)?\]/i);
        if (attrMatch) {
          const [, attr, op, val] = attrMatch;
          const actual = this.getAttribute(attr);
          if (actual === null) continue;
          if (!op) return true;
          if (op === '=' && actual.toLowerCase() === val.toLowerCase()) return true;
          if (op === '*=' && actual.toLowerCase().includes(val.toLowerCase())) return true;
          if (op === '^=' && actual.toLowerCase().startsWith(val.toLowerCase())) return true;
          if (op === '$=' && actual.toLowerCase().endsWith(val.toLowerCase())) return true;
        }
      }
      return false;
    }
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    }
    querySelectorAll(selector) {
      const results = [];
      const walk = node => {
        for (const child of node.children) {
          if (child.matches && child.matches(selector)) {
            results.push(child);
          }
          walk(child);
        }
      };
      walk(this);
      return results;
    }
    appendChild(child) {
      child.parentElement = this;
      this.children.push(child);
      return child;
    }
  }

  const rootBody = new MockElement('BODY');

  for (const el of domElements) {
    rootBody.appendChild(el);
  }

  if (activeSubmit) {
    const form = new MockElement('FORM');
    const submitBtn = new MockElement('BUTTON', { type: 'submit' }, 'Submit Application');
    form.appendChild(submitBtn);
    rootBody.appendChild(form);
  }

  if (errorBanner) {
    const err = new MockElement('DIV', { 'data-automation-id': 'errorBanner', class: 'alert-danger' }, errorText);
    rootBody.appendChild(err);
  }

  const listeners = new Map();

  const mockWindow = {
    location,
    addEventListener: (type, fn) => {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    dispatchEvent: evt => {
      for (const fn of listeners.get(evt.type) || []) fn(evt);
    }
  };

  const doc = {
    body: rootBody,
    documentElement: rootBody,
    title,
    addEventListener: (type, fn) => {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    dispatchEvent: evt => {
      for (const fn of listeners.get(evt.type) || []) fn(evt);
    },
    querySelector: sel => rootBody.querySelector(sel),
    querySelectorAll: sel => rootBody.querySelectorAll(sel),
    createTreeWalker: (rootNode) => {
      const allText = [];
      const collect = n => {
        if (n.innerText) allText.push({ textContent: n.innerText, parentElement: n });
        for (const c of n.children) collect(c);
      };
      collect(rootNode || rootBody);
      return { nextNode: () => allText.shift() || null };
    }
  };

  const sandbox = {
    document: doc,
    window: mockWindow,
    globalThis: {},
    NodeFilter: { SHOW_TEXT: 4 },
    MutationObserver: class { observe() {} disconnect() {} },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
    setTimeout: (fn) => { scheduledCallback = fn; return 1; },
    clearTimeout: () => { scheduledCallback = null; },
    sessionStorage: {
      _store: new Map(),
      getItem(k) { return this._store.get(k) || null; },
      setItem(k, v) { this._store.set(k, String(v)); },
      removeItem(k) { this._store.delete(k); }
    },
    chrome: {
      runtime: {
        sendMessage: async msg => {
          if (msg.type === 'NEXTKIN_GET_SUBMISSION_ATTEMPT') return sandbox.submissionAttempt !== false;
          messages.push(msg);
          return true;
        }
      }
    },
    MockElement
  };

  sandbox.globalThis = sandbox;

  return {
    sandbox,
    MockElement,
    run: async () => {
      runInNewContext(confirmationScript, sandbox);
      if (scheduledCallback) scheduledCallback();
      await new Promise(resolve => setImmediate(resolve));
      return messages;
    },
    triggerPageChange: async () => {
      for (const fn of listeners.get('beforeunload') || []) await fn({ type: 'beforeunload' });
      return messages;
    },
    messages
  };
}

test('ATS Confirmation: Visiting Angels confirmation heading + receipt with survey invitation', async () => {
  const { sandbox, MockElement, run } = createSandbox({
    url: 'https://visitingangels.careerportal.com/confirmation',
    title: "You're ready for the next step"
  });

  const heading = new MockElement('H1', {}, "You're ready for the next step.");
  const confirmationMsg = new MockElement('P', { class: 'confirmation-message' }, 'Thank you for your interest in our company, we have received your application. Please complete our brief survey to help us process your candidacy.');
  sandbox.document.body.appendChild(heading);
  sandbox.document.body.appendChild(confirmationMsg);

  const messages = await run();
  assert.equal(messages.length, 1, 'Visiting Angels confirmation must be detected even with follow-up survey invitation');
  assert.equal(messages[0].status, 'SUBMITTED');
  assert.ok(messages[0].evidence.toLowerCase().includes('received your application'));
});

test('ATS Confirmation: Negative check - standalone survey completion is rejected', async () => {
  const { sandbox, MockElement, run } = createSandbox({
    url: 'https://feedback.surveyportal.com/survey-complete',
    title: 'Survey Completed'
  });

  const surveyMsg = new MockElement('DIV', { class: 'survey-response' }, 'Thank you for taking our survey! Your feedback has been recorded.');
  sandbox.document.body.appendChild(surveyMsg);

  const messages = await run();
  assert.equal(messages.length, 0, 'Standalone survey completion must not trigger application confirmation');
});

test('ATS Confirmation: Negative check - newsletter subscription is rejected', async () => {
  const { sandbox, MockElement, run } = createSandbox({
    url: 'https://company.com/newsletter/thanks',
    title: 'Newsletter Subscription'
  });

  const newsMsg = new MockElement('DIV', {}, 'Thank you for subscribing to our newsletter! Subscription confirmed.');
  sandbox.document.body.appendChild(newsMsg);

  const messages = await run();
  assert.equal(messages.length, 0, 'Newsletter signup must not trigger application confirmation');
});

test('ATS Confirmation: Workday verified terminal selector and requisition extraction', async () => {
  const { sandbox, MockElement, run } = createSandbox({
    url: 'https://company.myworkdayjobs.com/en-US/Careers/job/Austin/Software-Engineer_JR10928/apply',
    title: 'Workday Application'
  });

  const successCard = new MockElement('DIV', { 'data-automation-id': 'applicationSubmitted' });
  const heading = new MockElement('H1', {}, 'Congratulations! Your application has been submitted.');
  const reqInfo = new MockElement('SPAN', { 'data-automation-id': 'requisitionId' }, 'JR10928');
  successCard.appendChild(heading);
  successCard.appendChild(reqInfo);
  sandbox.document.body.appendChild(successCard);

  const messages = await run();
  assert.equal(messages.length, 1);
  assert.equal(messages[0].status, 'SUBMITTED');
  assert.equal(messages[0].atsProvider, 'workday');
  assert.equal(messages[0].requisitionId, 'JR10928');
  assert.ok(messages[0].evidence.includes('application has been submitted') || messages[0].evidence.includes('Congratulations'));
});

test('ATS Confirmation: Greenhouse confirmation page and requisition ID extraction', async () => {
  const { sandbox, MockElement, run } = createSandbox({
    url: 'https://boards.greenhouse.io/acme/jobs/987654/confirmation',
    title: 'Thank you for applying'
  });

  const confirmationDiv = new MockElement('DIV', { id: 'application_confirmation', class: 'application-confirmation' }, 'Thank you for applying to Acme!');
  sandbox.document.body.appendChild(confirmationDiv);

  const messages = await run();
  assert.equal(messages.length, 1);
  assert.equal(messages[0].status, 'SUBMITTED');
  assert.equal(messages[0].atsProvider, 'greenhouse');
  assert.equal(messages[0].requisitionId, '987654');
});

test('ATS Confirmation: Lever confirmation page and posting UUID extraction', async () => {
  const leverId = '550e8400-e29b-41d4-a716-446655440000';
  const { sandbox, MockElement, run } = createSandbox({
    url: `https://jobs.lever.co/brand/${leverId}/thanks`,
    title: 'Application submitted'
  });

  const leverCard = new MockElement('DIV', { class: 'application-confirmation lever-confirmation' }, 'Application submitted! Thanks for applying.');
  sandbox.document.body.appendChild(leverCard);

  const messages = await run();
  assert.equal(messages.length, 1);
  assert.equal(messages[0].status, 'SUBMITTED');
  assert.equal(messages[0].atsProvider, 'lever');
  assert.equal(messages[0].requisitionId, leverId);
});

test('ATS Confirmation: Ashby confirmation terminal selector and external ID extraction', async () => {
  const ashbyPostingId = '8f3b2366-0d17-4ef2-a63e-b6a4ea29d4f0';
  const { sandbox, MockElement, run } = createSandbox({
    url: `https://jobs.ashbyhq.com/startup/${ashbyPostingId}/application`,
    title: 'Startup Careers'
  });

  const ashbyCard = new MockElement('DIV', { 'data-testid': 'application-submitted' }, "Your application was successfully submitted. We'll contact you if there are next steps.");
  sandbox.document.body.appendChild(ashbyCard);

  const messages = await run();
  assert.equal(messages.length, 1);
  assert.equal(messages[0].status, 'SUBMITTED');
  assert.equal(messages[0].atsProvider, 'ashby');
  assert.equal(messages[0].requisitionId, ashbyPostingId);
});

test('ATS Confirmation: SmartRecruiters confirmation test attribute and job ID extraction', async () => {
  const { sandbox, MockElement, run } = createSandbox({
    url: 'https://careers.smartrecruiters.com/AcmeCorp/jobs/74399999999/thank-you',
    title: 'Application Successful'
  });

  const srCard = new MockElement('DIV', { 'data-test': 'application-success' }, 'Your application has been received. Thank you for your interest!');
  sandbox.document.body.appendChild(srCard);

  const messages = await run();
  assert.equal(messages.length, 1);
  assert.equal(messages[0].status, 'SUBMITTED');
  assert.equal(messages[0].atsProvider, 'smartrecruiters');
  assert.equal(messages[0].requisitionId, '74399999999');
});

test('ATS Confirmation: Negative check - active enabled submit button blocks confirmation', async () => {
  const { sandbox, MockElement, run } = createSandbox({
    url: 'https://boards.greenhouse.io/acme/jobs/12345/apply',
    activeSubmit: true // Active submit button present on form
  });

  // Even if some heading or text contains confirmation keywords:
  const heading = new MockElement('H2', {}, 'Thank you for your interest in our company');
  sandbox.document.body.appendChild(heading);

  const messages = await run();
  assert.equal(messages.length, 0, 'Must NOT report confirmation when active submit button is still visible and enabled');
});

test('ATS Confirmation: Footers and wizard step bars do not falsely trigger confirmation', async () => {
  const { sandbox, MockElement, run } = createSandbox({
    url: 'https://company.myworkdayjobs.com/apply/step2',
    activeSubmit: false
  });

  const footer = new MockElement('FOOTER', {}, 'Thank you for your application to our open positions over the years.');
  const wizardBar = new MockElement('DIV', { class: 'step-indicator wizard-steps' }, 'Step 3: After submitting your application, you will receive an email.');
  sandbox.document.body.appendChild(footer);
  sandbox.document.body.appendChild(wizardBar);

  const messages = await run();
  assert.equal(messages.length, 0, 'Footers and wizard indicators must be strictly excluded from confirmation detection');
});

test('ATS Confirmation: Explicit ATS error banner triggers FAILED status', async () => {
  const { run } = createSandbox({
    url: 'https://company.myworkdayjobs.com/apply',
    errorBanner: true,
    errorText: 'Submission failed: there was an error processing your application'
  });

  const messages = await run();
  assert.equal(messages.length, 1);
  assert.equal(messages[0].status, 'FAILED');
  assert.ok(messages[0].evidence.includes('Submission failed'));
});

test('ATS Confirmation: Ambiguous outcome on page change triggers PENDING_VERIFICATION (never FAILED)', async () => {
  const env = createSandbox({
    url: 'https://jobs.ashbyhq.com/docker/posting/application'
  });

  await env.run();
  // No confirmation and no explicit error initially
  assert.equal(env.messages.length, 0);

  // Now page navigates / unloads before unambiguous receipt was observed
  await env.triggerPageChange();

  assert.equal(env.messages.length, 1);
  assert.equal(env.messages[0].status, 'PENDING_VERIFICATION');
  assert.equal(env.messages[0].evidence, 'Pending verification on page navigation');
});

test('ATS Confirmation: wizard navigation cannot arm submission tracking', async () => {
  const env = createSandbox({
    url: 'https://jobs.lever.co/employ/a4ec1fd5-d606-4995-a745-5a8b7848937c'
  });
  await env.run();

  const continueBtn = new env.MockElement('BUTTON', {}, 'Continue');
  env.sandbox.document.dispatchEvent({ type: 'click', target: continueBtn });

  const attemptMessages = env.messages.filter(m => m.type === 'NEXTKIN_SET_SUBMISSION_ATTEMPT');
  assert.equal(attemptMessages.length, 0);
  assert.equal(env.sandbox.sessionStorage.getItem('nextkin_submission_attempted'), null);
});

test('ATS Confirmation: Lever confirmation heading is detected and reported even without URL-only trigger', async () => {
  const env = createSandbox({
    url: 'https://jobs.lever.co/employ/a4ec1fd5-d606-4995-a745-5a8b7848937c',
    title: 'Mid-Market Account Executive'
  });

  const heading = new env.MockElement('H3', {}, 'Application submitted!');
  const returnBtn = new env.MockElement('BUTTON', {}, 'RETURN TO THE MAIN PAGE');
  env.sandbox.document.body.appendChild(heading);
  env.sandbox.document.body.appendChild(returnBtn);

  const messages = await env.run();
  const confirmationMsg = messages.find(m => m.type === 'application-confirmation');
  assert.ok(confirmationMsg, 'Lever confirmation must be reported');
  assert.equal(confirmationMsg.status, 'SUBMITTED');
  assert.equal(confirmationMsg.atsProvider, 'lever');
  assert.equal(confirmationMsg.requisitionId, 'a4ec1fd5-d606-4995-a745-5a8b7848937c');
});
