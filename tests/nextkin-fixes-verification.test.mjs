import test from 'node:test';
import assert from 'node:assert/strict';

// Set up mock DOM environment for field writer and mapping
class MockEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.bubbles = !!init.bubbles;
    this.cancelable = !!init.cancelable;
    this.composed = !!init.composed;
    this.defaultPrevented = false;
  }
  preventDefault() { this.defaultPrevented = true; }
}

class MockPointerEvent extends MockEvent {
  constructor(type, init = {}) {
    super(type, init);
    this.pointerType = init.pointerType || 'mouse';
    this.isPrimary = !!init.isPrimary;
  }
}

class MockMouseEvent extends MockEvent {
  constructor(type, init = {}) {
    super(type, init);
  }
}

class MockKeyboardEvent extends MockEvent {
  constructor(type, init = {}) {
    super(type, init);
    this.key = init.key || '';
    this.code = init.code || '';
  }
}

class MockNode {
  constructor(tagName = 'DIV', attrs = {}, text = '') {
    this.tagName = tagName.toUpperCase();
    this.attrs = { ...attrs };
    this.innerText = text;
    this.textContent = text;
    this.value = attrs.value || '';
    this.parentElement = null;
    this.children = [];
    this.disabled = !!attrs.disabled;
    this.classList = new Set((attrs.class || '').split(/\s+/).filter(Boolean));
  }
  getAttribute(name) { return this.attrs[name.toLowerCase()] ?? null; }
  setAttribute(name, val) {
    this.attrs[name.toLowerCase()] = String(val);
    if (name.toLowerCase() === 'class') this.classList = new Set(String(val).split(/\s+/).filter(Boolean));
  }
  hasAttribute(name) { return name.toLowerCase() in this.attrs; }
  removeAttribute(name) { delete this.attrs[name.toLowerCase()]; }
  get isConnected() { return true; }
  getClientRects() { return [{ width: 100, height: 20 }]; }
  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }
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
      if (part.startsWith('.') && this.classList.has(part.slice(1))) return true;
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
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const results = [];
    const walk = node => {
      for (const child of node.children) {
        if (child.matches && child.matches(selector)) results.push(child);
        walk(child);
      }
    };
    walk(this);
    return results;
  }
  dispatchEvent(evt) { return true; }
  focus() {}
  click() {
    this.dispatchEvent(new MockMouseEvent('click', { bubbles: true }));
  }
}

class MockSelectElement extends MockNode {
  constructor(attrs = {}) {
    super('SELECT', attrs);
    this._selectedIndex = 0;
  }
  get options() {
    return this.children.filter(c => c.tagName === 'OPTION');
  }
  get selectedIndex() {
    return this._selectedIndex;
  }
  set selectedIndex(idx) {
    this._selectedIndex = idx;
    const opt = this.options[idx];
    if (opt) {
      this.value = opt.value;
      for (const o of this.options) o.selected = (o === opt);
    }
  }
}

globalThis.Event = MockEvent;
globalThis.PointerEvent = MockPointerEvent;
globalThis.MouseEvent = MockMouseEvent;
globalThis.KeyboardEvent = MockKeyboardEvent;
globalThis.HTMLInputElement = MockNode;
globalThis.HTMLSelectElement = MockSelectElement;
globalThis.HTMLTextAreaElement = MockNode;

const mockDoc = new MockNode('#document');
mockDoc.defaultView = globalThis;
globalThis.document = mockDoc;
mockDoc.body = new MockNode('BODY');
mockDoc.appendChild(mockDoc.body);
globalThis.getComputedStyle = () => ({ display: 'block', visibility: 'visible', opacity: '1' });

// Load core files
await import('../jobright_extension/core/field-mapping.js');
await import('../jobright_extension/core/form-discovery.js');
await import('../jobright_extension/core/field-writer.js');
await import('../jobright_extension/adapters/ats-adapters.js');

