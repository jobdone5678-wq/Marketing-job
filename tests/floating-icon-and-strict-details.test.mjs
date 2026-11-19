import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import vm from 'node:vm';

const bundleCode = fs.readFileSync('tests/autofill-bundle.js', 'utf8');
const floatingWidgetCode = fs.readFileSync('jobright_extension/floating-widget.js', 'utf8');

function createSandbox(url = 'https://jobs.ashbyhq.com/openai/application?jr_id=123') {
  const elements = [];
  const listeners = {};
  const messageListeners = [];

  const documentElement = {
    appendChild: el => elements.push(el),
    contains: () => true,
    querySelectorAll: () => [],
    querySelector: () => null
  };

  const fakeDocument = {
    documentElement,
    body: documentElement,
    readyState: 'complete',
    getElementById: id => (id === 'nextkin-floating-widget-root' ? elements.find(e => e.id === id) || null : null),
    createElement: tag => {
      const el = {
        tagName: tag.toUpperCase(),
        id: '',
        style: {},
        innerHTML: '',
        classList: {
          add: () => {},
          remove: () => {},
          contains: () => false
        },
        attachShadow: () => {
          const shadowElements = {};
          return {
            appendChild: s => {},
            getElementById: sid => shadowElements[sid] || {
              id: sid,
              style: {},
              classList: { add: () => {}, remove: () => {}, contains: () => false },
              addEventListener: () => {},
              getBoundingClientRect: () => ({ top: 100, height: 48, width: 48 })
            }
          };
        },
        appendChild: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        contains: () => true,
        querySelector: () => null,
        getClientRects: () => [{ width: 100, height: 20 }],
        getBoundingClientRect: () => ({ top: 100, bottom: 120, left: 10, right: 110, width: 100, height: 20 })
      };
      return el;
    },
    addEventListener: (type, cb) => { listeners[type] = cb; },
    removeEventListener: () => {},
    querySelectorAll: () => [
      { name: '_systemfield_name', id: 'name', getAttribute: () => null, getClientRects: () => [{}], getBoundingClientRect: () => ({ top: 0, bottom: 20, left: 0, right: 100, width: 100, height: 20 }) },
      { name: '_systemfield_email', id: 'email', getAttribute: () => null, getClientRects: () => [{}], getBoundingClientRect: () => ({ top: 30, bottom: 50, left: 0, right: 100, width: 100, height: 20 }) },
      { name: 'resume', id: 'resume_file', getAttribute: () => null, getClientRects: () => [{}], getBoundingClientRect: () => ({ top: 60, bottom: 80, left: 0, right: 100, width: 100, height: 20 }) }
    ],
    querySelector: () => null
  };

  const sandbox = {
    window: {
      addEventListener: (type, cb) => { listeners[type] = cb; },
      removeEventListener: () => {}
    },
    document: fakeDocument,
    location: new URL(url),
    navigator: { userAgent: 'test' },
    console: console,
    chrome: {
      storage: {
        local: {
          get: async () => ({
            candidateProfile: {
              full_name: 'Bhargav Reddy',
              email: 'bhargav@example.com',
              current_job_title: 'Full Stack Engineer'
            },
            resumeData: { filename: 'Bhargav_Resume.pdf' }
          })
        }
      },
      runtime: {
        getURL: path => 'chrome-extension://mock/' + path,
        sendMessage: (msg, cb) => {
          if (msg?.action === 'check_side_panel_state' && cb) {
            cb({ isOpen: false });
          }
        },
        onMessage: {
          addListener: cb => { messageListeners.push(cb); }
        }
      }
    },
    setInterval: () => 1,
    clearInterval: () => {},
    setTimeout: fn => fn(),
    clearTimeout: () => {},
    crypto: { randomUUID: () => 'uuid-1234' }
  };

  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.window.top = sandbox.window;
  sandbox.window.self = sandbox.window;
  sandbox.addEventListener = (type, cb) => { listeners[type] = cb; };
  sandbox.removeEventListener = () => {};

  vm.createContext(sandbox);
  return { sandbox, elements, messageListeners };
}

