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
  }
}

class MockNode {
  constructor(tagName = 'DIV') {
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map();
    this.children = [];
    this.parentElement = null;
    this.listeners = new Map();
    this.textContent = '';
    this.isConnected = true;
    this.eventLog = [];
    this._value = '';
    this.disabled = false;
    this.readOnly = false;
  }

  getAttribute(name) {
    return this.attributes.has(name.toLowerCase()) ? this.attributes.get(name.toLowerCase()) : null;
  }
  setAttribute(name, val) {
    this.attributes.set(name.toLowerCase(), String(val));
  }
  hasAttribute(name) {
    return this.attributes.has(name.toLowerCase());
  }
  removeAttribute(name) {
    this.attributes.delete(name.toLowerCase());
  }

  get id() { return this.getAttribute('id') || ''; }
  set id(v) { this.setAttribute('id', v); }
  get name() { return this.getAttribute('name') || ''; }
  set name(v) { this.setAttribute('name', v); }
  get type() { return this.getAttribute('type') || ''; }
  set type(v) { this.setAttribute('type', v); }

  get value() { return this._value; }
  set value(v) { this._value = String(v); }

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
    this.dispatchEvent(new MockPointerEvent('pointerdown', { bubbles: true }));
    this.dispatchEvent(new MockMouseEvent('mousedown', { bubbles: true }));
    this.dispatchEvent(new MockMouseEvent('mouseup', { bubbles: true }));
    this.dispatchEvent(new MockMouseEvent('click', { bubbles: true }));
  }

  focus() { this.eventLog.push('focus'); }

  getRootNode() {
    let curr = this;
    while (curr.parentElement) curr = curr.parentElement;
    return curr;
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

    // Handle space-separated descendant selectors by taking the target piece
    const parts = sel.split(/\s+/);
    if (parts.length > 1) {
      sel = parts[parts.length - 1];
    }
    // Strip trailing ' i' or ' s' inside attribute selector
    sel = sel.replace(/\s+[is]\]$/, ']');

    // Tag check
    const tagMatch = sel.match(/^([a-z0-9_-]+)/i);
    let tag = '';
    if (tagMatch && !sel.startsWith('.') && !sel.startsWith('[')) {
      tag = tagMatch[1];
      sel = sel.slice(tag.length);
    }
    if (tag && this.tagName.toLowerCase() !== tag.toLowerCase()) return false;
    if (!sel) return true;

    // Class check
    if (sel.startsWith('.')) {
      const cls = sel.slice(1).split(/[\.\[]/)[0].toLowerCase();
      const hasCls = (this.getAttribute('class') || '').split(/\s+/).some(c => c.toLowerCase() === cls);
      if (!hasCls) return false;
    }

    // Attribute check
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

  get ownerDocument() {
    return globalThis.document;
  }
}

class MockInputElement extends MockNode {
  constructor() {
    super('INPUT');
    this._checked = false;
  }
  get checked() { return this._checked; }
  set checked(v) { this._checked = Boolean(v); }
}

class MockSelectElement extends MockNode {
  constructor() {
    super('SELECT');
    this.options = [];
    this.selectedIndex = -1;
  }
}

// Attach to globalThis for extension scripts
globalThis.Event = MockEvent;
globalThis.PointerEvent = MockPointerEvent;
globalThis.MouseEvent = MockMouseEvent;
globalThis.KeyboardEvent = MockKeyboardEvent;
globalThis.HTMLInputElement = MockInputElement;
globalThis.HTMLSelectElement = MockSelectElement;
globalThis.HTMLTextAreaElement = MockNode;

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

// Load core files
await import('../jobright_extension/core/field-mapping.js');
await import('../jobright_extension/core/form-discovery.js');
await import('../jobright_extension/core/field-writer.js');

const mapping = globalThis.NextkinFieldMapping;
const discovery = globalThis.NextkinForms;
const writer = globalThis.NextkinFieldWriter;

test.beforeEach(() => {
  mockDoc.body.children = [];
});

test('Part 1: Hardened Checkboxes - native checkbox with prototype setter & events', () => {
  const input = new MockInputElement();
  input.type = 'checkbox';
  mockDoc.body.appendChild(input);

  assert.equal(input.checked, false);
  const ok = writer.setCheckbox(input, true);
  assert.equal(ok, true);
  assert.equal(input.checked, true);
  assert.ok(input.eventLog.includes('pointerdown'), 'Dispatched pointerdown');
  assert.ok(input.eventLog.includes('mousedown'), 'Dispatched mousedown');
  assert.ok(input.eventLog.includes('click'), 'Dispatched click');
  assert.ok(input.eventLog.includes('input'), 'Dispatched input');
  assert.ok(input.eventLog.includes('change'), 'Dispatched change');
});

