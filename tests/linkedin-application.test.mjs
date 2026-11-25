import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../jobright_extension/core/job-capture.js', import.meta.url), 'utf8');

function node(text) {
  return { innerText: text, textContent: text, getAttribute: () => null };
}

// Minimal DOM shaped like a LinkedIn job view page.
function linkedinPage({ description = true } = {}) {
  const nodes = new Map([
    ['h1', node('DevSecOps Engineer')],
    ['.jobs-unified-top-card__company-name', node('Morgan McKinley')],
    ['.jobs-unified-top-card__subtitle-primary-grouping', node('Singapore, Singapore')],
  ]);
  if (description) {
    nodes.set('.show-more-less-html__markup', node(
      'We are looking for a DevSecOps Engineer to build secure pipelines, automate cloud infrastructure, and partner with engineering teams on threat modelling and compliance.'
    ));
  }
  const root = {
    querySelector(selector) {
      for (const part of selector.split(',').map(value => value.trim())) {
        if (nodes.has(part)) return nodes.get(part);
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector.includes('ld+json') || selector === 'a[href]' || selector.includes('canonical')) return [];
      return [];
    },
  };
  const document = {
    title: 'DevSecOps Engineer at Morgan McKinley | LinkedIn',
    querySelector: selector => root.querySelector(selector),
    querySelectorAll: selector => root.querySelectorAll(selector),
    createElement: () => {
      const template = {
        _html: '',
        content: {
          textContent: '',
          querySelectorAll: () => [],
        },
        get innerHTML() { return this._html; },
        set innerHTML(value) {
          this._html = value;
          this.content.textContent = String(value).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        },
      };
      return template;
    },
  };
  return { document, root };
}

function capture(page, url = 'https://www.linkedin.com/jobs/view/1234567890') {
  const sandbox = { console, URL, document: page.document, location: new URL(url), globalThis: null };
  sandbox.globalThis = sandbox;
  runInNewContext(source, sandbox);
  return sandbox.NextkinJobCapture.read(page.root, url);
}

test('LinkedIn job view is captured as an outside job so tracking can be armed', () => {
  const job = capture(linkedinPage());
  assert.ok(job, 'a LinkedIn job posting must produce a job for outside-application tracking');
  assert.equal(job.title, 'DevSecOps Engineer');
  assert.equal(job.company, 'Morgan McKinley');
  assert.match(job.description, /DevSecOps Engineer/);
  assert.equal(job.jobUrl, 'https://www.linkedin.com/jobs/view/1234567890');
});

test('LinkedIn Easy Apply success modal is detected and reported to the worker', async () => {
  const evidence = 'Your application was sent to Morgan McKinley!';
  const visible = { getClientRects: () => [{}], closest: () => null, innerText: evidence };
  const dialog = { ...visible, querySelectorAll: () => [] };
  let callback;
  const messages = [];
  const confirmation = readFileSync(new URL('../jobright_extension/application-confirmation.js', import.meta.url), 'utf8');
  const sandbox = {
    console,
    document: {
      body: {},
      querySelectorAll: selector => (selector.includes('dialog') ? [dialog] : []),
      createTreeWalker: () => ({ nextNode: () => null }),
    },
    window: { location: new URL('https://www.linkedin.com/jobs/view/1234567890') },
    NodeFilter: { SHOW_TEXT: 4 },
    MutationObserver: class { observe() {} disconnect() {} },
    getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '1' }),
    setTimeout: run => { callback = run; return 1; },
    clearTimeout() {},
    chrome: { runtime: { sendMessage: async message => { if (message.type !== 'NEXTKIN_GET_SUBMISSION_ATTEMPT') messages.push(message); return true; } } },
  };
  runInNewContext(confirmation, sandbox);
  callback();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(messages.length, 1);
  assert.equal(messages[0].type, 'application-confirmation');
  assert.match(messages[0].evidence, /application was sent/i);
});

