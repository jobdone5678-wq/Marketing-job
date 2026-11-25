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
    this.isTrusted = init.isTrusted !== undefined ? Boolean(init.isTrusted) : false;
    this.target = null;
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
  get htmlFor() { return this.getAttribute('for') || ''; }
  set htmlFor(v) { this.setAttribute('for', v); }

  get control() {
    if (this._control) return this._control;
    const forId = this.htmlFor || this.getAttribute('for');
    if (forId) {
      const doc = this.ownerDocument;
      return doc?.getElementById?.(forId) || null;
    }
    return this.querySelector('input, select, textarea, [role="radio"], [role="checkbox"]');
  }
  set control(v) { this._control = v; }

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
    if (!evt.target) evt.target = this;
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
  blur() { this.eventLog.push('blur'); }

  remove() {
    if (this.parentElement) {
      this.parentElement.children = this.parentElement.children.filter(c => c !== this);
      this.parentElement = null;
    }
  }

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
    this._checked = attrs.checked === true || attrs.checked === 'true';
    this._defaultChecked = attrs.defaultChecked !== undefined
      ? Boolean(attrs.defaultChecked)
      : (attrs.checked === true || attrs.checked === 'true');
  }
  get checked() { return this._checked; }
  set checked(v) {
    this._checked = Boolean(v);
    if (this._checked && (this.type === 'radio' || this.getAttribute('type') === 'radio')) {
      const name = this.name || this.getAttribute('name');
      if (name) {
        const root = this.getRootNode ? this.getRootNode() : null;
        if (root && root.querySelectorAll) {
          const others = root.querySelectorAll(`input[name="${name}"]`);
          for (const other of others) {
            if (other !== this && other instanceof MockInputElement) {
              other._checked = false;
            }
          }
        }
      }
    }
  }
  get defaultChecked() { return this._defaultChecked; }
  set defaultChecked(v) { this._defaultChecked = Boolean(v); }
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
  const walk = node => {
    if (node.id === id) return node;
    for (const child of node.children) {
      const found = walk(child);
      if (found) return found;
    }
    return null;
  };
  return walk(mockDoc);
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

test('writer overwrites untouched initial default radio (e.g. pre-checked "No") with confirmed candidate fact', async () => {
  // Radio group with "No" defaultChecked: true, but candidate fact is "Yes"
  // Writer must update radio to "Yes" because it was untouched by user
  const form = new MockNode('FORM');
  mockDoc.body.appendChild(form);

  const radioYes = new MockInputElement({ type: 'radio', name: 'sponsorship', value: 'Yes' });
  radioYes.id = 'sponsorship-yes';
  radioYes.checked = false;
  radioYes.defaultChecked = false;

  const radioNo = new MockInputElement({ type: 'radio', name: 'sponsorship', value: 'No', checked: 'true' });
  radioNo.id = 'sponsorship-no';
  radioNo.checked = true;
  radioNo.defaultChecked = true;

  form.appendChild(radioYes);
  form.appendChild(radioNo);

  const field = {
    key: 'field:sponsorship',
    label: 'Will you now or in the future require sponsorship?',
    kind: 'radio',
    element: radioNo,
    options: [
      { element: radioYes, label: 'Yes', value: 'Yes' },
      { element: radioNo, label: 'No', value: 'No' }
    ]
  };

  const plan = {
    field,
    value: 'Yes',
    factKey: 'requires_sponsorship',
    status: 'supported'
  };

  const report = await writer.applyFill([plan], { isCurrent: () => true });

  assert.equal(radioYes.checked, true, 'Radio Yes must be checked');
  assert.equal(radioNo.checked, false, 'Radio No must be unchecked');
  assert.equal(report.filled.length, 1, 'Field must be in filled');
  assert.equal(report.filled[0].writtenValue, 'Yes');
});