test('Part 1: Hardened Checkboxes - ARIA / custom checkboxes and data-state', () => {
  const custom = new MockNode('DIV');
  custom.setAttribute('role', 'checkbox');
  custom.setAttribute('aria-checked', 'false');
  custom.setAttribute('data-state', 'unchecked');
  mockDoc.body.appendChild(custom);

  assert.equal(writer.read({ kind: 'checkbox', element: custom }), false);
  const ok = writer.setCheckbox(custom, true);
  assert.equal(ok, true);
  assert.equal(custom.getAttribute('aria-checked'), 'true');
  assert.equal(custom.getAttribute('data-state'), 'checked');
  assert.equal(writer.read({ kind: 'checkbox', element: custom }), true);
});

test('Part 1: Hardened Checkboxes - hidden input with label[for="..."]', () => {
  const hiddenInput = new MockInputElement();
  hiddenInput.type = 'checkbox';
  hiddenInput.id = 'terms-agree';
  hiddenInput.getClientRects = () => []; // hidden

  const label = new MockNode('LABEL');
  label.setAttribute('for', 'terms-agree');
  label.getClientRects = () => [{ width: 50, height: 20 }];

  mockDoc.body.appendChild(hiddenInput);
  mockDoc.body.appendChild(label);

  const ok = writer.setCheckbox(hiddenInput, true);
  assert.equal(ok, true);
  assert.equal(hiddenInput.checked, true);
  assert.ok(label.eventLog.includes('click'), 'Target label received click');
});

test('Part 2: Hardened Radios - standard radio and normalization of target values', () => {
  const radioYes = new MockInputElement();
  radioYes.type = 'radio';
  radioYes.name = 'sponsorship';
  radioYes.value = 'Yes';

  const radioNo = new MockInputElement();
  radioNo.type = 'radio';
  radioNo.name = 'sponsorship';
  radioNo.value = 'No';

  mockDoc.body.appendChild(radioYes);
  mockDoc.body.appendChild(radioNo);

  const field = {
    kind: 'radio',
    options: [
      { label: 'Yes', value: 'Yes', element: radioYes },
      { label: 'No', value: 'No', element: radioNo }
    ]
  };

  // Affirmative normalization ('1' -> true -> 'Yes')
  const res1 = writer.setChoice(field, '1');
  assert.equal(res1.expected, 'Yes');
  assert.equal(radioYes.checked, true);
  assert.ok(radioYes.eventLog.includes('click'));
  assert.ok(radioYes.eventLog.includes('change'));

  // Negative normalization ('0' -> false -> 'No')
  const res2 = writer.setChoice(field, '0');
  assert.equal(res2.expected, 'No');
  assert.equal(radioNo.checked, true);
});

test('Part 2: Hardened Radios - Button-based choice groups (Ashby/Greenhouse/Lever Yes/No)', () => {
  const group = new MockNode('DIV');
  group.setAttribute('role', 'radiogroup');

  const btnYes = new MockNode('BUTTON');
  btnYes.textContent = 'Yes';
  btnYes.setAttribute('data-option', 'true');

  const btnNo = new MockNode('BUTTON');
  btnNo.textContent = 'No';
  btnNo.setAttribute('data-option', 'false');

  group.appendChild(btnYes);
  group.appendChild(btnNo);
  mockDoc.body.appendChild(group);

  const field = {
    kind: 'choice',
    options: [
      { label: 'Yes', value: 'true', element: btnYes },
      { label: 'No', value: 'false', element: btnNo }
    ]
  };

  const res = writer.setChoice(field, true);
  assert.equal(res.expected, 'Yes');
  assert.equal(btnYes.getAttribute('aria-checked'), 'true');
  assert.equal(btnYes.getAttribute('data-state'), 'checked');
  assert.ok(btnYes.eventLog.includes('click'));
});

test('Part 3: Dropdowns - Native <select> with prototype setter, selectedIndex & events', () => {
  const select = new MockSelectElement();
  const opt1 = new MockNode('OPTION');
  opt1.value = 'US';
  opt1.textContent = 'United States';
  opt1.index = 0;

  const opt2 = new MockNode('OPTION');
  opt2.value = 'CA';
  opt2.textContent = 'Canada';
  opt2.index = 1;

  select.options = [opt1, opt2];
  mockDoc.body.appendChild(select);

  const field = {
    kind: 'select',
    element: select,
    options: [
      { label: 'United States', value: 'US', element: opt1 },
      { label: 'Canada', value: 'CA', element: opt2 }
    ]
  };

  const res = writer.setChoice(field, 'Canada');
  assert.equal(res.expected, 'Canada');
  assert.equal(select.value, 'CA');
  assert.equal(select.selectedIndex, 1);
  assert.ok(select.eventLog.includes('change'));
  assert.ok(select.eventLog.includes('input'));
});

