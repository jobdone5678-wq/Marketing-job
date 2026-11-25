import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const registryCode = readFileSync(new URL('../jobright_extension/core/site-registry.js', import.meta.url), 'utf8');
const rulesCode = readFileSync(new URL('../jobright_extension/core/site-rules.js', import.meta.url), 'utf8');
const runtimeGateCode = readFileSync(new URL('../jobright_extension/core/runtime-gate.js', import.meta.url), 'utf8');
const launchCode = readFileSync(new URL('../jobright_extension/application-launch.js', import.meta.url), 'utf8');
const networkBridgeCode = readFileSync(new URL('../jobright_extension/main-world/submission-network.js', import.meta.url), 'utf8');
const frameworkBridgeCode = readFileSync(new URL('../jobright_extension/main-world/framework-bridges.js', import.meta.url), 'utf8');
const backgroundCode = readFileSync(new URL('../jobright_extension/background.js', import.meta.url), 'utf8');

function loadRegistryAndRules() {
  const sandbox = { console, URL, URLSearchParams, Set, Map, Date, RegExp, globalThis: null };
  sandbox.globalThis = sandbox;
  runInNewContext(registryCode, sandbox);
  runInNewContext(rulesCode, sandbox);
  return sandbox;
}

test('SiteRegistry: covers 90+ portals, canonicalizes Greenhouse origins, preserves job params, and excludes security frames', () => {
  const sandbox = loadRegistryAndRules();
  const reg = sandbox.NextkinSiteRegistry;

  assert.ok(reg.getRegistryCount() >= 90, `Expected >= 90 site definitions, got ${reg.getRegistryCount()}`);
  assert.equal(reg.detectAtsProvider('https://acme.wd5.myworkdayjobs.com/External/job/NYC/Eng_JR10023/apply'), 'workday');
  assert.equal(reg.detectAtsProvider('https://ekgf.fa.us2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX/job/412'), 'oraclecloud');
  assert.equal(reg.detectAtsProvider('https://jobs.ashbyhq.com/openai/12345678-1234-1234-1234-123456789012'), 'ashby');
  assert.equal(reg.canonicalOrigin('https://job-boards.greenhouse.io/acme/jobs/123'), 'https://boards.greenhouse.io');

  assert.equal(reg.isExcludedUrl('https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b'), true);
  assert.equal(reg.isExcludedUrl('https://www.google.com/recaptcha/api2/anchor'), true);
  assert.equal(reg.isExcludedUrl('https://accounts.google.com/o/oauth2/v2/auth'), true);
  assert.equal(reg.isExcludedUrl('https://jobs.lever.co/acme/11111111-1111-1111-1111-111111111111'), false);

  const cleaned = reg.cleanApplicationUrl('https://boards.greenhouse.io/acme/jobs/999?gh_jid=999&utm_source=linkedin&jr_id=abc&ref=home#marketing-intent=1234');
  assert.equal(cleaned, 'https://boards.greenhouse.io/acme/jobs/999?gh_jid=999');

  const ids = reg.extractIdentifiers('https://acme.wd5.myworkdayjobs.com/en-US/Careers/job/Remote/SWE_JR104522/apply', null, 'workday');
  assert.equal(ids.requisitionId, 'JR104522');
});

test('SiteRules: enforces minExtensionVersion gating and global/per-site killswitches', () => {
  const sandbox = loadRegistryAndRules();
  const rules = sandbox.NextkinSiteRules;

  assert.equal(rules.compareSemver('3.3.19', '3.3.18'), 1);
  assert.equal(rules.compareSemver('3.3.19', '3.3.19'), 0);
  assert.equal(rules.compareSemver('3.2.0', '3.3.19'), -1);

  const policyOk = rules.evaluateSitePolicy('workday', '3.3.19', {
    siteRulesKillSwitch: 'active',
    sites: {
      workday: {
        minExtensionVersion: '3.3.0',
        killSwitch: 'active',
        confirmationSelectors: ['[data-automation-id="customSuccess"]'],
      },
    },
  });
  assert.equal(policyOk.blocked, false);
  assert.deepEqual(policyOk.confirmationSelectors, ['[data-automation-id="customSuccess"]']);

  const policyKilled = rules.evaluateSitePolicy('workday', '3.3.19', {
    siteRulesKillSwitch: 'off',
  });
  assert.equal(policyKilled.blocked, true);

  const versionMismatch = rules.evaluateSitePolicy('workday', '3.3.19', {
    sites: {
      workday: {
        minExtensionVersion: '9.0.0',
        killSwitch: 'off',
      },
    },
  });
  assert.equal(versionMismatch.blocked, false, 'Rules requiring newer extension version must not activate on older client');
});