test('Floating Icon: Mounts floating widget with workspace extension icon on job portals (e.g. Ashby, Greenhouse, Lever, Workday)', () => {
  const { sandbox, elements, messageListeners } = createSandbox('https://jobs.ashbyhq.com/openai/application?jr_id=123');

  // Load bundle and floating widget
  vm.runInContext(bundleCode, sandbox);
  vm.runInContext(fs.readFileSync('jobright_extension/floating-widget.js', 'utf8'), sandbox);

  const widgetRoot = elements.find(el => el.id === 'nextkin-floating-widget-root');
  assert.ok(widgetRoot, 'Widget root (#nextkin-floating-widget-root) must be mounted on job portal');
  assert.strictEqual(widgetRoot.style.display, 'block', 'Widget root should be visible by default when side panel is closed');

  // Verify that floating widget source uses inline SVG logo (not broken img tag subject to CSP)
  const widgetSource = fs.readFileSync('jobright_extension/floating-widget.js', 'utf8');
  assert.ok(widgetSource.includes('<svg'), 'Floating widget must embed inline vector SVG logo');
  assert.ok(widgetSource.includes('data:image/png;base64'), 'Floating widget SVG must embed the Nextkinlife logo');
  assert.ok(!widgetSource.includes('icon48.plasmo.aced7582.png'), 'Floating widget must not rely on external icon48 PNG');

  // Verify Side Panel Visibility Toggle
  assert.ok(messageListeners.length > 0, 'Must register onMessage listener for side panel state');
  // Broadcast side panel OPEN -> floating widget hides
  for (const listener of messageListeners) {
    listener({ type: 'NEXTKIN_SIDE_PANEL_STATE', isOpen: true });
  }
  assert.strictEqual(widgetRoot.style.display, 'none', 'Widget root must hide (display: none) when side panel opens');

  // Broadcast side panel CLOSED -> floating widget reappears
  for (const listener of messageListeners) {
    listener({ type: 'NEXTKIN_SIDE_PANEL_STATE', isOpen: false });
  }
  assert.strictEqual(widgetRoot.style.display, 'block', 'Widget root must reappear (display: block) when side panel closes');
});

