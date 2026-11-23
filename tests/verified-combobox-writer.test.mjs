import test from 'node:test';
import assert from 'node:assert/strict';

// Set up mock DOM environment
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
    this.keyCode = init.keyCode || 0;
  }
}

class MockFocusEvent extends MockEvent {
  constructor(type, init = {}) {
    super(type, init);
  }
}

class MockNode {
  constructor(tagName = 'DIV', attrs = {}, text = '') {
    this.tagName = tagName.toUpperCase();
    this.attrs = {};
    for (const [k, v] of Object.entries(attrs)) {
      this.attrs[k.toLowerCase()] = String(v);
    }
    this.children = [];
    this.parentElement = null;
    this.textContent = text;
    this.disabled = !!attrs.disabled;
    this.readOnly = !!attrs.readonly;
    this.listeners = new Map();
    this.eventLog = [];
    this.isConnected = true;
    this._value = attrs.value || '';
    this._ownerDocument = null;
  }

  getAttribute(name) {
    const key = name.toLowerCase();
    return Object.prototype.hasOwnProperty.call(this.attrs, key) ? this.attrs[key] : null;
  }

  setAttribute(name, val) {
    this.attrs[name.toLowerCase()] = String(val);
  }

  hasAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attrs, name.toLowerCase());
  }

  removeAttribute(name) {
    delete this.attrs[name.toLowerCase()];
  }

  get id() { return this.getAttribute('id') || ''; }
  set id(v) { this.setAttribute('id', v); }
  get name() { return this.getAttribute('name') || ''; }
  set name(v) { this.setAttribute('name', v); }
  get type() { return this.getAttribute('type') || ''; }
  set type(v) { this.setAttribute('type', v); }

  get clientRects() { return [{ width: 100, height: 20 }]; }
  getClientRects() { return this.clientRects; }

  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }

  removeEventListener(type, fn) {
    if (this.listeners.has(type)) {
      this.listeners.set(type, this.listeners.get(type).filter(f => f !== fn));
    }
  }

  dispatchEvent(evt) {
    this.eventLog.push(evt.type);
    const handlers = this.listeners.get(evt.type) || [];
    for (const h of handlers) h(evt);
    if (evt.bubbles && this.parentElement) {
      this.parentElement.dispatchEvent(evt);
    }
    return !evt.defaultPrevented;
  }

  click() {
    this.dispatchEvent(new MockPointerEvent('pointerdown', { bubbles: true, composed: true }));
    this.dispatchEvent(new MockMouseEvent('mousedown', { bubbles: true, composed: true }));
    this.focus();
    this.dispatchEvent(new MockPointerEvent('pointerup', { bubbles: true, composed: true }));
    this.dispatchEvent(new MockMouseEvent('mouseup', { bubbles: true, composed: true }));
    this.dispatchEvent(new MockMouseEvent('click', { bubbles: true, composed: true }));
  }

  focus() { this.eventLog.push('focus'); }

  getRootNode() {
    let curr = this;
    while (curr.parentElement) curr = curr.parentElement;
    return curr;
  }

  get ownerDocument() {
    const root = this.getRootNode();
    return root.tagName === '#DOCUMENT' ? root : (this._ownerDocument || globalThis.document);
  }

  set ownerDocument(doc) {
    this._ownerDocument = doc;
  }

  closest(selector) {
    let curr = this;
    while (curr) {
      if (curr.matches && curr.matches(selector)) return curr;
      curr = curr.parentElement;
    }
    return null;
  }

  contains(node) {
    let curr = node;
    while (curr) {
      if (curr === this) return true;
      curr = curr.parentElement;
    }
    return false;
  }

  matchesSingle(selector) {
    let sel = selector.trim();
    if (!sel) return false;

    const parts = sel.split(/\s+/);
    if (parts.length > 1) {
      sel = parts[parts.length - 1];
    }
    sel = sel.replace(/\s+[is]\]$/, ']');

    const tagMatch = sel.match(/^([a-z0-9_-]+)/i);
    let tag = '';
    if (tagMatch && !sel.startsWith('.') && !sel.startsWith('[')) {
      tag = tagMatch[1];
      sel = sel.slice(tag.length);
    }
    if (tag && this.tagName.toLowerCase() !== tag.toLowerCase()) return false;
    if (!sel) return true;

    if (sel.startsWith('.')) {
      const cls = sel.slice(1).split(/[\.\[]/)[0].toLowerCase();
      const hasCls = (this.getAttribute('class') || '').split(/\s+/).some(c => c.toLowerCase() === cls);
      if (!hasCls) return false;
    }

    const attrMatch = sel.match(/\[([a-z0-9_-]+)(?:([*^$]?=)(?:"|')?([^"'\]]+)(?:"|')?)?\]/i);
    if (attrMatch) {
      const [, attr, op, val] = attrMatch;
      const attrVal = this.getAttribute(attr);
      if (attrVal === null) return false;
      if (!op) return true;
      if (op === '=') return attrVal.toLowerCase() === val.toLowerCase();
      if (op === '*=') return attrVal.toLowerCase().includes(val.toLowerCase());
      if (op === '^=') return attrVal.toLowerCase().startsWith(val.toLowerCase());
      if (op === '$=') return attrVal.toLowerCase().endsWith(val.toLowerCase());
    }

    return true;
  }

  matches(selector) {
    const parts = selector.split(',').map(s => s.trim()).filter(Boolean);
    return parts.some(part => this.matchesSingle(part));
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  querySelectorAll(selector) {
    const results = [];
    const parts = selector.split(',').map(s => s.trim()).filter(Boolean);
    const walk = node => {
      for (const child of node.children) {
        if (parts.some(p => child.matchesSingle(p))) results.push(child);
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

class MockInputElement extends MockNode {
  constructor(attrs = {}) {
    super('INPUT', attrs);
    this._checked = false;
  }
  get checked() { return this._checked; }
  set checked(v) { this._checked = Boolean(v); }
}

Object.defineProperty(MockInputElement.prototype, 'value', {
  get() { return this._value ?? ''; },
  set(v) { this._value = String(v ?? ''); },
  configurable: true,
  enumerable: true
});

class MockSelectElement extends MockNode {
  constructor(attrs = {}) {
    super('SELECT', attrs);
    this.options = [];
    this.selectedIndex = -1;
  }
}

Object.defineProperty(MockSelectElement.prototype, 'value', {
  get() { return this._value ?? ''; },
  set(v) { this._value = String(v ?? ''); },
  configurable: true,
  enumerable: true
});

class MockTextAreaElement extends MockNode {
  constructor(attrs = {}) {
    super('TEXTAREA', attrs);
  }
}

Object.defineProperty(MockTextAreaElement.prototype, 'value', {
  get() { return this._value ?? ''; },
  set(v) { this._value = String(v ?? ''); },
  configurable: true,
  enumerable: true
});

// Setup globals
globalThis.Event = MockEvent;
globalThis.PointerEvent = MockPointerEvent;
globalThis.MouseEvent = MockMouseEvent;
globalThis.KeyboardEvent = MockKeyboardEvent;
globalThis.FocusEvent = MockFocusEvent;
globalThis.HTMLInputElement = MockInputElement;
globalThis.HTMLSelectElement = MockSelectElement;
globalThis.HTMLTextAreaElement = MockTextAreaElement;

const mockDoc = new MockNode('#document');
mockDoc.defaultView = globalThis;
mockDoc.getElementById = id => {
  const all = mockDoc.querySelectorAll('*');
  return all.find(n => n.id === id) || null;
};
globalThis.document = mockDoc;
mockDoc.body = new MockNode('BODY');
mockDoc.appendChild(mockDoc.body);
globalThis.getComputedStyle = () => ({ display: 'block', visibility: 'visible', opacity: '1' });

// Load core modules
await import('../jobright_extension/core/field-mapping.js');
await import('../jobright_extension/core/form-discovery.js');
await import('../jobright_extension/core/field-writer.js');

const writer = globalThis.NextkinFieldWriter;

test.beforeEach(() => {
  mockDoc.body.children = [];
});

test('1. Programmatic writes use native prototype descriptors and fire input, change, and blur events', () => {
  assert.equal(typeof writer.setNativeValue, 'function', 'setNativeValue must be exported');

  // Input element with prototype property descriptor tracking
  const input = new MockInputElement();
  input.id = 'applicant-first-name';
  mockDoc.body.appendChild(input);

  // Track descriptor setter calls on prototype
  let protoSetterCalled = false;
  const originalInputDesc = Object.getOwnPropertyDescriptor(MockInputElement.prototype, 'value');
  Object.defineProperty(MockInputElement.prototype, 'value', {
    get: originalInputDesc.get,
    set(v) {
      protoSetterCalled = true;
      originalInputDesc.set.call(this, v);
    },
    configurable: true
  });

  // Track React value tracker reset
  let trackerReset = false;
  input._valueTracker = {
    setValue(v) {
      if (v === '') trackerReset = true;
    }
  };

  try {
    // Also simulate React overriding the instance property
    let instanceSetterCalled = false;
    Object.defineProperty(input, 'value', {
      get() { return this._value; },
      set(v) {
        instanceSetterCalled = true;
        // React controlled input may ignore plain assignment if not via native setter
        this._value = v;
      },
      configurable: true
    });

    writer.setNativeValue(input, 'Samantha');

    assert.equal(protoSetterCalled, true, 'Must call prototype descriptor setter');
    assert.equal(input.value, 'Samantha');
    assert.equal(trackerReset, true, 'Must reset React _valueTracker');
    assert.ok(input.eventLog.includes('input'), 'Must dispatch input event');
    assert.ok(input.eventLog.includes('change'), 'Must dispatch change event');
    assert.ok(input.eventLog.includes('blur'), 'Must dispatch blur event');
  } finally {
    Object.defineProperty(MockInputElement.prototype, 'value', originalInputDesc);
  }

  // TextArea element
  const textarea = new MockTextAreaElement();
  mockDoc.body.appendChild(textarea);
  writer.setNativeValue(textarea, 'Experienced software architect with 8 years...');
  assert.equal(textarea.value, 'Experienced software architect with 8 years...');
  assert.ok(textarea.eventLog.includes('input'), 'Textarea receives input event');
  assert.ok(textarea.eventLog.includes('change'), 'Textarea receives change event');
  assert.ok(textarea.eventLog.includes('blur'), 'Textarea receives blur event');

  // Select element
  const select = new MockSelectElement();
  const opt = new MockNode('OPTION');
  opt.value = 'US';
  opt.textContent = 'United States';
  select.options.push(opt);
  mockDoc.body.appendChild(select);
  writer.setNativeValue(select, 'US');
  assert.equal(select.value, 'US');
  assert.ok(select.eventLog.includes('input'), 'Select receives input event');
  assert.ok(select.eventLog.includes('change'), 'Select receives change event');
});

test('2. Custom combobox ([role="combobox"], [aria-haspopup="listbox"]) triggers option list opening, selects matching option text, and verifies selected value', async () => {
  const combo = new MockNode('DIV');
  combo.setAttribute('role', 'combobox');
  combo.setAttribute('aria-haspopup', 'listbox');
  combo.setAttribute('aria-expanded', 'false');

  const trigger = new MockNode('BUTTON');
  trigger.setAttribute('class', 'select-trigger');
  combo.appendChild(trigger);

  const display = new MockNode('SPAN');
  display.setAttribute('class', 'select-value');
  combo.appendChild(display);

  const listbox = new MockNode('UL');
  listbox.setAttribute('role', 'listbox');
  listbox.getClientRects = () => [{ width: 200, height: 100 }];

  const opt1 = new MockNode('LI');
  opt1.setAttribute('role', 'option');
  opt1.textContent = 'Frontend Engineer';
  opt1.setAttribute('data-value', 'fe');

  const opt2 = new MockNode('LI');
  opt2.setAttribute('role', 'option');
  opt2.textContent = 'Senior Product Manager';
  opt2.setAttribute('data-value', 'pm');

  listbox.appendChild(opt1);
  listbox.appendChild(opt2);

  // Trigger click opens listbox in DOM and sets aria-expanded true
  trigger.addEventListener('click', () => {
    combo.setAttribute('aria-expanded', 'true');
    mockDoc.body.appendChild(listbox);
  });

  // Clicking option updates combobox display, sets aria-selected, and closes listbox
  opt2.addEventListener('click', () => {
    display.textContent = 'Senior Product Manager';
    opt2.setAttribute('aria-selected', 'true');
    combo.setAttribute('aria-expanded', 'false');
    if (listbox.parentElement) listbox.parentElement.children = listbox.parentElement.children.filter(c => c !== listbox);
  });

  mockDoc.body.appendChild(combo);

  const field = {
    key: 'field:job_role',
    label: 'Desired Role',
    kind: 'combobox',
    element: combo
  };

  const res = await writer.fillCombo(field, 'Senior Product Manager', () => true);
  assert.ok(res, 'fillCombo must succeed');
  assert.equal(res.expected, 'Senior Product Manager');
  assert.ok(trigger.eventLog.includes('click'), 'Trigger must be clicked to open combobox');
  assert.ok(opt2.eventLog.includes('click'), 'Target option must be clicked');
  assert.equal(display.textContent, 'Senior Product Manager', 'Readback must verify selected value');
});

test('3. Post-fill readback verification reads back element state 50ms after write and flags dropped writes as unverified', async () => {
  // Input 1: persists write normally
  const inputValid = new MockInputElement();
  inputValid.id = 'applicant-city';
  mockDoc.body.appendChild(inputValid);

  const planValid = {
    field: { key: 'field:city', label: 'City', kind: 'text', element: inputValid },
    value: 'San Francisco',
    status: 'supported'
  };

  // Input 2: simulates an asynchronous framework (React/Angular) wiping/dropping value 15ms after write
  const inputDropped = new MockInputElement();
  inputDropped.id = 'applicant-company';
  mockDoc.body.appendChild(inputDropped);

  inputDropped.addEventListener('input', () => {
    setTimeout(() => {
      // Framework wipes value back to empty string
      inputDropped.value = '';
    }, 15);
  });

  const planDropped = {
    field: { key: 'field:company', label: 'Current Company', kind: 'text', element: inputDropped },
    value: 'Acme Corp',
    status: 'supported'
  };

  const report = await writer.applyFill([planValid, planDropped], { isCurrent: () => true });

  // Verified field appears in filled
  assert.ok(report.filled.some(r => r.field.key === 'field:city'), 'Persisted write must be in filled');
  assert.equal(inputValid.value, 'San Francisco');

  // Dropped field appears in unverified
  assert.ok(report.unverified.some(r => r.field.key === 'field:company'), 'Dropped write must be in unverified');
  assert.equal(inputDropped.value, '', 'Element value was wiped in DOM');
});

test('4. Returns a structured verification report { filled: [...], unverified: [...], manual: [...], unmapped: [...] }', async () => {
  const input1 = new MockInputElement();
  input1.id = 'applicant-first-name';
  mockDoc.body.appendChild(input1);

  const inputDropped = new MockInputElement();
  inputDropped.id = 'applicant-title';
  inputDropped.addEventListener('input', () => {
    setTimeout(() => { inputDropped.value = ''; }, 10);
  });
  mockDoc.body.appendChild(inputDropped);

  const manualInput = new MockInputElement();
  manualInput.id = 'extra-url';
  mockDoc.body.appendChild(manualInput);

  const unmappedInput = new MockInputElement();
  unmappedInput.id = 'custom-unknown';
  mockDoc.body.appendChild(unmappedInput);

  const plans = [
    {
      field: { key: 'field:first_name', label: 'First Name', kind: 'text', element: input1 },
      value: 'Elena',
      status: 'supported'
    },
    {
      field: { key: 'field:title', label: 'Title', kind: 'text', element: inputDropped },
      value: 'Lead Architect',
      status: 'supported'
    },
    {
      field: { key: 'field:other_url', label: 'Other URL', kind: 'text', element: manualInput },
      status: 'manual',
      reason: 'Unmapped link field; enter manually.'
    },
    {
      field: { key: 'field:unknown_q', label: 'Unknown Question', kind: 'text', element: unmappedInput },
      status: 'unmapped',
      reason: 'No matching profile fact found.'
    }
  ];

  const report = await writer.applyFill(plans, { isCurrent: () => true });

  // Structured report verification
  assert.ok(Array.isArray(report.filled), 'report.filled must be an array');
  assert.ok(Array.isArray(report.unverified), 'report.unverified must be an array');
  assert.ok(Array.isArray(report.manual), 'report.manual must be an array');
  assert.ok(Array.isArray(report.unmapped), 'report.unmapped must be an array');

  assert.equal(report.filled.length, 1, 'Exactly 1 field filled');
  assert.equal(report.filled[0].field.key, 'field:first_name');
  assert.equal(report.filled[0].writtenValue, 'Elena');

  assert.equal(report.unverified.length, 1, 'Exactly 1 field unverified');
  assert.equal(report.unverified[0].field.key, 'field:title');

  assert.equal(report.manual.length, 1, 'Exactly 1 field manual');
  assert.equal(report.manual[0].field.key, 'field:other_url');

  assert.equal(report.unmapped.length, 1, 'Exactly 1 field unmapped');
  assert.equal(report.unmapped[0].field.key, 'field:unknown_q');

  // Verify standalone verifyWrites function
  assert.equal(typeof writer.verifyWrites, 'function', 'verifyWrites must be exported');
  const standaloneReport = writer.verifyWrites(plans);
  assert.ok(standaloneReport.filled);
  assert.ok(standaloneReport.unverified);
  assert.ok(standaloneReport.manual);
  assert.ok(standaloneReport.unmapped);

  // Backwards compatibility with receipts array callers
  assert.ok(Array.isArray(report), 'Return value must remain array-like for legacy callers');
  assert.equal(report.length, 1, 'report.length equals filled count');
  assert.equal(report[0].writtenValue, 'Elena');
  const mapped = report.map(r => r.writtenValue);
  assert.deepEqual(mapped, ['Elena']);
});