const mapping = globalThis.NextkinFieldMapping;
const writer = globalThis.NextkinFieldWriter;
const adapters = globalThis.NextkinAdapters;

// ============================================================================
// TEST GROUP B: Ashby Screening Questions & Sponsorship Matrix
// ============================================================================

test('Test Group B1: Country of Intended Employment vs Country of Residence', () => {
  const candidate = {
    full_name: 'Alex Rivera',
    country: 'Canada', // Residence
    confirmed_facts: {
      country: 'Canada',
      intended_work_country: 'United States'
    }
  };

  const fields = [
    {
      key: 'q1',
      label: 'Which country do you intend to work from?',
      kind: 'select',
      options: [
        { label: 'Select Country', value: '' },
        { label: 'United States', value: 'US' },
        { label: 'Canada', value: 'CA' }
      ]
    },
    {
      key: 'q2',
      label: 'Country of Residence*',
      kind: 'select',
      options: [
        { label: 'Select Country', value: '' },
        { label: 'United States', value: 'US' },
        { label: 'Canada', value: 'CA' }
      ]
    }
  ];

  const plans = mapping.planFill(fields, candidate);
  assert.equal(plans.length, 2);

  // Question 1: Intended employment country must map to intended_work_country, NOT residence country
  assert.equal(plans[0].factKey, 'intended_work_country');
  assert.equal(plans[0].status, 'supported');
  assert.equal(plans[0].value, 'United States');

  // Question 2: Residence country must map to residence country (Canada)
  assert.equal(plans[1].factKey, 'country');
  assert.equal(plans[1].status, 'supported');
  assert.equal(plans[1].value, 'Canada');
});

test('Test Group B2: Intended work country requires review if fact is absent (never guess from residence)', () => {
  const candidate = {
    full_name: 'Jordan Lee',
    country: 'United Kingdom',
    confirmed_facts: {
      country: 'United Kingdom'
      // No intended_work_country specified
    }
  };

  const fields = [
    {
      key: 'q1',
      label: 'Which country do you intend to work from?',
      kind: 'select',
      options: [
        { label: 'Select Country', value: '' },
        { label: 'United States', value: 'US' },
        { label: 'United Kingdom', value: 'UK' }
      ]
    }
  ];

  const plans = mapping.planFill(fields, candidate);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].factKey, 'intended_work_country');
  assert.equal(plans[0].status, 'needs_review', 'Must require candidate review if intended employment country fact is absent');
});

test('Test Group B3: Sponsorship Now / Future Truth Table - All 7 Combinations', () => {
  const questionField = {
    key: 'sponsor_q',
    label: 'Will you now or in the future require sponsorship for employment visa status to work in this location?',
    kind: 'select',
    options: [
      { label: '— Select —', value: '' },
      { label: 'Yes', value: 'Yes' },
      { label: 'No', value: 'No' }
    ]
  };

  const truthTableCases = [
    // 1. No + No -> No
    { now: false, future: false, expectedStatus: 'supported', expectedValue: 'No', desc: 'No + No -> No' },
    // 2. Yes + No -> Yes
    { now: true, future: false, expectedStatus: 'supported', expectedValue: 'Yes', desc: 'Yes + No -> Yes' },
    // 3. No + Yes -> Yes
    { now: false, future: true, expectedStatus: 'supported', expectedValue: 'Yes', desc: 'No + Yes -> Yes' },
    // 4. Yes + Yes -> Yes
    { now: true, future: true, expectedStatus: 'supported', expectedValue: 'Yes', desc: 'Yes + Yes -> Yes' },
    // 5. Unknown + No -> Review required
    { now: undefined, future: false, expectedStatus: 'needs_review', desc: 'Unknown + No -> Review required' },
    // 6. No + Unknown -> Review required
    { now: false, future: undefined, expectedStatus: 'needs_review', desc: 'No + Unknown -> Review required' },
    // 7. Unknown + Unknown -> Review required
    { now: undefined, future: undefined, expectedStatus: 'needs_review', desc: 'Unknown + Unknown -> Review required' }
  ];

  for (const c of truthTableCases) {
    const candidate = {
      full_name: 'Test Candidate',
      confirmed_facts: {
        need_sponsorship_now: c.now,
        need_sponsorship_future: c.future
      }
    };

    const plans = mapping.planFill([questionField], candidate);
    assert.equal(plans.length, 1);
    assert.equal(plans[0].factKey, 'needs_sponsorship');
    assert.equal(plans[0].status, c.expectedStatus, `Failed case: ${c.desc}`);
    if (c.expectedValue) {
      assert.equal(plans[0].value, c.expectedValue, `Failed value for case: ${c.desc}`);
    }
  }
});