test('RuntimeGate + application-launch: preserves marketing-intent across SPA history.replaceState resets', () => {
  const sessionData = new Map();
  const sentMessages = [];
  let currentUrl = 'https://jobs.ashbyhq.com/acme/11111111-1111-1111-1111-111111111111#marketing-intent=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

  const makeLocation = () => new URL(currentUrl);
  const sandbox = {
    console,
    URL,
    URLSearchParams,
    Set,
    Map,
    Date,
    RegExp,
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    },
    chrome: {
      runtime: {
        sendMessage: async (msg) => {
          sentMessages.push(msg);
          return true;
        },
      },
    },
    sessionStorage: {
      getItem: k => sessionData.get(k) ?? null,
      setItem: (k, v) => sessionData.set(k, String(v)),
    },
    history: {
      replaceState(_state, _title, nextUrl) {
        currentUrl = new URL(nextUrl, currentUrl).href;
      },
      pushState(_state, _title, nextUrl) {
        currentUrl = new URL(nextUrl, currentUrl).href;
      },
    },
    dispatchEvent: () => {},
    addEventListener: () => {},
    get location() {
      return makeLocation();
    },
  };
  sandbox.window = sandbox;
  sandbox.window.top = sandbox;
  sandbox.globalThis = sandbox;

  runInNewContext(registryCode, sandbox);
  runInNewContext(rulesCode, sandbox);
  runInNewContext(runtimeGateCode, sandbox);

  // Simulate SPA router stripping #marketing-intent before document_start launch script runs
  sandbox.history.replaceState(null, '', '/acme/11111111-1111-1111-1111-111111111111/application');
  assert.equal(new URL(currentUrl).hash, '');

  runInNewContext(launchCode, sandbox);

  const intentMsg = sentMessages.find(m => m.type === 'application-intent-opened');
  assert.ok(intentMsg, 'application-intent-opened must still fire using preserved intent');
  assert.ok(intentMsg.url.includes('marketing-intent=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
});

test('MAIN-world submission-network bridge emits nextkin:submission-network on Workday & Ashby success and ignores failed Oracle drafts', async () => {
  const dispatched = [];
  const nextResponses = [];
  const sandbox = {
    console,
    URL,
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    },
    location: new URL('https://acme.wd5.myworkdayjobs.com/en-US/Careers/job/SWE_JR9001/apply'),
    fetch: async () => nextResponses.shift(),
    XMLHttpRequest: function MockXHR() {},
    dispatchEvent: evt => dispatched.push(evt),
  };
  sandbox.XMLHttpRequest.prototype = { open() {}, send() {} };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  runInNewContext(networkBridgeCode, sandbox);

  // 1. Workday finalize 200 OK
  nextResponses.push({
    ok: true,
    status: 200,
    url: 'https://acme.wd5.myworkdayjobs.com/wday/cxs/acme/Careers/jobs/SWE_JR9001/finalize',
    clone() {
      return { text: async () => JSON.stringify({ status: 'SUCCEEDED', applicationId: 'WD-APP-777' }) };
    },
  });
  await sandbox.fetch('https://acme.wd5.myworkdayjobs.com/wday/cxs/acme/Careers/jobs/SWE_JR9001/finalize', { method: 'POST', body: '{}' });
  await new Promise(r => setTimeout(r, 10));

  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0].detail.provider, 'workday');
  assert.equal(dispatched[0].detail.confirmationId, 'WD-APP-777');
  assert.equal(dispatched[0].detail.requisitionId, 'JR9001');

  // 2. Oracle draft must NOT emit submission event
  nextResponses.push({
    ok: true,
    status: 200,
    url: 'https://ekgf.fa.us2.oraclecloud.com/hcmRestApi/resources/latest/recruitingCEJobApplications',
    clone() {
      return { text: async () => JSON.stringify({ Id: 99, SubmissionConfirmedFlag: false }) };
    },
  });
  await sandbox.fetch('https://ekgf.fa.us2.oraclecloud.com/hcmRestApi/resources/latest/recruitingCEJobApplications', {
    method: 'POST',
    body: JSON.stringify({ SubmissionStatus: 'ORA_DRAFT' }),
  });
  await new Promise(r => setTimeout(r, 10));
  assert.equal(dispatched.length, 1, 'ORA_DRAFT without confirmation flag must not fire confirmed event');
});