test('writer strictly preserves field if modified by an isTrusted user event', async () => {
  // Input received an isTrusted input event
  // Writer must preserve the user-edited value
  const input = new MockInputElement({ type: 'text', name: 'first_name' });
  input.id = 'first-name';
  mockDoc.body.appendChild(input);

  // User manually edits the field
  input.value = 'Samantha';
  input.dispatchEvent(new MockEvent('input', { bubbles: true, isTrusted: true }));

  const plan = {
    field: {
      key: 'field:first_name',
      label: 'First Name',
      kind: 'text',
      element: input
    },
    value: 'Elena',
    factKey: 'first_name',
    status: 'supported'
  };

  const report = await writer.applyFill([plan], { isCurrent: () => true });

  assert.ok(writer.userEditedElements?.has(input), 'Input must be tracked in userEditedElements');
  assert.equal(input.value, 'Samantha', 'Manually entered value must be preserved');
  assert.equal(report.filled.length, 0);
  assert.equal(report.unverified[0].status, 'preserved_user_value');
  assert.equal(report.unverified[0].actual, 'Samantha');
});

test('writer tracks isTrusted clicks on <label> or sibling radio across the entire radio group', async () => {
  // Radio group where Option B's label received an isTrusted click
  // Writer must recognize the entire radio group as user-edited and preserve it
  const form = new MockNode('FORM');
  mockDoc.body.appendChild(form);

  const radioA = new MockInputElement({ type: 'radio', name: 'work_auth', value: 'Authorized' });
  radioA.id = 'auth-yes';
  radioA.checked = true;
  radioA.defaultChecked = true;

  const radioB = new MockInputElement({ type: 'radio', name: 'work_auth', value: 'Not Authorized' });
  radioB.id = 'auth-no';
  radioB.checked = false;
  radioB.defaultChecked = false;

  const labelB = new MockNode('LABEL');
  labelB.htmlFor = 'auth-no';
  labelB.textContent = 'Not Authorized';

  form.appendChild(radioA);
  form.appendChild(radioB);
  form.appendChild(labelB);

  // Candidate manually clicks Option B's label
  radioA.checked = false;
  radioB.checked = true;
  labelB.dispatchEvent(new MockMouseEvent('click', { bubbles: true, isTrusted: true }));

  const field = {
    key: 'field:work_auth',
    label: 'Are you authorized to work in the US?',
    kind: 'radio',
    element: radioB,
    options: [
      { element: radioA, label: 'Authorized', value: 'Authorized' },
      { element: radioB, label: 'Not Authorized', value: 'Not Authorized' }
    ]
  };

  // Profile fact says "Authorized" (Option A), but candidate manually chose Option B
  const plan = {
    field,
    value: 'Authorized',
    factKey: 'work_authorized',
    status: 'supported'
  };

  const report = await writer.applyFill([plan], { isCurrent: () => true });

  assert.ok(writer.userEditedElements?.has(radioA), 'Radio A in same group must be tracked in userEditedElements');
  assert.ok(writer.userEditedElements?.has(radioB), 'Radio B in same group must be tracked in userEditedElements');
  assert.equal(radioB.checked, true, 'User selected Option B must remain checked');
  assert.equal(radioA.checked, false, 'Option A must not overwrite user choice');
  assert.equal(report.filled.length, 0);
  assert.equal(report.unverified[0].status, 'preserved_user_value');
  assert.equal(report.unverified[0].actual, 'Not Authorized');
});