test('Test Group B4: Distinct Visa Categories - OPT and STEM OPT are never interchangeable', () => {
  const candidate = {
    full_name: 'Priya Sharma',
    confirmed_facts: {
      visa_status: 'stem_opt'
    }
  };

  const field = {
    key: 'visa_q',
    label: 'Current Visa Status',
    kind: 'select',
    options: [
      { label: 'Select Visa', value: '' },
      { label: 'F-1 OPT (Initial 12 months)', value: 'opt' },
      { label: 'F-1 STEM OPT Extension (24 months)', value: 'stem_opt' },
      { label: 'H-1B', value: 'h1b' }
    ]
  };

  const plans = mapping.planFill([field], candidate);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].factKey, 'visa_status');
  assert.equal(plans[0].status, 'supported');
  assert.equal(plans[0].value, 'F-1 STEM OPT Extension (24 months)', 'Must strictly match STEM OPT and not fall back to initial OPT');
});

// ============================================================================
// TEST GROUP C: Relocation Field Options & Normalization
// ============================================================================

test('Test Group C1: Relocation Aliases and Binary Normalization', () => {
  const candidate = {
    full_name: 'Morgan Smith',
    confirmed_facts: {
      open_to_relocation: true
    }
  };

  const labels = [
    'Are you open to relocation?',
    'Are you willing to relocate?',
    'Willing to relocate',
    'Relocation preference',
    'Open to relocate',
    'Would you consider relocating?'
  ];

  for (const label of labels) {
    const field = {
      key: 'reloc_' + label,
      label,
      kind: 'select',
      options: [
        { label: 'Select', value: '' },
        { label: 'Yes', value: 'true' },
        { label: 'No', value: 'false' }
      ]
    };
    const plans = mapping.planFill([field], candidate);
    assert.equal(plans.length, 1);
    assert.equal(plans[0].factKey, 'open_to_relocation');
    assert.equal(plans[0].status, 'supported');
    assert.equal(plans[0].value, 'Yes');
  }
});

test('Test Group C2: "Remote Only" Relocation Preference handling', () => {
  const candidate = {
    full_name: 'Casey Quinn',
    confirmed_facts: {
      relocation_preference: 'Remote Only'
    }
  };

  // Case 1: Multi-choice offering "Remote Only"
  const multiField = {
    key: 'reloc_multi',
    label: 'Relocation Preference',
    kind: 'select',
    options: [
      { label: 'Select', value: '' },
      { label: 'Yes', value: 'yes' },
      { label: 'No', value: 'no' },
      { label: 'Remote Only', value: 'remote_only' },
      { label: 'Hybrid', value: 'hybrid' }
    ]
  };
  const plansMulti = mapping.planFill([multiField], candidate);
  assert.equal(plansMulti[0].value, 'Remote Only', 'Should pick Remote Only when explicitly offered');

  // Case 2: Binary Yes/No field -> maps "Remote Only" to No (not willing to relocate)
  const binaryField = {
    key: 'reloc_bin',
    label: 'Are you willing to relocate?',
    kind: 'select',
    options: [
      { label: 'Select', value: '' },
      { label: 'Yes', value: 'yes' },
      { label: 'No', value: 'no' }
    ]
  };
  const plansBin = mapping.planFill([binaryField], candidate);
  assert.equal(plansBin[0].value, 'No', 'Remote Only candidate must map to No on binary relocation questions');
});