test('MAIN-world framework bridge handles React-Select Fiber onChange invocation', () => {
  const listeners = new Map();
  let selectedOptionReceived = null;
  const mockEl = {
    '__reactProps$abc': {
      options: [{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }],
      onChange: (opt) => { selectedOptionReceived = opt; },
    },
  };
  const sandbox = {
    console,
    Date,
    setTimeout,
    clearTimeout,
    CSS: { escape: s => s },
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    },
    document: {
      querySelector: sel => (sel.includes('target-1') ? mockEl : null),
    },
    HTMLInputElement: function () {},
    addEventListener: (type, fn) => listeners.set(type, fn),
    dispatchEvent: (evt) => {
      const fn = listeners.get(evt.type);
      if (fn) fn(evt);
    },
  };
  sandbox.HTMLInputElement.prototype = { click() {} };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  runInNewContext(frameworkBridgeCode, sandbox);

  let bridgeResponse = null;
  listeners.set('nextkin:bridge-response', evt => { bridgeResponse = evt.detail; });

  sandbox.dispatchEvent(new sandbox.CustomEvent('nextkin:bridge-request', {
    detail: { requestId: 'req-1', action: 'react-select-set', bridgeAttr: 'target-1', valueLabel: 'Yes' },
  }));

  assert.equal(bridgeResponse?.ok, true);
  assert.equal(bridgeResponse?.method, 'react-onChange');
  assert.deepEqual(selectedOptionReceived, { label: 'Yes', value: 'yes' });
});

test('Background NEXTKIN_REGISTER_MAIN_BRIDGES injects MAIN world scripts on ATS pages and rejects excluded security URLs', async () => {
  const messageHandlers = [];
  const executedScripts = [];
  const noop = { addListener() {} };

  const sandbox = {
    console,
    URL,
    URLSearchParams,
    Set,
    Map,
    Date,
    Promise,
    crypto,
    AbortSignal,
    importScripts: () => {},
    chrome: {
      runtime: {
        id: 'ext-1',
        getURL: p => 'chrome-extension://ext-1/' + p,
        onInstalled: noop,
        onStartup: noop,
        onConnect: noop,
        onMessage: { addListener: fn => messageHandlers.push(fn) },
      },
      alarms: { onAlarm: noop, create() {}, clear: async () => {} },
      storage: {
        onChanged: noop,
        local: { get: async () => ({}), set: async () => {}, remove: async () => {}, setAccessLevel: async () => {} },
        session: { get: async () => ({}), set: async () => {}, remove: async () => {}, setAccessLevel: async () => {} },
      },
      tabs: { onUpdated: noop, onRemoved: noop, query: async () => [] },
      sidePanel: { setPanelBehavior: async () => {} },
      scripting: {
        executeScript: async (opts) => {
          executedScripts.push(opts);
          return [{ result: true }];
        },
      },
    },
  };
  sandbox.globalThis = sandbox;
  runInNewContext(registryCode + '\n' + rulesCode + '\n' + backgroundCode, sandbox);

  assert.ok(messageHandlers.length > 0);
  const handler = messageHandlers[0];

  const allowedResult = await new Promise((resolve) => {
    handler(
      { type: 'NEXTKIN_REGISTER_MAIN_BRIDGES', url: 'https://jobs.lever.co/acme/1234' },
      { id: 'ext-1', tab: { id: 7 }, frameId: 0, url: 'https://jobs.lever.co/acme/1234' },
      resolve
    );
  });
  assert.equal(allowedResult, true);
  assert.equal(executedScripts.length, 1);
  assert.equal(executedScripts[0].world, 'MAIN');
  assert.deepEqual([...executedScripts[0].files], ['main-world/submission-network.js', 'main-world/framework-bridges.js']);

  const blockedResult = await new Promise((resolve) => {
    handler(
      { type: 'NEXTKIN_REGISTER_MAIN_BRIDGES', url: 'https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b' },
      { id: 'ext-1', tab: { id: 8 }, frameId: 0, url: 'https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b' },
      resolve
    );
  });
  assert.equal(blockedResult, false);
  assert.equal(executedScripts.length, 1);
});


test('stale policy drops overlays while retaining emergency stops and disabling active-mode automation', () => {
  const { NextkinSiteRules: rules } = loadRegistryAndRules();
  const stale = { expiresAt: Date.now() - 1, rules: {
    schemaVersion: 1,
    sites: {
      workday: { mode: 'active', confirmationSelectors: ['.new-receipt'] },
      ashby: { mode: 'off' },
    },
  } };
  const workday = rules.evaluateSitePolicy('workday', '3.3.19', stale);
  assert.equal(workday.mode, 'legacy');
  assert.equal(workday.confirmationSelectors.length, 0);
  assert.equal(rules.automationDisabled('https://company.myworkdayjobs.com/job/1', true, stale, '3.3.19'), true);
  assert.equal(rules.evaluateSitePolicy('ashby', '3.3.19', stale).blocked, true);
  assert.equal(rules.evaluateSitePolicy('workday', '3.3.19', { sites: { workday: { mode: 'invalid' } } }).blocked, true);
});

test('receipt URL cleanup drops credentials, including token params and unsupported schemes', () => {
  const { NextkinSiteRegistry: registry } = loadRegistryAndRules();
  assert.equal(registry.cleanApplicationUrl('https://jobs.lever.co/acme/role?token=private&session_id=private&id=7'),
    'https://jobs.lever.co/acme/role?id=7');
  assert.equal(registry.isExcludedUrl('javascript:123'), true);
});