test('fillCombo searches document.body portal listbox when opened via pointerdown and selects option', async () => {
  const combo = new MockNode('DIV', {
    role: 'combobox',
    'aria-haspopup': 'listbox',
    'aria-expanded': 'false'
  });
  const trigger = new MockNode('BUTTON', { 'data-slot': 'select-trigger' });
  const display = new MockNode('SPAN', { 'data-slot': 'select-value' });
  combo.appendChild(trigger);
  combo.appendChild(display);
  mockDoc.body.appendChild(combo);

  const portal = new MockNode('DIV', { 'data-radix-popper-content-wrapper': '' });
  const opt1 = new MockNode('DIV', { role: 'option', 'data-value': 'us' }, 'United States');
  const opt2 = new MockNode('DIV', { role: 'option', 'data-value': 'ca' }, 'Canada');
  portal.appendChild(opt1);
  portal.appendChild(opt2);

  trigger.addEventListener('click', () => {
    combo.setAttribute('aria-expanded', 'true');
    mockDoc.body.appendChild(portal);
  });

  opt1.addEventListener('click', () => {
    display.textContent = 'United States';
    opt1.setAttribute('aria-selected', 'true');
    combo.setAttribute('aria-expanded', 'false');
    portal.remove();
  });

  const field = {
    key: 'field:country',
    label: 'Country',
    kind: 'combobox',
    element: combo
  };

  const res = await writer.fillCombo(field, 'United States', () => true);
  assert.ok(res, 'fillCombo must succeed');
  assert.equal(res.expected, 'United States');
  assert.ok(trigger.eventLog.includes('click') || trigger.eventLog.includes('pointerdown'), 'Trigger opened via pointer/click');
  assert.ok(opt1.eventLog.includes('click'), 'Portal option must be clicked');
  assert.equal(display.textContent, 'United States');
  assert.equal(portal.parentElement, null, 'Portal popover must be closed');
});

test('fillCombo uses type-to-filter fallback when initial open shows no matching option', async () => {
  const combo = new MockNode('DIV', {
    role: 'combobox',
    'aria-haspopup': 'listbox',
    'aria-expanded': 'false'
  });
  const trigger = new MockNode('BUTTON', { 'data-slot': 'select-trigger' });
  const display = new MockNode('SPAN', { 'data-slot': 'select-value' });
  combo.appendChild(trigger);
  combo.appendChild(display);
  mockDoc.body.appendChild(combo);

  const listbox = new MockNode('DIV', { role: 'listbox' });
  const searchInput = new MockInputElement({ type: 'text', role: 'searchbox', class: 'select2-search__field' });
  listbox.appendChild(searchInput);

  const opt1 = new MockNode('DIV', { role: 'option', 'data-value': 'design' }, 'Product Design');
  const opt2 = new MockNode('DIV', { role: 'option', 'data-value': 'mkt' }, 'Marketing');
  listbox.appendChild(opt1);
  listbox.appendChild(opt2);

  let searchTypedValue = '';
  const optSWE = new MockNode('DIV', { role: 'option', 'data-value': 'swe' }, 'Software Engineer');

  searchInput.addEventListener('input', () => {
    searchTypedValue = searchInput.value;
    if (searchInput.value.toLowerCase().includes('software')) {
      // Async typeahead settling
      setTimeout(() => {
        listbox.appendChild(optSWE);
      }, 50);
    }
  });

  optSWE.addEventListener('click', () => {
    display.textContent = 'Software Engineer';
    optSWE.setAttribute('aria-selected', 'true');
    combo.setAttribute('aria-expanded', 'false');
    listbox.remove();
  });

  trigger.addEventListener('click', () => {
    combo.setAttribute('aria-expanded', 'true');
    mockDoc.body.appendChild(listbox);
  });

  const field = {
    key: 'field:job_title',
    label: 'Job Title',
    kind: 'combobox',
    element: combo
  };

  const res = await writer.fillCombo(field, 'Software Engineer', () => true);
  assert.ok(res, 'fillCombo must succeed with type-to-filter fallback');
  assert.equal(res.expected, 'Software Engineer');
  assert.equal(searchTypedValue, 'Software Engineer', 'Search input must receive query');
  assert.ok(optSWE.eventLog.includes('click'), 'Filtered option must be clicked');
  assert.equal(display.textContent, 'Software Engineer');
});

