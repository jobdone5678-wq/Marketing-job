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

    // ID check
    if (sel.startsWith('#')) {
      const id = sel.slice(1).split(/[\.\[#]/)[0];
      if (this.id !== id) return false;
      sel = sel.slice(1 + id.length);
      if (!sel) return true;
    }

    // Class check
    if (sel.startsWith('.')) {
      const cls = sel.slice(1).split(/[\.\[]/)[0].toLowerCase();
      const hasCls = (this.getAttribute('class') || '').split(/\s+/).some(c => c.toLowerCase() === cls);
      if (!hasCls) return false;
      sel = sel.slice(1 + cls.length);
      if (!sel) return true;
    }

    // Attribute check
    const attrMatch = sel.match(/\[([a-z0-9_-]+)(?:([*^$]?=)(?:"|')?([^"'\]]*)(?:"|')?)?\]/i);
    if (attrMatch) {
      const [, attr, op, val] = attrMatch;
      const attrVal = this.getAttribute(attr);
      if (attrVal === null) return false;
      if (!op) return true;
      if (op === '=') return (attrVal || '').toLowerCase() === (val || '').toLowerCase();
      if (op === '*=') return (attrVal || '').toLowerCase().includes((val || '').toLowerCase());
      if (op === '^=') return (attrVal || '').toLowerCase().startsWith((val || '').toLowerCase());
      if (op === '$=') return (attrVal || '').toLowerCase().endsWith((val || '').toLowerCase());
    } else if (sel.startsWith('[')) {
      return false;
    }

    return !sel;
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

const windowListeners = new Map();
if (!globalThis.addEventListener) {
  globalThis.addEventListener = (type, fn) => {
    if (!windowListeners.has(type)) windowListeners.set(type, []);
    windowListeners.get(type).push(fn);
  };
  globalThis.removeEventListener = (type, fn) => {
    if (windowListeners.has(type)) {
      windowListeners.set(type, windowListeners.get(type).filter(f => f !== fn));
    }
  };
  globalThis.dispatchEvent = evt => {
    const handlers = windowListeners.get(evt.type) || [];
    for (const h of handlers) h(evt);
    return true;
  };
}
if (!globalThis.location) {
  globalThis.location = { href: 'https://example.com/apply' };
}
mockDoc.defaultView.location = globalThis.location;

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
  custom.addEventListener('click', () => {
    custom.setAttribute('aria-checked', 'true');
    custom.setAttribute('data-state', 'checked');
  });
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
  btnYes.addEventListener('click', () => {
    btnYes.setAttribute('aria-checked', 'true');
    btnYes.setAttribute('data-state', 'checked');
  });

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

test('A portal that ignores a custom checkbox click is not reported as filled', async () => {
  const control = new MockNode('DIV');
  control.setAttribute('role', 'checkbox');
  control.setAttribute('aria-checked', 'false');
  mockDoc.body.appendChild(control);
  const field = { label: 'Open to relocation', kind: 'checkbox', element: control };
  const receipts = await writer.applyFill([{ field, status: 'supported', factKey: 'open_to_relocation', value: true }], { isCurrent: () => true });
  assert.equal(receipts.length, 0);
  assert.equal(control.getAttribute('aria-checked'), 'false');
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
    combo.appendChild(listbox);
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

test('Part 5: React rerender handling - leaves replaced controls for rediscovery', async () => {
  const oldInput = new MockInputElement();
  oldInput.id = 'applicant-phone';
  oldInput.name = 'phone';
  mockDoc.body.appendChild(oldInput);

  const plan = {
    field: { key: 'field:phone', label: 'Phone Number', kind: 'text', element: oldInput },
    value: '555-0199',
    status: 'supported'
  };

  // Simulate React unmounting oldInput and mounting a fresh input before filling
  oldInput.isConnected = false;
  const freshInput = new MockInputElement();
  freshInput.id = 'applicant-phone';
  freshInput.name = 'phone';
  mockDoc.body.appendChild(freshInput);

  const session = { isCurrent: () => true };
  const receipts = await writer.applyFill([plan], session);

  assert.equal(receipts.length, 0);
  assert.equal(receipts.unverified.length, 1);
  assert.equal(freshInput.value, '');
});

test('Part 6: Dependent controls (Country -> State) - handles async enablement and option population', async () => {
  // Country select
  const countrySelect = new MockSelectElement();
  countrySelect.id = 'country-select';
  const optUS = new MockNode('OPTION');
  optUS.value = 'US';
  optUS.textContent = 'United States';
  optUS.index = 0;
  countrySelect.options = [optUS];
  mockDoc.body.appendChild(countrySelect);

  // State select starts disabled with no options (dependent on Country)
  const stateSelect = new MockSelectElement();
  stateSelect.id = 'state-select';
  stateSelect.disabled = true;
  stateSelect.options = [];
  mockDoc.body.appendChild(stateSelect);

  // When Country receives change event, asynchronously enable State and populate options after 40ms
  countrySelect.addEventListener('change', () => {
    setTimeout(() => {
      const optCA = new MockNode('OPTION');
      optCA.value = 'CA';
      optCA.textContent = 'California';
      optCA.index = 0;
      stateSelect.options = [optCA];
      stateSelect.disabled = false;
    }, 40);
  });

  const countryPlan = {
    field: {
      key: 'field:country',
      label: 'Country',
      kind: 'select',
      element: countrySelect,
      options: [{ label: 'United States', value: 'US', element: optUS }]
    },
    value: 'United States',
    status: 'supported'
  };

  const statePlan = {
    field: {
      key: 'field:state',
      label: 'State',
      kind: 'select',
      element: stateSelect,
      options: [{ label: 'California', value: 'CA', element: null }]
    },
    value: 'California',
    status: 'supported'
  };

  const session = { isCurrent: () => true };
  const receipts = await writer.applyFill([countryPlan, statePlan], session);

  assert.equal(receipts.length, 2);
  assert.equal(countrySelect.value, 'US');
  assert.equal(stateSelect.value, 'CA');
});

test('Part 7: Complex ATS & Workday Field Mapping Matrix (Relocation, Phone Country Code, Address Hierarchy, Zip Sanitization)', async () => {
  const candidate = {
    full_name: 'Bhargav Reddy',
    phone: '(512) 555-0187',
    current_city: 'Austin',
    current_state: 'TX',
    full_address: 'Austin, TX',
    authorized_in_usa: true,
    confirmed_facts: {
      phone: '(512) 555-0187',
      country: 'United States',
      zip_code: '78701',
      open_to_relocation: true
    }
  };

  const fields = [
    {
      key: 'f1',
      label: 'Are you open to relocation?',
      kind: 'select',
      options: [
        { label: '— Make a Selection —', value: '' },
        { label: 'Yes', value: 'Yes' },
        { label: 'No', value: 'No' }
      ]
    },
    {
      key: 'f2',
      label: 'Number (Please include "+country code" before your number, e.g.+8612345678)',
      kind: 'text',
      placeholder: 'e.g. +1 555-0100'
    },
    {
      key: 'f3',
      label: 'Country of Residence*',
      hint: 'addressSection_countryRegion',
      kind: 'select',
      options: [
        { label: '— Make a Selection —', value: '' },
        { label: 'United States of America', value: 'USA' },
        { label: 'Canada', value: 'CAN' }
      ]
    },
    {
      key: 'f4',
      label: 'State/Province',
      hint: 'addressSection_countrySubdivisionCode',
      kind: 'select',
      options: [
        { label: 'Please select a country', value: '' },
        { label: 'Texas', value: 'TX' }
      ]
    },
    {
      key: 'f5',
      label: 'Zip/Postal Code*',
      hint: 'addressSection_postalCode',
      kind: 'text'
    }
  ];

  const plans = mapping.planFill(fields, candidate);
  assert.equal(plans.length, 5);

  // 1. Relocation dropdown
  assert.equal(plans[0].factKey, 'open_to_relocation');
  assert.equal(plans[0].status, 'supported');
  assert.equal(plans[0].value, 'Yes');

  // 2. Phone with international +country code
  assert.equal(plans[1].factKey, 'phone');
  assert.equal(plans[1].status, 'supported');
  assert.equal(plans[1].value, '+15125550187');

  // 3. Country of residence dropdown
  assert.equal(plans[2].factKey, 'country');
  assert.equal(plans[2].status, 'supported');
  assert.equal(plans[2].value, 'United States of America');

  // 4. State/Province dropdown
  assert.equal(plans[3].factKey, 'current_state');
  assert.equal(plans[3].status, 'supported');
  assert.equal(plans[3].value, 'Texas');

  // 5. Zip/Postal Code (must be 5 digits, never polluted with "Austin, TX")
  assert.equal(plans[4].factKey, 'zip_code');
  assert.equal(plans[4].status, 'supported');
  assert.equal(plans[4].value, '78701');
  assert.notEqual(plans[4].value, 'Austin, TX');
});

test('setCheckbox toggles an unchecked React controlled checkbox to true without double-toggling', () => {
  // Direct controlled React checkbox: click handler flips checked state
  const input = new MockInputElement();
  input.type = 'checkbox';
  input.checked = false;
  let clickCount = 0;
  input.addEventListener('click', () => {
    clickCount++;
    input.checked = !input.checked;
  });
  mockDoc.body.appendChild(input);

  const ok = writer.setCheckbox(input, true);
  assert.equal(ok, true);
  assert.equal(input.checked, true);
  assert.equal(clickCount, 1, 'Expected exactly one click pass without double-toggling');

  // Label-wrapped / associated controlled checkbox
  const label = new MockNode('LABEL');
  label.setAttribute('for', 'react-controlled-cb');
  const input2 = new MockInputElement();
  input2.id = 'react-controlled-cb';
  input2.type = 'checkbox';
  input2.checked = false;
  input2.getClientRects = () => []; // hidden input, label is target

  let labelClicks = 0;
  let inputClicks = 0;
  label.addEventListener('click', () => {
    labelClicks++;
    input2.checked = !input2.checked;
  });
  input2.addEventListener('click', () => {
    inputClicks++;
    input2.checked = !input2.checked;
  });
  mockDoc.body.appendChild(input2);
  mockDoc.body.appendChild(label);

  const ok2 = writer.setCheckbox(input2, true);
  assert.equal(ok2, true);
  assert.equal(input2.checked, true);
  assert.equal(labelClicks, 1, 'Target label should receive one click');
  assert.equal(inputClicks, 0, 'Input element should not receive an extraneous secondary click');

  // Label target where click does not synchronously flip checked
  // In old code, this triggered a redundant secondary el.click() on input
  const label3 = new MockNode('LABEL');
  label3.setAttribute('for', 'react-async-cb');
  const input3 = new MockInputElement();
  input3.id = 'react-async-cb';
  input3.type = 'checkbox';
  input3.checked = false;
  input3.getClientRects = () => []; // hidden input, label is target

  let input3Clicks = 0;
  input3.addEventListener('click', () => {
    input3Clicks++;
    input3.checked = !input3.checked;
  });
  mockDoc.body.appendChild(input3);
  mockDoc.body.appendChild(label3);

  const ok3 = writer.setCheckbox(input3, true);
  assert.equal(ok3, true);
  assert.equal(input3.checked, true);
  assert.equal(input3Clicks, 0, 'Input element should not receive secondary click when label target did not toggle');
});

test('setNativeValue resets React _valueTracker on text input, textarea, and select controls', () => {
  // 1. Text input
  const input = new MockInputElement();
  input.type = 'text';
  input.value = 'old';
  let inputTrackerVal = null;
  input._valueTracker = {
    setValue(v) {
      inputTrackerVal = v;
    }
  };
  mockDoc.body.appendChild(input);
  writer.setNativeValue(input, 'new');
  assert.equal(input.value, 'new');
  assert.equal(inputTrackerVal, 'old', 'Expected input _valueTracker.setValue to receive prevValue "old"');

  // 2. Textarea
  const textarea = new MockNode('TEXTAREA');
  textarea.value = 'old';
  let textareaTrackerVal = null;
  textarea._valueTracker = {
    setValue(v) {
      textareaTrackerVal = v;
    }
  };
  mockDoc.body.appendChild(textarea);
  writer.setNativeValue(textarea, 'new');
  assert.equal(textarea.value, 'new');
  assert.equal(textareaTrackerVal, 'old', 'Expected textarea _valueTracker.setValue to receive prevValue "old"');

  // 3. Select
  const select = new MockSelectElement();
  select.value = 'old';
  let selectTrackerVal = null;
  select._valueTracker = {
    setValue(v) {
      selectTrackerVal = v;
    }
  };
  mockDoc.body.appendChild(select);
  writer.setNativeValue(select, 'new');
  assert.equal(select.value, 'new');
  assert.equal(selectTrackerVal, 'old', 'Expected select _valueTracker.setValue to receive prevValue "old"');
});

test('setCheckbox resets React _valueTracker with String(!desired)', () => {
  const input = new MockInputElement();
  input.type = 'checkbox';
  input.checked = false;
  let trackerVal = null;
  input._valueTracker = {
    setValue(v) {
      trackerVal = v;
    }
  };
  mockDoc.body.appendChild(input);

  // Click does not toggle (MockInputElement has no click handler to flip checked)
  // Fallback descriptor setter should be invoked and reset _valueTracker with String(!true) => 'false'
  const ok = writer.setCheckbox(input, true);
  assert.equal(ok, true);
  assert.equal(input.checked, true);
  assert.equal(trackerVal, 'false', 'Expected tracker value to be reset to "false" when desired is true');

  // Now test toggling from true to false
  trackerVal = null;
  const ok2 = writer.setCheckbox(input, false);
  assert.equal(ok2, true);
  assert.equal(input.checked, false);
  assert.equal(trackerVal, 'true', 'Expected tracker value to be reset to "true" when desired is false');
});

test('Part 8: Visible Field Tracking - visually hidden native checkboxes and radios with visible label or wrapper', () => {
  // 1. Visually hidden checkbox with associated label[for] having rects
  const hiddenCb = new MockInputElement();
  hiddenCb.type = 'checkbox';
  hiddenCb.id = 'opt-in-cb';
  hiddenCb.getClientRects = () => []; // visually hidden

  const cbLabel = new MockNode('LABEL');
  cbLabel.setAttribute('for', 'opt-in-cb');
  cbLabel.getClientRects = () => [{ width: 120, height: 24 }];

  mockDoc.body.appendChild(hiddenCb);
  mockDoc.body.appendChild(cbLabel);

  assert.ok(discovery.visible, 'discovery.visible must be exposed on NextkinForms');
  assert.equal(discovery.visible(hiddenCb), true, 'Hidden checkbox with visible label[for] should be considered visible');

  // 2. Visually hidden radio with 0x0 rects wrapped inside custom-radio container
  const radioWrap = new MockNode('DIV');
  radioWrap.setAttribute('class', 'custom-radio');
  radioWrap.getClientRects = () => [{ width: 24, height: 24 }];

  const zeroRadio = new MockInputElement();
  zeroRadio.type = 'radio';
  zeroRadio.getClientRects = () => [{ width: 0, height: 0 }]; // 0x0 rects
  radioWrap.appendChild(zeroRadio);
  mockDoc.body.appendChild(radioWrap);

  assert.equal(discovery.visible(zeroRadio), true, '0x0 radio inside .custom-radio wrapper should be considered visible');

  // 3. Hidden text input wrapped in a label must NOT be treated as visible
  const hiddenText = new MockInputElement();
  hiddenText.type = 'text';
  hiddenText.getClientRects = () => [];
  const textLabel = new MockNode('LABEL');
  textLabel.getClientRects = () => [{ width: 100, height: 20 }];
  textLabel.appendChild(hiddenText);
  mockDoc.body.appendChild(textLabel);

  assert.equal(discovery.visible(hiddenText), false, 'Visually hidden text input should not be considered visible');

  // 4. Disabled checkbox with visible label must NOT be treated as visible
  const disabledCb = new MockInputElement();
  disabledCb.type = 'checkbox';
  disabledCb.disabled = true;
  disabledCb.id = 'disabled-cb';
  disabledCb.getClientRects = () => [];
  const disLabel = new MockNode('LABEL');
  disLabel.setAttribute('for', 'disabled-cb');
  disLabel.getClientRects = () => [{ width: 100, height: 20 }];
  mockDoc.body.appendChild(disabledCb);
  mockDoc.body.appendChild(disLabel);

  assert.equal(discovery.visible(disabledCb), false, 'Disabled checkbox must not be considered visible');
});

test('Part 9: Multi-Frame Result Aggregation in panel.js - aggregateAutofillResults', async () => {
  const { readFileSync } = await import('node:fs');
  const { runInNewContext } = await import('node:vm');
  const panelSource = readFileSync(new URL('../jobright_extension/panel.js', import.meta.url), 'utf8');
  assert.ok(panelSource.includes('function aggregateAutofillResults('), 'panel.js must define aggregateAutofillResults');

  const start = panelSource.indexOf('function aggregateAutofillResults(');
  let depth = 0;
  let end = -1;
  for (let i = start; i < panelSource.length; i++) {
    if (panelSource[i] === '{') depth++;
    else if (panelSource[i] === '}') {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  const fnCode = panelSource.slice(start, end);
  const sandbox = {};
  runInNewContext(fnCode + '\n;this.aggregateAutofillResults = aggregateAutofillResults;', sandbox);
  const aggregate = sandbox.aggregateAutofillResults;

  // 1. Aggregates results across multiple frames, ignores errored frames, deduplicates filled & unfilled
  const multiFrameResults = [
    {
      frameId: 0,
      documentId: 'doc-top',
      result: {
        filled: [
          { key: 'first_name', label: 'First Name', value: 'Alex' },
          { key: 'email', label: 'Email', value: 'alex@example.com' }
        ],
        unfilled: [
          { key: 'phone', label: 'Phone', kind: 'text' },
          { key: 'resume', label: 'Resume', kind: 'file' }
        ],
        questions: [{ key: 'q1', label: 'Years of experience?' }],
        questionMeta: { q1: { fieldId: 'f_q1', combo: false, required: true } },
        warnings: ['Warning 1'],
        unverified: ['Unverified 1'],
        total: 4
      }
    },
    {
      frameId: 1,
      documentId: 'doc-iframe',
      result: {
        filled: [
          { key: 'first_name', label: 'First Name', value: 'Alex' },
          { key: 'resume', label: 'Resume', value: 'Resume.pdf' },
          { key: 'portfolio', label: 'Portfolio URL', value: 'https://alex.dev' }
        ],
        unfilled: [
          { key: 'github', label: 'GitHub URL', kind: 'text' }
        ],
        questions: [{ key: 'q1', label: 'Years of experience?' }, { key: 'q2', label: 'Target salary?' }],
        questionMeta: {
          q1: { fieldId: 'f_q1_dup', combo: false, required: false },
          q2: { fieldId: 'f_q2', combo: true, required: true },
        },
        warnings: ['Warning 2'],
        unverified: ['Unverified 2'],
        total: 3
      }
    },
    {
      frameId: 2,
      documentId: 'doc-ad-frame',
      result: {
        error: 'No application form found on frame'
      }
    }
  ];

  const aggregated = aggregate(multiFrameResults);
  assert.ok(aggregated);

  // Filled deduplication
  assert.equal(aggregated.filled.length, 4); // first_name, email, resume, portfolio
  assert.deepEqual(Array.from(aggregated.filled.map(f => f.key)), ['first_name', 'email', 'resume', 'portfolio']);

  // Unfilled deduplication: 'resume' was in frame 0 unfilled, but filled in frame 1, so must NOT be in unfilled
  assert.equal(aggregated.unfilled.length, 2); // phone, github
  assert.deepEqual(Array.from(aggregated.unfilled.map(u => u.key)), ['phone', 'github']);

  // Questions deduplication & questionMeta preservation
  assert.equal(aggregated.questions.length, 2); // q1, q2
  assert.deepEqual(Array.from(aggregated.questions.map(q => q.key)), ['q1', 'q2']);
  assert.deepEqual(JSON.parse(JSON.stringify(aggregated.questionMeta)), {
    q1: { fieldId: 'f_q1', combo: false, required: true },
    q2: { fieldId: 'f_q2', combo: true, required: true },
  });

  // Warnings and unverified aggregation
  assert.deepEqual(Array.from(aggregated.warnings), ['Warning 1', 'Warning 2']);
  assert.deepEqual(Array.from(aggregated.unverified).sort(), ['Unverified 1', 'Unverified 2']);

  // Total
  assert.ok(aggregated.total >= aggregated.filled.length + aggregated.unfilled.length);

  // 2. Throws error if all frames failed
  const errorFrames = [
    { frameId: 0, result: { error: 'Form not found on page' } },
    { frameId: 1, result: { error: 'Frame timed out' } }
  ];
  assert.throws(() => aggregate(errorFrames), /Form not found on page/);

  // 3. Throws fallback error if empty or no valid results
  assert.throws(() => aggregate([]), /Could not fill this form\./);
});

test('Part 10: Multi-Step Navigation - observeStepTransitions handles SPA route changes with 350ms debounce', async () => {
  const defaultHref = 'https://portal.jobs.com/apply/step-1';
  globalThis.location = { href: defaultHref };
  mockDoc.defaultView.location = globalThis.location;

  const input1 = new MockInputElement();
  input1.id = 'step1-field';
  input1.name = 'step1_name';
  mockDoc.body.appendChild(input1);

  let transitionCalls = 0;
  let lastReport = null;

  const observer = discovery.observeStepTransitions(mockDoc, report => {
    transitionCalls++;
    lastReport = report;
  });

  // Step 2 route change: update location.href and dispatch hashchange
  globalThis.location.href = 'https://portal.jobs.com/apply/step-2';
  const input2 = new MockInputElement();
  input2.id = 'step2-field';
  input2.name = 'step2_name';
  mockDoc.body.appendChild(input2);

  globalThis.dispatchEvent(new MockEvent('hashchange'));

  // At 200ms: Debounce is 350ms (up from 150ms). At 200ms, it must NOT have fired yet.
  await new Promise(r => setTimeout(r, 200));
  assert.equal(transitionCalls, 0, 'Callback should not fire at 200ms because debounce is 350ms');

  // At 450ms: Debounce has elapsed, callback should have fired
  await new Promise(r => setTimeout(r, 250));
  assert.equal(transitionCalls, 1, 'Callback should fire after 350ms debounce elapsed');
  assert.ok(lastReport);
  assert.equal(lastReport.triggerType, 'route_change');
  assert.ok(lastReport.newFields.some(f => f.element === input2 || f.key.includes('step2-field')));

  observer.disconnect();
});