test('Part 3: Custom Comboboxes - async option await, search input typing, Escape fallback', async () => {
  const combo = new MockNode('DIV');
  combo.setAttribute('role', 'combobox');

  const trigger = new MockNode('BUTTON');
  trigger.setAttribute('class', 'select-trigger');
  combo.appendChild(trigger);

  const listbox = new MockNode('UL');
  listbox.setAttribute('role', 'listbox');
  listbox.getClientRects = () => [{ width: 200, height: 100 }];

  const optA = new MockNode('LI');
  optA.setAttribute('role', 'option');
  optA.textContent = 'Engineer';
  optA.setAttribute('data-value', 'eng');

  const optB = new MockNode('LI');
  optB.setAttribute('role', 'option');
  optB.textContent = 'Product Manager';
  optB.setAttribute('data-value', 'pm');

  listbox.appendChild(optA);
  listbox.appendChild(optB);

  // Trigger opens listbox
  trigger.addEventListener('click', () => {
    mockDoc.body.appendChild(listbox);
  });

  mockDoc.body.appendChild(combo);

  const field = {
    kind: 'combobox',
    element: combo
  };

  const res = await writer.fillCombo(field, 'Product Manager', () => true);
  assert.ok(res);
  assert.equal(res.expected, 'Product Manager');
  assert.ok(optB.eventLog.includes('click'), 'Option clicked');
});

test('Part 4: Multi-Step / Wizard Navigation - Step discovery, field detection, value preservation', () => {
  // Step 1: Name field
  const input1 = new MockInputElement();
  input1.id = 'applicant-name';
  input1.value = 'Alex Morgan';
  mockDoc.body.appendChild(input1);

  const fieldsStep1 = [
    { key: 'field:0:applicant-name', label: 'Applicant Name', kind: 'text', element: input1 }
  ];

  // Record preserved values
  writer.recordPreservedValues(fieldsStep1);
  assert.equal(writer.getPreservedValue(fieldsStep1[0]), 'Alex Morgan');

  // Next button
  const nextBtn = new MockNode('BUTTON');
  nextBtn.textContent = 'Continue to Next Step';
  mockDoc.body.appendChild(nextBtn);

  const nav = discovery.findStepNavigation(mockDoc.body);
  assert.ok(nav.nextButton, 'Next button found');
  assert.equal(nav.nextButton.textContent, 'Continue to Next Step');

  // Advance step
  const advanced = writer.advanceStep(mockDoc.body);
  assert.equal(advanced, true);
  assert.ok(nextBtn.eventLog.includes('click'));

  // Step 2 revealed: Email field
  const input2 = new MockInputElement();
  input2.id = 'applicant-email';
  mockDoc.body.appendChild(input2);

  const fieldsStep2 = [
    ...fieldsStep1,
    { key: 'field:1:applicant-email', label: 'Email', kind: 'text', element: input2 }
  ];

  const newFields = discovery.detectNewFields(fieldsStep1, fieldsStep2);
  assert.equal(newFields.length, 1);
  assert.equal(newFields[0].key, 'field:1:applicant-email');

  // Preserved value from step 1 is still intact
  assert.equal(writer.getPreservedValue(fieldsStep1[0]), 'Alex Morgan');
});

test('Part 3: Custom Comboboxes - Search input typing & Escape fallback', async () => {
  const combo = new MockNode('DIV');
  combo.setAttribute('role', 'combobox');

  const searchInput = new MockInputElement();
  searchInput.setAttribute('role', 'searchbox');
  combo.appendChild(searchInput);

  mockDoc.body.appendChild(combo);

  const field = {
    kind: 'combobox',
    element: combo
  };

  // Searching for an option that does not exist should trigger search input typing and Escape fallback
  const res = await writer.fillCombo(field, 'Nonexistent Option', () => true);
  assert.equal(res, null);
  assert.ok(searchInput.eventLog.includes('keydown'), 'Escape keydown was dispatched');
  assert.ok(searchInput.eventLog.includes('keyup'), 'Escape keyup was dispatched');
});

test('Part 4: Multi-Step / Wizard Navigation - applyFill preserves previous values on step 2', async () => {
  // Step 1 field
  const input1 = new MockInputElement();
  input1.id = 'applicant-first-name';
  mockDoc.body.appendChild(input1);

  const plan1 = {
    field: { key: 'field:0:applicant-first-name', label: 'First Name', kind: 'text', element: input1 },
    value: 'Jordan',
    status: 'supported'
  };

  const session = { isCurrent: () => true };
  const receipts1 = await writer.applyFill([plan1], session);
  assert.equal(receipts1.length, 1);
  assert.equal(input1.value, 'Jordan');
  assert.equal(writer.getPreservedValue(plan1.field), 'Jordan');

  // Step 2 field revealed
  const input2 = new MockInputElement();
  input2.id = 'applicant-last-name';
  mockDoc.body.appendChild(input2);

  const plan2 = {
    field: { key: 'field:1:applicant-last-name', label: 'Last Name', kind: 'text', element: input2 },
    value: 'Bell',
    status: 'supported'
  };

  // Simulate re-running fill on both plans (step 1 already answered in DOM & preserved)
  const receipts2 = await writer.applyFill([plan1, plan2], session);
  // plan1 is skipped because input1 already has Jordan, plan2 is filled
  assert.equal(input1.value, 'Jordan');
  assert.equal(input2.value, 'Bell');
  assert.equal(receipts2.length, 2);
  assert.equal(writer.getPreservedValue(plan2.field), 'Bell');
});