test('cascading dropdowns populate sequentially (Country -> State -> City) with option settling wait', async () => {
  // Country combobox
  const countryCombo = new MockNode('DIV', { role: 'combobox', 'aria-haspopup': 'listbox', 'aria-expanded': 'false' });
  const countryTrigger = new MockNode('BUTTON', { 'data-slot': 'select-trigger' });
  const countryDisplay = new MockNode('SPAN', { 'data-slot': 'select-value' });
  countryCombo.appendChild(countryTrigger);
  countryCombo.appendChild(countryDisplay);
  mockDoc.body.appendChild(countryCombo);

  const countryListbox = new MockNode('DIV', { role: 'listbox' });
  const countryOptUS = new MockNode('DIV', { role: 'option', 'data-value': 'us' }, 'United States');
  countryListbox.appendChild(countryOptUS);

  // State combobox (initially empty options)
  const stateCombo = new MockNode('DIV', { role: 'combobox', 'aria-haspopup': 'listbox', 'aria-expanded': 'false' });
  const stateTrigger = new MockNode('BUTTON', { 'data-slot': 'select-trigger' });
  const stateDisplay = new MockNode('SPAN', { 'data-slot': 'select-value' });
  stateCombo.appendChild(stateTrigger);
  stateCombo.appendChild(stateDisplay);
  mockDoc.body.appendChild(stateCombo);

  const stateListbox = new MockNode('DIV', { role: 'listbox' });
  const stateOptCA = new MockNode('DIV', { role: 'option', 'data-value': 'ca' }, 'California');

  let countryFilledFirst = false;
  let countrySelectedTime = 0;
  let stateOptionsPopulatedTime = 0;

  countryTrigger.addEventListener('click', () => {
    countryCombo.setAttribute('aria-expanded', 'true');
    mockDoc.body.appendChild(countryListbox);
  });

  countryOptUS.addEventListener('click', () => {
    countryDisplay.textContent = 'United States';
    countryOptUS.setAttribute('aria-selected', 'true');
    countryCombo.setAttribute('aria-expanded', 'false');
    countryListbox.remove();
    countryFilledFirst = true;
    countrySelectedTime = Date.now();

    // Dependent state options populate asynchronously after country selection
    setTimeout(() => {
      stateListbox.appendChild(stateOptCA);
      stateOptionsPopulatedTime = Date.now();
    }, 60);
  });

  stateTrigger.addEventListener('click', () => {
    stateCombo.setAttribute('aria-expanded', 'true');
    mockDoc.body.appendChild(stateListbox);
  });

  stateOptCA.addEventListener('click', () => {
    stateDisplay.textContent = 'California';
    stateOptCA.setAttribute('aria-selected', 'true');
    stateCombo.setAttribute('aria-expanded', 'false');
    stateListbox.remove();
  });

  const stateField = {
    key: 'field:state',
    label: 'State / Province',
    kind: 'combobox',
    element: stateCombo
  };

  const countryField = {
    key: 'field:country',
    label: 'Country',
    kind: 'combobox',
    element: countryCombo
  };

  // State is placed before Country in input array to test cascading reordering
  const plans = [
    { field: stateField, value: 'California', status: 'supported' },
    { field: countryField, value: 'United States', status: 'supported' }
  ];

  const report = await writer.applyFill(plans, { isCurrent: () => true });

  assert.equal(countryFilledFirst, true, 'Country must be filled before State');
  assert.ok(stateOptionsPopulatedTime >= countrySelectedTime, 'State options populated after country selection');
  assert.ok(report.filled.some(r => r.field.key === 'field:country'), 'Country must be in filled');
  assert.ok(report.filled.some(r => r.field.key === 'field:state'), 'State must be in filled after settling');
  assert.equal(countryDisplay.textContent, 'United States');
  assert.equal(stateDisplay.textContent, 'California');
});

test('closeCombo only dispatches Escape if listbox is still open, never closing employer modal', () => {
  const modal = new MockNode('DIV', { class: 'modal-dialog', role: 'dialog' });
  mockDoc.body.appendChild(modal);

  let modalEscapeReceived = false;
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') modalEscapeReceived = true;
  });

  // Case 1: Closed combobox (aria-expanded="false", listbox already closed)
  const closedCombo = new MockNode('DIV', { role: 'combobox', 'aria-expanded': 'false' });
  modal.appendChild(closedCombo);

  let closedComboEscape = false;
  closedCombo.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closedComboEscape = true;
  });

  writer.closeCombo(closedCombo);

  assert.equal(closedComboEscape, false, 'Must NOT dispatch Escape when combobox is already closed');
  assert.equal(modalEscapeReceived, false, 'Employer modal dialog must NEVER receive Escape from closed combobox');

  // Case 2: Open combobox (aria-expanded="true")
  const openCombo = new MockNode('DIV', { role: 'combobox', 'aria-expanded': 'true' });
  modal.appendChild(openCombo);

  let openComboEscape = false;
  openCombo.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') openComboEscape = true;
  });

  writer.closeCombo(openCombo);

  assert.equal(openComboEscape, true, 'MUST dispatch Escape when combobox is still open');
});