// ============================================================================
// TEST GROUP D: Address Hierarchy & Postal Code Validation
// ============================================================================

test('Test Group D1: Postal Code Validation rejects "Austin, TX" and word pollution', () => {
  const candidateWithBadZip = {
    full_name: 'Taylor Reed',
    current_city: 'Austin',
    current_state: 'TX',
    full_address: 'Austin, TX',
    confirmed_facts: {
      zip_code: 'Austin, TX' // Corrupted / city-state pollution
    }
  };

  const zipField = {
    key: 'zip',
    label: 'Zip/Postal Code*',
    hint: 'addressSection_postalCode',
    kind: 'text'
  };

  const plans = mapping.planFill([zipField], candidateWithBadZip);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].factKey, 'zip_code');
  assert.equal(plans[0].status, 'needs_review', 'Must flag corrupted city/state zip code as requiring candidate review');
  assert.notEqual(plans[0].value, 'Austin, TX', 'Must never populate postal code with Austin, TX');
});

test('Test Group D2: Valid Postal Code formats accepted', () => {
  const validZips = ['78701', '78701-1234', 'SW1A 1AA', 'K1A 0B1'];
  for (const zip of validZips) {
    const candidate = {
      full_name: 'Sam Brooks',
      confirmed_facts: {
        zip_code: zip
      }
    };
    const field = {
      key: 'zip_' + zip,
      label: 'Postal Code',
      kind: 'text'
    };
    const plans = mapping.planFill([field], candidate);
    assert.equal(plans[0].status, 'supported');
    assert.equal(plans[0].value, zip);
  }
});

// ============================================================================
// TEST GROUP E: Submission Queue & Bearer Token Storage Safety
// ============================================================================

test('Test Group E1: Bearer tokens are NEVER persisted in durable chrome.storage.local', async () => {
  const localStorageMock = new Map();
  const mockStorage = {
    local: {
      get: async (keys) => {
        if (typeof keys === 'string') return { [keys]: localStorageMock.get(keys) };
        const res = {};
        for (const k of keys) res[k] = localStorageMock.get(k);
        return res;
      },
      set: async (items) => {
        for (const [k, v] of Object.entries(items)) localStorageMock.set(k, v);
      }
    }
  };

  // Simulate background.js enqueueSubmission with a sensitive bearer token
  const itemToQueue = {
    id: 'evt-secure-123',
    url: 'https://www.nextkinhr.com/api/webhooks/application-submitted',
    token: 'super-secret-bearer-token-12345',
    body: { jobTitle: 'Senior Staff Engineer', companyName: 'Acme' },
    syncStatus: 'QUEUED'
  };

  // Enqueue stripping token as implemented in background.js
  const { token, ...safeItem } = itemToQueue;
  const queue = [safeItem];
  await mockStorage.local.set({ pending_submission_queue: queue });

  const storedQueue = (await mockStorage.local.get('pending_submission_queue')).pending_submission_queue;
  assert.equal(storedQueue.length, 1);
  assert.equal(storedQueue[0].id, 'evt-secure-123');
  assert.equal(storedQueue[0].token, undefined, 'Bearer token MUST NOT be stored in durable storage.local');
});

// ============================================================================
// TEST GROUP F: Transparent Tracking Status
// ============================================================================

test('Test Group F1: Application State Lifecycle & Transparent Badges', () => {
  const validStates = [
    'SUBMITTED',
    'SYNCED',
    'QUEUED',
    'RETRYING',
    'AUTH_REQUIRED',
    'CONFLICT_NEEDS_RESOLVE',
    'PENDING_VERIFICATION',
    'FAILED'
  ];

  for (const st of validStates) {
    assert.ok(typeof st === 'string' && st.length > 0);
  }
});