test('Strict Autofill: If candidate details are missing or empty, autofill fills NOTHING', async () => {
  const sandbox = {
    window: {},
    document: {
      querySelectorAll: () => [],
      querySelector: () => null,
      getElementById: () => null,
      documentElement: { contains: () => true },
      body: { contains: () => true }
    },
    location: {
      href: 'https://jobs.ashbyhq.com/testco/apply',
      pathname: '/testco/apply',
      search: ''
    },
    navigator: { userAgent: 'test' },
    console: console,
    crypto: { randomUUID: () => 'test-uuid' }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(bundleCode, sandbox);

  // Run fill with completely empty candidate and no resume
  const emptyCandidate = {};
  const emptyResume = null;

  const fields = [
    { label: 'Full Name', kind: 'text' },
    { label: 'Email', kind: 'text' },
    { label: 'Phone', kind: 'text' },
    { label: 'Gender', kind: 'choice', options: ['Female', 'Male', 'Decline'] }
  ];

  const plans = sandbox.NextkinFieldMapping.planFill(fields, emptyCandidate);
  for (const p of plans) {
    assert.notStrictEqual(p.status, 'supported', `Field ${p.field.label} must not be supported when candidate details are empty`);
    assert.strictEqual(p.value, undefined, `Field ${p.field.label} must have undefined value when candidate details are empty`);
  }
});

test('Strict Autofill: When candidate submits details, ONLY fields present in details are filled; omitted fields are not filled', async () => {
  const sandbox = {
    window: {},
    document: {
      querySelectorAll: () => [],
      querySelector: () => null,
      getElementById: () => null
    },
    location: {
      href: 'https://boards.greenhouse.io/acme/jobs/12345',
      pathname: '/acme/jobs/12345',
      search: ''
    },
    navigator: { userAgent: 'test' },
    console: console,
    crypto: { randomUUID: () => 'test-uuid' }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(bundleCode, sandbox);

  const candidateWithPartialDetails = {
    full_name: 'Bhargav Reddy',
    first_name: 'Bhargav',
    last_name: 'Reddy',
    email: 'bhargav@example.com',
    phone: '5125550187',
    current_city: 'Austin',
    current_state: 'TX',
    // Gender, Race, Veteran, Disability, and Visa are NOT provided
    gender: '',
    race: '',
    veteran_status: '',
    disability_status: '',
    visa_status: ''
  };

  const fields = [
    { label: 'Full Name', kind: 'text' },
    { label: 'Email', kind: 'text' },
    { label: 'Phone', kind: 'text' },
    { label: 'City', kind: 'text' },
    { label: 'Gender', kind: 'choice', options: ['Female', 'Male', 'Non-Binary', 'Decline to self-identify'] },
    { label: 'Race / Ethnicity', kind: 'choice', options: ['Asian', 'White', 'Hispanic or Latino', 'Decline to self-identify'] },
    { label: 'Veteran Status', kind: 'choice', options: ['I am not a protected veteran', 'Protected veteran', 'Prefer not to say'] },
    { label: 'Disability Status', kind: 'choice', options: ['No, I do not have a disability', 'Yes', 'Prefer not to say'] },
    { label: 'Why do you want to join Acme?', kind: 'text' }
  ];

  const plans = sandbox.NextkinFieldMapping.planFill(fields, candidateWithPartialDetails);

  // Full Name, Email, Phone, City must be supported
  assert.strictEqual(plans.find(p => p.field.label === 'Full Name').status, 'supported');
  assert.strictEqual(plans.find(p => p.field.label === 'Full Name').value, 'Bhargav Reddy');
  assert.strictEqual(plans.find(p => p.field.label === 'Email').status, 'supported');
  assert.strictEqual(plans.find(p => p.field.label === 'Email').value, 'bhargav@example.com');
  assert.strictEqual(plans.find(p => p.field.label === 'City').status, 'supported');
  assert.strictEqual(plans.find(p => p.field.label === 'City').value, 'Austin');

  // Gender, Race, Veteran, Disability, and Why Join must NOT be filled (must NOT fall back to decline or guess)
  const genderPlan = plans.find(p => p.field.label === 'Gender');
  const racePlan = plans.find(p => p.field.label === 'Race / Ethnicity');
  const vetPlan = plans.find(p => p.field.label === 'Veteran Status');
  const disPlan = plans.find(p => p.field.label === 'Disability Status');
  const whyPlan = plans.find(p => p.field.label === 'Why do you want to join Acme?');

  assert.notStrictEqual(genderPlan.status, 'supported', 'Gender must not be filled without candidate detail');
  assert.strictEqual(genderPlan.value, undefined, 'Gender value must remain undefined');

  assert.notStrictEqual(racePlan.status, 'supported', 'Race must not be filled without candidate detail');
  assert.strictEqual(racePlan.value, undefined, 'Race value must remain undefined');

  assert.notStrictEqual(vetPlan.status, 'supported', 'Veteran status must not be filled without candidate detail');
  assert.strictEqual(vetPlan.value, undefined, 'Veteran status value must remain undefined');

  assert.notStrictEqual(disPlan.status, 'supported', 'Disability status must not be filled without candidate detail');
  assert.strictEqual(disPlan.value, undefined, 'Disability status value must remain undefined');

  assert.notStrictEqual(whyPlan.status, 'supported', 'Custom questions must not be filled without candidate detail');
});

test('Brand Colors & Unfilled Sections: Verifies extension logo colors and unfilled sections rendering', () => {
  const panelCss = fs.readFileSync('jobright_extension/panel.css', 'utf8');

  // Verify Logo Navy Blue
  // Verify Logo Red
  assert.ok(panelCss.includes('#ca1e1c'), 'panel.css must include Logo Red (#ca1e1c)');
  // Verify Logo Cream
  assert.ok(panelCss.includes('#f8efd8'), 'panel.css must include Logo Cream (#f8efd8)');

  // Verify status-line[data-ready="true"] uses logo red
  assert.match(panelCss, /\.status-line\[data-ready="true"\]\s*i\s*\{[^}]*(?:#ca1e1c|--color-brand-red)/, 'Status line ready check dots must use logo red');

  // Verify Primary button uses #00162d
  assert.match(panelCss, /\.primary\s*\{[^}]*(?:#00162d|--color-button-bg)/, 'Primary button must use #00162d');

  // Verify no Jobright green colors remain
  const jobrightGreens = ['#08b981', '#10b981', '#059669', '#008157', '#86eaa5', '#eefcf3', '#08652d', '#afecc2', '#dbfce6', '#087a31', '#008640'];
  for (const green of jobrightGreens) {
    assert.ok(!panelCss.toLowerCase().includes(green.toLowerCase()), `panel.css must not contain Jobright green: ${green}`);
  }

  // Verify unfilled section exists in panel.html
  const panelHtml = fs.readFileSync('jobright_extension/panel.html', 'utf8');
  assert.ok(panelHtml.includes('id="unfilled-section"'), 'panel.html must include unfilled-section');
  assert.ok(panelHtml.includes('id="fields-unfilled"'), 'panel.html must include fields-unfilled');
});