test('readChoices dispatches ArrowDown fallback when initial trigger click renders no options and returns options that appear afterward', async () => {
  const control = new MockNode('DIV', { class: 'select__control' });
  const combo = new MockNode('DIV', { role: 'combobox', 'aria-haspopup': 'listbox', 'aria-expanded': 'false' });
  const trigger = new MockNode('BUTTON', { 'data-slot': 'select-trigger' });
  combo.appendChild(trigger);
  control.appendChild(combo);
  mockDoc.body.appendChild(control);

  const listbox = new MockNode('DIV', { role: 'listbox' });
  const optYes = new MockNode('DIV', { role: 'option', 'data-value': 'yes' }, 'Yes');
  const optNo = new MockNode('DIV', { role: 'option', 'data-value': 'no' }, 'No');

  let controlClicked = false;
  let arrowDownCount = 0;

  control.addEventListener('click', () => {
    controlClicked = true;
  });

  // Trigger click alone does not render options; ArrowDown opens the listbox asynchronously
  trigger.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      arrowDownCount += 1;
      setTimeout(() => {
        combo.setAttribute('aria-expanded', 'true');
        listbox.appendChild(optYes);
        listbox.appendChild(optNo);
        mockDoc.body.appendChild(listbox);
      }, 40);
    } else if (e.key === 'Escape') {
      combo.setAttribute('aria-expanded', 'false');
      listbox.remove();
    }
  });

  const field = {
    key: 'field:arrow-combo',
    label: 'Authorized in US',
    kind: 'combobox',
    options: [],
    element: combo,
  };

  const choices = await writer.readChoices(field, () => true);

  assert.equal(controlClicked, true, 'readChoices should also click .select__control fallback');
  assert.equal(arrowDownCount, 1, 'readChoices must dispatch ArrowDown fallback when trigger click renders no options');
  assert.deepEqual(choices.map(c => c.label), ['Yes', 'No']);
  assert.equal(combo.getAttribute('aria-expanded'), 'false', 'readChoices must close combobox in finally');
});


test('verification rejects uncommitted dropdowns, different identifiers and partial selections', () => {
  const combo = new MockNode('INPUT', { role: 'combobox', value: 'Authorized' });
  const identifier = new MockNode('INPUT', { value: 'INV-1234567' });
  const rows = [
    { field: { element: combo, kind: 'combobox' }, value: 'Authorized', _write: { option: { isConnected: false } } },
    { field: { element: identifier, kind: 'text' }, value: 'ABC-1234567' },
    { field: { element: new MockNode('DIV'), kind: 'multi-combobox' }, value: ['Java', 'SQL'],
      _write: { partial: true } },
  ].map(plan => ({ status: 'supported', ...plan }));
  const report = writer.verifyWrites(rows);
  assert.equal(report.filled.length, 0);
  assert.deepEqual(report.unverified.map(item => item.status), ['unverified', 'unverified', 'partial']);
});

test('a numeric placeholder is unanswered and an opposite option is not selected', () => {
  const select = new MockNode('SELECT');
  select.selectedIndex = 0;
  select.options = [{ text: 'Please Select', value: '0' }];
  const field = { element: select, kind: 'select', options: [] };
  assert.equal(writer.isAnswered(field), false);
  assert.equal(writer.setChoice({ ...field, options: [{ label: 'Not authorized', value: '0' }] }, 'Authorized'), null);
});
